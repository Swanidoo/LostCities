import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { client } from "../db_client.ts";

const jwtKey = Deno.env.get("JWT_SECRET");
if (!jwtKey) {
  throw new Error("JWT_SECRET not set");
}

const encoder = new TextEncoder();
const keyData = encoder.encode(jwtKey);
export const cryptoKey = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

// Configuration des durées
export const TOKEN_CONFIG = {
  ACCESS_TOKEN_EXPIRY: 30 * 60, // 30 minutes
  REFRESH_TOKEN_EXPIRY: 7 * 24 * 60 * 60, // 7 jours
  MAX_REFRESH_TOKENS_PER_USER: 5, // Limite par utilisateur
};

// Interface pour les tokens
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface RefreshTokenData {
  userId: string;
  tokenHash: string;
  deviceInfo?: string;
  ipAddress?: string;
}

// Générer une paire de tokens
export async function generateTokenPair(
  userId: string, 
  userEmail: string,
  userRole: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);
  
  // Access Token (court)
  const accessTokenPayload = {
    id: userId,
    email: userEmail,
    role: userRole,
    iat: now,
    exp: now + TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY,
    type: 'access'
  };
  
  const accessToken = await create(
    { alg: "HS256", typ: "JWT" },
    accessTokenPayload,
    cryptoKey
  );
  
  // Refresh Token (long) - moins d'infos pour la sécurité
  const refreshTokenPayload = {
    id: userId,
    iat: now,
    exp: now + TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY,
    type: 'refresh',
    jti: crypto.randomUUID() // Unique identifier
  };
  
  const refreshToken = await create(
    { alg: "HS256", typ: "JWT" },
    refreshTokenPayload,
    cryptoKey
  );
  
  // Hasher et stocker le refresh token
  await storeRefreshToken(userId, refreshToken, deviceInfo, ipAddress);
  
  return {
    accessToken,
    refreshToken,
    expiresIn: TOKEN_CONFIG.ACCESS_TOKEN_EXPIRY
  };
}

// Stocker le refresh token de manière sécurisée
async function storeRefreshToken(
  userId: string, 
  refreshToken: string,
  deviceInfo?: string,
  ipAddress?: string
): Promise<void> {
  // Hasher le token pour le stockage
  const tokenHash = await hash(refreshToken, 12);
  
  // Nettoyer les anciens tokens expirés pour cet utilisateur
  await client.queryObject(
    `DELETE FROM refresh_tokens 
     WHERE user_id = $1 AND (expires_at < NOW() OR is_revoked = TRUE)`,
    [userId]
  );
  
  // Vérifier la limite de tokens par utilisateur
  const countResult = await client.queryObject<{count: number}>(
    `SELECT COUNT(*) as count FROM refresh_tokens 
     WHERE user_id = $1 AND is_revoked = FALSE`,
    [userId]
  );
  
  // Si limite atteinte, supprimer le plus ancien
  if (Number(countResult.rows[0].count) >= TOKEN_CONFIG.MAX_REFRESH_TOKENS_PER_USER) {
    await client.queryObject(
      `DELETE FROM refresh_tokens 
       WHERE user_id = $1 AND is_revoked = FALSE
       ORDER BY created_at ASC LIMIT 1`,
      [userId]
    );
  }
  
  // Stocker le nouveau token
  await client.queryObject(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info, ip_address)
     VALUES ($1, $2, NOW() + INTERVAL '${TOKEN_CONFIG.REFRESH_TOKEN_EXPIRY} seconds', $3, $4)`,
    [userId, tokenHash, deviceInfo, ipAddress]
  );
}

// Vérifier et utiliser un refresh token
export async function validateAndUseRefreshToken(
  refreshToken: string,
  ipAddress?: string
): Promise<{ userId: string; userEmail: string; userRole: string } | null> {
  try {
    // Vérifier la signature du token
    const payload = await verify(refreshToken, cryptoKey) as any;
    
    // Vérifier le type
    if (payload.type !== 'refresh') {
      return null;
    }
    
    const userId = payload.id;
    
    // Récupérer les tokens actifs pour cet utilisateur
    const tokensResult = await client.queryObject<{
      id: number;
      token_hash: string;
      expires_at: string;
    }>(
      `SELECT id, token_hash, expires_at FROM refresh_tokens 
       WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > NOW()`,
      [userId]
    );
    
    // Vérifier si le token correspond à un token stocké
    let tokenFound = false;
    let tokenId: number | null = null;
    
    for (const storedToken of tokensResult.rows) {
      if (await compare(refreshToken, storedToken.token_hash)) {
        tokenFound = true;
        tokenId = storedToken.id;
        break;
      }
    }
    
    if (!tokenFound) {
      // Token invalide - possibilité de compromission
      // Révoquer tous les tokens de cet utilisateur par sécurité
      await revokeAllUserTokens(userId, 'Invalid token used');
      return null;
    }
    
    // Mettre à jour la date de dernière utilisation
    await client.queryObject(
      `UPDATE refresh_tokens 
       SET last_used_at = NOW() 
       WHERE id = $1`,
      [tokenId]
    );
    
    // Récupérer les infos utilisateur
    const userResult = await client.queryObject<{
      id: string;
      email: string;
      role: string;
    }>(
      `SELECT id, email, role FROM users WHERE id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return null;
    }
    
    const user = userResult.rows[0];
    return {
      userId: user.id,
      userEmail: user.email,
      userRole: user.role
    };
    
  } catch (error) {
    console.error('Error validating refresh token:', error);
    return null;
  }
}

// Révoquer un token spécifique
export async function revokeRefreshToken(
  refreshToken: string,
  reason: string = 'User logout'
): Promise<boolean> {
  try {
    const payload = await verify(refreshToken, cryptoKey) as any;
    const userId = payload.id;
    
    // Trouve et révoque le token correspondant
    const tokensResult = await client.queryObject<{
      id: number;
      token_hash: string;
    }>(
      `SELECT id, token_hash FROM refresh_tokens 
       WHERE user_id = $1 AND is_revoked = FALSE`,
      [userId]
    );
    
    for (const storedToken of tokensResult.rows) {
      if (await compare(refreshToken, storedToken.token_hash)) {
        await client.queryObject(
          `UPDATE refresh_tokens 
           SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
           WHERE id = $2`,
          [reason, storedToken.id]
        );
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error revoking refresh token:', error);
    return false;
  }
}

// Révoquer tous les tokens d'un utilisateur
export async function revokeAllUserTokens(
  userId: string,
  reason: string = 'Security measure'
): Promise<number> {
  try {
    const result = await client.queryObject<{count: number}>(
      `UPDATE refresh_tokens 
       SET is_revoked = TRUE, revoked_at = NOW(), revoked_reason = $1
       WHERE user_id = $2 AND is_revoked = FALSE
       RETURNING id`,
      [reason, userId]
    );
    
    return result.rows.length;
  } catch (error) {
    console.error('Error revoking all user tokens:', error);
    return 0;
  }
}

// Nettoyer les tokens expirés
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await client.queryObject<{count: number}>(
      `DELETE FROM refresh_tokens 
       WHERE expires_at < NOW() OR (is_revoked = TRUE AND revoked_at < NOW() - INTERVAL '30 days')
       RETURNING id`
    );
    
    return result.rows.length;
  } catch (error) {
    console.error('Error cleaning up tokens:', error);
    return 0;
  }
}
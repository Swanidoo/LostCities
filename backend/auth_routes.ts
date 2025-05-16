import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { client } from "./db_client.ts";
import { 
  generateTokenPair, 
  validateAndUseRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cryptoKey 
} from "./utils/token_utils.ts";

const authRouter = new Router();

const jwtKey = Deno.env.get("JWT_SECRET"); // Load JWT_SECRET from the environment
if (!jwtKey) {
  console.error("JWT_SECRET is not set in the environment variables.");
  Deno.exit(1); // Exit if the secret is missing
}

const encoder = new TextEncoder();
const keyData = encoder.encode(jwtKey);
const cryptoKey = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

// Route for user registration
authRouter.post("/register", async (ctx) => {
  try {
    const { username, email, password } = await ctx.request.body({ type: "json" }).value;

    if (!username || !email || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing required fields: username, email, or password" };
      return;
    }

    const userExists = await client.queryObject("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "User already exists" };
      return;
    }

    const hashedPassword = await hash(password);
    const result = await client.queryObject(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, email, role",
      [username, email, hashedPassword]
    );

    const newUser = result.rows[0];
    
    // Générer les tokens pour le nouvel utilisateur
    const { deviceInfo, ipAddress } = getDeviceInfo(ctx);
    const tokenPair = await generateTokenPair(
      newUser.id,
      newUser.email,
      newUser.role,
      deviceInfo,
      ipAddress
    );

    ctx.response.status = 201;
    ctx.response.body = { 
      message: "User registered successfully",
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: "Bearer"
    };
  } catch (err) {
    console.error("Error in /register:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Route for user login
authRouter.post("/login", async (ctx) => {
  try {
    const { email, password } = await ctx.request.body({ type: "json" }).value;

    const user = await client.queryObject("SELECT * FROM users WHERE email = $1", [email]);
    if (!user.rows.length) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const dbUser = user.rows[0];
    const isPasswordValid = await compare(password, dbUser.password);
    if (!isPasswordValid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid password" };
      return;
    }

    // Générer la paire de tokens
    const { deviceInfo, ipAddress } = getDeviceInfo(ctx);
    const tokenPair = await generateTokenPair(
      dbUser.id,
      dbUser.email,
      dbUser.role,
      deviceInfo,
      ipAddress
    );

    // Mettre à jour last_login
    await client.queryObject(
      "UPDATE users SET last_login = NOW() WHERE id = $1",
      [dbUser.id]
    );

    ctx.response.status = 200;
    ctx.response.body = { 
      message: "Login successful", 
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: "Bearer"
    };
  } catch (err) {
    console.error("Error in /login:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Fonction helper pour obtenir device info et IP
function getDeviceInfo(ctx: any): { deviceInfo?: string; ipAddress?: string } {
  const userAgent = ctx.request.headers.get("User-Agent");
  const ipAddress = ctx.request.ip || 
                   ctx.request.headers.get("x-forwarded-for") || 
                   ctx.request.headers.get("x-real-ip");
  
  return {
    deviceInfo: userAgent,
    ipAddress: ipAddress
  };
}

authRouter.post("/refresh", async (ctx) => {
  try {
    const { refreshToken } = await ctx.request.body({ type: "json" }).value;
    
    if (!refreshToken) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Refresh token required" };
      return;
    }
    
    // Valider le refresh token
    const { ipAddress } = getDeviceInfo(ctx);
    const userInfo = await validateAndUseRefreshToken(refreshToken, ipAddress);
    
    if (!userInfo) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid or expired refresh token" };
      return;
    }
    
    // Générer une nouvelle paire de tokens
    const { deviceInfo } = getDeviceInfo(ctx);
    const tokenPair = await generateTokenPair(
      userInfo.userId,
      userInfo.userEmail,
      userInfo.userRole,
      deviceInfo,
      ipAddress
    );
    
    // Optionnel : révoquer l'ancien refresh token
    await revokeRefreshToken(refreshToken, 'Token renewed');
    
    ctx.response.status = 200;
    ctx.response.body = {
      message: "Tokens refreshed successfully",
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      expiresIn: tokenPair.expiresIn,
      tokenType: "Bearer"
    };
    
  } catch (err) {
    console.error("Error in /refresh:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

authRouter.post("/logout", authMiddleware, async (ctx) => {
  try {
    const { refreshToken } = await ctx.request.body({ type: "json" }).value;
    const userId = ctx.state.user.id;
    
    if (refreshToken) {
      // Révoquer le refresh token spécifique
      await revokeRefreshToken(refreshToken, 'User logout');
    } else {
      // Si pas de refresh token fourni, révoquer tous les tokens de l'utilisateur
      await revokeAllUserTokens(userId, 'Global logout');
    }
    
    ctx.response.status = 200;
    ctx.response.body = { message: "Logged out successfully" };
    
  } catch (err) {
    console.error("Error in /logout:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

authRouter.post("/logout-all", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    const revokedCount = await revokeAllUserTokens(userId, 'Logout from all devices');
    
    ctx.response.status = 200;
    ctx.response.body = { 
      message: `Logged out from all devices successfully`,
      tokensRevoked: revokedCount
    };
    
  } catch (err) {
    console.error("Error in /logout-all:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Protected route for user profile
authRouter.get("/profile", authMiddleware, (ctx) => {
  console.log("🔍 ctx.state.user:", ctx.state.user); // Debugging log

  if (!ctx.state.user) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: User not authenticated" };
    return;
  }

  ctx.response.body = { 
    message: "Welcome to your profile!", 
    user: ctx.state.user 
  };
});

// Route pour vérifier le statut de ban
authRouter.get("/ban-status", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    
    const banResult = await client.queryObject(
      `SELECT is_banned, banned_until, ban_reason FROM users WHERE id = $1`,
      [userId]
    );
    
    if (banResult.rows.length > 0) {
      const user = banResult.rows[0];
      
      if (user.is_banned && (!user.banned_until || new Date(user.banned_until) > new Date())) {
        ctx.response.body = {
          banned: true,
          banInfo: {
            reason: user.ban_reason,
            until: user.banned_until
          }
        };
        return;
      }
    }
    
    ctx.response.body = { banned: false };
  } catch (err) {
    console.error("Error checking ban status:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

export default authRouter;
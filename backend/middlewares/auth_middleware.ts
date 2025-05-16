import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { cryptoKey } from "../utils/token_utils.ts";

export const authMiddleware = async (ctx: any, next: any) => {
  try {
    const authHeader = ctx.request.headers.get("Authorization");
    console.log("🔍 Authorization header:", authHeader);

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      ctx.response.status = 401;
      ctx.response.body = { 
        error: "Unauthorized: Invalid Authorization header format",
        code: "MISSING_TOKEN"
      };
      return;
    }

    const token = authHeader.split(" ")[1];
    
    // Vérifier le token avec la clé crypto
    const payload = await verify(token, cryptoKey);
    
    // Vérifier que c'est bien un access token
    if ((payload as any).type !== 'access') {
      ctx.response.status = 401;
      ctx.response.body = { 
        error: "Unauthorized: Invalid token type",
        code: "INVALID_TOKEN_TYPE"
      };
      return;
    }
    
    ctx.state.user = payload;
    await next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err);
    
    // Gestion spécifique des erreurs JWT
    if (err.name === 'JWTExpired') {
      ctx.response.status = 401;
      ctx.response.body = { 
        error: "Unauthorized: Token expired",
        code: "TOKEN_EXPIRED"
      };
    } else if (err.name === 'JWTInvalid') {
      ctx.response.status = 401;
      ctx.response.body = { 
        error: "Unauthorized: Invalid token",
        code: "INVALID_TOKEN"
      };
    } else {
      ctx.response.status = 401;
      ctx.response.body = { 
        error: "Unauthorized: Authentication failed",
        code: "AUTH_FAILED"
      };
    }
  }
};
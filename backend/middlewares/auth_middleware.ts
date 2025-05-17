import { verifyJWT } from "../jwt_utils.ts";

export const authMiddleware = async (ctx: any, next: any) => {
  try {
    // Récupérer le token depuis le cookie - AWAIT nécessaire
    const token = await ctx.cookies.get("authToken");
    
    console.log("🔍 Token from cookie:", token);
    console.log("🔍 Token length:", token?.length);
    
    if (!token) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: No authentication token" };
      return;
    }
    
    console.log("🔍 About to verify token...");
    
    // Utiliser la fonction verifyJWT du module partagé
    const payload = await verifyJWT(token);
    
    console.log("✅ Token verified successfully");
    
    ctx.state.user = payload;
    await next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err);
    console.error("❌ Error details:", err.message);
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Invalid or expired token" };
  }
}
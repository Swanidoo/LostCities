import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

export const authMiddleware = async (ctx: any, next: any) => {
  try {
    // Récupérer le token depuis le cookie au lieu du header
    const token = ctx.cookies.get("authToken");
    
    if (!token) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: No authentication token" };
      return;
    }
    
    // Get the JWT_SECRET
    const jwtKey = Deno.env.get("JWT_SECRET");
    if (!jwtKey) {
      ctx.response.status = 500;
      ctx.response.body = { error: "Server configuration error" };
      return;
    }
    
    // Create the same CryptoKey used for signing
    const encoder = new TextEncoder();
    const keyData = encoder.encode(jwtKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    
    // Verify with the CryptoKey
    const payload = await verify(token, cryptoKey);
    
    ctx.state.user = payload;
    await next();
  } catch (err) {
    console.error("❌ Auth middleware error:", err);
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Invalid or expired token" };
  }
};
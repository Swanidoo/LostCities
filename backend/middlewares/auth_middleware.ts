import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const jwtKey = Deno.env.get("JWT_SECRET");

if (!jwtKey) {
  console.error("❌ JWT_SECRET is not set in the environment variables.");
  throw new Error("JWT_SECRET is not set in environment variables");
}

// Pre-import the CryptoKey once when starting
const encoder = new TextEncoder();
const keyData = encoder.encode(jwtKey);
const cryptoKey = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

export const authMiddleware = async (ctx, next) => {
  const authHeader = ctx.request.headers.get("Authorization");

  if (!authHeader) {
    console.error("❌ Missing Authorization header");
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Missing Authorization header" };
    return;
  }

  const token = authHeader.split(" ")[1];
  console.log("🔍 Token being verified:", token);

  try {
    const payload = await verify(token, cryptoKey);
    console.log("✅ Token payload:", payload);
    ctx.state.user = payload;
    await next();
  } catch (err) {
    console.error("❌ Invalid or expired token:", err.message);
    ctx.response.status = 403;
    ctx.response.body = { error: "Forbidden: Invalid or expired token" };
  }
};

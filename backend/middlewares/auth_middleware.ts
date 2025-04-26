import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

export const authMiddleware = async (ctx: any, next: any) => {
  const authHeader = ctx.request.headers.get("Authorization");
  console.log("🔍 Authorization header:", authHeader);

  if (!authHeader) {
    console.error("❌ Missing Authorization header");
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Missing Authorization header" };
    return;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    console.error("❌ Missing token in Authorization header");
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Missing token" };
    return;
  }

  try {
    const payload = await verify(token, Deno.env.get("JWT_SECRET")!, "HS256");
    console.log("✅ Token payload:", payload);

    ctx.state.user = payload;
    await next();
  } catch (err) {
    console.error("❌ Invalid or expired token:", err.message);
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Invalid or expired token" };
  }
};

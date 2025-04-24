import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

export const authMiddleware = async (ctx, next) => {
  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Missing Authorization header" };
    return;
  }

  const token = authHeader.split(" ")[1];
  const jwtKey = Deno.env.get("JWT_SECRET") || "default_secret";

  try {
    const payload = await verify(token, jwtKey, "HS256");
    ctx.state.user = payload; // Attach user payload to the context
    await next();
  } catch (err) {
    console.error("Invalid or expired token:", err);
    ctx.response.status = 403;
    ctx.response.body = { error: "Forbidden: Invalid or expired token" };
  }
};
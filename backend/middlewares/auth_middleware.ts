import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

export const authMiddleware = async (ctx, next) => {
  const jwtKey = Deno.env.get("JWT_SECRET"); // Load JWT_SECRET from the environment

  if (!jwtKey) {
    console.error("JWT_SECRET is not set in the environment variables.");
    ctx.response.status = 500; // Internal Server Error
    ctx.response.body = { error: "Internal server error: JWT_SECRET is missing." };
    return;
  }

  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader) {
    ctx.response.status = 401; // Unauthorized
    ctx.response.body = { error: "Unauthorized: Missing Authorization header" };
    return;
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = await verify(token, jwtKey, "HS256");
    ctx.state.user = payload; // Attach user payload to the context
    await next();
  } catch (err) {
    console.error("Invalid or expired token:", err);
    ctx.response.status = 403; // Forbidden
    ctx.response.body = { error: "Forbidden: Invalid or expired token" };
  }
};
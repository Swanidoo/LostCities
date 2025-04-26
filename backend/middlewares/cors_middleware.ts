import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

// Configure the CORS middleware directly
export const corsMiddleware = async (ctx, next) => {
  const requestOrigin = ctx.request.headers.get("Origin") || "null (no origin)";
  console.log("CORS request from:", requestOrigin);

  const allowedOrigins = [
    "http://localhost:8080",
    "https://localhost",
    "https://lostcitiesfrontend.onrender.com",
  ];

  const isAllowed = allowedOrigins.includes(requestOrigin);
  console.log("Is origin allowed?", isAllowed);

  if (!isAllowed) {
    // If the origin is not allowed, return a 403 response
    ctx.response.status = 403;
    ctx.response.body = { error: "CORS origin not allowed" };
    return; // Stop the middleware chain
  }

  // If the origin is allowed, apply the oakCors middleware
  const cors = oakCors({
    origin: requestOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  await cors(ctx, next);
};
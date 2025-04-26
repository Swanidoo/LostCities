import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

// Configure le middleware CORS une seule fois
const cors = oakCors({
  origin: (requestOrigin) => {
    console.log("CORS request from:", requestOrigin);
    const allowedOrigins = [
      "http://localhost:8080",
      "https://localhost",
      "https://lostcitiesfrontend.onrender.com",
    ];
    return allowedOrigins.includes(requestOrigin) ? requestOrigin : false;
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Middleware CORS encapsulé
export const corsMiddleware = async (ctx, next) => {
  await cors(ctx, async () => {
    await next(); // Chaîne correctement les middlewares
  });
};
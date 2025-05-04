import { Middleware } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

// Create the CORS middleware
const corsHandler = oakCors({
  origin: [
    "http://localhost:8080", 
    "http://localhost",
    "https://localhost:8080", 
    "https://localhost",
    "https://localhost:443",
    "https://lostcitiesfrontend.onrender.com"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Upgrade", "Connection"],
  optionsSuccessStatus: 200
});

// Wrap the CORS middleware to ensure it runs even on errors
export const corsMiddleware: Middleware = async (ctx, next) => {
  try {
    await corsHandler(ctx, next);
  } catch (err) {
    // Add CORS headers even on errors
    ctx.response.headers.set("Access-Control-Allow-Origin", ctx.request.headers.get("Origin") || "*");
    ctx.response.headers.set("Access-Control-Allow-Credentials", "true");
    throw err;
  }
};
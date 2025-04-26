import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

// Configure the CORS middleware directly
export const corsMiddleware = oakCors({
  origin: (requestOrigin) => {
    console.log("CORS request from:", requestOrigin || "null (no origin)");
    const allowedOrigins = [
      "http://localhost:8080",
      "https://localhost",
      "https://lostcitiesfrontend.onrender.com",
    ];
    const isAllowed = allowedOrigins.includes(requestOrigin || "");
    console.log("Is origin allowed?", isAllowed);
    return isAllowed ? requestOrigin : false;
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
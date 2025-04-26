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

    // Allow the origin if it's in the allowed list
    if (allowedOrigins.includes(requestOrigin || "")) {
      console.log("Is origin allowed? true");
      return requestOrigin;
    }

    console.log("Is origin allowed? false");
    return false; // Disallow the origin
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
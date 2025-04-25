import { oakCors } from "https://deno.land/x/cors@v1.2.3/mod.ts";

export const corsMiddleware = oakCors({
  origin: (requestOrigin) => {
    // Allow specific origins
    const allowedOrigins = [
      "http://localhost:8080", // Local frontend (HTTP)
      "https://localhost", // Local frontend (HTTPS)
      "https://lostcitiesfrontend.onrender.com", // Deployed frontend
    ];
    return allowedOrigins.includes(requestOrigin) ? requestOrigin : false;
  },
  credentials: true, // Allow cookies and credentials
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Allowed HTTP methods
  allowedHeaders: ["Content-Type", "Authorization"], // Allowed headers
});
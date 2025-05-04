import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

export const corsMiddleware = oakCors({
  origin: [
    "http://localhost:8080", 
    "http://localhost",
    "https://localhost:8080", 
    "https://localhost", 
    "https://lostcitiesfrontend.onrender.com"
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Upgrade", "Connection"],
});
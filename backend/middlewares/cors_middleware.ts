import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

export const corsMiddleware = oakCors({
  origin: (origin) => {
    const allowedOrigins = [
      "http://localhost:8080",
      "http://localhost",
      "https://localhost:8080",
      "https://localhost",
      "http://localhost:3000",
      "https://localhost:3000",
      "https://localhost:443",
      "http://localhost:80",
      "https://lostcitiesfrontend.onrender.com/",
      "https://lostcitiesfrontend.onrender.com"
    ];
    
    // En production, si pas d'origin (même domaine) ou origin autorisée
    if (!origin) return true;  // Requêtes du même domaine
    return allowedOrigins.includes(origin);  // Retourne directement true/false
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Upgrade", "Connection"],
  exposedHeaders: ["*"],
  maxAge: 86400,
});
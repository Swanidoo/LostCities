import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";

export const corsMiddleware = oakCors({
  origin: (origin, ctx) => {
    // Pour le debugging
    console.log(`🔍 CORS origin check: "${origin}"`);
    
    const allowedOrigins = [
      "http://localhost:8080",
      "http://localhost",
      "https://localhost:8080", 
      "https://localhost",
      "http://localhost:3000",
      "https://localhost:3000",
      "https://lostcitiesfrontend.onrender.com"
    ];
    
    // En développement local, autoriser toutes les origines localhost
    if (!origin || origin.includes('localhost')) {
      console.log(`✅ CORS: Allowing localhost origin`);
      return true;
    }
    
    // Vérifier si l'origine est dans la liste
    const isAllowed = allowedOrigins.includes(origin);
    console.log(`${isAllowed ? '✅' : '❌'} CORS: Origin "${origin}" ${isAllowed ? 'allowed' : 'rejected'}`);
    
    return isAllowed;
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Set-Cookie"],
  maxAge: 86400,
});
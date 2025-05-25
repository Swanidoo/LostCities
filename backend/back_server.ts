import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import authRouter from "./auth_routes.ts";
import gameRouter from "./game_routes.ts";
import wsRouter from "./ws_routes.ts";
import welcomeRouter from "./welcome_routes.ts";
import userRouter from "./user_routes.ts";
import settingsRouter from "./settings_routes.ts";
import leaderboardRouter from "./leaderboard_routes.ts";
import adminRouter from "./admin_routes.ts";
import { corsMiddleware } from "./middlewares/cors_middleware.ts";
import { errorMiddleware } from "./middlewares/error_middleware.ts";
import { loggingMiddleware } from "./middlewares/logging_middleware.ts";
import { securityHeadersMiddleware } from "./middlewares/security_headers_middleware.ts";
import { rateLimitingMiddleware } from "./middlewares/rate_limiting_middleware.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import profileRouter from "./profile_routes.ts";
import { checkUserStatus } from "./middlewares/check_user_status.ts";
import gameDetailsRouter from "./game_details_routes.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

const app = new Application({
  proxy: true // Permet de faire confiance aux en-têtes de proxy (X-Forwarded-Proto)
});

const rawDatabaseUrl = Deno.env.get("DATABASE_URL");
if (!rawDatabaseUrl) {
  console.error("❌ DATABASE_URL is not set in the environment variables.");
  Deno.exit(1);
}

const client = new Client(rawDatabaseUrl); // Pas d'options TLS manuelles

try {
  console.log("🔧 Connecting to the database...");
  await client.connect();
  console.log("✅ Database connection established successfully.");
} catch (err) {
  console.error("❌ Database connection failed:", err.message);
  console.error(err.stack);
}

// 🛡️ Middlewares globaux
app.use(corsMiddleware);
app.use(errorMiddleware);
app.use(loggingMiddleware);
app.use(securityHeadersMiddleware);
app.use(rateLimitingMiddleware);

// 🛣️ Routes publiques
app.use(welcomeRouter.routes());
app.use(welcomeRouter.allowedMethods());
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());
app.use(leaderboardRouter.routes());
app.use(leaderboardRouter.allowedMethods());
app.use(profileRouter.routes());
app.use(profileRouter.allowedMethods());
app.use(userRouter.routes());
app.use(userRouter.allowedMethods());

// 📡 WebSocket routes (avant auth)
app.use(wsRouter.routes());
app.use(wsRouter.allowedMethods());

// 🔒 Auth middleware pour routes protégées
app.use(authMiddleware);
app.use(checkUserStatus);

// 🔒 Routes protégées
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());
app.use(settingsRouter.routes());
app.use(settingsRouter.allowedMethods());
app.use(adminRouter.routes());
app.use(adminRouter.allowedMethods());
app.use(gameDetailsRouter.routes());
app.use(gameDetailsRouter.allowedMethods());

// Fonction pour nettoyer les bans et mutes expirés
async function cleanupExpiredBansAndMutes() {
  try {
    // Nettoyer les bans expirés
    const banResult = await client.queryObject(`
      UPDATE users 
      SET is_banned = false 
      WHERE is_banned = true 
        AND banned_until IS NOT NULL 
        AND banned_until <= NOW()
      RETURNING id, username
    `);
    
    if (banResult.rows.length > 0) {
      console.log(`✅ Cleaned up ${banResult.rows.length} expired bans`);
      banResult.rows.forEach(user => {
        console.log(`  - Unbanned user ${user.username} (ID: ${user.id})`);
      });
    }
    
    // Note: On ne nettoie PAS les mutes ici car ils ont leur propre logique
    
  } catch (error) {
    console.error("❌ Error cleaning up expired bans:", error);
  }
}

// Nettoyer les bans expirés toutes les 5 minutes
setInterval(cleanupExpiredBansAndMutes, 5 * 60 * 1000);

// Nettoyer au démarrage également
cleanupExpiredBansAndMutes();

// 🚀 Lancer le serveur
const port = parseInt(Deno.env.get("PORT") || "3000");
const isProduction = Deno.env.get("ENV") === "production";

console.log(`🚀 HTTP server running on port ${port}`);
console.log(`🌐 Environment: ${isProduction ? 'production' : 'development'}`);
await app.listen({ port });
import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
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
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

const app = new Application();
const DATABASE_URL = Deno.env.get("DATABASE_URL");

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in the environment variables.");
  Deno.exit(1);
}

const client = new Client(DATABASE_URL);
await client.connect();

// Use middlewares
app.use(corsMiddleware); // Handle CORS
app.use(securityHeadersMiddleware); // Add secure headers
app.use(loggingMiddleware); // Log incoming requests
app.use(rateLimitingMiddleware); // Limit requests to prevent abuse
app.use(errorMiddleware); // Handle errors globally

// Register public routes
app.use(welcomeRouter.routes());
app.use(welcomeRouter.allowedMethods());
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());

// Apply authMiddleware to protect all routes registered after this point
app.use(authMiddleware);

// Register protected routes
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());
app.use(wsRouter.routes());
app.use(wsRouter.allowedMethods());
app.use(userRouter.routes());
app.use(userRouter.allowedMethods());
app.use(settingsRouter.routes());
app.use(settingsRouter.allowedMethods());
app.use(leaderboardRouter.routes());
app.use(leaderboardRouter.allowedMethods());
app.use(adminRouter.routes());
app.use(adminRouter.allowedMethods());

console.log("HTTP server running on port 3000");
await app.listen({ port: 3000 });
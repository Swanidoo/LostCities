import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import authRouter from "./auth_routes.ts";
import gameRouter from "./game_routes.ts";
import wsRouter from "./ws_routes.ts";
import welcomeRouter from "./welcome_routes.ts";
import { errorMiddleware } from "./middlewares/error_middleware.ts";
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

app.use(oakCors({
  origin: ["http://localhost:8080", "https://lostcitiesfrontend.onrender.com"],
  credentials: true,
}));

app.use(errorMiddleware);
app.use(welcomeRouter.routes());
app.use(welcomeRouter.allowedMethods());
app.use(authRouter.routes());
app.use(authRouter.allowedMethods());
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());
app.use(wsRouter.routes());
app.use(wsRouter.allowedMethods());

console.log("HTTP server running on port 3000");
await app.listen({ port: 3000 });
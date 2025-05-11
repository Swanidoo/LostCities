// Modified front_server.ts
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { send } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const ROOT = Deno.cwd();
const app = new Application();

// 1. Route redirects for section roots
const redirectRouter = new Router();

redirectRouter.get("/login", (ctx) => {
  ctx.response.redirect("/login/login.html");
});

redirectRouter.get("/admin", (ctx) => {
  ctx.response.redirect("/admin/admin.html");
});

redirectRouter.get("/matchmaking", (ctx) => {
  ctx.response.redirect("/matchmaking/matchmaking.html");
});

redirectRouter.get("/leaderboard", (ctx) => {
  ctx.response.redirect("/leaderboard/leaderboard.html");
});

redirectRouter.get("/profile", (ctx) => {
  ctx.response.redirect("/profile/profile.html");
});

// 2. Game-specific dynamic routes
const gameRouter = new Router();
gameRouter.get("/game/game.html", async (ctx) => {
  try {
    await send(ctx, "/game/game.html", { root: ROOT });
  } catch (err) {
    console.error("Error serving game.html:", err);
    ctx.response.status = 404;
    ctx.response.body = "Game not found";
  }
});

// 3. Mount routers
app.use(redirectRouter.routes());
app.use(redirectRouter.allowedMethods());
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());

// 4. Root route - serve index.html
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/") {
    try {
      await send(ctx, "/index.html", { root: ROOT });
      return;
    } catch (err) {
      console.error("Error serving index.html:", err);
    }
  }
  await next();
});

// 5. Static file serving with proper MIME types
app.use(async (ctx, next) => {
  try {
    // Set MIME types explicitly
    const path = ctx.request.url.pathname;
    if (path.endsWith(".css")) {
      ctx.response.headers.set("Content-Type", "text/css");
    } else if (path.endsWith(".js")) {
      ctx.response.headers.set("Content-Type", "application/javascript");
    } else if (path.endsWith(".html")) {
      ctx.response.headers.set("Content-Type", "text/html");
    }
    else if (path.endsWith(".png")) {
      ctx.response.headers.set("Content-Type", "image/png");
    } else if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
      ctx.response.headers.set("Content-Type", "image/jpeg");
    } else if (path.endsWith(".svg")) {
      ctx.response.headers.set("Content-Type", "image/svg+xml");
    }
        
    // Serve the file
    await send(ctx, path, { root: ROOT });
  } catch (err) {
    if (err.name !== "NotFound") {
      console.error(`Error serving file: ${err}`);
    }
    await next();
  }
});

// 6. 404 handler
app.use((ctx) => {
  ctx.response.status = 404;
  ctx.response.body = "Page not found";
});

// Configuration du port et des options SSL
const port = parseInt(Deno.args[0]) || 8080;
const options: any = { port };

// Configuration SSL si des arguments sont fournis
if (Deno.args.length >= 3) {
  try {
    options.secure = true;
    options.certFile = Deno.args[1];
    options.keyFile = Deno.args[2];
    console.log(`SSL configuration ready (using https)`);
  } catch (error) {
    console.error("Error loading SSL certificates:", error);
    console.log("Starting server without SSL...");
  }
}

console.log(`Starting frontend server on port ${options.port}`);
console.log(`Routes available:`);
console.log(`- / (index or login redirect)`);
console.log(`- /login`);
console.log(`- /chat`);
console.log(`- /matchmaking.html (new)`);
console.log(`- /game/:id`);
console.log(`- /admin`);
console.log(`- /shared`);

// Démarrer le serveur
await app.listen(options);
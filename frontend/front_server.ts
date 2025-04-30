import { Application, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Router } from "https://deno.land/x/oak@v12.6.1/router.ts";

// Define the ROOT constant
const ROOT = Deno.cwd();

// Game routes
const gameRouter = new Router();

// Route to serve the game page
gameRouter.get("/game/:id", async (ctx) => {
  const gameId = ctx.params.id;
  try {
    // Just serve the static game.html file - we'll handle the data loading in the client
    const html = await Deno.readTextFile(`${ROOT}/game/game.html`);
    ctx.response.type = "text/html";
    ctx.response.body = html;
  } catch (error) {
    console.error("Error loading game page:", error);
    ctx.response.status = 404;
    ctx.response.body = "Game not found";
  }
});

// Route to create a new game
gameRouter.get("/new-game", async (ctx) => {
  try {
    // Serve the new game form
    const html = await Deno.readTextFile(`${ROOT}/game/new_game.html`);
    ctx.response.type = "text/html";
    ctx.response.body = html;
  } catch (error) {
    console.error("Error loading new game page:", error);
    ctx.response.status = 500;
    ctx.response.body = "Error loading page";
  }
});

// Create the application
const app = new Application();

// IMPORTANT: Serve static files with correct MIME types
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  try {
    // Serve static files
    if (
      path.startsWith("/shared/") ||
      path.startsWith("/game/") ||
      path.startsWith("/login/") ||
      path.startsWith("/admin/") ||
      path.startsWith("/chat/")
    ) {
      // Set correct content type based on file extension
      if (path.endsWith('.css')) {
        ctx.response.headers.set("Content-Type", "text/css");
      } else if (path.endsWith('.js')) {
        ctx.response.headers.set("Content-Type", "application/javascript");
      } else if (path.endsWith('.html')) {
        ctx.response.headers.set("Content-Type", "text/html");
      } else if (path.endsWith('.png')) {
        ctx.response.headers.set("Content-Type", "image/png");
      } else if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
        ctx.response.headers.set("Content-Type", "image/jpeg");
      }
      
      await send(ctx, path, {
        root: ROOT,
      });
      return;
    }
    await next();
  } catch (err) {
    if (err.name !== 'NotFound') {
      console.error(`Error serving static file ${path}:`, err);
    }
    await next();
  }
});

// Use the game router
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());

// Root path - redirect to login
app.use(async (ctx) => {
  if (ctx.request.url.pathname === "/") {
    ctx.response.redirect("/login/login.html");
    return;
  }
  
  // If we get here, serve a 404 page
  ctx.response.status = 404;
  ctx.response.body = "Page not found";
});

// Configuration du port et des options SSL
const port = parseInt(Deno.args[0]) || 8080; // Ajout d'une valeur par défaut
const options: any = { port };

// Configuration SSL si des arguments sont fournis
if (Deno.args.length >= 3) {
  try {
    options.secure = true;
    options.certFile = Deno.args[1]; // Utiliser certFile au lieu de cert
    options.keyFile = Deno.args[2]; // Utiliser keyFile au lieu de key
    console.log(`SSL conf ready (use https)`);
  } catch (error) {
    console.error("Error loading SSL certificates:", error);
    console.log("Starting server without SSL...");
  }
}

console.log(`Oak static server running on port ${options.port} for the files in ${ROOT}`);
console.log(`Routes available:`);
console.log(`- /login`);
console.log(`- /chat`);
console.log(`- /new-game`);
console.log(`- /game/:id`);
console.log(`- /admin`);
console.log(`- /shared`);

// Démarrer le serveur
await app.listen(options);
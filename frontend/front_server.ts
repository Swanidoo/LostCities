import { Application, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Router } from "https://deno.land/x/oak@v12.6.1/router.ts";

// Define the ROOT constant
const ROOT = Deno.cwd();

// Create the application
const app = new Application();

// Middleware to set CORS headers
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 200;
    return;
  }
  
  await next();
});

// Game router for dynamic game routes
const gameRouter = new Router();

// Route to serve the game page
gameRouter.get("/game/:id", async (ctx) => {
  const gameId = ctx.params.id;
  try {
    // Read the HTML template
    const html = await Deno.readTextFile(`${ROOT}/game/game.html`);
    
    // Replace template variables with default values
    const modifiedHtml = html
      .replace(/\{\{userId\}\}/g, "1") // Default user ID
      .replace(/\{\{gameId\}\}/g, gameId)
      .replace(/\{\{player1Name\}\}/g, "Player 1")
      .replace(/\{\{player2Name\}\}/g, "Player 2");
    
    ctx.response.type = "text/html";
    ctx.response.body = modifiedHtml;
  } catch (error) {
    console.error("Error loading game page:", error);
    ctx.response.status = 404;
    ctx.response.body = "Game not found";
  }
});

// Use the game router
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());

// Middleware to serve static files with correct MIME types
app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;

  // Set mime types explicitly for important file types
  const mimeTypes = {
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
  };

  // Set content type based on file extension
  for (const [ext, type] of Object.entries(mimeTypes)) {
    if (path.endsWith(ext)) {
      ctx.response.headers.set("Content-Type", type);
      break;
    }
  }

  // Try to serve the file
  try {
    // Special case for matchmaking.html and matchmaking.js in root
    if (path === "/matchmaking.html" || path === "/matchmaking.js") {
      await send(ctx, path, { root: ROOT });
      return;
    }
    
    // Handle other static files
    await send(ctx, path, { root: ROOT });
    return;
  } catch (err) {
    if (err.name !== "NotFound") {
      console.error(`Error serving static file ${path}:`, err);
    }
    await next();
  }
});

// Default route - redirect to index.html or login
app.use(async (ctx) => {
  if (ctx.request.url.pathname === "/") {
    try {
      await send(ctx, "/index.html", { root: ROOT });
      return;
    } catch (err) {
      // Fallback to login if index.html doesn't exist
      ctx.response.redirect("/login/login.html");
      return;
    }
  }
  
  // If we get here, serve a 404 page
  try {
    await send(ctx, "/404.html", { root: ROOT });
  } catch (err) {
    ctx.response.status = 404;
    ctx.response.body = "Page not found";
  }
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
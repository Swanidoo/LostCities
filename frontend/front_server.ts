import { Application, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { Router } from "https://deno.land/x/oak@v12.6.1/router.ts";

const app = new Application();
const router = new Router();

// Définir la racine pour les fichiers statiques
const ROOT = Deno.cwd(); // Ceci était utilisé dans le message de log mais n'était pas défini

// Servir la page d'accueil
router.get("/", async (ctx) => {
  await ctx.send({
    root: ROOT,
    index: "index.html",
  });
});

// Routes spécifiques pour les pages principales
router.get("/login", async (ctx) => {
  ctx.response.redirect("/login/login.html");
});

router.get("/chat", async (ctx) => {
  ctx.response.redirect("/chat/chat.html");
});

router.get("/new-game", async (ctx) => {
  ctx.response.redirect("/game/new_game.html");
});

// Ajout d'une route pour les jeux
router.get("/game/:id", async (ctx) => {
  await ctx.send({
    root: ROOT,
    path: "game/game.html" // On sert directement game.html avec les paramètres de l'URL préservés
  });
});

// Router doit être utilisé avant le middleware de fichiers statiques
app.use(router.routes());
app.use(router.allowedMethods());

// Middleware pour servir les fichiers statiques
app.use(async (ctx, next) => {
  try {
    // Essayer de servir un fichier statique
    const filePath = ctx.request.url.pathname;
    
    // Servir tout fichier demandé directement
    await send(ctx, filePath, {
      root: ROOT,
    });
  } catch (err) {
    // Si le fichier n'est pas trouvé, passer au middleware suivant
    await next();
  }
});

// Middleware de fallback pour les routes non gérées
app.use(async (ctx) => {
  try {
    // Si aucune route n'a été trouvée, on essaie de servir index.html
    await ctx.send({
      root: ROOT,
      path: "index.html",
    });
  } catch (err) {
    // Si même index.html n'est pas trouvé, on renvoie une 404
    ctx.response.status = 404;
    ctx.response.body = "Page not found";
  }
});

// Configuration du port et des options SSL
const port = parseInt(Deno.args[0]) || 8080; // Ajout d'une valeur par défaut
const options: any = { port };

// Configuration SSL si des arguments sont fournis
if (Deno.args.length >= 3) {
  try {
    options.secure = true;
    options.certFile = Deno.args[1]; // Utiliser certFile au lieu de cert
    options.keyFile = Deno.args[2];  // Utiliser keyFile au lieu de key
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
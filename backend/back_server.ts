import { Application, Router } from "https://deno.land/x/oak@v17.1.4/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { DB } from "https://deno.land/x/sqlite/mod.ts";
import "https://deno.land/x/dotenv/load.ts";


// Initialisation de l'application
const app = new Application();

// Configuration CORS
app.use(oakCors({
  origin: ["http://127.0.0.1:8080", "http://localhost:8080"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// Gestion des erreurs globales
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Erreur serveur :", err);
    ctx.response.status = err.status || 500;
    ctx.response.body = { error: err.message || "Erreur interne" };
  }
});

// Connexion à la base de données SQLite
const db = new DB("users.db");

// Création de la table des utilisateurs
db.query(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

const router = new Router();

// 📌 Route d'inscription
router.post("/register", async (ctx) => {
    const body = ctx.request.body({ type: "json" });
  if (!body.value) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Requête invalide" };
    return;
  }
  const { email, password } = await body.value;

  const userExists = [...db.query("SELECT * FROM users WHERE email = ?", [email])];
  if (userExists.length > 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Utilisateur déjà existant !" };
    return;
  }

  const hashedPassword = await hash(password, 12);
  db.query("INSERT INTO users (username, email, password) VALUES (?, ?, ?)", [
    username,
    email,
    hashedPassword,
  ]);

  ctx.response.status = 201;
  ctx.response.body = { message: "Utilisateur créé !" };
});

// 📌 Route de connexion
router.post("/login", async (ctx) => {
  const { email, password } = await ctx.request.body({ type: "json" }).value;

  const user = db.queryEntries("SELECT * FROM users WHERE email = ?", [email]);
  if (user.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Utilisateur non trouvé !" };
    return;
  }
  const storedPassword = user[0].password;

  if (!(await compare(password, storedPassword))) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Mot de passe incorrect !" };
    return;
  }

  const jwtKey = Deno.env.get("JWT_SECRET") || "secret_par_defaut";
  
  const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60; // 1 hour
  
  const token = await create({ alg: "HS256", typ: "JWT" }, { email, exp: expirationTime }, jwtKey);

  ctx.response.body = { message: "Connexion réussie", token };
});


// 📌 Middleware d'authentification
const authMiddleware = async (ctx, next) => {
  const authHeader = ctx.request.headers.get("Authorization");
  if (!authHeader) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Non autorisé !" };
    return;
  }
  
  const token = authHeader.split(" ")[1];
  const jwtKey = Deno.env.get("JWT_SECRET") || "secret_par_defaut"; // Récupérer la clé secrète
  
  try {
    const payload = await verify(token, jwtKey, "HS256"); // Vérifier le token avec la bonne clé
    ctx.state.user = payload; // Ajouter le payload du token à l'état de la requête
    await next();
  } catch {
    ctx.response.status = 403;
    ctx.response.body = { error: "Token invalide ou expiré !" }; // Erreur si le token est invalide ou expiré
  }
};



// 📌 Route protégée
router.get("/profile", authMiddleware, (ctx) => {
  ctx.response.body = { message: "Bienvenue dans votre profil !" };
});

app.use(router.routes());
app.use(router.allowedMethods());

// 📌 Serveur WebSocket
const clients = new Set<WebSocket>();

const server = Deno.listen({ port: 8081 });
console.log("WebSocket server running on port 8081");

async function handleWs(conn: Deno.Conn) {
  const httpConn = Deno.serveHttp(conn);
  for await (const { request, respondWith } of httpConn) {
    if (request.headers.get("upgrade") !== "websocket") {
      respondWith(new Response("Not a WebSocket request", { status: 400 }));
      continue;
    }

    const { socket, response } = Deno.upgradeWebSocket(request);
    clients.add(socket);
    console.log("Nouvelle connexion WebSocket");
    
    socket.onmessage = (event) => {
      console.log("📩 Message reçu:", event.data);
      try {
        const parsedMessage = JSON.parse(event.data);
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ text: parsedMessage.text }));
          }
        });
      } catch (error) {
        console.error("Erreur WebSocket :", error);
      }
    };

    socket.onclose = () => clients.delete(socket);
    socket.onerror = (event) => {
      console.error("Erreur WebSocket :", event);
      clients.delete(socket);
    };
    

    respondWith(response);
  }
}

(async () => {
  for await (const conn of server) {
    handleWs(conn);
  }
})();

console.log("HTTP server running on port 3000");
await app.listen({ port: 3000 });

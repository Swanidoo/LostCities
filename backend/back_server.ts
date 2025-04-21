import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

// Initialisation de l'application
const app = new Application();

// Initialisation du routeur
const router = new Router();

// Récupération des variables d'environnement
const DATABASE_URL = Deno.env.get("DATABASE_URL");
console.log("DATABASE_URL:", DATABASE_URL);

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in the environment variables.");
  Deno.exit(1);
}

// Configuration CORS
app.use(oakCors({
  origin: [
    "http://127.0.0.1:8080", // Pour le développement local
    "http://localhost:8080", // Pour le développement local
    "https://lostcitiesfrontend.onrender.com", // Frontend déployé
  ],
  credentials: true, // Si tu utilises des cookies ou des headers d'authentification
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Méthodes HTTP autorisées
  allowedHeaders: ["Content-Type", "Authorization"], // Headers autorisés
}));

// Gestion des WebSockets
const connectedClients: WebSocket[] = []; // Liste des clients connectés

router.get("/ws", (ctx) => {
  if (ctx.isUpgradable) {
    const socket = ctx.upgrade(); // Met à niveau la connexion HTTP vers WebSocket
    console.log("✅ Client connecté au WebSocket !");

    // Ajouter le client à la liste des clients connectés
    connectedClients.push(socket);

    // Gérer les messages reçus
    socket.onmessage = (event) => {
      console.log("📩 Message reçu :", event.data);

      // Diffuser le message à tous les clients connectés
      connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(event.data);
        }
      });
    };

    // Gérer la déconnexion du client
    socket.onclose = () => {
      console.log("❌ Client déconnecté !");
      const index = connectedClients.indexOf(socket);
      if (index !== -1) {
        connectedClients.splice(index, 1); // Supprimer le client de la liste
      }
    };

    // Gérer les erreurs
    socket.onerror = (error) => {
      console.error("❌ Erreur WebSocket :", error);
    };
  } else {
    ctx.response.status = 400;
    ctx.response.body = { error: "Connexion WebSocket non supportée." };
  }
});

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

// Connexion à la base de données PostgreSQL avec mécanisme de retry
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000; // 5 secondes

async function connectWithRetry(attempt = 1) {
  try {
    console.log(`Tentative de connexion à la base de données (${attempt}/${MAX_RETRIES})...`);
    const client = new Client(DATABASE_URL);
    await client.connect();
    console.log("Connexion à la base de données établie !");
    return client;
  } catch (err) {
    if (attempt >= MAX_RETRIES) {
      console.error("Impossible de se connecter à la base de données après plusieurs tentatives :", err);
      Deno.exit(1);
    }
    console.error(`Échec de la connexion, nouvelle tentative dans ${RETRY_DELAY_MS / 1000} secondes...`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    return connectWithRetry(attempt + 1);
  }
}

const client = await connectWithRetry();

// 📌 Route pour la racine "/"
router.get("/", (ctx) => {
  ctx.response.status = 200;
  ctx.response.body = {
    message: "Bienvenue sur l'API LostCities !",
    routes: {
      register: "/register",
      login: "/login",
      profile: "/profile (requires authentication)",
    },
  };
});

// 📌 Route d'inscription
router.post("/register", async (ctx) => {
  const body = ctx.request.body({ type: "json" });
  const { username, email, password } = await body.value;

  // Vérifier si l'utilisateur existe déjà
  const userExists = await client.queryObject(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  if (userExists.rows.length > 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Utilisateur déjà existant !" };
    return;
  }

  // Hacher le mot de passe et insérer l'utilisateur
  const hashedPassword = await hash(password, 12);
  await client.queryObject(
    "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
    [username, email, hashedPassword]
  );

  ctx.response.status = 201;
  ctx.response.body = { message: "Utilisateur créé !" };
});

// 📌 Route de connexion
router.post("/login", async (ctx) => {
  try {
    const { email, password } = await ctx.request.body({ type: "json" }).value;

    // Retrieve the user
    const user = await client.queryObject(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (!user.rows || user.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const dbUser = user.rows[0];

    // Compare passwords
    const isPasswordValid = await compare(password, dbUser.password);
    if (!isPasswordValid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid password" };
      return;
    }

    // Respond with success (e.g., generate a JWT token)
    ctx.response.status = 200;
    ctx.response.body = { message: "Login successful" };
  } catch (err) {
    console.error("Error in /login route:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
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
  const jwtKey = Deno.env.get("JWT_SECRET") || "secret_par_defaut";

  try {
    const payload = await verify(token, jwtKey, "HS256");
    ctx.state.user = payload;
    await next();
  } catch {
    ctx.response.status = 403;
    ctx.response.body = { error: "Token invalide ou expiré !" };
  }
};

// 📌 Route protégée
router.get("/profile", authMiddleware, (ctx) => {
  ctx.response.body = { message: "Bienvenue dans votre profil !" };
});

app.use(router.routes());
app.use(router.allowedMethods());

// Lancer le serveur
console.log("HTTP server running on port 3000");
await app.listen({ port: 3000 });
import { Application, Router } from "https://deno.land/x/oak@v12.5.0/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
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

// Connexion à la base de données PostgreSQL
const client = new Client(Deno.env.get("DATABASE_URL")!);
await client.connect();

// Création des tables si elles n'existent pas
await client.queryObject(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);

// Initialisation du routeur
const router = new Router();

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
  const { email, password } = await ctx.request.body({ type: "json" }).value;

  // Récupérer l'utilisateur
  const user = await client.queryObject(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );
  if (user.rows.length === 0) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Utilisateur non trouvé !" };
    return;
  }

  const storedPassword = user.rows[0].password;

  // Vérifier le mot de passe
  if (!(await compare(password, storedPassword))) {
    ctx.response.status = 400;
    ctx.response.body = { error: "Mot de passe incorrect !" };
    return;
  }

  // Générer un token JWT
  const jwtKey = Deno.env.get("JWT_SECRET") || "secret_par_defaut";
  const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60; // 1 heure
  const token = await create(
    { alg: "HS256", typ: "JWT" },
    { email, exp: expirationTime },
    jwtKey
  );

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
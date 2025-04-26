import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { client } from "./db_client.ts";

const authRouter = new Router();

const jwtKey = Deno.env.get("JWT_SECRET"); // Load JWT_SECRET from the environment
if (!jwtKey) {
  console.error("JWT_SECRET is not set in the environment variables.");
  Deno.exit(1); // Exit if the secret is missing
}

const encoder = new TextEncoder();
const keyData = encoder.encode(jwtKey);
const cryptoKey = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

// Route for user registration
authRouter.post("/register", async (ctx) => {
  try {
    const { username, email, password } = await ctx.request.body({ type: "json" }).value;

    if (!username || !email || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Missing required fields: username, email, or password" };
      return;
    }

    const userExists = await client.queryObject("SELECT * FROM users WHERE email = $1", [email]);
    if (userExists.rows.length > 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "User already exists" };
      return;
    }

    const hashedPassword = await hash(password);
    await client.queryObject(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3)",
      [username, email, hashedPassword]
    );

    ctx.response.status = 201;
    ctx.response.body = { message: "User registered successfully" };
  } catch (err) {
    console.error("Error in /register:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Route for user login
authRouter.post("/login", async (ctx) => {
  try {
    const { email, password } = await ctx.request.body({ type: "json" }).value;

    const user = await client.queryObject("SELECT * FROM users WHERE email = $1", [email]);
    if (!user.rows.length) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const dbUser = user.rows[0];
    const isPasswordValid = await compare(password, dbUser.password); // bcrypt for password verification
    if (!isPasswordValid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid password" };
      return;
    }

    // Create the JWT token
    const payload = {
      id: dbUser.id,
      username: user.username,
      email: dbUser.email,
      role: dbUser.role, // Inclure le rôle dans le JWT
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expiration dans 1 heure
    };

    const jwt = await create(
      { alg: "HS256", typ: "JWT" }, // Header
      payload, // Payload
      cryptoKey // CryptoKey
    );

    ctx.response.status = 200;
    ctx.response.body = { message: "Login successful", token: jwt };
  } catch (err) {
    console.error("Error in /login:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Protected route for user profile
authRouter.get("/profile", authMiddleware, (ctx) => {
  ctx.response.body = { message: "Welcome to your profile!", user: ctx.state.user };
});

export default authRouter;
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { client } from "./db_client.ts";
import { cryptoKey, createJWT } from "./jwt_utils.ts";

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
    const isPasswordValid = await compare(password, dbUser.password);
    if (!isPasswordValid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid password" };
      return;
    }

    // Create the JWT token
    const payload = {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expiration dans 1 heure
    };

    const jwt = await createJWT(payload);

    // Dans la route /login, après la création du JWT
    console.log("🔍 JWT created:", jwt); // DEBUG
    console.log("🔍 JWT length:", jwt.length); // DEBUG

    // Au lieu de retourner le token, le mettre dans un cookie HTTP-only
    const isProduction = Deno.env.get("ENV") === "production";

    // En production sur Render, on sait qu'on est derrière HTTPS même si Oak ne le sait pas
    const isRenderProduction = isProduction && ctx.request.headers.get("host")?.includes("render.com");

    try {
      if (isRenderProduction) {
        // Sur Render, utiliser une approche spéciale pour contourner la vérification d'Oak
        ctx.response.headers.set(
          "Set-Cookie", 
          `authToken=${jwt}; HttpOnly; Secure; SameSite=None; Max-Age=3600; Path=/`
        );
        console.log(`✅ Cookie set manually for Render production`);
      } else {
        // Localement ou autres environnements, utiliser Oak normalement
        const proto = ctx.request.headers.get("x-forwarded-proto") || "http";
        const isSecure = isProduction && proto === "https";
        
        ctx.cookies.set("authToken", jwt, {
          httpOnly: true,
          secure: isSecure,
          sameSite: isProduction ? "none" : "lax",
          maxAge: 60 * 60 * 1000,
          path: "/"
        });
        
        console.log(`✅ Cookie set with Oak: secure=${isSecure}`);
      }
    } catch (err) {
      console.error("❌ Error setting cookie:", err);
      // Fallback ultime
      ctx.response.headers.set(
        "Set-Cookie", 
        `authToken=${jwt}; HttpOnly; Max-Age=3600; Path=/`
      );
    }

    console.log("✅ Cookie set successfully"); // DEBUG

    // Retourner seulement le message de succès (pas le token)
    ctx.response.status = 200;
    ctx.response.body = { 
      message: "Login successful",
      user: {
        id: dbUser.id,
        username: dbUser.username,
        email: dbUser.email,
        role: dbUser.role
      }
    };
  } catch (err) {
    console.error("Error in /login:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Protected route for user profile
authRouter.get("/profile", authMiddleware, (ctx) => {
  console.log("🔍 ctx.state.user:", ctx.state.user); // Debugging log

  if (!ctx.state.user) {
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: User not authenticated" };
    return;
  }

  ctx.response.body = { 
    message: "Welcome to your profile!", 
    user: ctx.state.user 
  };
});

// Route pour vérifier le statut de ban
authRouter.get("/ban-status", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    
    const banResult = await client.queryObject(
      `SELECT is_banned, banned_until, ban_reason FROM users WHERE id = $1`,
      [userId]
    );
    
    if (banResult.rows.length > 0) {
      const user = banResult.rows[0];
      
      if (user.is_banned && (!user.banned_until || new Date(user.banned_until) > new Date())) {
        ctx.response.body = {
          banned: true,
          banInfo: {
            reason: user.ban_reason,
            until: user.banned_until
          }
        };
        return;
      }
    }
    
    ctx.response.body = { banned: false };
  } catch (err) {
    console.error("Error checking ban status:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});


// Route pour logout - supprimer le cookie
authRouter.post("/logout", (ctx) => {
  ctx.cookies.delete("authToken");
  ctx.response.status = 200;
  ctx.response.body = { message: "Logged out successfully" };
});

// Route pour vérifier l'authentification
authRouter.get("/check-auth", authMiddleware, (ctx) => {
  // Si on arrive ici, c'est que l'utilisateur est authentifié
  ctx.response.body = { 
    authenticated: true,
    user: ctx.state.user 
  };
});

export default authRouter;
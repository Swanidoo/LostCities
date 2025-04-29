// front_server.ts
import { Application, Router, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";

// Create the application
const app = new Application();

// Create routers
const router = new Router();
const gameRouter = new Router();

// Basic routes
router.get("/", async (ctx) => {
  await send(ctx, "index.html", {
    root: `${Deno.cwd()}`,
  });
});

// Login routes
router.get("/login", async (ctx) => {
  await send(ctx, "/login/login.html", {
    root: `${Deno.cwd()}`,
  });
});

// Chat routes
router.get("/chat", async (ctx) => {
  await send(ctx, "/chat/chat.html", {
    root: `${Deno.cwd()}`,
  });
});

// Admin routes
router.get("/admin", async (ctx) => {
  await send(ctx, "/admin/admin.html", {
    root: `${Deno.cwd()}`,
  });
});

// Game routes
gameRouter.get("/game/:id", async (ctx) => {
  const gameId = ctx.params.id;
  
  // Get auth cookie
  const cookies = await ctx.cookies;
  const token = cookies.get("auth_token");
  
  // If no token, redirect to login
  if (!token) {
    ctx.response.redirect("/login");
    return;
  }
  
  // Fetch game data from API
  try {
    const response = await fetch(`http://backend:3000/lost-cities/games/${gameId}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      // If game not found or user not authorized, redirect to home
      ctx.response.redirect("/");
      return;
    }
    
    const gameData = await response.json();
    
    // Get user info from API
    const userResponse = await fetch("http://backend:3000/user", {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    
    if (!userResponse.ok) {
      ctx.response.redirect("/login");
      return;
    }
    
    const userData = await userResponse.json();
    
    // Determine player names
    let player1Name = "Player 1";
    let player2Name = "Player 2";
    
    if (gameData.player1.id === userData.id) {
      player1Name = userData.username;
      
      // Fetch opponent name
      const opponentResponse = await fetch(`http://backend:3000/users/${gameData.player2.id}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (opponentResponse.ok) {
        const opponentData = await opponentResponse.json();
        player2Name = opponentData.username;
      }
    } else {
      player2Name = userData.username;
      
      // Fetch opponent name
      const opponentResponse = await fetch(`http://backend:3000/users/${gameData.player1.id}`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (opponentResponse.ok) {
        const opponentData = await opponentResponse.json();
        player1Name = opponentData.username;
      }
    }
    
    // Render game page with template data
    const html = await Deno.readTextFile("./game/game.html");
    const renderedHtml = html
      .replace("{{userId}}", userData.id)
      .replace("{{gameId}}", gameId)
      .replace("{{player1Name}}", player1Name)
      .replace("{{player2Name}}", player2Name);
    
    ctx.response.type = "text/html";
    ctx.response.body = renderedHtml;
    
  } catch (error) {
    console.error("Error loading game:", error);
    ctx.response.redirect("/");
  }
});

// Route to create a new game
gameRouter.get("/new-game", async (ctx) => {
  // Get auth cookie
  const cookies = await ctx.cookies;
  const token = cookies.get("auth_token");
  
  // If no token, redirect to login
  if (!token) {
    ctx.response.redirect("/login");
    return;
  }
  
  // Render new game form
  const html = await Deno.readTextFile("./game/new_game.html");
  
  ctx.response.type = "text/html";
  ctx.response.body = html;
});

// Route to process new game form
gameRouter.post("/new-game", async (ctx) => {
  const cookies = await ctx.cookies;
  const token = cookies.get("auth_token");
  
  // If no token, redirect to login
  if (!token) {
    ctx.response.redirect("/login");
    return;
  }
  
  try {
    const formData = await ctx.request.body({ type: "form" }).value;
    const opponentId = formData.get("opponent_id");
    const usePurple = formData.get("use_purple") === "on";
    
    // Create game via API
    const response = await fetch("http://backend:3000/lost-cities/games", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        opponentId,
        usePurpleExpedition: usePurple
      })
    });
    
    if (!response.ok) {
      throw new Error("Failed to create game");
    }
    
    const responseData = await response.json();
    const gameId = responseData.gameId;
    
    // Redirect to the new game
    ctx.response.redirect(`/game/${gameId}`);
    
  } catch (error) {
    console.error("Error creating game:", error);
    ctx.response.redirect("/new-game?error=failed");
  }
});

// Add the routers to the application
app.use(router.routes());
app.use(router.allowedMethods());
app.use(gameRouter.routes());
app.use(gameRouter.allowedMethods());

// Create a specific middleware to handle static files like CSS and JS
app.use(async (ctx, next) => {
  try {
    const path = ctx.request.url.pathname;
    
    // Serve static files from the correct directories
    if (
      path.endsWith('.css') || 
      path.endsWith('.js') || 
      path.endsWith('.html') || 
      path.endsWith('.png') || 
      path.endsWith('.jpg') || 
      path.endsWith('.ico')
    ) {
      await send(ctx, path, {
        root: `${Deno.cwd()}`,
        index: "index.html",
      });
      return;
    }
    
    // Special handling for game assets
    if (path.startsWith('/game/') && !path.includes(':')) {
      await send(ctx, path, {
        root: `${Deno.cwd()}`,
      });
      return;
    }
    
    // If we get here, proceed to the next middleware
    await next();
  } catch (err) {
    console.error(`Error serving static file: ${err.message}`);
    await next();
  }
});

// Log each request
app.use(async (ctx, next) => {
  console.log(`Request: ${ctx.request.method} ${ctx.request.url.pathname}`);
  await next();
  console.log(`Response: ${ctx.response.status}`);
});

// Create a fallback index page for development
if (!await Deno.stat("./index.html").catch(() => null)) {
  await Deno.writeTextFile("./index.html", `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Lost Cities: Le Duel</title>
      <style>
        body { font-family: Arial, sans-serif; text-align: center; margin-top: 50px; }
        nav { margin: 20px 0; }
        a { margin: 0 10px; color: #007BFF; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>Lost Cities: Le Duel</h1>
      <p>Welcome to the Lost Cities card game!</p>
      <nav>
        <a href="/login">Login</a>
        <a href="/chat">Chat</a>
        <a href="/new-game">New Game</a>
      </nav>
    </body>
    </html>
  `);
}

// Get port from command line argument or default to 8080
const port = parseInt(Deno.args[0] || "8080");

// Log that we're starting
console.log(`Starting server on port ${port}...`);

// Start the server - THIS IS THE CRUCIAL LINE THAT WAS MISSING
await app.listen({ port });
// Add these imports and routes to your front_server.ts file

// Import necessary modules
import { Router } from "https://deno.land/x/oak@v12.6.1/router.ts";
import { Application, send } from "https://deno.land/x/oak@v12.6.1/mod.ts";

// Game routes
const gameRouter = new Router();

// Route to serve the game page
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

// Add this to your existing app setup:
// app.use(gameRouter.routes());
// app.use(gameRouter.allowedMethods());

// Add this to serve static game assets:
// app.use(async (ctx, next) => {
//   if (ctx.request.url.pathname.startsWith("/game/")) {
//     try {
//       await send(ctx, ctx.request.url.pathname, {
//         root: `${Deno.cwd()}/frontend`,
//       });
//     } catch {
//       await next();
//     }
//     return;
//   }
//   await next();
// });
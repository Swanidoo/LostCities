import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { client } from "./db_client.ts";
import { LostCitiesGame } from "./lost_cities/lost_cities_controller.ts";

const wsRouter = new Router();
const connectedClients: Map<string, { socket: WebSocket; username: string }> = new Map();

// Matchmaking queue et parties en cours
const matchmakingQueue: { userId: string; socket: WebSocket; timestamp: number }[] = [];
const activeGames: Map<string, { gameId: string; player1: string; player2: string; timestamp: number }> = new Map();

// Map pour suivre les abonnements aux jeux: gameId -> Set de WebSockets
const gameSubscriptions: Map<string, Set<WebSocket>> = new Map();

const jwtKey = Deno.env.get("JWT_SECRET");
if (!jwtKey) {
  console.error("❌ JWT_SECRET is not set in the environment variables.");
  Deno.exit(1);
}

// Debug function to log connected clients
function logConnectedClients() {
  console.log(`=== CONNECTED CLIENTS (${connectedClients.size}) ===`);
  Array.from(connectedClients.entries()).forEach(([userId, client], index) => {
    console.log(`  ${index + 1}. ${userId} (${client.username}) - Ready state: ${client.socket.readyState}`);
  });
  console.log("======================================");
}

// Set up a periodic check of connected clients
setInterval(() => {
  logConnectedClients();
  
  // Clean up any closed connections
  for (const [userId, client] of connectedClients.entries()) {
    if (client.socket.readyState !== WebSocket.OPEN) {
      console.log(`🧹 Cleaning up closed connection for ${client.username} (${userId})`);
      connectedClients.delete(userId);
    }
  }
  
  // Clean up matchmaking queue (remove users who disconnected)
  for (let i = matchmakingQueue.length - 1; i >= 0; i--) {
    const entry = matchmakingQueue[i];
    if (entry.socket.readyState !== WebSocket.OPEN) {
      console.log(`🧹 Removing disconnected user from matchmaking queue: ${entry.userId}`);
      matchmakingQueue.splice(i, 1);
    }
  }
  
  // Nettoyer les jeux inactifs (plus vieux que 24h)
  const currentTime = Date.now();
  const MAX_GAME_AGE = 24 * 60 * 60 * 1000; // 24 heures
  
  for (const [gameId, game] of activeGames.entries()) {
    if (currentTime - game.timestamp > MAX_GAME_AGE) {
      console.log(`🧹 Removing inactive game: ${gameId}`);
      activeGames.delete(gameId);
    }
  }
  
  // Clean up game subscriptions
  cleanupGameSubscriptions();
}, 30000); // Every 30 seconds

// Function to check for possible matchmaking
function processMatchmaking() {
  console.log(`⚙️ Processing matchmaking queue (${matchmakingQueue.length} players waiting)`);
  
  if (matchmakingQueue.length < 2) return; // Need at least 2 players
  
  // Simple algorithm: match the two players who have been waiting the longest
  const player1 = matchmakingQueue.shift();
  const player2 = matchmakingQueue.shift();
  
  if (!player1 || !player2) return;
  
  // Check if both sockets are still open
  if (player1.socket.readyState !== WebSocket.OPEN || player2.socket.readyState !== WebSocket.OPEN) {
    // Put back any player with open connection
    if (player1.socket.readyState === WebSocket.OPEN) {
      matchmakingQueue.push(player1);
    }
    if (player2.socket.readyState === WebSocket.OPEN) {
      matchmakingQueue.push(player2);
    }
    return;
  }
  
  console.log(`🎮 Creating a game between ${player1.userId} and ${player2.userId}`);
  
  // Create a new game
  createGameBetweenPlayers(player1.userId, player2.userId, player1.socket, player2.socket);
}

// Run matchmaking every 5 seconds
setInterval(processMatchmaking, 5000);

// Function to create a game between two players
async function createGameBetweenPlayers(player1Id: string, player2Id: string, socket1: WebSocket, socket2: WebSocket) {
  try {
    // Notify both players they've been matched
    const player1Client = connectedClients.get(player1Id);
    const player2Client = connectedClients.get(player2Id);
    
    if (!player1Client || !player2Client) {
      console.error("❌ One of the players is not connected anymore");
      return;
    }
    
    // Send matched notification
    socket1.send(JSON.stringify({
      event: "matchmakingUpdate",
      data: {
        status: "matched",
        opponent: player2Client.username
      }
    }));
    
    socket2.send(JSON.stringify({
      event: "matchmakingUpdate",
      data: {
        status: "matched",
        opponent: player1Client.username
      }
    }));
    
    // Create game in database
    const usePurpleExpedition = true; // You can make this configurable
    
    try {
      // Create game entry
      const gameResult = await client.queryObject<{id: number}>(
        `INSERT INTO games (
          player1_id, 
          player2_id, 
          status
        ) VALUES ($1, $2, 'in_progress') RETURNING id`,
        [player1Id, player2Id]
      );
      
      const gameId = gameResult.rows[0].id;
      
      // Create game instance
      const game = new LostCitiesGame({
        gameId,
        usePurpleExpedition,
        player1: { id: player1Id },
        player2: { id: player2Id }
      });
      
      // Initialize game
      game.initGame(player1Id, player2Id);
      
      // Save initial state
      await game.save();
      
      // Add to active games
      activeGames.set(gameId.toString(), {
        gameId: gameId.toString(),
        player1: player1Id,
        player2: player2Id,
        timestamp: Date.now()
      });
      
      // Send game created event to both players
      socket1.send(JSON.stringify({
        event: "gameCreated",
        data: {
          gameId: gameId,
          opponent: player2Client.username
        }
      }));
      
      socket2.send(JSON.stringify({
        event: "gameCreated",
        data: {
          gameId: gameId,
          opponent: player1Client.username
        }
      }));
      
      console.log(`✅ Game ${gameId} created successfully`);
    } catch (error) {
      console.error("❌ Error creating game:", error);
      
      // Notify players of error
      socket1.send(JSON.stringify({
        event: "systemMessage",
        data: { message: "Erreur lors de la création de la partie. Veuillez réessayer." }
      }));
      
      socket2.send(JSON.stringify({
        event: "systemMessage",
        data: { message: "Erreur lors de la création de la partie. Veuillez réessayer." }
      }));
    }
  } catch (error) {
    console.error("❌ Error in createGameBetweenPlayers:", error);
  }
}

wsRouter.get("/ws", async (ctx) => {
  try {
    if (!ctx.isUpgradable) {
      console.error("❌ WebSocket upgrade not supported");
      ctx.throw(400, "WebSocket connection not supported.");
    }

    const { searchParams } = new URL(ctx.request.url.href);
    const token = searchParams.get("token");
    console.log("🔍 Received token:", token ? `${token.substring(0, 20)}...` : "null");
    
    if (!token) {
      console.error("❌ Missing token in query string");
      ctx.throw(400, "Missing token");
    }

    try {
      // Create the same CryptoKey used for signing in auth_routes.ts
      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtKey);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      
      // Verify with the CryptoKey
      const payload = await verify(token, cryptoKey);
      console.log("✅ Token valid:", payload);
      
      if (typeof payload !== "object" || payload === null) {
        console.error("❌ Invalid token payload structure");
        ctx.throw(401, "Invalid token payload structure");
      }
      
      const username = (payload as Record<string, unknown>).username || (payload as Record<string, unknown>).email;
      const userId = (payload as Record<string, unknown>).id;
      
      if (typeof username !== "string" || typeof userId !== "string") {
        console.error("❌ Invalid token payload: Missing username, email or id");
        ctx.throw(401, "Invalid token payload");
      }
      
      // Upgrade the connection
      let socket;
      try {
        socket = ctx.upgrade();
        console.log(`✅ Client connected to WebSocket as ${username} (${userId})!`);
      } catch (error) {
        console.error(`❌ Failed to upgrade connection for ${username}:`, error);
        ctx.throw(500, "Failed to upgrade connection");
      }
      
      // Check for existing connections with the same userId and close them
      if (connectedClients.has(userId.toString())) {
        const existingClient = connectedClients.get(userId.toString());
        if (existingClient && existingClient.socket.readyState === WebSocket.OPEN) {
          console.log(`⚠️ Found existing connection for ${username} (${userId}), closing it.`);
          try {
            existingClient.socket.close(1000, "User reconnected");
          } catch (e) {
            console.error("Error closing existing connection:", e);
          }
        }
      }
      
      // Add the new client to the connected clients map
      connectedClients.set(userId.toString(), { socket, username: username.toString() });
      console.log(`👥 Current connected clients: ${connectedClients.size}`);
      
      // Remove user from matchmaking queue if they were there
      const queueIndex = matchmakingQueue.findIndex(entry => entry.userId === userId.toString());
      if (queueIndex !== -1) {
        matchmakingQueue.splice(queueIndex, 1);
      }
      
      // Send a welcome message to the client
      try {
        socket.send(JSON.stringify({
          event: "systemMessage",
          data: { message: `Bienvenue, ${username}!` }
        }));
        
        // Send online players list
        sendOnlinePlayersList(socket);
      } catch (error) {
        console.error(`❌ Error sending welcome message to ${username}:`, error);
      }
      
      // Notify others that a new user has joined
      broadcastSystemMessage(`${username} a rejoint le chat.`, socket);
      
      // Set up message event listener
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📩 Message received:", data);
          
          switch (data.event) {
            case "chatMessage":
              handleChatMessage(data.data, socket, username.toString(), userId.toString());
              break;
              
            case "startMatchmaking":
              handleStartMatchmaking(data.data, socket, userId.toString());
              break;
              
            case "cancelMatchmaking":
              handleCancelMatchmaking(data.data, socket, userId.toString());
              break;
              
            case "getOnlinePlayers":
              sendOnlinePlayersList(socket);
              break;
              
            case "challengePlayer":
              handleChallengePlayer(data.data, socket, userId.toString());
              break;
              
            case "gameAction":
              handleGameAction(data.data, socket, userId.toString());
              break;
              
            case "subscribeGame":
              handleGameSubscription(data.data, socket, username.toString());
              break;
              
            default:
              console.warn("⚠️ Unknown message type or missing data:", data);
          }
        } catch (error) {
          console.error("❌ Error parsing message:", error);
        }
      };
      
      // Set up close event listener
      socket.onclose = (event) => {
        console.log(`👋 Client ${username} (${userId}) disconnected with code ${event.code} and reason "${event.reason}"`);
        
        // Remove the client from the connected clients map
        connectedClients.delete(userId.toString());
        console.log(`👥 Remaining connected clients: ${connectedClients.size}`);
        
        // Remove from matchmaking queue
        const queueIndex = matchmakingQueue.findIndex(entry => entry.userId === userId.toString());
        if (queueIndex !== -1) {
          console.log(`🎮 Removing ${username} from matchmaking queue due to disconnect`);
          matchmakingQueue.splice(queueIndex, 1);
        }
        
        // Remove from game subscriptions
        handleGameClientDisconnect(socket);
        
        // Notify others that the user has left
        broadcastSystemMessage(`${username} a quitté le chat.`);
      };
      
      // Set up error event listener
      socket.onerror = (error) => {
        console.error(`❌ WebSocket error for ${username}:`, error);
      };
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { loadGameState } from "./game_routes.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = [];
const playersLookingForMatch: { socket: WebSocket; userId: string; username: string }[] = [];
const gameSubscriptions: Map<string, Set<WebSocket>> = new Map();

const jwtKey = Deno.env.get("JWT_SECRET");
if (!jwtKey) {
  console.error("❌ JWT_SECRET is not set in the environment variables.");
  Deno.exit(1);
}

// Debug function to log all connected clients
function logConnectedClients() {
  console.log(`=== CONNECTED CLIENTS (${connectedClients.length}) ===`);
  connectedClients.forEach((client, index) => {
    console.log(`  ${index + 1}. ${client.username} - Ready state: ${client.socket.readyState}`);
  });
  console.log("======================================");
}

// Set up a periodic check of connected clients
setInterval(() => {
  logConnectedClients();
  
  // Clean up any closed connections that might still be in the array
  const initialCount = connectedClients.length;
  for (let i = connectedClients.length - 1; i >= 0; i--) {
    if (connectedClients[i].socket.readyState !== WebSocket.OPEN) {
      console.log(`🧹 Cleaning up closed connection for ${connectedClients[i].username}`);
      connectedClients.splice(i, 1);
    }
  }
  if (initialCount !== connectedClients.length) {
    console.log(`👥 After cleanup: ${connectedClients.length} connected clients`);
  }
}, 30000); // Every 30 seconds

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
      if (typeof username !== "string") {
        console.error("❌ Invalid token payload: Missing username or email");
        ctx.throw(401, "Invalid token payload");
      }
      
      // Upgrade the connection
      let socket;
      try {
        socket = ctx.upgrade();
        console.log(`✅ Client connected to WebSocket as ${username}!`);
      } catch (error) {
        console.error(`❌ Failed to upgrade connection for ${username}:`, error);
        ctx.throw(500, "Failed to upgrade connection");
      }
      
      // Check for existing connections with the same username and remove them
      const existingIndex = connectedClients.findIndex(client => client.username === username);
      if (existingIndex !== -1) {
        console.log(`⚠️ Found existing connection for ${username}, closing it.`);
        try {
          connectedClients[existingIndex].socket.close(1000, "User reconnected");
        } catch (e) {
          console.error("Error closing existing connection:", e);
        }
        connectedClients.splice(existingIndex, 1);
      }
      
      // Add the new client to the connected clients array
      connectedClients.push({ socket, username });
      console.log(`👥 Current connected clients: ${connectedClients.length}`);
      logConnectedClients();
      
      // Send a welcome message to the client
      try {
        socket.send(JSON.stringify({
          event: "systemMessage",
          data: { message: `Welcome to the chat, ${username}!` }
        }));
      } catch (error) {
        console.error(`❌ Error sending welcome message to ${username}:`, error);
      }
      
      // Notify others that a new user has joined
      broadcastSystemMessage(`${username} has joined the chat.`, socket);
      
      // WebSocket message event handler 
      socket.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          console.log("📩 Message received:", data);

          // Find the client in our connected clients array
          const clientIndex = connectedClients.findIndex(client => client.socket === socket);
          if (clientIndex === -1) {
            console.warn("⚠️ Message received from unknown client");
            return;
          }
          
          // Get client data including username
          const clientData = connectedClients[clientIndex];
          
          // Inside the socket.onmessage function in ws_routes.ts
          switch (data.event) {
            case "chatMessage":
                if (data.data?.message) {
                    handleChatMessage(data.data, socket, clientData.username);
                }
                break;
            case "movePlayed":
                if (data.data?.gameId && data.data?.move) {
                    handleMovePlayed(data.data, socket, clientData.username);
                }
                break;
            case "findMatch":
                // Use the userId from the message data, not from unknown scope
                handleMatchmaking(socket, clientData.username, data.data?.userId);
                break;
            case "cancelMatch":
                removeFromMatchmaking(socket);
                break;
            case "getOnlinePlayers":
                // Handle request for online players
                handleGetOnlinePlayers(socket);
                break;
            case "subscribeGame":
                // Add this new case to handle game subscriptions
                if (data.data?.gameId) {
                    handleGameSubscription(data.data, socket, clientData.username);
                }
                break;
            case "requestGameState":
                // Add this case to handle game state requests
                if (data.data?.gameId) {
                    handleGameStateRequest(data.data, socket, clientData.username);
                }
                break;
            default:
                console.warn("⚠️ Unknown message type or missing data:", data);
          }
        } catch (error) {
          console.error("❌ Error parsing message:", error);
        }
      };
            
      
      // WebSocket onclose event handler 
      socket.onclose = function(event) {
        // Find client data from the array instead of using local variables
        const clientIndex = connectedClients.findIndex(client => client.socket === socket);
        const clientData = clientIndex !== -1 ? connectedClients[clientIndex] : { username: "unknown user" };
        
        console.log(`👋 Client ${clientData.username} disconnected with code ${event.code} and reason "${event.reason}"`);
        
        // Remove the client from the connected clients array
        if (clientIndex !== -1) {
          connectedClients.splice(clientIndex, 1);
          console.log(`👥 Remaining connected clients: ${connectedClients.length}`);
        } else {
          console.warn("⚠️ Could not find client in connected clients array!");
        }
        
        // Notify others that the user has left
        broadcastSystemMessage(`${clientData.username} has left the chat.`);
        
        // Handle player disconnect for matchmaking
        removeFromMatchmaking(socket);
      }
      
      // Set up error event listener
      socket.onerror = (error) => {
        console.error(`❌ WebSocket error for ${username}:`, error);
      };
      
    } catch (err) {
      console.error("❌ Invalid or expired token:", err.message);
      ctx.throw(401, "Invalid or expired token");
    }
  } catch (error) {
    console.error("❌ Error in WebSocket route:", error);
    if (!ctx.response.writable) {
      console.error("❌ Cannot respond, context already used");
      return;
    }
    ctx.response.status = error.status || 500;
    ctx.response.body = { error: error.message || "Internal server error" };
  }
});

// Broadcast a system message to all clients except the excluded socket
function broadcastSystemMessage(message: string, excludeSocket?: WebSocket) {
  console.log(`💬 Broadcasting system message: ${message}`);
  const systemMessage = JSON.stringify({
    event: "systemMessage",
    data: { message }
  });
  
  let sentCount = 0;
  connectedClients.forEach((client) => {
    try {
      if ((!excludeSocket || client.socket !== excludeSocket) && 
          client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(systemMessage);
        sentCount++;
      }
    } catch (error) {
      console.error(`❌ Error sending system message to ${client.username}:`, error);
    }
  });
  console.log(`✅ System message sent to ${sentCount} clients`);
}

// Handle chat messages
function handleChatMessage(
  data: { message: string },
  sender: WebSocket,
  username: string
) {
  console.log(`💬 Chat message from ${username}: ${data.message}`);
  
  // Format the message to be sent
  const formattedMessage = JSON.stringify({ 
    event: "chatMessage", 
    data: { username, message: data.message } 
  });
  
  console.log(`📤 Sending message to all other clients (${connectedClients.length - 1} others)`);
  
  // Send to all other connected clients
  let sentCount = 0;
  connectedClients.forEach((client) => {
    try {
      if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
        console.log(`  📨 Sending to ${client.username}`);
        client.socket.send(formattedMessage);
        sentCount++;
      }
    } catch (error) {
      console.error(`❌ Error sending message to ${client.username}:`, error);
    }
  });
  
  console.log(`✅ Message sent to ${sentCount} clients`);
}

// Handle moves played in the game
function handleMovePlayed(
  data: { gameId: string; move: string },
  sender: WebSocket,
  username: string
) {
  console.log(`🎮 Move played in game ${data.gameId} by ${username}: ${data.move}`);
  
  // Format the message
  const formattedMessage = JSON.stringify({ 
    event: "movePlayed", 
    data: { username, gameId: data.gameId, move: data.move } 
  });
  
  // Send to all OTHER connected clients
  let sentCount = 0;
  connectedClients.forEach((client) => {
    try {
      if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(formattedMessage);
        sentCount++;
      }
    } catch (error) {
      console.error(`❌ Error sending move to ${client.username}:`, error);
    }
  });
  
  console.log(`✅ Move sent to ${sentCount} clients`);
}


// Function to handle getOnlinePlayers request
function handleGetOnlinePlayers(socket) {
  // Get list of online players (excluding the requestor)
  const onlinePlayers = connectedClients.map(client => ({
    username: client.username,
    status: 'available' // You can add more status types if needed
  }));
  
  // Send the list to the client
  socket.send(JSON.stringify({
    event: "onlinePlayers",
    data: { players: onlinePlayers }
  }));
}

// Notify game players about updates
function notifyGamePlayers(gameId: string, gameState: any): void {
  const subscribers = gameSubscriptions.get(gameId);
  if (!subscribers) return;

  const message = JSON.stringify({
    event: "gameUpdate",
    data: { gameId, gameState }
  });

  subscribers.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(message);
      } catch (error) {
        console.error(`❌ Error notifying player in game ${gameId}:`, error);
      }
    }
  });
}


function handleMatchmaking(socket, username, userId) {
  console.log(`🎮 User ${username} (${userId}) is looking for a match`);
  
  // Remove any existing entry for this player (in case they're already searching)
  removeFromMatchmaking(socket);
  
  // Add to matchmaking queue
  playersLookingForMatch.push({ socket, userId, username });
  
  // Send confirmation to player
  socket.send(JSON.stringify({
    event: "matchmakingStatus",
    data: { status: "searching", message: "Looking for an opponent..." }
  }));
  
  // Try to find a match
  tryFindMatch();
}

function removeFromMatchmaking(socket: WebSocket) {
  const index = playersLookingForMatch.findIndex(player => player.socket === socket);
  if (index !== -1) {
    const player = playersLookingForMatch[index];
    console.log(`🎮 User ${player.username} (${player.userId}) stopped looking for a match`);
    playersLookingForMatch.splice(index, 1);
  }
}

function tryFindMatch() {
  // Need at least 2 players to make a match
  if (playersLookingForMatch.length >= 2) {
    // Take the first two players in the queue
    const player1 = playersLookingForMatch.shift();
    const player2 = playersLookingForMatch.shift();
    
    console.log(`🎮 Match found between ${player1.username} and ${player2.username}`);
    
    // Create a simple game ID (just using timestamp for now)
    const gameId = Date.now().toString();
    
    // Notify both players
    player1.socket.send(JSON.stringify({
      event: "matchFound",
      data: { 
        gameId,
        opponentId: player2.userId,
        opponentName: player2.username
      }
    }));
    
    player2.socket.send(JSON.stringify({
      event: "matchFound",
      data: { 
        gameId,
        opponentId: player1.userId,
        opponentName: player1.username
      }
    }));
  }
}

// Handle game subscription requests
function handleGameSubscription(data: { gameId: string }, socket: WebSocket, username: string): void {
  console.log(`🎮 User ${username} subscribing to game ${data.gameId}`);
  
  // Create set for this game if it doesn't exist
  if (!gameSubscriptions.has(data.gameId)) {
      gameSubscriptions.set(data.gameId, new Set());
  }
  
  // Add socket to the game's subscriptions
  const subscribers = gameSubscriptions.get(data.gameId)!;
  subscribers.add(socket);
  
  console.log(`✅ User ${username} subscribed to game ${data.gameId}. Total subscribers: ${subscribers.size}`);
  
  // Send confirmation to the client
  try {
      socket.send(JSON.stringify({
          event: 'gameSubscribed',
          data: { gameId: data.gameId }
      }));
  } catch (error) {
      console.error(`❌ Error sending subscription confirmation to ${username}:`, error);
  }
}

// Handle requests for game state
function handleGameStateRequest(data: { gameId: string }, socket: WebSocket, username: string): void {
  console.log(`🎮 User ${username} requested game state for game ${data.gameId}`);
  
  // Try to load the game
  try {
      // Load the game state from database
      loadGameState(data.gameId).then(game => {
          // Send the game state to the client
          socket.send(JSON.stringify({
              event: 'gameUpdated',
              data: {
                  gameId: data.gameId,
                  gameState: game.getGameState(username)
              }
          }));
          console.log(`✅ Sent game state to ${username} for game ${data.gameId}`);
      }).catch(error => {
          console.error(`❌ Error loading game state: ${error.message}`);
          // Send error to client
          socket.send(JSON.stringify({
              event: 'error',
              data: { message: 'Error loading game state' }
          }));
      });
  } catch (error) {
      console.error(`❌ Error handling game state request: ${error.message}`);
  }
}


export { notifyGamePlayers };
export default wsRouter;
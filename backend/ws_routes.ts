import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

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

// Handle matchmaking requests
function handleMatchmaking(socket: WebSocket, username: string, userId: string) {
  console.log(`🎮 User ${username} (${userId}) is looking for a match`);
  
  // Remove any existing entry
  removeFromMatchmaking(socket);
  
  // Add to queue
  playersLookingForMatch.push({ socket, userId, username });
  
  // Send confirmation
  try {
    socket.send(JSON.stringify({
      event: "matchmakingStatus",
      data: { status: "searching", message: "Looking for an opponent..." }
    }));
  } catch (error) {
    console.error("Error sending matchmaking confirmation:", error);
  }
  
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
  if (playersLookingForMatch.length >= 2) {
    const player1 = playersLookingForMatch.shift();
    const player2 = playersLookingForMatch.shift();
    
    const gameId = Date.now().toString();
    
    console.log(`🎮 Match found between ${player1.username} and ${player2.username}`);
    
    try {
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
    } catch (error) {
      console.error("Error notifying players about match:", error);
    }
  }
}

// Game subscription handler
function handleGameSubscription(data: { gameId: string }, socket: WebSocket, username: string) {
  const gameId = data.gameId;
  console.log(`🎮 User ${username} subscribing to game ${gameId}`);
  
  // Create set for this game if it doesn't exist
  if (!gameSubscriptions.has(gameId)) {
    gameSubscriptions.set(gameId, new Set());
  }
  
  // Add socket to the game's subscriptions
  const subscribers = gameSubscriptions.get(gameId);
  subscribers.add(socket);
  
  console.log(`✅ User ${username} subscribed to game ${gameId}. Total subscribers: ${subscribers.size}`);
  
  // Send confirmation to the client
  try {
    socket.send(JSON.stringify({
      event: 'gameSubscribed',
      data: { gameId }
    }));
  } catch (error) {
    console.error(`❌ Error sending subscription confirmation to ${username}:`, error);
  }
}

// Game move handler
function handleGameMove(data: { gameId: string, moveType: string, moveData: any }, socket: WebSocket, username: string) {
  console.log(`🎮 Move in game ${data.gameId} by ${username}: ${data.moveType}`);
  
  // Get subscribers to this game
  const subscribers = gameSubscriptions.get(data.gameId);
  if (!subscribers) {
    console.log(`ℹ️ No subscribers for game ${data.gameId}`);
    return;
  }
  
  // Format the message
  const message = JSON.stringify({
    event: 'gameMove',
    data: {
      gameId: data.gameId,
      player: username,
      moveType: data.moveType,
      moveData: data.moveData,
      timestamp: new Date().toISOString()
    }
  });
  
  // Send to all OTHER subscribers of this game
  let sentCount = 0;
  subscribers.forEach(sub => {
    try {
      if (sub !== socket && sub.readyState === WebSocket.OPEN) {
        sub.send(message);
        sentCount++;
      }
    } catch (error) {
      console.error('❌ Error broadcasting game move:', error);
      // Remove socket on error
      subscribers.delete(sub);
    }
  });
  
  console.log(`✅ Move broadcast to ${sentCount} subscribers`);
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
      const encoder = new TextEncoder();
      const keyData = encoder.encode(jwtKey);
      const cryptoKey = await crypto.subtle.importKey(
        "raw",
        keyData,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"]
      );
      
      const payload = await verify(token, cryptoKey);
      console.log("✅ Token valid:", payload);
      
      if (typeof payload !== "object" || payload === null) {
        console.error("❌ Invalid token payload structure");
        ctx.throw(401, "Invalid token payload structure");
      }
      
      const username = (payload as Record<string, unknown>).username || (payload as Record<string, unknown>).email;
      const userId = (payload as Record<string, unknown>).id;
      
      if (typeof username !== "string" || userId === undefined) {
        console.error("❌ Invalid token payload: Missing username or id");
        ctx.throw(401, "Invalid token payload");
      }
      
      // Convert userId to string
      const userIdStr = String(userId);
      
      let socket;
      try {
        socket = ctx.upgrade();
        console.log(`✅ Client connected to WebSocket as ${username} (${userIdStr})!`);
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
      
      // Set up message event listener
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📩 Message received:", data);
          
          if (data.event === "chatMessage" && data.data?.message) {
            handleChatMessage(data.data, socket, username);
          } else if (data.event === "movePlayed" && data.data?.gameId && data.data?.move) {
            handleMovePlayed(data.data, socket, username);
          } else if (data.event === "subscribeGame" && data.data?.gameId) {
            handleGameSubscription(data.data, socket, username);
          } else if (data.event === "gameMove" && data.data?.gameId) {
            handleGameMove(data.data, socket, username);
          } else if (data.event === "findMatch") {
            // Make sure to pass userId which is now defined
            handleMatchmaking(socket, username, userIdStr);
          } else if (data.event === "cancelMatch") {
            removeFromMatchmaking(socket);
            
            // Send cancellation confirmation
            try {
              socket.send(JSON.stringify({
                event: "matchmakingStatus",
                data: { status: "cancelled", message: "Matchmaking cancelled" }
              }));
            } catch (error) {
              console.error("Error sending cancellation confirmation:", error);
            }
          } else {
            console.warn("⚠️ Unknown message type or missing data:", data);
          }
        } catch (error) {
          console.error("❌ Error parsing message:", error);
        }
      };
      
      // Set up close event listener
      socket.onclose = (event) => {
        console.log(`👋 Client ${username} disconnected with code ${event.code} and reason "${event.reason}"`);
        
        // Remove from connected clients
        const index = connectedClients.findIndex(client => client.socket === socket);
        if (index !== -1) {
          connectedClients.splice(index, 1);
          console.log(`👥 Remaining connected clients: ${connectedClients.length}`);
        } else {
          console.warn("⚠️ Could not find client in connected clients array!");
        }
        
        // Remove from matchmaking
        removeFromMatchmaking(socket);
        
        // Remove from all game subscriptions
        for (const [gameId, subscribers] of gameSubscriptions.entries()) {
          if (subscribers.has(socket)) {
            subscribers.delete(socket);
            console.log(`🎮 Removed user from game ${gameId} subscriptions`);
            
            // Remove empty subscription sets
            if (subscribers.size === 0) {
              gameSubscriptions.delete(gameId);
              console.log(`🧹 Removed empty subscription set for game ${gameId}`);
            }
          }
        }
        
        // Notify others that the user has left
        broadcastSystemMessage(`${username} has left the chat.`);
      };
      
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

// Notify game players about updates
function notifyGamePlayers(gameId: string, gameState: any): void {
  const subscribers = gameSubscriptions.get(gameId);
  if (!subscribers) return;

  const message = JSON.stringify({
    event: "gameUpdate",
    data: { gameId, gameState }
  });

  let sentCount = 0;
  subscribers.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(message);
        sentCount++;
      } catch (error) {
        console.error(`❌ Error notifying player in game ${gameId}:`, error);
      }
    }
  });
  
  console.log(`✅ Game update sent to ${sentCount} subscribers`);
}

export { notifyGamePlayers };
export default wsRouter;
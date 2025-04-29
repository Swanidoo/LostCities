import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = [];

// Map to track active game subscriptions: gameId -> Set of WebSockets
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
  
  // Also clean up game subscriptions
  cleanupGameSubscriptions();
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
      const userId = (payload as Record<string, unknown>).id;
      
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
        
        // Remove the client from the connected clients array
        const index = connectedClients.findIndex(client => client.socket === socket);
        if (index !== -1) {
          connectedClients.splice(index, 1);
          console.log(`👥 Remaining connected clients: ${connectedClients.length}`);
        } else {
          console.warn("⚠️ Could not find client in connected clients array!");
        }
        
        // Remove from game subscriptions
        handleGameClientDisconnect(socket);
        
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

// Notify all subscribers of a game update
function notifyGameUpdate(gameId: string, gameState: any): void {
  console.log(`🎮 Notifying update for game ${gameId}`);
  
  const subscribers = gameSubscriptions.get(gameId);
  if (!subscribers || subscribers.size === 0) {
    console.log(`ℹ️ No subscribers for game ${gameId}`);
    return;
  }
  
  console.log(`📤 Sending game update to ${subscribers.size} subscribers`);
  
  const message = JSON.stringify({
    event: 'gameUpdated',
    data: { 
      gameId,
      gameState
    }
  });
  
  let sentCount = 0;
  subscribers.forEach(socket => {
    try {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
        sentCount++;
      } else {
        // Remove closed sockets
        subscribers.delete(socket);
      }
    } catch (error) {
      console.error('❌ Error sending game update:', error);
      // Remove socket on error
      subscribers.delete(socket);
    }
  });
  
  console.log(`✅ Game update sent to ${sentCount} subscribers`);
}

// Handle game move notifications
function handleGameMove(data: { gameId: string, moveType: string, moveData: any }, socket: WebSocket, username: string): void {
  console.log(`🎮 Move in game ${data.gameId} by ${username}: ${data.moveType}`);
  
  // Format and broadcast the move to other subscribers
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
  const subscribers = gameSubscriptions.get(data.gameId);
  if (!subscribers) {
    console.log(`ℹ️ No subscribers for game ${data.gameId}`);
    return;
  }
  
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

// Handle client disconnection - remove from game subscriptions
function handleGameClientDisconnect(socket: WebSocket): void {
  // Check all game subscriptions and remove this socket
  gameSubscriptions.forEach((subscribers, gameId) => {
    if (subscribers.has(socket)) {
      subscribers.delete(socket);
      console.log(`🎮 Client unsubscribed from game ${gameId}. Remaining subscribers: ${subscribers.size}`);
      
      // Clean up empty subscription sets
      if (subscribers.size === 0) {
        gameSubscriptions.delete(gameId);
        console.log(`🧹 Removed empty subscription set for game ${gameId}`);
      }
    }
  });
}

// Function to check for and clean up stale game subscriptions
function cleanupGameSubscriptions(): void {
  let totalRemoved = 0;
  
  gameSubscriptions.forEach((subscribers, gameId) => {
    const initialSize = subscribers.size;
    
    // Remove closed sockets
    subscribers.forEach(socket => {
      if (socket.readyState !== WebSocket.OPEN) {
        subscribers.delete(socket);
        totalRemoved++;
      }
    });
    
    // Remove empty sets
    if (subscribers.size === 0) {
      gameSubscriptions.delete(gameId);
      console.log(`🧹 Removed empty subscription set for game ${gameId}`);
    } else if (initialSize !== subscribers.size) {
      console.log(`🧹 Removed ${initialSize - subscribers.size} stale subscribers from game ${gameId}`);
    }
  });
  
  if (totalRemoved > 0) {
    console.log(`🧹 Total stale connections removed: ${totalRemoved}`);
  }
}

// Export function for game routes to use
export function notifyGamePlayers(gameId: string, gameState: any): void {
  notifyGameUpdate(String(gameId), gameState);
}

// Also export notifyGameUpdate directly
export { notifyGameUpdate };

export default wsRouter;
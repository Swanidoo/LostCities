import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = [];

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
      
      // Set up message event listener
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("📩 Message received:", data);
          
          if (data.event === "chatMessage" && data.data?.message) {
            handleChatMessage(data.data, socket, username);
          } else if (data.event === "movePlayed" && data.data?.gameId && data.data?.move) {
            handleMovePlayed(data.data, socket, username);
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

export default wsRouter;
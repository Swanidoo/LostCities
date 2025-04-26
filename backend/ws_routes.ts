import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = [];

const jwtKey = Deno.env.get("JWT_SECRET");
if (!jwtKey) {
  console.error("❌ JWT_SECRET is not set in the environment variables.");
  Deno.exit(1);
}

wsRouter.get("/ws", async (ctx) => {
  if (!ctx.isUpgradable) {
    console.error("❌ WebSocket upgrade not supported");
    ctx.throw(400, "WebSocket connection not supported.");
  }

  const { searchParams } = new URL(ctx.request.url.href);
  const token = searchParams.get("token");
  console.log("🔍 Received token:", token);
  
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
    
    const socket = ctx.upgrade();
    console.log(`✅ Client connected to WebSocket as ${username}!`);
    
    // Add the new client to the connected clients array
    connectedClients.push({ socket, username });
    console.log(`👥 Current connected clients: ${connectedClients.length}`);
    
    // Send a welcome message to the client
    socket.send(JSON.stringify({
      event: "systemMessage",
      data: { message: `Welcome to the chat, ${username}!` }
    }));
    
    // Notify others that a new user has joined
    connectedClients.forEach((client) => {
      if (client.socket !== socket && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify({
          event: "systemMessage",
          data: { message: `${username} has joined the chat.` }
        }));
      }
    });
    
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
    socket.onclose = () => {
      console.log(`👋 Client ${username} disconnected`);
      
      // Remove the client from the connected clients array
      const index = connectedClients.findIndex(client => client.socket === socket);
      if (index !== -1) {
        connectedClients.splice(index, 1);
      }
      
      // Notify others that the user has left
      connectedClients.forEach((client) => {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(JSON.stringify({
            event: "systemMessage",
            data: { message: `${username} has left the chat.` }
          }));
        }
      });
    };
    
    // Set up error event listener
    socket.onerror = (error) => {
      console.error(`❌ WebSocket error for ${username}:`, error);
    };
    
  } catch (err) {
    console.error("❌ Invalid or expired token:", err.message);
    ctx.throw(401, "Invalid or expired token");
  }
});

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
  
  // Send to all OTHER connected clients
  connectedClients.forEach((client) => {
    if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(formattedMessage);
    }
  });
}

// Handle moves played in the game
function handleMovePlayed(
  data: { gameId: string; move: string },
  sender: WebSocket,
  username: string
) {
  console.log(`🎮 Move played in game ${data.gameId} by ${username}: ${data.move}`);
  
  connectedClients.forEach((client) => {
    if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(
        JSON.stringify({ 
          event: "movePlayed", 
          data: { username, gameId: data.gameId, move: data.move } 
        })
      );
    }
  });
}

export default wsRouter;
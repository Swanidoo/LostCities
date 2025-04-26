import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = []; // List of connected clients with usernames

const jwtKey = Deno.env.get("JWT_SECRET"); // Load JWT_SECRET from the environment
if (!jwtKey) {
  console.error("❌ JWT_SECRET is not set in the environment variables.");
  Deno.exit(1); // Exit if the secret is missing
}

wsRouter.get("/ws", async (ctx) => {
  if (ctx.isUpgradable) {
    const token = ctx.request.url.searchParams.get("token"); // Get the token from the query string
    console.log("🔍 Received token:", token);

    if (!token) {
      console.error("❌ Missing token in query string");
      ctx.response.status = 400; // Bad Request
      ctx.response.body = { error: "Missing token" };
      return;
    }

    try {
      // Verify the JWT token
      const payload = await verify(token, jwtKey, { alg: "HS256" });
      console.log("✅ Token valid:", payload);

      const username = payload.username || payload.email; // Extract username or email from the token payload
      if (!username) {
        console.error("❌ Invalid token payload: Missing username or email");
        ctx.response.status = 401; // Unauthorized
        ctx.response.body = { error: "Invalid token payload" };
        return;
      }

      // Upgrade the connection to WebSocket
      const socket = ctx.upgrade();
      console.log(`✅ Client connected to WebSocket as ${username}!`);

      // Add the client to the list of connected clients
      connectedClients.push({ socket, username });

      // Handle incoming messages
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data); // Parse the incoming message
          console.log("📩 Message received:", message);

          // Handle specific events
          switch (message.event) {
            case "chatMessage":
              handleChatMessage(message.data, socket, username);
              break;

            case "movePlayed":
              handleMovePlayed(message.data, socket, username);
              break;

            default:
              console.warn("⚠️ Unknown event:", message.event);
          }
        } catch (err) {
          console.error("❌ Error parsing message:", err);
        }
      };

      // Handle client disconnection
      socket.onclose = () => {
        console.log(`❌ Client ${username} disconnected!`);
        const index = connectedClients.findIndex((client) => client.socket === socket);
        if (index !== -1) {
          connectedClients.splice(index, 1); // Remove the client from the list
        }
      };

      // Handle WebSocket errors
      socket.onerror = (error) => {
        console.error(`❌ WebSocket error for ${username}:`, error);
      };
    } catch (err) {
      console.error("❌ Invalid or expired token:", err.message);
      ctx.response.status = 401; // Unauthorized
      ctx.response.body = { error: "Invalid or expired token" };
    }
  } else {
    console.error("❌ WebSocket upgrade not supported");
    ctx.response.status = 400; // Bad Request
    ctx.response.body = { error: "WebSocket connection not supported." };
  }
});

// Handle chat messages
function handleChatMessage(
  data: { message: string },
  sender: WebSocket,
  username: string
) {
  console.log(`💬 Chat message from ${username}: ${data.message}`);

  // Broadcast the chat message to all connected clients except the sender
  connectedClients.forEach((client) => {
    if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(
        JSON.stringify({ event: "chatMessage", data: { username, message: data.message } })
      );
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

  // Broadcast the move to all connected clients
  connectedClients.forEach((client) => {
    if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(
        JSON.stringify({ event: "movePlayed", data: { username, gameId: data.gameId, move: data.move } })
      );
    }
  });
}

export default wsRouter;
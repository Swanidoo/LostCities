import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = []; // List of connected clients with usernames

const jwtKey = Deno.env.get("JWT_SECRET") || "default_secret"; // Load JWT secret

wsRouter.get("/ws", async (ctx) => {
  if (ctx.isUpgradable) {
    const token = ctx.request.url.searchParams.get("token"); // Get the token from the query string

    if (!token) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: Missing token" };
      return;
    }

    try {
      // Verify the JWT token
      const payload = await verify(token, jwtKey, "HS256");
      const username = payload.username; // Extract username from the token payload

      if (!username) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized: Invalid token" };
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
      console.error("❌ Invalid token:", err);
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: Invalid token" };
    }
  } else {
    ctx.response.status = 400;
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
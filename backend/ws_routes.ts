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
    const payload = await verify(token, jwtKey, "HS256");
    console.log("✅ Token valid:", payload);

    if (typeof payload !== "object" || payload === null) {
      console.error("❌ Invalid token payload structure");
      ctx.throw(401, "Invalid token payload structure");
    }

    // Attention ici : dans ton JWT, c'est bien "username" que tu stockes ?
    const username = (payload as Record<string, unknown>).username || (payload as Record<string, unknown>).email;
    if (typeof username !== "string") {
      console.error("❌ Invalid token payload: Missing username or email");
      ctx.throw(401, "Invalid token payload");
    }

    const socket = ctx.upgrade();
    console.log(`✅ Client connected to WebSocket as ${username}!`);

    connectedClients.push({ socket, username });

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log("📩 Message received:", message);

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

    socket.onclose = () => {
      console.log(`❌ Client ${username} disconnected!`);
      const index = connectedClients.findIndex((client) => client.socket === socket);
      if (index !== -1) connectedClients.splice(index, 1);
    };

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

  connectedClients.forEach((client) => {
    if (client.socket !== sender && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(
        JSON.stringify({ event: "movePlayed", data: { username, gameId: data.gameId, move: data.move } })
      );
    }
  });
}

export default wsRouter;

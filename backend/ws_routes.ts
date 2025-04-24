import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const wsRouter = new Router();
const connectedClients: WebSocket[] = []; // List of connected clients

wsRouter.get("/ws", (ctx) => {
  if (ctx.isUpgradable) {
    const socket = ctx.upgrade(); // Upgrade HTTP connection to WebSocket
    console.log("✅ Client connected to WebSocket!");

    // Add the client to the list of connected clients
    connectedClients.push(socket);

    // Handle incoming messages
    socket.onmessage = (event) => {
      console.log("📩 Message received:", event.data);

      // Broadcast the message to all connected clients
      connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(event.data);
        }
      });
    };

    // Handle client disconnection
    socket.onclose = () => {
      console.log("❌ Client disconnected!");
      const index = connectedClients.indexOf(socket);
      if (index !== -1) {
        connectedClients.splice(index, 1); // Remove the client from the list
      }
    };

    // Handle WebSocket errors
    socket.onerror = (error) => {
      console.error("❌ WebSocket error:", error);
    };
  } else {
    ctx.response.status = 400;
    ctx.response.body = { error: "WebSocket connection not supported." };
  }
});

export default wsRouter;
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { loadGameState } from "./game_routes.ts";
import { client } from "./db_client.ts";
import { LostCitiesGame } from "./lost_cities/lost_cities_controller.ts";

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
                case "gameAction":
                  if (data.data?.gameId && data.data?.action) {
                      switch (data.data.action) {
                          case "request_state":
                              // Handle game state request
                              handleGameStateRequest(data.data, socket, clientData.username);
                              break;
                          case "play_card":
                              handlePlayCard(data.data, socket, clientData.username);
                              break;
                          case "discard_card":
                              handleDiscardCard(data.data, socket, clientData.username);
                              break;
                          case "draw_card":
                              handleDrawCard(data.data, socket, clientData.username);
                              break;
                          default:
                              console.warn(`⚠️ Unhandled game action: ${data.data.action}`);
                      }
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

// Handle play card action
async function handlePlayCard(data: any, socket: WebSocket, username: string) {
  const { gameId, cardId, color, destination } = data;
  
  try {
    console.log(`🎮 Player ${username} playing card ${cardId} to ${destination}`);
    
    // Load the game
    const game = await loadGameFromDatabase(gameId);
    const userId = await getUserIdFromUsername(username);
    
    // Make the move
    let success = false;
    if (destination === 'expedition') {
      success = game.playCardToExpedition(userId, cardId, color);
    }
    
    if (success) {
      // Save the updated game state
      await game.save();
      
      // Notify all players
      const gameState = game.getGameState();
      notifyGamePlayers(gameId, gameState);
    } else {
      // Send error back to player
      socket.send(JSON.stringify({
        event: 'error',
        data: { message: 'Invalid move' }
      }));
    }
  } catch (error) {
    console.error(`❌ Error handling play card: ${error}`);
    socket.send(JSON.stringify({
      event: 'error',
      data: { message: 'Failed to play card' }
    }));
  }
}

// Handle discard card action
async function handleDiscardCard(data: any, socket: WebSocket, username: string) {
  const { gameId, cardId } = data;
  
  try {
    console.log(`🎮 Player ${username} discarding card ${cardId}`);
    
    // Load the game
    const game = await loadGameFromDatabase(gameId);
    const userId = await getUserIdFromUsername(username);
    
    // Make the move
    const success = game.discardCard(userId, cardId);
    
    if (success) {
      // Save the updated game state
      await game.save();
      
      // Notify all players
      const gameState = game.getGameState();
      notifyGamePlayers(gameId, gameState);
    } else {
      // Send error back to player
      socket.send(JSON.stringify({
        event: 'error',
        data: { message: 'Invalid move' }
      }));
    }
  } catch (error) {
    console.error(`❌ Error handling discard card: ${error}`);
    socket.send(JSON.stringify({
      event: 'error',
      data: { message: 'Failed to discard card' }
    }));
  }
}

// Handle draw card action
async function handleDrawCard(data: any, socket: WebSocket, username: string) {
  const { gameId, source, color } = data;
  
  try {
    console.log(`🎮 Player ${username} drawing card from ${source}`);
    
    // Load the game
    const game = await loadGameFromDatabase(gameId);
    const userId = await getUserIdFromUsername(username);
    
    // Make the move
    let success = false;
    if (source === 'deck') {
      success = game.drawCardFromDeck(userId);
    } else if (source === 'discard_pile') {
      success = game.drawCardFromDiscardPile(userId, color);
    }
    
    if (success) {
      // Save the updated game state
      await game.save();
      
      // Notify all players
      const gameState = game.getGameState();
      notifyGamePlayers(gameId, gameState);
    } else {
      // Send error back to player
      socket.send(JSON.stringify({
        event: 'error',
        data: { message: 'Invalid move' }
      }));
    }
  } catch (error) {
    console.error(`❌ Error handling draw card: ${error}`);
    socket.send(JSON.stringify({
      event: 'error',
      data: { message: 'Failed to draw card' }
    }));
  }
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
    
    // CREATE THE GAME IN THE DATABASE
    createGame(gameId, player1.userId, player2.userId)
      .then(() => {
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
      })
      .catch(error => {
        console.error("❌ Error creating game:", error);
        // Notify players of the error
        const errorMessage = JSON.stringify({
          event: "matchmakingError",
          data: { message: "Failed to create game. Please try again." }
        });
        player1.socket.send(errorMessage);
        player2.socket.send(errorMessage);
      });
  }
}

async function createGame(gameId: string, player1Id: string, player2Id: string): Promise<void> {
  try {
    // Create the game record
    await client.queryObject(`
      INSERT INTO games (id, player1_id, player2_id, status, current_turn_player_id, turn_phase, started_at)
      VALUES ($1, $2, $3, 'in_progress', $2, 'play', CURRENT_TIMESTAMP)
    `, [gameId, player1Id, player2Id]);
    
    // Create the board record
    const boardResult = await client.queryObject<{id: number}>(
      `INSERT INTO board (game_id, use_purple_expedition, remaining_cards_in_deck, current_round)
       VALUES ($1, false, 60, 1) RETURNING id`,
      [gameId]
    );
    
    const boardId = boardResult.rows[0].id;
    console.log(`✅ Board created with ID ${boardId}`);
    
    // Initialize expedition slots
    const colors = ['red', 'green', 'white', 'blue', 'yellow'];
    
    // Create expedition entries for both players
    for (const color of colors) {
      await client.queryObject(
        `INSERT INTO expedition (board_id, player_id, color, wager_count, card_count)
         VALUES ($1, $2, $3, 0, 0)`,
        [boardId, player1Id, color]
      );
      
      await client.queryObject(
        `INSERT INTO expedition (board_id, player_id, color, wager_count, card_count)
         VALUES ($1, $2, $3, 0, 0)`,
        [boardId, player2Id, color]
      );
      
      // Create discard pile for this color
      await client.queryObject(
        `INSERT INTO discard_pile (board_id, color)
         VALUES ($1, $2)`,
        [boardId, color]
      );
    }
    
    // Create a deck of cards
    const deck: { id: string; color: string; type: string; value: number | string }[] = [];
    
    for (const color of colors) {
      // Add expedition cards (2-10)
      for (let value = 2; value <= 10; value++) {
        deck.push({
          id: `${color}_${value}`,
          color: color,
          type: 'expedition',
          value: value
        });
      }
      
      // Add wager cards (3 per color)
      for (let i = 0; i < 3; i++) {
        deck.push({
          id: `${color}_wager_${i}`,
          color: color,
          type: 'wager',
          value: 'W'
        });
      }
    }
    
    // Shuffle the deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    // Deal initial hands (8 cards each)
    const player1Hand = deck.splice(0, 8);
    const player2Hand = deck.splice(0, 8);
    
    // Add cards to database - Player 1 hand
    for (let i = 0; i < player1Hand.length; i++) {
      const card = player1Hand[i];
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'player1_hand', $3)`,
        [gameId, card.id, i]
      );
    }
    
    // Add cards to database - Player 2 hand
    for (let i = 0; i < player2Hand.length; i++) {
      const card = player2Hand[i];
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'player2_hand', $3)`,
        [gameId, card.id, i]
      );
    }
    
    // Add remaining cards to deck
    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'deck', $3)`,
        [gameId, card.id, i]
      );
    }
    
    // Update deck count in board
    await client.queryObject(
      `UPDATE board SET remaining_cards_in_deck = $1 WHERE game_id = $2`,
      [deck.length, gameId]
    );
    
    console.log(`✅ Game ${gameId} created successfully with ${deck.length} cards in deck, 8 cards per player`);
  } catch (error) {
    console.error("❌ Error creating game in database:", error);
    throw error;
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

async function loadGameFromDatabase(gameId: string): Promise<LostCitiesGame> {
  return await LostCitiesGame.load(gameId);
}

async function getUserIdFromUsername(username: string): Promise<string> {
  const result = await client.queryObject<{id: string}>(
    "SELECT id FROM users WHERE username = $1",
    [username]
  );
  
  if (result.rows.length === 0) {
    throw new Error(`User not found: ${username}`);
  }
  
  return result.rows[0].id;
}

// Handle requests for game state
async function handleGameStateRequest(data: any, socket: WebSocket, username: string) {
  const { gameId } = data;
  
  console.log(`🎮 User ${username} requested game state for game ${gameId}`);
  
  try {
    // Load game from database
    const game = await loadGameFromDatabase(gameId);
    
    // Create a debug-friendly version of the game state
    const debugState = {
      gameId: game.gameId,
      status: game.gameStatus,
      currentPlayerId: game.currentPlayerId,
      player1HandCount: game.player1?.hand?.length || 0,
      player2HandCount: game.player2?.hand?.length || 0,
      deckCount: game.deck?.length || 0,
      turnPhase: game.turnPhase
    };
    
    console.log(`📊 Game state for ${gameId}:`, JSON.stringify(debugState, null, 2));
    
    // Get game state for the requesting player
    const userId = await getUserIdFromUsername(username);
    const gameState = game.getGameState(userId);
    
    console.log(`📤 Sending game state to ${username}:`, JSON.stringify(gameState, null, 2));
    
    // Send game state to requesting player
    socket.send(JSON.stringify({
      event: 'gameUpdated',
      data: { gameState }
    }));
    
    console.log(`✅ Sent game state to ${username} for game ${gameId}`);
  } catch (error) {
    console.error(`❌ Error getting game state for ${gameId}:`, error);
    socket.send(JSON.stringify({
      event: 'error',
      data: { message: 'Failed to get game state' }
    }));
  }
}


export { notifyGamePlayers };
export default wsRouter;
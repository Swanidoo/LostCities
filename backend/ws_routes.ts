import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { loadGameState } from "./game_routes.ts";
import { client } from "./db_client.ts";
import { LostCitiesGame } from "./lost_cities/lost_cities_controller.ts";

const wsRouter = new Router();
const connectedClients: { socket: WebSocket; username: string }[] = [];
const playersLookingForMatch: { 
  socket: WebSocket; 
  userId: string; 
  username: string;
  preferences: {
    gameMode: string;
    useExtension: boolean;
  };
}[] = [];
const gameSubscriptions: Map<string, Set<WebSocket>> = new Map();

const jwtKey = Deno.env.get("JWT_SECRET");
if (!jwtKey) {
  console.error("❌ JWT_SECRET is not set in the environment variables.");
  Deno.exit(1);
}

async function getUserMuteInfo(userId: string): Promise<{ isMuted: boolean; reason?: string; until?: Date }> {
  try {
    const result = await client.queryObject<{ muted_until: Date; mute_reason: string }>(
      `SELECT muted_until, mute_reason
       FROM user_mutes 
       WHERE user_id = $1 
       AND (muted_until IS NULL OR muted_until > NOW())
       ORDER BY muted_at DESC
       LIMIT 1`,
      [userId]
    );
    
    if (result.rows.length > 0) {
      return {
        isMuted: true,
        reason: result.rows[0].mute_reason,
        until: result.rows[0].muted_until
      };
    }
    
    return { isMuted: false };
  } catch (error) {
    console.error("Error checking mute status:", error);
    return { isMuted: false };
  }
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

    const token = await ctx.cookies.get("authToken");
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

      // La socket est DÉJÀ ouverte après ctx.upgrade(), traiter immédiatement
      console.log(`🔗 WebSocket ready for ${username}`);

      // Ajouter le client à la liste immédiatement
      connectedClients.push({ socket, username });
      console.log(`👥 Current connected clients: ${connectedClients.length}`);

      // Envoyer le message de bienvenue immédiatement
      try {
        socket.send(JSON.stringify({
          event: "systemMessage",
          data: { message: `Bienvenue sur le chat, ${username}!` }
        }));
        console.log(`✅ Welcome message sent to ${username}`);
      } catch (error) {
        console.error(`❌ Error sending welcome message to ${username}:`, error);
      }

      // Notifier les autres utilisateurs immédiatement
      broadcastSystemMessage(`${username} a rejoint le chat.`, socket);
      
      // Log des clients connectés
      logConnectedClients();
      
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
          
          // Handle different message types
          switch (data.event) {
            case "chatMessage":
                if (data.data?.message) {
                    handleChatMessage(data.data, socket, clientData.username);
                }
                break;
            case "checkMuteStatus":
                // Vérifier le statut de mute et renvoyer l'info
                handleCheckMuteStatus(socket, clientData.username);
                break;
            case "movePlayed":
                if (data.data?.gameId && data.data?.move) {
                    handleMovePlayed(data.data, socket, clientData.username);
                }
                break;
            case "findMatch":
                // Use the userId from the message data
                handleMatchmaking(socket, clientData.username, data.data?.userId, data.data);
                break;
            case "cancelMatch":
                removeFromMatchmaking(socket);
                break;
            case "getOnlinePlayers":
                // Handle request for online players
                handleGetOnlinePlayers(socket);
                break;
            case "subscribeGame":
                // Handle game subscriptions
                if (data.data?.gameId) {
                    handleGameSubscription(data.data, socket, clientData.username);
                }
                break;
            case "requestGameState":
                // Handle game state requests
                if (data.data?.gameId) {
                    handleGameStateRequest(data.data, socket, clientData.username);
                }
                break;
            case "gameAction":
                if (data.data?.gameId && data.data?.action) {
                    switch (data.data.action) {
                        case "request_state":
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
                        case "surrender":
                            handleSurrender(data.data, socket, clientData.username);
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
        // Améliorer la gestion de la déconnexion
        const clientIndex = connectedClients.findIndex(client => client.socket === socket);
        
        if (clientIndex !== -1) {
          const clientData = connectedClients[clientIndex];
          console.log(`👋 Client ${clientData.username} disconnected with code ${event.code} and reason "${event.reason}"`);
          
          // Supprimer de la liste
          connectedClients.splice(clientIndex, 1);
          console.log(`👥 Remaining connected clients: ${connectedClients.length}`);
          
          // Notifier les autres
          broadcastSystemMessage(`${clientData.username} a quitté le chat.`);
        } else {
          console.warn("⚠️ Disconnected client not found in array");
        }
        
        // Handle player disconnect for matchmaking
        removeFromMatchmaking(socket);
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

async function handleCheckMuteStatus(socket: WebSocket, username: string) {
  const userId = await getUserIdFromUsername(username);
  if (!userId) return;
  
  const muteInfo = await getUserMuteInfo(userId);
  
  if (muteInfo.isMuted) {
      let errorMessage = "Vous êtes muté et ne pouvez pas envoyer de messages.";
      
      if (muteInfo.reason) {
          errorMessage += ` Raison: ${muteInfo.reason}`;
      }
      
      if (muteInfo.until) {
          const untilDate = new Date(muteInfo.until);
          const now = new Date();
          const timeLeft = untilDate.getTime() - now.getTime();
          
          if (timeLeft > 0) {
              const minutes = Math.floor(timeLeft / (1000 * 60));
              const hours = Math.floor(minutes / 60);
              const days = Math.floor(hours / 24);
              
              let timeString = "";
              if (days > 0) {
                  timeString = `${days} jour${days > 1 ? 's' : ''}`;
              } else if (hours > 0) {
                  timeString = `${hours} heure${hours > 1 ? 's' : ''}`;
              } else {
                  timeString = `${minutes} minute${minutes > 1 ? 's' : ''}`;
              }
              
              errorMessage += ` Temps restant: ${timeString}`;
          }
      } else {
          errorMessage += " (Permanent)";
      }
      
      socket.send(JSON.stringify({
          event: "error",
          data: { 
              message: errorMessage,
              type: "mute_error"
          }
      }));
  }
}

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

//Fonction pour save les messages dans la bdd
async function saveChatMessage(senderId: string, message: string, gameId?: string): Promise<string> {
  try {
    const result = await client.queryObject<{id: string}>(
      `INSERT INTO chat_message (sender_id, message, game_id) VALUES ($1, $2, $3) RETURNING id`,
      [senderId, message, gameId || null]
    );
    return result.rows[0].id;
  } catch (error) {
    console.error("Error saving chat message:", error);
    return null;
  }
}

// Handle chat messages
function handleChatMessage(
  data: { message: string; gameId?: string },
  sender: WebSocket,
  username: string
) {
  console.log(`💬 Chat message from ${username}: ${data.message}`);
  
  // Vérifier la longueur du message
  const MAX_MESSAGE_LENGTH = 500;
  if (data.message.length > MAX_MESSAGE_LENGTH) {
    sender.send(JSON.stringify({
      event: "error",
      data: { message: `Message trop long. Maximum ${MAX_MESSAGE_LENGTH} caractères.` }
    }));
    return;
  }

  const MAX_MESSAGE_LINES = 15;
  const lineCount = (data.message.match(/\n/g) || []).length + 1;
  if (lineCount > MAX_MESSAGE_LINES) {
    sender.send(JSON.stringify({
      event: "error",
      data: { message: `Message trop long. Maximum ${MAX_MESSAGE_LINES} lignes.` }
    }));
    return;
  }
  
  // Récupérer l'ID de l'utilisateur et vérifier s'il est muté
  getUserIdFromUsername(username).then(async (userId) => {
    if (!userId) {
      console.error("User ID not found for username:", username);
      return;
    }
    
    // AJOUT : Récupérer les informations de mute
    const muteInfo = await getUserMuteInfo(userId);
    
    if (muteInfo.isMuted) {
      let errorMessage = "Vous êtes muté et ne pouvez pas envoyer de messages.";
      
      if (muteInfo.reason) {
        errorMessage += ` Raison: ${muteInfo.reason}`;
      }
      
      if (muteInfo.until) {
        const untilDate = new Date(muteInfo.until);
        const now = new Date();
        const timeLeft = untilDate.getTime() - now.getTime();
        
        if (timeLeft > 0) {
          // Calculer le temps restant
          const minutes = Math.floor(timeLeft / (1000 * 60));
          const hours = Math.floor(minutes / 60);
          const days = Math.floor(hours / 24);
          
          let timeString = "";
          if (days > 0) {
            timeString = `${days} jour${days > 1 ? 's' : ''}`;
          } else if (hours > 0) {
            timeString = `${hours} heure${hours > 1 ? 's' : ''}`;
          } else {
            timeString = `${minutes} minute${minutes > 1 ? 's' : ''}`;
          }
          
          errorMessage += ` Temps restant: ${timeString}`;
        }
      } else {
        errorMessage += " (Permanent)";
      }
      
      sender.send(JSON.stringify({
        event: "error",
        data: { 
          message: errorMessage,
          type: "mute_error"
        }
      }));
      return;
    }
    
    // Sauvegarder le message en base de données
    const messageId = await saveChatMessage(userId, data.message, data.gameId);

    
    // Format the message to be sent
    const formattedMessage = JSON.stringify({ 
      event: "chatMessage", 
      data: { 
          username, 
          message: data.message,
          messageId // Include the ID
      } 
  });
    
    // Send to all connected clients INCLUDING the sender
    connectedClients.forEach((client) => {
      try {
        if (client.socket.readyState === WebSocket.OPEN) {
          client.socket.send(formattedMessage);
        }
      } catch (error) {
        console.error(`❌ Error sending message to ${client.username}:`, error);
      }
    });
  });
}

// Fonction handleSurrender corrigée
async function handleSurrender(data: any, socket: WebSocket, username: string) {
  const { gameId } = data;
  
  try {
    console.log(`🏳️ Player ${username} surrendering game ${gameId}`);
    
    // Get user ID
    const userId = await getUserIdFromUsername(username);
    
    // Load the game
    const game = await loadGameFromDatabase(gameId);
    
    // AJOUT: Enregistrer la reddition comme un mouvement
    await game.recordMove({
      playerId: userId,
      action: 'surrender',
      cardId: null,
      destination: null,
      source: null,
      color: null
    });
    
    // Update game status in database
    const gameResult = await client.queryObject(`
      SELECT player1_id, player2_id FROM games WHERE id = $1
    `, [gameId]);
    
    if (gameResult.rows.length === 0) {
      throw new Error("Game not found");
    }
    
    const gameData = gameResult.rows[0];
    
    // Determine the winner (opponent)
    const winnerId = gameData.player1_id === userId ? gameData.player2_id : gameData.player1_id;
    
    // Update game status in database
    await client.queryObject(`
      UPDATE games 
      SET status = 'finished', 
          winner_id = $1,
          ended_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [winnerId, gameId]);
    
    // Load the full game state to notify players
    const fullGame = await loadGameState(gameId);
    const gameState = fullGame.getGameState();
    
    // Add surrender info to the game state
    (gameState as any).surrenderInfo = {
      playerId: userId,
      type: 'surrender'
    };
    
    // Notify ALL players (including the one who surrendered)
    notifyGamePlayers(gameId, gameState);
    
    console.log(`✅ Surrender processed for player ${username} in game ${gameId}`);
    
  } catch (error) {
    console.error(`❌ Error handling surrender: ${error}`);
    socket.send(JSON.stringify({
      event: 'error',
      data: { message: 'Failed to surrender game' }
    }));
  }
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

// Helper function to get username from socket
function getUsernameFromSocket(socket: WebSocket): string | null {
  const clientEntry = connectedClients.find(client => client.socket === socket);
  return clientEntry ? clientEntry.username : null;
}

// Notify game players about updates
async function notifyGamePlayers(gameId: string, gameState: any): Promise<void> {
  const subscribers = gameSubscriptions.get(gameId);
  if (!subscribers) return;

  console.log(`Notifying ${subscribers.size} players about game ${gameId} update`);

  // Load the full game state from database to ensure we have all data
  try {
    // AJOUT: Récupérer les informations utilisateur
    const userInfoResult = await client.queryObject(`
      SELECT 
        g.player1_id,
        g.player2_id,
        u1.username as player1_username,
        u1.avatar_url as player1_avatar,
        u2.username as player2_username,
        u2.avatar_url as player2_avatar
      FROM games g
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      WHERE g.id = $1
    `, [gameId]);

    console.log("🔍 User info from DB for notifyGamePlayers:", userInfoResult.rows[0]);
    
    if (userInfoResult.rows.length === 0) {
      console.error("❌ No user info found for game", gameId);
      // Fallback to original behavior
      subscribers.forEach(socket => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            event: "gameUpdated",
            data: { gameId, gameState }
          }));
        }
      });
      return;
    }

    const userInfo = userInfoResult.rows[0];
    const fullGame = await loadGameState(gameId);
    
    // For each connected player
    for (const socket of subscribers) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      
      try {
        // Get username for this socket
        const username = getUsernameFromSocket(socket);
        if (!username) {
          console.log("Unknown user, sending generic update");
          socket.send(JSON.stringify({
            event: "gameUpdated",
            data: { gameId, gameState }
          }));
          continue;
        }
        
        // Get user ID
        const userId = await getUserIdFromUsername(username);
        console.log(`Preparing personalized update for ${username} (ID: ${userId})`);
        
        // Get player-specific game state with hand data included
        const playerState = fullGame.getGameState(userId);
        
        // MODIFICATION: Enrichir avec les informations utilisateur
        playerState.player1.username = userInfo.player1_username;
        playerState.player1.avatar_url = userInfo.player1_avatar;
        playerState.player2.username = userInfo.player2_username;
        playerState.player2.avatar_url = userInfo.player2_avatar;
        
        // Debug log to check enriched data
        console.log(`🔍 Enriched state for ${username}:`, {
          player1: { username: playerState.player1.username, avatar: playerState.player1.avatar_url },
          player2: { username: playerState.player2.username, avatar: playerState.player2.avatar_url }
        });
        
        // Debug log to check hand data presence
        console.log(`Hand data for ${username}: ${playerState.player1.hand ? playerState.player1.hand.length : 'none'} P1 cards, ${playerState.player2.hand ? playerState.player2.hand.length : 'none'} P2 cards`);
        
        // Send personalized state
        socket.send(JSON.stringify({
          event: "gameUpdated",
          data: { gameId, gameState: playerState }
        }));
        
        console.log(`✅ Sent personalized update to ${username}`);
      } catch (error) {
        console.error(`Error sending update to player: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Failed to load user info or full game data: ${error}`);
    
    // Fall back to sending the original state if loading fails
    subscribers.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({
          event: "gameUpdated", 
          data: { gameId, gameState }
        }));
      }
    });
  }
}

async function handleMatchmaking(socket, username, userId, gameOptions = {}) {
  try {
    // Vérifier le statut de ban
    const banResult = await client.queryObject(
      `SELECT is_banned, banned_until, ban_reason FROM users WHERE id = $1`,
      [userId]
    );
    
    if (banResult.rows.length > 0) {
      const user = banResult.rows[0];
      
      if (user.is_banned && (!user.banned_until || new Date(user.banned_until) > new Date())) {
        console.log(`❌ Banned user ${username} (${userId}) tried to find match`);
        socket.send(JSON.stringify({
          event: "error",
          data: { 
            message: "Vous êtes banni et ne pouvez pas rechercher de partie",
            type: "ban_error",
            banInfo: {
              reason: user.ban_reason,
              until: user.banned_until
            }
          }
        }));
        return;
      }
    }
    
    // Log les options de jeu reçues
    console.log(`🎮 User ${username} (${userId}) is looking for a match with options:`, {
      gameMode: gameOptions.gameMode || 'classic',
      useExtension: gameOptions.useExtension || false
    });
    
    // Remove any existing entry for this player (in case they're already searching)
    removeFromMatchmaking(socket);
    
    // Add to matchmaking queue with preferences
    playersLookingForMatch.push({ 
      socket, 
      userId, 
      username,
      preferences: {
        gameMode: gameOptions.gameMode || 'classic',
        useExtension: gameOptions.useExtension || false
      }
    });
    
    console.log(`📋 Added ${username} to matchmaking queue. Total players waiting: ${playersLookingForMatch.length}`);
    console.log(`🎯 Looking for: ${gameOptions.gameMode || 'classic'} mode, extension: ${gameOptions.useExtension || false}`);
    
    // Send confirmation to player
    socket.send(JSON.stringify({
      event: "matchmakingStatus",
      data: { 
        status: "searching", 
        message: `Searching for ${gameOptions.gameMode || 'classic'} match${gameOptions.useExtension ? ' with extension' : ''}...` 
      }
    }));
    
    // Try to find a match immediately
    tryFindMatch();
    
  } catch (error) {
    console.error("❌ Error in handleMatchmaking:", error);
    
    // Send error to the player
    socket.send(JSON.stringify({
      event: "error",
      data: { 
        message: "Erreur lors de la recherche de partie",
        type: "matchmaking_error"
      }
    }));
  }
}

export function broadcastMessageDeletion(messageId: string) {
  console.log(`Broadcasting message deletion for ID: ${messageId}`);
  const deletionMessage = JSON.stringify({
    event: "messageDeleted",
    data: { messageId }
  });
  
  let sentCount = 0;
  connectedClients.forEach((client) => {
    try {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(deletionMessage);
        sentCount++;
      }
    } catch (error) {
      console.error(`Error sending deletion notification to ${client.username}:`, error);
    }
  });
  console.log(`Sent deletion notification to ${sentCount} clients`);
}

// Handle play card action
async function handlePlayCard(data: any, socket: WebSocket, username: string) {
  const { gameId, cardId, color, destination } = data;
  
  try {
    console.log(`🎮 Player ${username} playing card ${cardId} to ${destination}`);
    
    // Load the game
    const game = await loadGameState(gameId);
    const userId = await getUserIdFromUsername(username);
    
    // Make the move
    console.log(`Before move: ${game.player1.hand.length} cards in P1 hand`);
    const success = game.playCardToExpedition(userId, cardId, color);
    console.log(`After move: ${game.player1.hand.length} cards in P1 hand`);
    
    if (success) {
      // AJOUT: Enregistrer explicitement le mouvement
      await game.recordMove({
        playerId: userId,
        action: 'play_card',
        cardId: cardId,
        destination: 'expedition',
        color: color
      });
      
      // Save the updated game state
      await game.save();
      
      // Get updated game state to notify players
      const updatedGame = await loadGameState(gameId);
      const gameState = updatedGame.getGameState();
      
      // Debug
      console.log(`State to broadcast: P1 ${gameState.player1.handSize} cards, P2 ${gameState.player2.handSize} cards`);
      
      // Notify all players with the full game
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
      // AJOUT: Enregistrer explicitement le mouvement
      await game.recordMove({
        playerId: userId,
        action: 'discard_card',
        cardId: cardId,
        destination: 'discard_pile',
        color: null // La couleur est déterminée par la carte
      });
      
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
      // AJOUT: Enregistrer explicitement le mouvement
      await game.recordMove({
        playerId: userId,
        action: 'draw_card',
        source: source,
        color: source === 'discard_pile' ? color : null
      });
      
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
    console.log(`🎯 Trying to find match with ${playersLookingForMatch.length} players`);
    
    // Search for compatible players
    for (let i = 0; i < playersLookingForMatch.length - 1; i++) {
      const player1 = playersLookingForMatch[i];
      
      for (let j = i + 1; j < playersLookingForMatch.length; j++) {
        const player2 = playersLookingForMatch[j];
        
        // Check if preferences are compatible
        if (player1.preferences.gameMode === player2.preferences.gameMode &&
            player1.preferences.useExtension === player2.preferences.useExtension) {
          
          console.log(`🎮 Match found between ${player1.username} and ${player2.username}`, {
            gameMode: player1.preferences.gameMode,
            useExtension: player1.preferences.useExtension
          });
          
          // Remove players from queue BEFORE creating the game
          playersLookingForMatch.splice(j, 1);
          playersLookingForMatch.splice(i, 1);
          
          // Create game
          const gameId = Date.now().toString();
          
          // CREATE GAME AND THEN NOTIFY - this is the key fix
          createGame(gameId, player1.userId, player2.userId, {
            gameMode: player1.preferences.gameMode,
            useExtension: player1.preferences.useExtension
          })
          .then(() => {
            console.log(`✅ Game ${gameId} created, notifying players`);
            
            // Notify both players - THIS PART WAS MISSING OR FAILING
            try {
              if (player1.socket.readyState === WebSocket.OPEN) {
                player1.socket.send(JSON.stringify({
                  event: "matchFound",
                  data: { 
                    gameId,
                    opponentId: player2.userId,
                    opponentName: player2.username
                  }
                }));
                console.log(`🔔 Notified ${player1.username} about match`);
              } else {
                console.error(`❌ Player1 socket not open for ${player1.username}`);
              }
              
              if (player2.socket.readyState === WebSocket.OPEN) {
                player2.socket.send(JSON.stringify({
                  event: "matchFound",
                  data: { 
                    gameId,
                    opponentId: player1.userId,
                    opponentName: player1.username
                  }
                }));
                console.log(`🔔 Notified ${player2.username} about match`);
              } else {
                console.error(`❌ Player2 socket not open for ${player2.username}`);
              }
            } catch (error) {
              console.error("❌ Error sending match notifications:", error);
            }
          })
          .catch(error => {
            console.error("❌ Error creating game:", error);
            // Re-add players to queue if game creation failed
            playersLookingForMatch.unshift(player1, player2);
            
            // Notify players of the error
            const errorMessage = JSON.stringify({
              event: "matchmakingError",
              data: { message: "Failed to create game. Please try again." }
            });
            
            if (player1.socket.readyState === WebSocket.OPEN) {
              player1.socket.send(errorMessage);
            }
            if (player2.socket.readyState === WebSocket.OPEN) {
              player2.socket.send(errorMessage);
            }
          });
          
          return; // Exit the function after finding a match
        }
      }
    }
    
    console.log('🕐 No matching players found with compatible preferences');
  }
}

async function createGame(
  gameId: string, 
  player1Id: string, 
  player2Id: string,
  options: { gameMode: string; useExtension: boolean } = { gameMode: 'classic', useExtension: false }
): Promise<void> {
  try {
    console.log(`🎮 Creating new game ${gameId} between ${player1Id} and ${player2Id}`, options);
    
    // Create the game record with the correct mode and rounds
    await client.queryObject(`
      INSERT INTO games (id, player1_id, player2_id, status, current_turn_player_id, turn_phase, started_at, game_mode)
      VALUES ($1, $2, $3, 'in_progress', $2, 'play', CURRENT_TIMESTAMP, $4)
    `, [gameId, player1Id, player2Id, options.gameMode]);
    
    console.log(`✅ Game created with mode: ${options.gameMode}`);
    
    // Create the board record with extension settings
    const boardResult = await client.queryObject<{id: number}>(
      `INSERT INTO board (game_id, use_purple_expedition, remaining_cards_in_deck, current_round)
       VALUES ($1, $2, 60, 1) RETURNING id`,
      [gameId, options.useExtension]
    );
    
    const boardId = boardResult.rows[0].id;
    console.log(`✅ Board created with ID ${boardId}, purple extension: ${options.useExtension}`);
    
    // Initialize expedition slots and colors
    const colors = ['red', 'green', 'white', 'blue', 'yellow'];
    if (options.useExtension) {
      colors.push('purple');
    }
    
    console.log(`🎨 Using colors: ${colors.join(', ')}`);
    
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
    
    console.log(`✅ Expeditions and discard piles created for ${colors.length} colors`);
    
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
    
    const expectedCards = options.useExtension ? 72 : 60; // 6 couleurs * 12 cartes ou 5 couleurs * 12 cartes
    console.log(`✅ Deck created with ${deck.length} cards (expected: ${expectedCards})`);
    
    // Shuffle the deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    
    console.log(`✅ Deck shuffled`);
    
    // Deal initial hands (8 cards each)
    const player1Hand = deck.splice(0, 8);
    const player2Hand = deck.splice(0, 8);
    
    console.log(`✅ Dealt hands: Player 1: ${player1Hand.length} cards, Player 2: ${player2Hand.length} cards`);
    
    // Add cards to database - Player 1 hand
    for (let i = 0; i < player1Hand.length; i++) {
      const card = player1Hand[i];
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'player1_hand', $3)`,
        [gameId, card.id, i]
      );
    }
    
    console.log(`✅ Player 1 cards saved to database`);
    
    // Add cards to database - Player 2 hand
    for (let i = 0; i < player2Hand.length; i++) {
      const card = player2Hand[i];
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'player2_hand', $3)`,
        [gameId, card.id, i]
      );
    }
    
    console.log(`✅ Player 2 cards saved to database`);
    
    // Add remaining cards to deck
    for (let i = 0; i < deck.length; i++) {
      const card = deck[i];
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'deck', $3)`,
        [gameId, card.id, i]
      );
    }
    
    console.log(`✅ Deck cards saved to database`);
    
    // Update deck count in board
    await client.queryObject(
      `UPDATE board SET remaining_cards_in_deck = $1 WHERE game_id = $2`,
      [deck.length, gameId]
    );
    
    console.log(`✅ Board deck count updated to ${deck.length}`);
    
    // Verification of total cards
    const verifyResult = await client.queryObject(`
      SELECT COUNT(*) as count FROM game_card WHERE game_id = $1
    `, [gameId]);
    console.log(`🔍 After creation, game ${gameId} has ${verifyResult.rows[0].count} cards in game_card`);
    
    if (Number(verifyResult.rows[0].count) !== expectedCards) {
      console.error(`❌ Expected ${expectedCards} cards but found ${verifyResult.rows[0].count} for game ${gameId}`);
    }
    
    console.log(`🎯 Game ${gameId} creation completed successfully with options:`, options);
    
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

async function getUserIdFromUsername(username: string): Promise<string | null> {
  try {
    const result = await client.queryObject<{ id: string }>(
      "SELECT id FROM users WHERE username = $1",
      [username]
    );
    
    if (result.rows.length > 0) {
      return result.rows[0].id;
    }
    return null;
  } catch (error) {
    console.error("Error getting user ID:", error);
    return null;
  }
}

// Handle requests for game state
async function handleGameStateRequest(data: any, socket: WebSocket, username: string) {
  if (socket.readyState !== WebSocket.OPEN) {
    console.log(`WebSocket not open for ${username}, skipping game state send`);
    return;
  }

  const { gameId } = data;
  
  console.log(`🎮 User ${username} requested game state for game ${gameId}`);
  
  try {
    // AJOUT: Récupérer les informations utilisateur
    const userInfoResult = await client.queryObject(`
      SELECT 
        g.player1_id,
        g.player2_id,
        u1.username as player1_username,
        u1.avatar_url as player1_avatar,
        u2.username as player2_username,
        u2.avatar_url as player2_avatar
      FROM games g
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      WHERE g.id = $1
    `, [gameId]);

    console.log("🔍 User info from DB:", userInfoResult.rows[0]);
    const userInfo = userInfoResult.rows[0];
    
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
    
    // MODIFICATION: Enrichir avec les informations utilisateur
    gameState.player1.username = userInfo.player1_username;
    gameState.player1.avatar_url = userInfo.player1_avatar;
    gameState.player2.username = userInfo.player2_username;
    gameState.player2.avatar_url = userInfo.player2_avatar;
    
    console.log("🔍 Enriched state with user info:", {
      player1: { username: gameState.player1.username, avatar: gameState.player1.avatar_url },
      player2: { username: gameState.player2.username, avatar: gameState.player2.avatar_url }
    });
    
    console.log(`📤 Sending game state to ${username}:`, JSON.stringify(gameState, null, 2));
    
    try {
      socket.send(JSON.stringify({
        event: 'gameUpdated',
        data: { gameState }
      }));
      console.log(`✅ Sent game state to ${username} for game ${gameId}`);
    } catch (error) {
      console.error(`Failed to send game state to ${username}: WebSocket closed`);
    }
    
  } catch (error) {
    console.error(`❌ Error getting game state for ${gameId}:`, error);
    
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({
          event: 'error',
          data: { message: 'Failed to get game state' }
        }));
      } catch (e) {
        console.error('Failed to send error message: WebSocket closed');
      }
    }
  }
}


export { notifyGamePlayers };
export default wsRouter;
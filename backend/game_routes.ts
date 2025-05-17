import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { LostCitiesGame } from "./lost_cities/lost_cities_controller.ts";
import { notifyGamePlayers } from "./ws_routes.ts";
import { loadGameState } from "./lost_cities/lost_cities_model.ts";

const gameRouter = new Router();

// ----------- EXISTING GENERAL GAME ROUTES -----------

// Route to get all games
gameRouter.get("/games", async (ctx) => {
  try {
    const games = await client.queryObject("SELECT * FROM games");
    ctx.response.body = games.rows;
  } catch (err) {
    console.error("Error fetching games:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Route to create a new game
gameRouter.post("/games", async (ctx) => {
  try {
    const { player1_id, player2_id, settings_id } = await ctx.request.body({ type: "json" }).value;
    await client.queryObject(
      "INSERT INTO games (player1_id, player2_id, status, settings_id) VALUES ($1, $2, 'waiting', $3)",
      [player1_id, player2_id, settings_id]
    );
    ctx.response.status = 201;
    ctx.response.body = { message: "Game created" };
  } catch (err) {
    console.error("Error creating game:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Route to update a game's status
gameRouter.put("/games/:id", async (ctx) => {
  try {
    const id = ctx.params.id;
    const { status } = await ctx.request.body({ type: "json" }).value;
    await client.queryObject("UPDATE games SET status = $1 WHERE id = $2", [status, id]);
    ctx.response.status = 200;
    ctx.response.body = { message: "Game updated" };
  } catch (err) {
    console.error("Error updating game:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Route to delete a game
gameRouter.delete("/games/:id", async (ctx) => {
  try {
    const id = ctx.params.id;
    await client.queryObject("DELETE FROM games WHERE id = $1", [id]);
    ctx.response.status = 200;
    ctx.response.body = { message: "Game deleted" };
  } catch (err) {
    console.error("Error deleting game:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// ----------- LOST CITIES SPECIFIC ROUTES -----------

// Create a new Lost Cities game
gameRouter.post("/lost-cities/games", authMiddleware, async (ctx) => {
  try {
    const { opponentId, usePurpleExpedition } = await ctx.request.body({ type: "json" }).value;
    const userId = ctx.state.user.id;
    const gameId = Date.now(); // Use timestamp for ID
    const banResult = await client.queryObject(
      `SELECT is_banned, banned_until, ban_reason FROM users WHERE id = $1`,
      [userId]
    );
    
    if (banResult.rows.length > 0) {
      const user = banResult.rows[0];
      
      if (user.is_banned && (!user.banned_until || new Date(user.banned_until) > new Date())) {
        ctx.response.status = 403;
        ctx.response.body = { 
          error: "You are banned and cannot create games",
          banInfo: {
            reason: user.ban_reason,
            until: user.banned_until
          }
        };
        return;
      }
    }

    console.log(`🎮 Creating new game ${gameId} between ${userId} and ${opponentId}`);
    
    // Create game entry
    const gameResult = await client.queryObject<{id: number}>(
      `INSERT INTO games (id, player1_id, player2_id, status)
       VALUES ($1, $2, $3, 'waiting') RETURNING id`,
      [gameId, userId, opponentId]
    );
    
    console.log(`✅ Game entry created`);


    // Create board for this game
    const boardResult = await client.queryObject<{id: number}>(
      `INSERT INTO board (game_id, use_purple_expedition, remaining_cards_in_deck, current_round)
       VALUES ($1, $2, 60, 1) RETURNING id`,
      [gameId, usePurpleExpedition]
    );
    
    const boardId = boardResult.rows[0].id;
    console.log(`✅ Board created with ID ${boardId}`);
    
    // Initialize expedition slots
    const colors = ['red', 'green', 'white', 'blue', 'yellow'];
    if (usePurpleExpedition) {
      colors.push('purple');
    }
    
    // Create expedition entries for both players
    for (const color of colors) {
      await client.queryObject(
        `INSERT INTO expedition (board_id, player_id, color, wager_count, card_count)
         VALUES ($1, $2, $3, 0, 0)`,
        [boardId, userId, color]
      );
      
      await client.queryObject(
        `INSERT INTO expedition (board_id, player_id, color, wager_count, card_count)
         VALUES ($1, $2, $3, 0, 0)`,
        [boardId, opponentId, color]
      );
      
      // Create discard pile for this color
      await client.queryObject(
        `INSERT INTO discard_pile (board_id, color)
         VALUES ($1, $2)`,
        [boardId, color]
      );
    }


    console.log(`✅ Expeditions and discard piles created`);
    
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

    console.log(`✅ Deck created with ${deck.length} cards`);
    
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
    
    // Save game state to database
    await client.queryObject(
      `UPDATE games SET 
       current_turn_player_id = $1,
       status = 'in_progress',
       turn_phase = 'play',
       started_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [userId, gameId]
    );

    console.log(`✅ Game status updated to in_progress`);
    
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

    // After all the card insertion code, add this verification:
    const verifyResult = await client.queryObject(`
      SELECT COUNT(*) as count FROM game_card WHERE game_id = $1
    `, [gameId]);
    console.log(`🔍 After creation, game ${gameId} has ${verifyResult.rows[0].count} cards in game_card`);

    if (verifyResult.rows[0].count !== 60) {
      console.error(`❌ Expected 60 cards but found ${verifyResult.rows[0].count} for game ${gameId}`);
    }

    console.log(`✅ Board deck count updated to ${deck.length}`);

    ctx.response.status = 201;
    ctx.response.body = { 
      gameId, 
      message: "Lost Cities game created successfully"
    };

    console.log(`🎯 Game ${gameId} creation completed successfully`);
    
  } catch (err) {
    console.error("Error creating Lost Cities game:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Get game state
gameRouter.get("/lost-cities/games/:id", authMiddleware, async (ctx) => {
  try {
    const gameId = ctx.params.id;
    const userId = ctx.state.user.id;

    console.log(`[GET /lost-cities/games/${gameId}] Starting request for user ${userId}`);

    // Get game info - convert all BigInts to strings
    const gameResult = await client.queryObject(`
      SELECT g.id::text as id,
             g.player1_id, 
             g.player2_id,
             g.status,
             g.winner_id,
             g.score_player1,
             g.score_player2,
             g.current_turn_player_id,
             g.turn_phase,
             g.current_round,
             g.started_at,
             g.ended_at,
             g.last_discarded_pile,
             g.game_mode,  -- ✅ IMPORTANT: Cette ligne doit être présente
             b.use_purple_expedition, 
             // ... reste de la query
        FROM games g
        JOIN board b ON g.id = b.game_id
        // ... reste de la query
    `, [gameId]);

    console.log(`[GET /lost-cities/games/${gameId}] Game query result:`, gameResult.rows.length);
    
    if (gameResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found" };
      return;
    }
    
    const game = gameResult.rows[0];
    
    const gameMode = game.game_mode || 'classic'; // Fallback to classic if undefined
    const totalRounds = gameMode === 'quick' ? 1 : 3;
    console.log(`🔍 Game mode from DB: ${game.game_mode}, totalRounds: ${totalRounds}`);
    console.log(`🔍 All game data:`, game);

    // In the game state endpoint, after getting the game data
    console.log(`[GET /lost-cities/games/${gameId}] Player IDs - p1: ${game.player1_id} (${typeof game.player1_id}), p2: ${game.player2_id} (${typeof game.player2_id})`);
    console.log(`[GET /lost-cities/games/${gameId}] Current user ID: ${userId} (${typeof userId})`);
    
    // After getting the gameResult
    const debugResult = await client.queryObject(`
      SELECT 
        COUNT(*) as total_cards,
        SUM(CASE WHEN location = 'deck' THEN 1 ELSE 0 END) as deck_cards,
        SUM(CASE WHEN location = 'player1_hand' THEN 1 ELSE 0 END) as p1_cards,
        SUM(CASE WHEN location = 'player2_hand' THEN 1 ELSE 0 END) as p2_cards
      FROM game_card 
      WHERE game_id = $1
    `, [gameId]);
    console.log(`[GET /lost-cities/games/${gameId}] Card distribution:`, debugResult.rows[0]);

    // Determine which player is requesting
    const isPlayer1 = game.player1_id === userId;
    const isPlayer2 = game.player2_id === userId;

    console.log(`[GET /lost-cities/games/${gameId}] User ${userId} is player1: ${isPlayer1}, is player2: ${isPlayer2}`);
    
    if (!isPlayer1 && !isPlayer2) {
      ctx.response.status = 403;
      ctx.response.body = { error: "Not a player in this game" };
      return;
    }
    
    // Get player's hand
    const handResult = await client.queryObject(`
      SELECT c.* FROM game_card gc
      JOIN card c ON gc.card_id = c.id
      WHERE gc.game_id = $1 AND gc.location = $2
      ORDER BY gc.position
    `, [gameId, isPlayer1 ? 'player1_hand' : 'player2_hand']);

    console.log(`[GET /lost-cities/games/${gameId}] Hand query result:`, handResult.rows.length);
    
    // Get expeditions for both players
    const expeditions = await getExpeditions(gameId);
    
    // Get discard piles
    const discardPiles = await getDiscardPiles(gameId);
    
    // Construct game state
    const gameState = {
      gameId: game.id,
      status: game.status,
      currentRound: Number(game.current_round), // Convert to number
      totalRounds: totalRounds,
      currentPlayerId: Number(game.current_turn_player_id), // Convert to number
      turnPhase: game.turn_phase || 'play',
      usePurpleExpedition: game.use_purple_expedition,
      cardsInDeck: Number(await getCardsInDeck(gameId)), // Ensure number
      player1: {
        id: Number(game.player1_id),
        username: game.player1_username,
        avatar_url: game.player1_avatar,
        expeditions: expeditions.player1,
        handSize: isPlayer1 ? handResult.rows.length : Number(await getHandSize(gameId, 'player1_hand')),
        hand: isPlayer1 ? handResult.rows : undefined
      },
      player2: {
        id: Number(game.player2_id),
        username: game.player2_username,
        avatar_url: game.player2_avatar,
        expeditions: expeditions.player2,
        handSize: isPlayer2 ? handResult.rows.length : Number(await getHandSize(gameId, 'player2_hand')),
        hand: isPlayer2 ? handResult.rows : undefined
      },
      discardPiles,
      scores: await getScores(gameId),
      winner: game.winner_id ? Number(game.winner_id) : null
    };

    function convertBigIntsToNumbers(obj: any): any {
      if (obj === null || obj === undefined) return obj;
      
      if (typeof obj === 'bigint') {
        return Number(obj);
      }
      
      if (Array.isArray(obj)) {
        return obj.map(convertBigIntsToNumbers);
      }
      
      if (typeof obj === 'object') {
        const newObj: any = {};
        for (const key in obj) {
          newObj[key] = convertBigIntsToNumbers(obj[key]);
        }
        return newObj;
      }
      
      return obj;
    }
    
    ctx.response.body = convertBigIntsToNumbers(gameState);    


  } catch (err) {
    console.error(`[GET /lost-cities/games/:id] Detailed error:`, err);
    console.error(`[GET /lost-cities/games/:id] Error stack:`, err.stack);
    console.error(`[GET /lost-cities/games/:id] Error name:`, err.name);
    console.error(`[GET /lost-cities/games/:id] Error message:`, err.message);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", details: err.message };  
  }
});

// Helper functions
async function getCardsInDeck(gameId) {
  const result = await client.queryObject(`
    SELECT COUNT(*) as count FROM game_card 
    WHERE game_id = $1 AND location = 'deck'
  `, [gameId]);
  return result.rows[0].count;
}

async function getHandSize(gameId, location) {
  const result = await client.queryObject(`
    SELECT COUNT(*) as count FROM game_card 
    WHERE game_id = $1 AND location = $2
  `, [gameId, location]);
  return result.rows[0].count;
}

async function getExpeditions(gameId) {
  try {
    // First get the board_id for this game
    const boardResult = await client.queryObject<{id: number}>(
      'SELECT id FROM board WHERE game_id = $1',
      [gameId]
    );
    
    if (boardResult.rows.length === 0) {
      console.error(`No board found for game ${gameId}`);
      return { player1: {}, player2: {} };
    }
    
    const boardId = boardResult.rows[0].id;
    
    // Now query expeditions using board_id
    const expeditionsResult = await client.queryObject(`
      SELECT 
        e.player_id,
        e.color,
        e.wager_count,
        e.card_count,
        e.total_value,
        e.score,
        e.has_started,
        array_agg(
          json_build_object(
            'id', c.id,
            'color', c.color,
            'type', c.type,
            'value', c.value
          ) ORDER BY gc.position
        ) FILTER (WHERE c.id IS NOT NULL) as cards
      FROM expedition e
      LEFT JOIN game_card gc ON e.id = gc.expedition_id AND gc.game_id = $1
      LEFT JOIN card c ON gc.card_id = c.id
      WHERE e.board_id = $2
      GROUP BY e.id, e.player_id, e.color, e.wager_count, e.card_count, e.total_value, e.score, e.has_started
      ORDER BY e.player_id, e.color
    `, [gameId, boardId]);
    
    // Initialize expeditions structure
    const expeditions = {
      player1: { red: [], green: [], white: [], blue: [], yellow: [] },
      player2: { red: [], green: [], white: [], blue: [], yellow: [] }
    };
    
    // Process results
    for (const exp of expeditionsResult.rows) {
      const playerKey = exp.player_id === 1 ? 'player1' : 'player2';
      expeditions[playerKey][exp.color] = exp.cards || [];
    }
    
    return expeditions;
    
  } catch (error) {
    console.error('Error in getExpeditions:', error);
    return { player1: {}, player2: {} };
  }
}

async function getDiscardPiles(gameId) {
  try {
    // First get the board_id for this game
    const boardResult = await client.queryObject<{id: number}>(
      'SELECT id FROM board WHERE game_id = $1',
      [gameId]
    );
    
    if (boardResult.rows.length === 0) {
      console.error(`No board found for game ${gameId}`);
      return {};
    }
    
    const boardId = boardResult.rows[0].id;
    
    // Query discard piles using board_id
    const discardResult = await client.queryObject(`
      SELECT 
        dp.color,
        array_agg(
          json_build_object(
            'id', c.id,
            'color', c.color,
            'type', c.type,
            'value', c.value
          ) ORDER BY gc.position
        ) FILTER (WHERE c.id IS NOT NULL) as cards
      FROM discard_pile dp
      LEFT JOIN game_card gc ON dp.id = gc.pile_id AND gc.game_id = $1
      LEFT JOIN card c ON gc.card_id = c.id
      WHERE dp.board_id = $2
      GROUP BY dp.id, dp.color
    `, [gameId, boardId]);
    
    const discardPiles = {
      red: [],
      green: [],
      white: [],
      blue: [],
      yellow: []
    };
    
    for (const pile of discardResult.rows) {
      discardPiles[pile.color] = pile.cards || [];
    }
    
    return discardPiles;
    
  } catch (error) {
    console.error('Error in getDiscardPiles:', error);
    return {};
  }
}

async function getScores(gameId) {
  const result = await client.queryObject(`
    SELECT 
      b.round1_score_player1,
      b.round1_score_player2,
      b.round2_score_player1,
      b.round2_score_player2,
      b.round3_score_player1,
      b.round3_score_player2
    FROM board b
    WHERE b.game_id = $1
  `, [gameId]);

  if (result.rows.length === 0) {
    return { player1: { total: 0 }, player2: { total: 0 } };
  }

  const scores = result.rows[0];
  for (const key in scores) {
    if (typeof scores[key] === 'bigint') {
      scores[key] = Number(scores[key]);
    }
  }

  return {
    player1: {
      round1: scores.round1_score_player1 || 0,
      round2: scores.round2_score_player1 || 0,
      round3: scores.round3_score_player1 || 0,
      total: (scores.round1_score_player1 || 0) + 
             (scores.round2_score_player1 || 0) + 
             (scores.round3_score_player1 || 0),
    },
    player2: {
      round1: scores.round1_score_player2 || 0,
      round2: scores.round2_score_player2 || 0,
      round3: scores.round3_score_player2 || 0,
      total: (scores.round1_score_player2 || 0) + 
             (scores.round2_score_player2 || 0) + 
             (scores.round3_score_player2 || 0),
    },
  };
}

// Join an existing game
gameRouter.post("/lost-cities/games/:id/join", authMiddleware, async (ctx) => {
  try {
    const gameId = ctx.params.id;
    const userId = ctx.state.user.id;
    
    // Check if game exists and user is player2
    const gameResult = await client.queryObject(`
      SELECT * FROM games WHERE id = $1 AND (player1_id = $2 OR player2_id = $2)
    `, [gameId, userId]);
    
    if (gameResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found or you're not a player" };
      return;
    }
    
    const game = gameResult.rows[0];
    
    // If game is in 'waiting' status, update to 'in_progress'
    if (game.status === 'waiting') {
      await client.queryObject(
        `UPDATE games SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [gameId]
      );
    }
    
    ctx.response.body = { 
      message: "Successfully joined game",
      gameId
    };
    
  } catch (err) {
    console.error("Error joining game:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Make a move in the game
gameRouter.post("/lost-cities/games/:id/moves", authMiddleware, async (ctx) => {
  try {
    const gameId = ctx.params.id;
    const userId = ctx.state.user.id;
    const move = await ctx.request.body({ type: "json" }).value;
    
    // Load game state
    const game = await loadGameState(gameId);
    
    // Check if it's the user's turn
    if (game.currentPlayerId !== userId) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Not your turn" };
      return;
    }
    
    // Process the move based on action type
    let success = false;
    
    switch (move.action) {
      case 'play_card':
        success = game.playCardToExpedition(userId, move.cardId, move.color);
        break;
        
      case 'discard_card':
        success = game.discardCard(userId, move.cardId);
        break;
        
      case 'draw_card':
        if (move.source === 'deck') {
          success = game.drawCardFromDeck(userId);
        } else if (move.source === 'discard_pile') {
          success = game.drawCardFromDiscardPile(userId, move.color);
        }
        break;
        
      default:
        ctx.response.status = 400;
        ctx.response.body = { error: "Invalid move action" };
        return;
    }
    
    if (!success) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid move" };
      return;
    }
    
    // Save updated game state to database
    await saveGameState(game);
    
    // Record the move in the moves table
    await client.queryObject(`
      INSERT INTO move (game_id, player_id, turn_number, action, card_id, destination, source)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      gameId, 
      userId, 
      game.moveHistory.length,
      move.action,
      move.cardId || null,
      move.destination || null,
      move.source || null
    ]);
    
    // Notify players of game update
    if (typeof notifyGamePlayers === 'function') {
      try {
        notifyGamePlayers(String(gameId), game.getGameState());
        console.log(`✅ Notified players of update for game ${gameId}`);
      } catch (error) {
        console.error(`❌ Failed to notify players of game update: ${error.message}`);
      }
    } else {
      console.warn(`⚠️ WebSocket notification function not available`);
    }
    
    // Return updated game state
    ctx.response.body = { 
      success: true,
      gameState: game.getGameState(userId)
    };
    
  } catch (err) {
    console.error("Error processing move:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Surrender a game
gameRouter.post("/lost-cities/games/:id/surrender", authMiddleware, async (ctx) => {
  try {
    const gameId = ctx.params.id;
    const userId = ctx.state.user.id;
    
    // Check if game exists and user is a player
    const gameResult = await client.queryObject(`
      SELECT * FROM games WHERE id = $1 AND (player1_id = $2 OR player2_id = $2)
    `, [gameId, userId]);
    
    if (gameResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found or you're not a player" };
      return;
    }
    
    const game = gameResult.rows[0];
    
    // Determine winner (the other player)
    const winnerId = game.player1_id === userId ? game.player2_id : game.player1_id;
    
    // Update game status
    await client.queryObject(`
      UPDATE games 
      SET status = 'finished', 
          winner_id = $1,
          ended_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [winnerId, gameId]);
    
    ctx.response.body = { 
      message: "You have surrendered the game",
      winnerId
    };
    
  } catch (err) {
    console.error("Error surrendering game:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Send a chat message
gameRouter.post("/lost-cities/games/:id/chat", authMiddleware, async (ctx) => {
  try {
    const gameId = ctx.params.id;
    const userId = ctx.state.user.id;
    const { message } = await ctx.request.body({ type: "json" }).value;
    
    // Verify user is a player in this game
    const gameResult = await client.queryObject(`
      SELECT * FROM games WHERE id = $1 AND (player1_id = $2 OR player2_id = $2)
    `, [gameId, userId]);
    
    if (gameResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found or you're not a player" };
      return;
    }
    
    // Save chat message
    await client.queryObject(`
      INSERT INTO chat_message (game_id, sender_id, message)
      VALUES ($1, $2, $3)
    `, [gameId, userId, message]);
    
    ctx.response.body = { success: true };
    
  } catch (err) {
    console.error("Error sending chat message:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});


// Helper function to save game state to database with improved reliability
async function saveGameState(game: LostCitiesGame): Promise<void> {
  const gameId = game.gameId;
  
  console.log(`🎮 Saving game state for game ${gameId}, status: ${game.gameStatus}, round: ${game.currentRound}/${game.totalRounds}`);
  
  try {
    // Validation des données scores - vérifier qu'elles sont numériques
    const player1Score = typeof game.scores.player1.total === 'number' ? game.scores.player1.total : 0;
    const player2Score = typeof game.scores.player2.total === 'number' ? game.scores.player2.total : 0;
    
    console.log(`📊 Validated scores: P1=${player1Score}, P2=${player2Score}, winner=${game.winner || 'tie'}`);
    
    // Update game table with critical information
    await client.queryObject(`
      UPDATE games 
      SET current_turn_player_id = $1,
          status = $2,
          winner_id = $3,
          turn_phase = $4,
          score_player1 = $5,
          score_player2 = $6,
          last_discarded_pile = $7
      WHERE id = $8`,
      [
        game.currentPlayerId,
        game.gameStatus,
        game.winner || null,
        game.turnPhase,
        player1Score,
        player2Score,
        game.lastDiscardedPile || null,
        gameId
      ]
    );
    
    console.log(`✅ Updated basic game info and scores: P1=${player1Score}, P2=${player2Score}`);
    
    // Update board table with proper deck count and current round
    await client.queryObject(`
      UPDATE board
      SET current_round = $1,
          remaining_cards_in_deck = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE game_id = $3
    `, [
      game.currentRound,
      game.deck.length,
      gameId
    ]);
    
    // Handle score updates per round
    if (game.gameStatus === 'finished' || game.currentRound > 1) {
      const roundScoreField1 = `round${game.currentRound}_score_player1`;
      const roundScoreField2 = `round${game.currentRound}_score_player2`;
      
      // Valider les scores de round
      const roundScore1 = game.scores.player1[`round${game.currentRound}`] || 0;
      const roundScore2 = game.scores.player2[`round${game.currentRound}`] || 0;
      
      console.log(`📊 Saving round ${game.currentRound} scores: P1=${roundScore1}, P2=${roundScore2}`);
      
      await client.queryObject(`
        UPDATE board
        SET ${roundScoreField1} = $1,
            ${roundScoreField2} = $2
        WHERE game_id = $3
      `, [
        roundScore1,
        roundScore2,
        gameId
      ]);
    }
    
    // Si le jeu est terminé, TOUJOURS définir ended_at et enregistrer les scores
    if (game.gameStatus === 'finished') {
      console.log(`🏁 Game ${gameId} is finished, ensuring ended_at is set`);
      
      // Définir ended_at IMMÉDIATEMENT - pas de vérification pour éviter toute race condition
      await client.queryObject(
        `UPDATE games SET ended_at = CURRENT_TIMESTAMP WHERE id = $1 AND (ended_at IS NULL)`,
        [gameId]
      );
      
      console.log(`⏱️ Ensured ended_at timestamp is set for game ${gameId}`);
      
      // Enregistrer les scores dans le leaderboard, en gérant les cas où le jeu est abandonné
      const gameMode = game.totalRounds === 1 ? 'quick' : 'classic';
      const withExtension = game.usePurpleExpedition;
      
      // D'abord vérifier si des entrées existantes sont présentes pour éviter les doublons
      const existingEntries = await client.queryObject(
        `SELECT id FROM leaderboard WHERE player_id IN ($1, $2) AND date >= NOW() - INTERVAL '10 minutes'`,
        [game.player1.id, game.player2.id]
      );
      
      if (existingEntries.rows.length === 0) {
        console.log(`🏆 Recording leaderboard entries for game ${gameId}`);
        
        // Récupérer les noms d'utilisateurs en une seule requête
        const playersResult = await client.queryObject<{ id: string, username: string }>(
          `SELECT id, username FROM users WHERE id IN ($1, $2)`,
          [game.player1.id, game.player2.id]
        );
        
        const players = new Map();
        playersResult.rows.forEach(row => {
          players.set(row.id, row.username);
        });
        
        const player1Name = players.get(game.player1.id) || "Unknown Player";
        const player2Name = players.get(game.player2.id) || "Unknown Player";
        
        // Insérer les deux scores en une transaction
        await client.queryObject(`BEGIN`);
        try {
          // Enregistrer le score du joueur 1
          await client.queryObject(
            `INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension)
            VALUES ($1, $2, $3, $4, $5)`,
            [game.player1.id, player1Name, player1Score, gameMode, withExtension]
          );
          
          // Enregistrer le score du joueur 2
          await client.queryObject(
            `INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension)
            VALUES ($1, $2, $3, $4, $5)`,
            [game.player2.id, player2Name, player2Score, gameMode, withExtension]
          );
          
          await client.queryObject(`COMMIT`);
          console.log(`✅ Scores recorded in leaderboard for game ${gameId}`);
        } catch (error) {
          await client.queryObject(`ROLLBACK`);
          console.error(`❌ Failed to record leaderboard entries:`, error);
        }
      } else {
        console.log(`ℹ️ Leaderboard entries already exist for players in game ${gameId}`);
      }
    }
    
    // Get board ID
    const boardResult = await client.queryObject<{id: number}>(
      `SELECT id FROM board WHERE game_id = $1`,
      [gameId]
    );
    
    if (boardResult.rows.length === 0) {
      throw new Error(`Board not found for game ${gameId}`);
    }
    
    const boardId = boardResult.rows[0].id;
    
    // Update card positions - mise à jour de la position des cartes
    // First mark all cards as removed (we'll update their actual location)
    await client.queryObject(
      `UPDATE game_card
      SET location = 'removed',
          expedition_id = NULL,
          pile_id = NULL
      WHERE game_id = $1`,
      [gameId]
    );
    
    // Update player 1 hand
    for (let i = 0; i < game.player1.hand.length; i++) {
      const card = game.player1.hand[i];
      await client.queryObject(
        `UPDATE game_card
        SET location = 'player1_hand',
            position = $1,
            expedition_id = NULL,
            pile_id = NULL
        WHERE game_id = $2 AND card_id = $3`,
        [i, gameId, card.id]
      );
    }
    
    // Update player 2 hand
    for (let i = 0; i < game.player2.hand.length; i++) {
      const card = game.player2.hand[i];
      await client.queryObject(
        `UPDATE game_card
        SET location = 'player2_hand',
            position = $1,
            expedition_id = NULL,
            pile_id = NULL
        WHERE game_id = $2 AND card_id = $3`,
        [i, gameId, card.id]
      );
    }
    
    // Update deck
    for (let i = 0; i < game.deck.length; i++) {
      const card = game.deck[i];
      await client.queryObject(
        `UPDATE game_card
        SET location = 'deck',
            position = $1,
            expedition_id = NULL,
            pile_id = NULL
        WHERE game_id = $2 AND card_id = $3`,
        [i, gameId, card.id]
      );
    }
  
    // Re-insert expeditions
    const colors = Object.keys(game.player1.expeditions);
    
    for (const color of colors) {
      // Get expedition IDs for this color
      const expResult = await client.queryObject(`
        SELECT id, player_id FROM expedition 
        WHERE board_id = (SELECT id FROM board WHERE game_id = $1)
        AND color = $2
      `, [gameId, color]);
      
      const expeditions = expResult.rows;
      const player1ExpId = expeditions.find(exp => exp.player_id === game.player1.id)?.id;
      const player2ExpId = expeditions.find(exp => exp.player_id === game.player2.id)?.id;
      
      // Update expedition properties
      if (player1ExpId) {
        const wagerCount = game.player1.expeditions[color].filter(c => c.type === 'wager').length;
        
        await client.queryObject(`
          UPDATE expedition
          SET card_count = $1,
              wager_count = $2,
              total_value = $3,
              has_started = $4
          WHERE id = $5
        `, [
          game.player1.expeditions[color].length,
          wagerCount,
          game.player1.expeditions[color]
            .filter(c => c.type === 'expedition')
            .reduce((sum, card) => sum + (typeof card.value === 'number' ? card.value : 0), 0),
          game.player1.expeditions[color].length > 0,
          player1ExpId
        ]);
        
        // Update card positions
        for (let i = 0; i < game.player1.expeditions[color].length; i++) {
          const card = game.player1.expeditions[color][i];
          await client.queryObject(`
            UPDATE game_card
            SET location = 'player1_expedition',
                expedition_id = $1,
                position = $2
            WHERE game_id = $3 AND card_id = $4
          `, [player1ExpId, i, gameId, card.id]);
        }
      }
      
      // Do the same for player 2
      if (player2ExpId) {
        const wagerCount = game.player2.expeditions[color].filter(c => c.type === 'wager').length;
        
        await client.queryObject(`
          UPDATE expedition
          SET card_count = $1,
              wager_count = $2,
              total_value = $3,
              has_started = $4
          WHERE id = $5
        `, [
          game.player2.expeditions[color].length,
          wagerCount,
          game.player2.expeditions[color]
            .filter(c => c.type === 'expedition')
            .reduce((sum, card) => sum + (typeof card.value === 'number' ? card.value : 0), 0),
          game.player2.expeditions[color].length > 0,
          player2ExpId
        ]);
        
        // Update card positions
        for (let i = 0; i < game.player2.expeditions[color].length; i++) {
          const card = game.player2.expeditions[color][i];
          await client.queryObject(`
            UPDATE game_card
            SET location = 'player2_expedition',
                expedition_id = $1,
                position = $2
            WHERE game_id = $3 AND card_id = $4
          `, [player2ExpId, i, gameId, card.id]);
        }
      }
      
      // Update discard pile
      const pileResult = await client.queryObject(`
        SELECT id FROM discard_pile 
        WHERE board_id = (SELECT id FROM board WHERE game_id = $1)
        AND color = $2
      `, [gameId, color]);
      
      if (pileResult.rows.length > 0) {
        const pileId = pileResult.rows[0].id;
        
        // Update cards in discard pile
        for (let i = 0; i < game.discardPiles[color].length; i++) {
          const card = game.discardPiles[color][i];
          await client.queryObject(`
            UPDATE game_card
            SET location = 'discard_pile',
                pile_id = $1,
                position = $2
            WHERE game_id = $3 AND card_id = $4
          `, [pileId, i, gameId, card.id]);
        }
        
        // Update discard pile top card reference
        if (game.discardPiles[color].length > 0) {
          const topCard = game.discardPiles[color][game.discardPiles[color].length - 1];
          await client.queryObject(`
            UPDATE discard_pile
            SET top_card_id = $1
            WHERE id = $2
          `, [topCard.id, pileId]);
        } else {
          await client.queryObject(`
            UPDATE discard_pile
            SET top_card_id = NULL
            WHERE id = $1
          `, [pileId]);
        }
      }
    }
    
    // Vérification finale - s'assurer que les scores sont correctement enregistrés
    if (game.gameStatus === 'finished') {
      const verifyResult = await client.queryObject(`
        SELECT 
          score_player1, 
          score_player2, 
          winner_id, 
          ended_at 
        FROM games WHERE id = $1
      `, [gameId]);
      
      if (verifyResult.rows.length > 0) {
        const data = verifyResult.rows[0];
        console.log(`🔍 Final verification for game ${gameId}:`);
        console.log(`- Scores in DB: P1=${data.score_player1}, P2=${data.score_player2}`);
        console.log(`- Winner in DB: ${data.winner_id}`);
        console.log(`- ended_at set: ${data.ended_at ? 'Yes' : 'No'}`);
        
        // Si données incohérentes, refaire la mise à jour
        if (data.score_player1 !== player1Score || 
            data.score_player2 !== player2Score || 
            data.winner_id != game.winner || 
            !data.ended_at) {
          
          console.warn(`⚠️ Data inconsistency detected for game ${gameId}, fixing...`);
          await client.queryObject(`
            UPDATE games 
            SET score_player1 = $1,
                score_player2 = $2,
                winner_id = $3,
                ended_at = COALESCE(ended_at, CURRENT_TIMESTAMP)
            WHERE id = $4`,
            [player1Score, player2Score, game.winner || null, gameId]
          );
          console.log(`✅ Fixed data inconsistencies`);
        }
      }
    }
    
    console.log(`✅ Game state saved successfully for game ${gameId}`);
  } catch (error) {
    console.error(`❌ Error saving game state for game ${gameId}:`, error);
    // Log the full error stack for better debugging
    if (error.stack) {
      console.error(`Stack trace: ${error.stack}`);
    }
    throw error; // Propager l'erreur pour la gestion en amont
  }
}

export { loadGameState };


export default gameRouter;


import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { LostCitiesGame } from "./lost_cities/lost_cities_controller.ts";
import { notifyGamePlayers } from "./ws_routes.ts";

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
    
    // Create game entry
    const gameResult = await client.queryObject<{id: number}>(
      `INSERT INTO games (player1_id, player2_id, status) 
       VALUES ($1, $2, 'waiting') RETURNING id`,
      [userId, opponentId]
    );
    
    const gameId = gameResult.rows[0].id;
    
    // Create board for this game
    await client.queryObject(
      `INSERT INTO board (game_id, use_purple_expedition, remaining_cards_in_deck, current_round)
       VALUES ($1, $2, 60, 1)`,
      [gameId, usePurpleExpedition]
    );
    
    // Initialize expedition slots
    const colors = ['red', 'green', 'white', 'blue', 'yellow'];
    if (usePurpleExpedition) {
      colors.push('purple');
    }
    
    // Create expedition entries for both players
    for (const color of colors) {
      await client.queryObject(
        `INSERT INTO expedition (board_id, player_id, color, wager_count, card_count)
         VALUES (currval('board_id_seq'), $1, $2, 0, 0)`,
        [userId, color]
      );
      
      await client.queryObject(
        `INSERT INTO expedition (board_id, player_id, color, wager_count, card_count)
         VALUES (currval('board_id_seq'), $1, $2, 0, 0)`,
        [opponentId, color]
      );
      
      // Create discard pile for this color
      await client.queryObject(
        `INSERT INTO discard_pile (board_id, color)
         VALUES (currval('board_id_seq'), $1)`,
        [color]
      );
    }
    
    // Create initial deck and deal cards
    const game = new LostCitiesGame({
      gameId,
      usePurpleExpedition,
      player1: { id: userId },
      player2: { id: opponentId }
    });
    
    // Initialize game (create deck, shuffle, deal cards)
    game.initGame(userId, opponentId);
    
    // Save game state to database
    await client.queryObject(
      `UPDATE games SET 
       current_turn_player_id = $1,
       status = 'in_progress',
       started_at = CURRENT_TIMESTAMP 
       WHERE id = $2`,
      [userId, gameId]
    );
    
    // Add cards to database
    for (const card of game.deck) {
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'deck', $3)`,
        [gameId, card.id, game.deck.indexOf(card)]
      );
    }
    
    for (const card of game.player1.hand) {
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'player1_hand', $3)`,
        [gameId, card.id, game.player1.hand.indexOf(card)]
      );
    }
    
    for (const card of game.player2.hand) {
      await client.queryObject(
        `INSERT INTO game_card (game_id, card_id, location, position)
         VALUES ($1, $2, 'player2_hand', $3)`,
        [gameId, card.id, game.player2.hand.indexOf(card)]
      );
    }
    
    ctx.response.status = 201;
    ctx.response.body = { 
      gameId, 
      message: "Lost Cities game created successfully"
    };
    
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
    
    // Get basic game info
    const gameResult = await client.queryObject(`
      SELECT g.*, b.use_purple_expedition, b.remaining_cards_in_deck, b.current_round
      FROM games g
      JOIN board b ON g.id = b.game_id
      WHERE g.id = $1
    `, [gameId]);
    
    if (gameResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found" };
      return;
    }
    
    const game = gameResult.rows[0];
    
    // Check if user is a player in this game
    if (game.player1_id !== userId && game.player2_id !== userId) {
      ctx.response.status = 403;
      ctx.response.body = { error: "You are not a player in this game" };
      return;
    }
    
    // Load game state from database to create full response
    const lostCitiesGame = await loadGameState(gameId);
    
    // Return the game state filtered for this player
    ctx.response.body = lostCitiesGame.getGameState(userId);
    
  } catch (err) {
    console.error("Error getting game state:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

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

// Helper function to load game state from database
async function loadGameState(gameId: string | number): Promise<LostCitiesGame> {
  // Get basic game info
  const gameResult = await client.queryObject(`
    SELECT g.*, b.use_purple_expedition, b.current_round
    FROM games g
    JOIN board b ON g.id = b.game_id
    WHERE g.id = $1
  `, [gameId]);
  
  const gameData = gameResult.rows[0];
  
  // Create game instance
  const game = new LostCitiesGame({
    gameId,
    usePurpleExpedition: gameData.use_purple_expedition,
    totalRounds: 3, // Default to 3 rounds
    player1: { id: gameData.player1_id },
    player2: { id: gameData.player2_id }
  });
  
  // Load players' hands
  const player1HandResult = await client.queryObject(`
    SELECT * FROM game_card 
    WHERE game_id = $1 AND location = 'player1_hand'
    ORDER BY position
  `, [gameId]);
  
  const player2HandResult = await client.queryObject(`
    SELECT * FROM game_card 
    WHERE game_id = $1 AND location = 'player2_hand'
    ORDER BY position
  `, [gameId]);
  
  game.player1.hand = player1HandResult.rows.map(row => ({
    id: row.card_id,
    color: row.card_id.split('_')[0],
    type: row.card_id.includes('wager') ? 'wager' : 'expedition',
    value: row.card_id.includes('wager') ? 'W' : parseInt(row.card_id.split('_')[1])
  }));
  
  game.player2.hand = player2HandResult.rows.map(row => ({
    id: row.card_id,
    color: row.card_id.split('_')[0],
    type: row.card_id.includes('wager') ? 'wager' : 'expedition',
    value: row.card_id.includes('wager') ? 'W' : parseInt(row.card_id.split('_')[1])
  }));
  
  // Load expeditions
  const colors = ['red', 'green', 'white', 'blue', 'yellow'];
  if (gameData.use_purple_expedition) {
    colors.push('purple');
  }
  
  for (const color of colors) {
    // Player 1 expeditions
    const player1ExpResult = await client.queryObject(`
      SELECT gc.* 
      FROM game_card gc
      JOIN expedition e ON e.id = gc.expedition_id
      WHERE gc.game_id = $1 AND e.player_id = $2 AND e.color = $3
      ORDER BY gc.position
    `, [gameId, gameData.player1_id, color]);
    
    game.player1.expeditions[color] = player1ExpResult.rows.map(row => ({
      id: row.card_id,
      color,
      type: row.card_id.includes('wager') ? 'wager' : 'expedition',
      value: row.card_id.includes('wager') ? 'W' : parseInt(row.card_id.split('_')[1])
    }));
    
    // Player 2 expeditions
    const player2ExpResult = await client.queryObject(`
      SELECT gc.* 
      FROM game_card gc
      JOIN expedition e ON e.id = gc.expedition_id
      WHERE gc.game_id = $1 AND e.player_id = $2 AND e.color = $3
      ORDER BY gc.position
    `, [gameId, gameData.player2_id, color]);
    
    game.player2.expeditions[color] = player2ExpResult.rows.map(row => ({
      id: row.card_id,
      color,
      type: row.card_id.includes('wager') ? 'wager' : 'expedition',
      value: row.card_id.includes('wager') ? 'W' : parseInt(row.card_id.split('_')[1])
    }));
    
    // Discard piles
    const discardResult = await client.queryObject(`
      SELECT gc.* 
      FROM game_card gc
      JOIN discard_pile dp ON dp.id = gc.pile_id
      WHERE gc.game_id = $1 AND dp.color = $2
      ORDER BY gc.position
    `, [gameId, color]);
    
    game.discardPiles[color] = discardResult.rows.map(row => ({
      id: row.card_id,
      color,
      type: row.card_id.includes('wager') ? 'wager' : 'expedition',
      value: row.card_id.includes('wager') ? 'W' : parseInt(row.card_id.split('_')[1])
    }));
  }
  
  // Load deck
  const deckResult = await client.queryObject(`
    SELECT * FROM game_card 
    WHERE game_id = $1 AND location = 'deck'
    ORDER BY position
  `, [gameId]);
  
  game.deck = deckResult.rows.map(row => ({
    id: row.card_id,
    color: row.card_id.split('_')[0],
    type: row.card_id.includes('wager') ? 'wager' : 'expedition',
    value: row.card_id.includes('wager') ? 'W' : parseInt(row.card_id.split('_')[1])
  }));
  
  // Load scores
  const scoresResult = await client.queryObject(`
    SELECT round1_score_player1, round1_score_player2,
           round2_score_player1, round2_score_player2,
           round3_score_player1, round3_score_player2
    FROM board
    WHERE game_id = $1
  `, [gameId]);
  
  if (scoresResult.rows.length > 0) {
    const scores = scoresResult.rows[0];
    game.scores = {
      player1: {
        round1: scores.round1_score_player1 || 0,
        round2: scores.round2_score_player1 || 0,
        round3: scores.round3_score_player1 || 0,
        total: (scores.round1_score_player1 || 0) + 
               (scores.round2_score_player1 || 0) + 
               (scores.round3_score_player1 || 0)
      },
      player2: {
        round1: scores.round1_score_player2 || 0,
        round2: scores.round2_score_player2 || 0,
        round3: scores.round3_score_player2 || 0,
        total: (scores.round1_score_player2 || 0) + 
               (scores.round2_score_player2 || 0) + 
               (scores.round3_score_player2 || 0)
      }
    };
  }
  
  // Set current game state
  game.currentPlayerId = gameData.current_turn_player_id;
  game.currentRound = gameData.current_round;
  game.gameStatus = gameData.status;
  game.turnPhase = gameData.turn_phase || 'play';
  game.winner = gameData.winner_id;
  
  return game;
}

// Helper function to save game state to database
async function saveGameState(game: LostCitiesGame): Promise<void> {
  const gameId = game.gameId;
  
  // Update game table
  await client.queryObject(`
    UPDATE games 
    SET current_turn_player_id = $1,
        status = $2,
        winner_id = $3,
        turn_phase = $4
    WHERE id = $5
  `, [
    game.currentPlayerId,
    game.gameStatus,
    game.winner || null,
    game.turnPhase,
    gameId
  ]);
  
  // Update board table
  await client.queryObject(`
    UPDATE board
    SET current_round = $1,
        remaining_cards_in_deck = $2
    WHERE game_id = $3
  `, [
    game.currentRound,
    game.deck.length,
    gameId
  ]);
  
  // Handle score updates if needed
  if (game.gameStatus === 'finished' || game.currentRound > 1) {
    const roundScoreField1 = `round${game.currentRound}_score_player1`;
    const roundScoreField2 = `round${game.currentRound}_score_player2`;
    
    await client.queryObject(`
      UPDATE board
      SET ${roundScoreField1} = $1,
          ${roundScoreField2} = $2
      WHERE game_id = $3
    `, [
      game.scores.player1[`round${game.currentRound}`],
      game.scores.player2[`round${game.currentRound}`],
      gameId
    ]);
  }
  
  // We'll assume the game logic has already updated the cards in memory,
  // so now we need to sync those changes to the database
  
  // Clear all card locations (we'll re-insert them)
  await client.queryObject(`
    UPDATE game_card
    SET location = 'removed',
        expedition_id = NULL,
        pile_id = NULL
    WHERE game_id = $1
  `, [gameId]);
  
  // Re-insert player 1 hand
  for (let i = 0; i < game.player1.hand.length; i++) {
    const card = game.player1.hand[i];
    await client.queryObject(`
      UPDATE game_card
      SET location = 'player1_hand',
          position = $1
      WHERE game_id = $2 AND card_id = $3
    `, [i, gameId, card.id]);
  }
  
  // Re-insert player 2 hand
  for (let i = 0; i < game.player2.hand.length; i++) {
    const card = game.player2.hand[i];
    await client.queryObject(`
      UPDATE game_card
      SET location = 'player2_hand',
          position = $1
      WHERE game_id = $2 AND card_id = $3
    `, [i, gameId, card.id]);
  }
  
  // Re-insert deck
  for (let i = 0; i < game.deck.length; i++) {
    const card = game.deck[i];
    await client.queryObject(`
      UPDATE game_card
      SET location = 'deck',
          position = $1
      WHERE game_id = $2 AND card_id = $3
    `, [i, gameId, card.id]);
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
}


export { loadGameState };

export default gameRouter;


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
    
    // Get game info
    const gameResult = await client.queryObject(`
      SELECT g.*, b.use_purple_expedition, b.current_round,
             u1.username as player1_name, u2.username as player2_name
      FROM games g
      JOIN board b ON g.id = b.game_id
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      WHERE g.id = $1
    `, [gameId]);
    
    if (gameResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found" };
      return;
    }
    
    const game = gameResult.rows[0];
    
    // Determine which player is requesting
    const isPlayer1 = game.player1_id === userId;
    const isPlayer2 = game.player2_id === userId;
    
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
    
    // Get expeditions for both players
    const expeditions = await getExpeditions(gameId);
    
    // Get discard piles
    const discardPiles = await getDiscardPiles(gameId);
    
    // Construct game state
    const gameState = {
      gameId: game.id,
      status: game.status,
      currentRound: game.current_round,
      totalRounds: 3,
      currentPlayerId: game.current_turn_player_id,
      turnPhase: game.turn_phase || 'play',
      usePurpleExpedition: game.use_purple_expedition,
      cardsInDeck: await getCardsInDeck(gameId),
      player1: {
        id: game.player1_id,
        name: game.player1_name,
        expeditions: expeditions.player1,
        handSize: isPlayer1 ? handResult.rows.length : await getHandSize(gameId, 'player1_hand'),
        hand: isPlayer1 ? handResult.rows : undefined
      },
      player2: {
        id: game.player2_id,
        name: game.player2_name,
        expeditions: expeditions.player2,
        handSize: isPlayer2 ? handResult.rows.length : await getHandSize(gameId, 'player2_hand'),
        hand: isPlayer2 ? handResult.rows : undefined
      },
      discardPiles,
      scores: await getScores(gameId),
      winner: game.winner_id
    };
    
    ctx.response.body = gameState;
    
  } catch (err) {
    console.error("Error getting game state:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
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
  // Implementation to fetch expedition data
  return { player1: {}, player2: {} };
}

async function getDiscardPiles(gameId) {
  // Implementation to fetch discard pile data
  return {};
}

async function getScores(gameId) {
  // Implementation to fetch scores
  return { player1: { total: 0 }, player2: { total: 0 } };
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


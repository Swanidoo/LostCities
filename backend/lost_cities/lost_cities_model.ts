/**
 * Lost Cities Game Database Model
 * 
 * This file handles database operations for the Lost Cities card game
 */

import { client } from "../db_client.ts";
import { LostCitiesGame } from "./lost_cities_controller.ts";
import { Card, GameData, BoardData, ExpeditionData, GameCardData, DiscardPileData } from "./lost_cities_types.ts";

/**
 * Create a new Lost Cities game in the database
 */
export async function createGame(
  userId: string,
  opponentId: string,
  usePurpleExpedition: boolean
): Promise<number> {
  // Create game entry
  const gameResult = await client.queryObject<{id: number}>(
    `INSERT INTO games (
      player1_id, 
      player2_id, 
      status
    ) VALUES ($1, $2, 'waiting') RETURNING id`,
    [userId, opponentId]
  );
  
  const gameId = gameResult.rows[0].id;
  
  // Create board for this game
  await client.queryObject(
    `INSERT INTO board (
      game_id, 
      use_purple_expedition, 
      remaining_cards_in_deck, 
      current_round
    ) VALUES ($1, $2, 60, 1)`,
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
      `INSERT INTO expedition (
        board_id, 
        player_id, 
        color, 
        wager_count, 
        card_count
      ) VALUES (currval('board_id_seq'), $1, $2, 0, 0)`,
      [userId, color]
    );
    
    await client.queryObject(
      `INSERT INTO expedition (
        board_id, 
        player_id, 
        color, 
        wager_count, 
        card_count
      ) VALUES (currval('board_id_seq'), $1, $2, 0, 0)`,
      [opponentId, color]
    );
    
    // Create discard pile for this color
    await client.queryObject(
      `INSERT INTO discard_pile (
        board_id, 
        color
      ) VALUES (currval('board_id_seq'), $1)`,
      [color]
    );
  }
  
  return gameId;
}

/**
 * Save initial cards when starting a new game
 */
export async function saveInitialCards(game: LostCitiesGame): Promise<void> {
  const gameId = game.gameId;
  
  // Add cards to database
  for (let i = 0; i < game.deck.length; i++) {
    const card = game.deck[i];
    await client.queryObject(
      `INSERT INTO game_card (
        game_id, 
        card_id, 
        location, 
        position
      ) VALUES ($1, $2, 'deck', $3)`,
      [gameId, card.id, i]
    );
  }
  
  // Add player 1's hand
  for (let i = 0; i < game.player1.hand.length; i++) {
    const card = game.player1.hand[i];
    await client.queryObject(
      `INSERT INTO game_card (
        game_id, 
        card_id, 
        location, 
        position
      ) VALUES ($1, $2, 'player1_hand', $3)`,
      [gameId, card.id, i]
    );
  }
  
  // Add player 2's hand
  for (let i = 0; i < game.player2.hand.length; i++) {
    const card = game.player2.hand[i];
    await client.queryObject(
      `INSERT INTO game_card (
        game_id, 
        card_id, 
        location, 
        position
      ) VALUES ($1, $2, 'player2_hand', $3)`,
      [gameId, card.id, i]
    );
  }
  
  // Update game status
  await client.queryObject(
    `UPDATE games SET 
     current_turn_player_id = $1,
     status = 'in_progress',
     started_at = CURRENT_TIMESTAMP 
     WHERE id = $2`,
    [game.currentPlayerId, gameId]
  );
}

/**
 * Load game state from database
 */
export async function loadGameState(gameId: string | number): Promise<LostCitiesGame> {
  console.log(`🔍 Loading game state for game ${gameId}`);
  
  // First check if we have any cards for this game
  const cardCountResult = await client.queryObject(`
    SELECT COUNT(*) as count FROM game_card WHERE game_id = $1
  `, [gameId]);
  console.log(`🎴 Total cards in game_card table for game ${gameId}: ${cardCountResult.rows[0].count}`);
  
  if (cardCountResult.rows[0].count === 0) {
    console.error(`❌ No cards found for game ${gameId} in game_card table`);
  }
  
  // Get basic game info
  const gameResult = await client.queryObject<any>(`
    SELECT g.*, 
           b.use_purple_expedition, 
           b.current_round as board_current_round,
           b.remaining_cards_in_deck,
           b.id as board_id
    FROM games g
    JOIN board b ON g.id = b.game_id
    WHERE g.id = $1
  `, [gameId]);
  
  if (gameResult.rows.length === 0) {
    throw new Error("Game not found");
  }
  
  const gameData = gameResult.rows[0];
  console.log(`📋 Found game data:`, gameData);
  
  // Initialize the game object
  const game = new LostCitiesGame({
    gameId: gameId,
    usePurpleExpedition: gameData.use_purple_expedition || false,
    totalRounds: 3,
    player1: { id: gameData.player1_id, hand: [], expeditions: {} },
    player2: { id: gameData.player2_id, hand: [], expeditions: {} },
    onGameStateChanged: () => {},
    onError: console.error
  });
  
  // Initialize all data structures
  game.deck = [];
  game.discardPiles = {};

  // Initialize colors and expeditions
  const colors = ['red', 'green', 'white', 'blue', 'yellow'];
  if (gameData.use_purple_expedition) {
    colors.push('purple');
  }

  colors.forEach(color => {
    game.player1.expeditions[color] = [];
    game.player2.expeditions[color] = [];
    game.discardPiles[color] = [];
  });

  // Get player hands - with JOIN to card table for complete card info
  const player1HandResult = await client.queryObject<any>(`
    SELECT gc.card_id, c.color, c.type, c.value, gc.position
    FROM game_card gc
    JOIN card c ON gc.card_id = c.id
    WHERE gc.game_id = $1 AND gc.location = 'player1_hand'
    ORDER BY gc.position
  `, [gameId]);
  
  const player2HandResult = await client.queryObject<any>(`
    SELECT gc.card_id, c.color, c.type, c.value, gc.position
    FROM game_card gc
    JOIN card c ON gc.card_id = c.id
    WHERE gc.game_id = $1 AND gc.location = 'player2_hand'
    ORDER BY gc.position
  `, [gameId]);
  
  console.log(`🃏 Player 1 hand: ${player1HandResult.rows.length} cards`);
  console.log(`🃏 Player 2 hand: ${player2HandResult.rows.length} cards`);
  
  // Populate player hands
  game.player1.hand = player1HandResult.rows.map(row => ({
    id: row.card_id,
    color: row.color,
    type: row.type,
    value: row.value
  }));
  
  game.player2.hand = player2HandResult.rows.map(row => ({
    id: row.card_id,
    color: row.color,
    type: row.type,
    value: row.value
  }));

  // Load deck
  const deckResult = await client.queryObject<any>(`
    SELECT gc.card_id, c.color, c.type, c.value, gc.position
    FROM game_card gc
    JOIN card c ON gc.card_id = c.id
    WHERE gc.game_id = $1 AND gc.location = 'deck'
    ORDER BY gc.position
  `, [gameId]);

  game.deck = deckResult.rows.map(row => ({
    id: row.card_id,
    color: row.color,
    type: row.type,
    value: row.value
  }));

  console.log(`🃏 Deck: ${game.deck.length} cards`);
  
  // Load expeditions and discard piles
  const boardId = gameData.board_id;
  
  for (const color of colors) {
    // Get expedition IDs for this color
    const expResult = await client.queryObject<ExpeditionData>(
      `SELECT id, player_id FROM expedition 
      WHERE board_id = $1 AND color = $2`,
      [boardId, color]
    );
    
    const expeditions = expResult.rows;
    const player1ExpId = expeditions.find(exp => exp.player_id === gameData.player1_id)?.id;
    const player2ExpId = expeditions.find(exp => exp.player_id === gameData.player2_id)?.id;
    
    // Player 1 expeditions
    if (player1ExpId) {
      const player1ExpResult = await client.queryObject<any>(
        `SELECT gc.card_id, c.color, c.type, c.value, gc.position
        FROM game_card gc
        JOIN card c ON gc.card_id = c.id
        WHERE gc.game_id = $1 AND gc.expedition_id = $2
        ORDER BY gc.position`,
        [gameId, player1ExpId]
      );
      
      game.player1.expeditions[color] = player1ExpResult.rows.map(row => ({
        id: row.card_id,
        color: row.color,
        type: row.type,
        value: row.value
      }));
    }
    
    // Player 2 expeditions
    if (player2ExpId) {
      const player2ExpResult = await client.queryObject<any>(
        `SELECT gc.card_id, c.color, c.type, c.value, gc.position
        FROM game_card gc
        JOIN card c ON gc.card_id = c.id
        WHERE gc.game_id = $1 AND gc.expedition_id = $2
        ORDER BY gc.position`,
        [gameId, player2ExpId]
      );
      
      game.player2.expeditions[color] = player2ExpResult.rows.map(row => ({
        id: row.card_id,
        color: row.color,
        type: row.type,
        value: row.value
      }));
    }
    
    // Get discard pile for this color
    const pileResult = await client.queryObject<DiscardPileData>(
      `SELECT id FROM discard_pile 
      WHERE board_id = $1 AND color = $2`,
      [boardId, color]
    );
    
    if (pileResult.rows.length > 0) {
      const pileId = pileResult.rows[0].id;
      
      // Load cards in discard pile
      const discardResult = await client.queryObject<any>(
        `SELECT gc.card_id, c.color, c.type, c.value, gc.position
        FROM game_card gc
        JOIN card c ON gc.card_id = c.id
        WHERE gc.game_id = $1 AND gc.pile_id = $2
        ORDER BY gc.position`,
        [gameId, pileId]
      );
      
      game.discardPiles[color] = discardResult.rows.map(row => ({
        id: row.card_id,
        color: row.color,
        type: row.type,
        value: row.value
      }));
    }
  }
  
  // Load scores
  const scoresResult = await client.queryObject<BoardData>(
    `SELECT 
      round1_score_player1, round1_score_player2,
      round2_score_player1, round2_score_player2,
      round3_score_player1, round3_score_player2
    FROM board
    WHERE game_id = $1`,
    [gameId]
  );
  
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
  
  // Set additional game state
  game.currentPlayerId = gameData.current_turn_player_id;
  game.currentRound = gameData.board_current_round || gameData.current_round || 1;
  game.gameStatus = gameData.status;
  game.turnPhase = gameData.turn_phase || 'play';
  game.winner = gameData.winner_id;
  
  console.log(`✅ Game state loaded: ${game.player1.hand.length} + ${game.player2.hand.length} cards in hands, ${game.deck.length} in deck`);  
  return game;
}

/**
 * Save game state to database
 */
export async function saveGameState(game: LostCitiesGame): Promise<void> {
  const gameId = game.gameId;
  
  // Update game table
  await client.queryObject(
    `UPDATE games 
    SET current_turn_player_id = $1,
        status = $2,
        winner_id = $3,
        turn_phase = $4
    WHERE id = $5`,
    [
      game.currentPlayerId,
      game.gameStatus,
      game.winner || null,
      game.turnPhase,
      gameId
    ]
  );
  
  // Update board table
  await client.queryObject(
    `UPDATE board
    SET current_round = $1,
        remaining_cards_in_deck = $2,
        updated_at = CURRENT_TIMESTAMP
    WHERE game_id = $3`,
    [
      game.currentRound,
      game.deck.length,
      gameId
    ]
  );
  
  // Handle score updates if needed
  if (game.gameStatus === 'finished' || game.currentRound > 1) {
    const roundScoreField1 = `round${game.currentRound}_score_player1`;
    const roundScoreField2 = `round${game.currentRound}_score_player2`;
    
    await client.queryObject(
      `UPDATE board
      SET ${roundScoreField1} = $1,
          ${roundScoreField2} = $2
      WHERE game_id = $3`,
      [
        game.scores.player1[`round${game.currentRound}`],
        game.scores.player2[`round${game.currentRound}`],
        gameId
      ]
    );
  }
  
  // Get board ID
  const boardResult = await client.queryObject<{id: number}>(
    `SELECT id FROM board WHERE game_id = $1`,
    [gameId]
  );
  
  if (boardResult.rows.length === 0) {
    throw new Error("Board not found for game");
  }
  
  const boardId = boardResult.rows[0].id;
  
  // Update card positions
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
  
  // Update expeditions and discard piles
  const colors = Object.keys(game.player1.expeditions);
  
  for (const color of colors) {
    // Get expedition IDs for this color
    const expResult = await client.queryObject<ExpeditionData>(
      `SELECT id, player_id FROM expedition 
      WHERE board_id = $1 AND color = $2`,
      [boardId, color]
    );
    
    const expeditions = expResult.rows;
    const player1ExpId = expeditions.find(exp => exp.player_id === game.player1.id)?.id;
    const player2ExpId = expeditions.find(exp => exp.player_id === game.player2.id)?.id;
    
    // Update Player 1 expedition
    if (player1ExpId) {
      const wagerCount = game.player1.expeditions[color].filter(c => c.type === 'wager').length;
      const totalValue = game.player1.expeditions[color]
        .filter(c => c.type === 'expedition')
        .reduce((sum, card) => sum + (typeof card.value === 'number' ? card.value : 0), 0);
      
      await client.queryObject(
        `UPDATE expedition
        SET card_count = $1,
            wager_count = $2,
            total_value = $3,
            has_started = $4
        WHERE id = $5`,
        [
          game.player1.expeditions[color].length,
          wagerCount,
          totalValue,
          game.player1.expeditions[color].length > 0,
          player1ExpId
        ]
      );
      
      // Update cards in this expedition
      for (let i = 0; i < game.player1.expeditions[color].length; i++) {
        const card = game.player1.expeditions[color][i];
        await client.queryObject(
          `UPDATE game_card
          SET location = 'player1_expedition',
              expedition_id = $1,
              position = $2,
              pile_id = NULL
          WHERE game_id = $3 AND card_id = $4`,
          [player1ExpId, i, gameId, card.id]
        );
      }
    }
    
    // Update Player 2 expedition
    if (player2ExpId) {
      const wagerCount = game.player2.expeditions[color].filter(c => c.type === 'wager').length;
      const totalValue = game.player2.expeditions[color]
        .filter(c => c.type === 'expedition')
        .reduce((sum, card) => sum + (typeof card.value === 'number' ? card.value : 0), 0);
      
      await client.queryObject(
        `UPDATE expedition
        SET card_count = $1,
            wager_count = $2,
            total_value = $3,
            has_started = $4
        WHERE id = $5`,
        [
          game.player2.expeditions[color].length,
          wagerCount,
          totalValue,
          game.player2.expeditions[color].length > 0,
          player2ExpId
        ]
      );
      
      // Update cards in this expedition
      for (let i = 0; i < game.player2.expeditions[color].length; i++) {
        const card = game.player2.expeditions[color][i];
        await client.queryObject(
          `UPDATE game_card
          SET location = 'player2_expedition',
              expedition_id = $1,
              position = $2,
              pile_id = NULL
          WHERE game_id = $3 AND card_id = $4`,
          [player2ExpId, i, gameId, card.id]
        );
      }
    }
    
    // Update discard pile
    const pileResult = await client.queryObject<DiscardPileData>(
      `SELECT id FROM discard_pile 
      WHERE board_id = $1 AND color = $2`,
      [boardId, color]
    );
    
    if (pileResult.rows.length > 0) {
      const pileId = pileResult.rows[0].id;
      
      // Update cards in discard pile
      for (let i = 0; i < game.discardPiles[color].length; i++) {
        const card = game.discardPiles[color][i];
        await client.queryObject(
          `UPDATE game_card
          SET location = 'discard_pile',
              pile_id = $1,
              position = $2,
              expedition_id = NULL
          WHERE game_id = $3 AND card_id = $4`,
          [pileId, i, gameId, card.id]
        );
      }
      
      // Update discard pile top card reference
      if (game.discardPiles[color].length > 0) {
        const topCard = game.discardPiles[color][game.discardPiles[color].length - 1];
        await client.queryObject(
          `UPDATE discard_pile
          SET top_card_id = $1
          WHERE id = $2`,
          [topCard.id, pileId]
        );
      } else {
        await client.queryObject(
          `UPDATE discard_pile
          SET top_card_id = NULL
          WHERE id = $1`,
          [pileId]
        );
      }
    }
  }
}

/**
 * Record a move in the database
 */
export async function recordMove(
  gameId: string | number,
  playerId: string,
  turnNumber: number,
  action: string,
  cardId?: string,
  destination?: string,
  source?: string,
  color?: string
): Promise<void> {
  await client.queryObject(
    `INSERT INTO move (
      game_id, 
      player_id, 
      turn_number, 
      action, 
      card_id, 
      destination, 
      source,
      color
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      gameId, 
      playerId, 
      turnNumber,
      action,
      cardId || null,
      destination || null,
      source || null,
      color || null
    ]
  );
}

/**
 * Get active games for a player
 */
export async function getActiveGamesForPlayer(playerId: string): Promise<GameData[]> {
  const result = await client.queryObject<GameData>(
    `SELECT g.* 
    FROM games g
    WHERE (g.player1_id = $1 OR g.player2_id = $1)
    AND g.status IN ('waiting', 'in_progress')
    ORDER BY g.started_at DESC, g.id DESC`,
    [playerId]
  );
  
  return result.rows;
}

/**
 * Get completed games for a player
 */
export async function getCompletedGamesForPlayer(playerId: string): Promise<GameData[]> {
  const result = await client.queryObject<GameData>(
    `SELECT g.* 
    FROM games g
    WHERE (g.player1_id = $1 OR g.player2_id = $1)
    AND g.status = 'finished'
    ORDER BY g.ended_at DESC, g.id DESC`,
    [playerId]
  );
  
  return result.rows;
}
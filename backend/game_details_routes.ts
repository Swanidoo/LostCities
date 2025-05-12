import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";

const gameDetailsRouter = new Router();

gameDetailsRouter.get("/api/games/:gameId/details", async (ctx) => {
  try {
    const gameId = ctx.params.gameId;
    
    // 1. Récupérer les infos de base de la partie
    const gameInfo = await client.queryObject(`
      SELECT 
        g.id,
        g.started_at,
        g.ended_at,
        g.game_mode,
        g.score_player1,
        g.score_player2,
        g.winner_id,
        g.player1_id,
        g.player2_id,
        u1.username as player1_name,
        u2.username as player2_name,
        b.current_round,
        b.round1_score_player1, b.round1_score_player2,
        b.round2_score_player1, b.round2_score_player2,
        b.round3_score_player1, b.round3_score_player2,
        b.use_purple_expedition
      FROM games g
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      LEFT JOIN board b ON g.id = b.game_id
      WHERE g.id = $1 AND g.status = 'finished'
    `, [gameId]);
    
    if (gameInfo.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found" };
      return;
    }
    
    const game = gameInfo.rows[0];
    
    // 2. Récupérer tous les moves de la partie
    const moves = await client.queryObject(`
      SELECT 
        m.id,
        m.player_id,
        u.username as player_name,
        m.turn_number,
        m.action,
        m.card_id,
        m.destination,
        m.source,
        m.color,
        m.timestamp
      FROM move m
      JOIN users u ON m.player_id = u.id
      WHERE m.game_id = $1
      ORDER BY m.timestamp ASC
    `, [gameId]);
    
    // 3. Organiser les données par rounds (basé sur les scores)
    const rounds = [];
    const roundsData = [
      { 
        round: 1, 
        score_p1: Number(game.round1_score_player1) || 0, 
        score_p2: Number(game.round1_score_player2) || 0 
      },
      { 
        round: 2, 
        score_p1: Number(game.round2_score_player1) || 0, 
        score_p2: Number(game.round2_score_player2) || 0 
      },
      { 
        round: 3, 
        score_p1: Number(game.round3_score_player1) || 0, 
        score_p2: Number(game.round3_score_player2) || 0 
      }
    ];
    
    // 4. Calculer quelques statistiques de base
    const statistics = {
      totalMoves: moves.rows.length,
      movesPerPlayer: {
        [game.player1_name]: moves.rows.filter(m => m.player_id === game.player1_id).length,
        [game.player2_name]: moves.rows.filter(m => m.player_id === game.player2_id).length
      },
      cardsByAction: {
        played: moves.rows.filter(m => m.action === 'play_card').length,
        discarded: moves.rows.filter(m => m.action === 'discard_card').length,
        drawn: moves.rows.filter(m => m.action === 'draw_card').length
      }
    };
    
    // 5. Préparer la réponse
    const response = {
      basic: {
        gameId: Number(game.id),
        players: [game.player1_name, game.player2_name],
        scores: [Number(game.score_player1) || 0, Number(game.score_player2) || 0],
        duration: game.ended_at && game.started_at ? 
          Math.round((new Date(game.ended_at).getTime() - new Date(game.started_at).getTime()) / (1000 * 60)) : null,
        mode: game.game_mode,
        started_at: game.started_at,
        ended_at: game.ended_at,
        winner: game.winner_id === game.player1_id ? game.player1_name : 
                game.winner_id === game.player2_id ? game.player2_name : null,
        withExtension: Boolean(game.use_purple_expedition)
      },
      rounds: roundsData.filter(r => r.score_p1 > 0 || r.score_p2 > 0),
      moves: moves.rows.map(move => ({
        id: Number(move.id),
        player: move.player_name,
        playerId: Number(move.player_id),
        turn: Number(move.turn_number),
        action: move.action,
        card: move.card_id,
        destination: move.destination,
        source: move.source,
        color: move.color,
        timestamp: move.timestamp
      })),
      statistics
    };
    
    ctx.response.body = response;
    
  } catch (err) {
    console.error("Error fetching game details:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

export default gameDetailsRouter;
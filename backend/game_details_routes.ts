import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";

const gameDetailsRouter = new Router();

gameDetailsRouter.get("/api/games/:gameId/details", async (ctx) => {
  try {
    const gameId = ctx.params.gameId;
    
    // 1. Récupérer les infos de base de la partie avec tous les champs nécessaires
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
        g.status,
        u1.username as player1_name,
        u1.avatar_url as player1_avatar,
        u2.username as player2_name,
        u2.avatar_url as player2_avatar,
        b.current_round,
        b.use_purple_expedition,
        b.round1_score_player1, 
        b.round1_score_player2,
        b.round2_score_player1, 
        b.round2_score_player2,
        b.round3_score_player1, 
        b.round3_score_player2
      FROM games g
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      LEFT JOIN board b ON g.id = b.game_id
      WHERE g.id = $1
    `, [gameId]);
    
    if (gameInfo.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "Game not found" };
      return;
    }
    
    const game = gameInfo.rows[0];
    console.log(`Récupération des détails pour la partie ${gameId}:`, game);
    
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
    
    // 3. Organiser les données par rounds
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
    const player1Moves = moves.rows.filter(m => m.player_id === game.player1_id);
    const player2Moves = moves.rows.filter(m => m.player_id === game.player2_id);
    
    const statistics = {
      totalMoves: moves.rows.length,
      movesPerPlayer: {
        [game.player1_name]: player1Moves.length,
        [game.player2_name]: player2Moves.length
      },
      cardsByAction: {
        played: moves.rows.filter(m => m.action === 'play_card').length,
        discarded: moves.rows.filter(m => m.action === 'discard_card').length,
        drawn: moves.rows.filter(m => m.action === 'draw_card').length
      },
      colorDistribution: {
        player1: countColorsByPlayer(player1Moves),
        player2: countColorsByPlayer(player2Moves)
      }
    };
    
    // 5. Calculer la durée de façon robuste
    let duration = null;
    if (game.started_at && game.ended_at) {
      try {
        const startTime = new Date(game.started_at);
        const endTime = new Date(game.ended_at);
        
        if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
          const durationMs = Math.max(0, endTime.getTime() - startTime.getTime());
          duration = Math.max(1, Math.round(durationMs / (1000 * 60))); // Au moins 1 minute
          console.log(`⏱️ Durée calculée pour la partie ${gameId}: ${duration} minutes`);
        } else {
          console.warn(`⚠️ Dates invalides pour la partie ${gameId}`);
          duration = 5; // Valeur par défaut raisonnable
        }
      } catch (error) {
        console.error(`❌ Erreur lors du calcul de la durée:`, error);
        duration = 5; // Valeur par défaut en cas d'erreur
      }
    } else if (game.started_at) {
      // Si la partie est en cours, calculer la durée jusqu'à maintenant
      try {
        const startTime = new Date(game.started_at);
        const now = new Date();
        
        if (!isNaN(startTime.getTime())) {
          const durationMs = Math.max(0, now.getTime() - startTime.getTime());
          duration = Math.max(1, Math.round(durationMs / (1000 * 60)));
          console.log(`⏱️ Durée en cours pour la partie ${gameId}: ${duration} minutes`);
        }
      } catch (error) {
        console.error(`❌ Erreur lors du calcul de la durée en cours:`, error);
      }
    }
    
    // 6. Préparer la réponse complète
    const response = {
      basic: {
        gameId: Number(game.id),
        players: [
          { 
            id: Number(game.player1_id), 
            name: game.player1_name,
            avatar: game.player1_avatar
          },
          { 
            id: Number(game.player2_id), 
            name: game.player2_name,
            avatar: game.player2_avatar
          }
        ],
        scores: {
          player1: Number(game.score_player1) || 0,
          player2: Number(game.score_player2) || 0
        },
        duration: duration,
        mode: game.game_mode || 'classic',
        started_at: game.started_at,
        ended_at: game.ended_at,
        status: game.status,
        winner: game.winner_id ? {
          id: Number(game.winner_id),
          name: Number(game.winner_id) === Number(game.player1_id) ? game.player1_name : game.player2_name
        } : null,
        withExtension: Boolean(game.use_purple_expedition),
        currentRound: Number(game.current_round) || 1
      },
      rounds: roundsData.filter(r => r.score_p1 !== 0 || r.score_p2 !== 0),
      moves: moves.rows.map(move => ({
        id: Number(move.id),
        player: {
          id: Number(move.player_id),
          name: move.player_name
        },
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
    
    // Conversion des BigInt en Number pour éviter les erreurs JSON
    ctx.response.body = JSON.parse(JSON.stringify(response, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    
  } catch (err) {
    console.error("Error fetching game details:", err);
    console.error("Error stack:", err.stack);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Internal server error", 
      details: err.message 
    };
  }
});

// Fonction utilitaire pour compter les couleurs utilisées par un joueur
function countColorsByPlayer(playerMoves) {
  const colorCounts = {
    red: 0,
    green: 0,
    blue: 0,
    white: 0,
    yellow: 0,
    purple: 0
  };
  
  playerMoves.forEach(move => {
    if (move.color && colorCounts.hasOwnProperty(move.color)) {
      colorCounts[move.color]++;
    }
  });
  
  return colorCounts;
}

export default gameDetailsRouter;
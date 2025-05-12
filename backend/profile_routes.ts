import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { client } from "./db_client.ts";

const profileRouter = new Router();


// GET /api/profile/:id/games - Récupérer l'historique des parties d'un utilisateur
profileRouter.get("/api/profile/:id/games", async (ctx) => {
  try {
    const userId = ctx.params.id;
    
    // Parse query parameters for pagination
    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;
    
    // Get total count of games for this user
    const countResult = await client.queryObject<{total: number}>(`
      SELECT COUNT(*) as total 
      FROM games 
      WHERE player1_id = $1 OR player2_id = $1
    `, [userId]);
    
    const totalGames = Number(countResult.rows[0].total);
    
    // Get games with opponents and results
    const gamesResult = await client.queryObject(`
      SELECT 
        g.id,
        g.started_at as date,
        g.ended_at,
        g.game_mode as mode,
        g.status,
        g.score_player1,
        g.score_player2,
        g.winner_id,
        CASE 
          WHEN g.player1_id = $1 THEN u2.username 
          ELSE u1.username 
        END as opponent,
        CASE 
          WHEN g.player1_id = $1 THEN g.score_player1 
          ELSE g.score_player2 
        END as score_player,
        CASE 
          WHEN g.player1_id = $1 THEN g.score_player2 
          ELSE g.score_player1 
        END as score_opponent,
        CASE 
          WHEN g.winner_id = $1 THEN 'victory'
          WHEN g.winner_id IS NULL THEN 'draw'
          ELSE 'defeat'
        END as result,
        -- Check if game used extension by looking at board
        COALESCE(b.use_purple_expedition, false) as with_extension,
        -- Calculate duration in minutes
        CASE 
          WHEN g.ended_at IS NOT NULL AND g.started_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (g.ended_at - g.started_at)) / 60 
          ELSE NULL 
        END as duration
      FROM games g
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      LEFT JOIN board b ON g.id = b.game_id
      WHERE g.player1_id = $1 OR g.player2_id = $1
      ORDER BY g.started_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    // Format the results
    const games = gamesResult.rows.map(game => ({
      id: game.id,
      date: game.date,
      mode: game.mode,
      opponent: game.opponent,
      result: game.result,
      score: {
        player: Number(game.score_player || 0),
        opponent: Number(game.score_opponent || 0)
      },
      with_extension: game.with_extension,
      duration: game.duration ? Math.round(Number(game.duration)) : null,
      status: game.status
    }));
    
    // Return games with pagination info
    ctx.response.body = {
      games,
      pagination: {
        page,
        limit,
        total: totalGames,
        totalPages: Math.ceil(totalGames / limit)
      }
    };
    
  } catch (err) {
    console.error("Error fetching game history:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

profileRouter.get("/api/profile/:id/messages", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.params.id;
    
    // Vérifier si l'utilisateur est admin
    if (ctx.state.user.role !== 'admin') {
      ctx.response.status = 403;
      ctx.response.body = { error: "Admin access required" };
      return;
    }
    
    // Récupérer les messages du dernier mois
    const messages = await client.queryObject(
      `SELECT 
        cm.id,
        cm.message,
        cm.timestamp,
        CASE 
          WHEN cm.game_id IS NULL THEN 'General Chat'
          ELSE CONCAT('Game #', cm.game_id)
        END as context,
        cm.is_deleted
      FROM chat_message cm
      WHERE cm.sender_id = $1
      AND cm.timestamp > NOW() - INTERVAL '1 month'
      ORDER BY cm.timestamp DESC
      LIMIT 100`,
      [userId]
    );
    
    ctx.response.body = messages.rows;
    
  } catch (err) {
    console.error("Error fetching user messages:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});


// GET /api/profile/:id - Récupérer un profil public
profileRouter.get("/api/profile/:id", async (ctx) => {
    try {
      const userId = ctx.params.id;
      
      // First check if user exists
      const userResult = await client.queryObject(
        `SELECT id, username, avatar_url, bio, created_at FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "User not found" };
        return;
      }
      
      const user = userResult.rows[0];
      
      // Get game stats separately with error handling
      let gamesPlayed = 0;
      let gamesWon = 0;
      
      try {
        const statsResult = await client.queryObject(
          `SELECT 
            COUNT(*) as games_played,
            COUNT(CASE WHEN winner_id = $1 THEN 1 END) as games_won
          FROM games 
          WHERE player1_id = $1 OR player2_id = $1`,
          [userId]
        );
        
        if (statsResult.rows.length > 0) {
          gamesPlayed = Number(statsResult.rows[0].games_played) || 0;
          gamesWon = Number(statsResult.rows[0].games_won) || 0;
        }
      } catch (statsError) {
        console.error("Error fetching game stats:", statsError);
        // Continue with default values
      }
      
      // Return combined data
      ctx.response.body = {
        ...user,
        games_played: gamesPlayed,
        games_won: gamesWon
      };
      
    } catch (err) {
      console.error("Error fetching profile:", err);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });

// PUT /api/profile - Mettre à jour son propre profil
profileRouter.put("/api/profile", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    const { bio, avatar_url } = await ctx.request.body({ type: "json" }).value;
    
    await client.queryObject(
      `UPDATE users SET bio = $1, avatar_url = $2 WHERE id = $3`,
      [bio, avatar_url, userId]
    );
    
    ctx.response.body = { message: "Profile updated successfully" };
  } catch (err) {
    console.error("Error updating profile:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});


// POST /api/report - Créer un rapport
profileRouter.post("/api/report", authMiddleware, async (ctx) => {
  try {
    const reporterId = ctx.state.user.id;
    const { reported_user_id, report_type, description } = await ctx.request.body({ type: "json" }).value;
    
    await client.queryObject(
      `INSERT INTO reports (reporter_id, reported_user_id, report_type, description, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [reporterId, reported_user_id, report_type, description]
    );
    
    ctx.response.body = { message: "Report submitted successfully" };
  } catch (err) {
    console.error("Error creating report:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});



export default profileRouter;
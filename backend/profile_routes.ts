import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { client } from "./db_client.ts";
import { hash, compare } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";
import { create } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { cryptoKey, createJWT } from "./jwt_utils.ts";

const profileRouter = new Router();


// GET /api/profile/:id/games - Récupérer l'historique des parties d'un utilisateur
// GET /api/profile/:id/games - Récupérer l'historique des parties d'un utilisateur
profileRouter.get("/api/profile/:id/games", async (ctx) => {
  try {
    const userId = parseInt(ctx.params.id);
    console.log("🎮 Fetching games for user:", userId);
    
    // Parse query parameters for pagination
    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '10');
    const offset = (page - 1) * limit;
    
    // Get total count de manière simple
    const countResult = await client.queryObject<{count: string}>(`
      SELECT COUNT(*) as count
      FROM games 
      WHERE (player1_id = $1 OR player2_id = $1) 
        AND status = 'finished'
        AND started_at > NOW() - INTERVAL '30 days'
    `, [userId]);
    
    const totalGames = parseInt(countResult.rows[0].count);
    console.log("📊 Total games:", totalGames);
    
    // Requête simplifiée pour les parties
    const gamesResult = await client.queryObject(`
      SELECT 
        g.id,
        g.started_at,
        g.ended_at,
        g.game_mode,
        g.status,
        g.score_player1,
        g.score_player2,
        g.winner_id,
        g.player1_id,
        g.player2_id,
        u1.username as player1_name,
        u2.username as player2_name
      FROM games g
      JOIN users u1 ON g.player1_id = u1.id
      JOIN users u2 ON g.player2_id = u2.id
      WHERE (g.player1_id = $1 OR g.player2_id = $1) 
        AND g.status = 'finished'
        AND g.started_at > NOW() - INTERVAL '1 month'
      ORDER BY g.started_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, Math.min(limit, 10), offset]);
    
    console.log("🎯 Found games:", gamesResult.rows.length);
    
    // Traitement des résultats côté JavaScript
    const games = gamesResult.rows.map(row => {
      const isPlayer1 = Number(row.player1_id) === userId;
      const opponent = isPlayer1 ? row.player2_name : row.player1_name;
      let playerScore = 0;
      let opponentScore = 0;

      // Additionner les scores des manches
      if (row.round1_score_player1 !== undefined) {
        if (isPlayer1) {
          playerScore = (Number(row.round1_score_player1) || 0) +
                      (Number(row.round2_score_player1) || 0) +
                      (Number(row.round3_score_player1) || 0);
          opponentScore = (Number(row.round1_score_player2) || 0) +
                        (Number(row.round2_score_player2) || 0) +
                        (Number(row.round3_score_player2) || 0);
        } else {
          playerScore = (Number(row.round1_score_player2) || 0) +
                      (Number(row.round2_score_player2) || 0) +
                      (Number(row.round3_score_player2) || 0);
          opponentScore = (Number(row.round1_score_player1) || 0) +
                        (Number(row.round2_score_player1) || 0) +
                        (Number(row.round3_score_player1) || 0);
        }
      } else {
        // Fallback sur les scores existants
        playerScore = isPlayer1 ? row.score_player1 : row.score_player2;
        opponentScore = isPlayer1 ? row.score_player2 : row.score_player1;
      }
      
      let result = 'defeat';
      if (Number(row.winner_id) === userId) result = 'victory';
      else if (row.winner_id === null) result = 'draw';
      
      // Calculate duration in minutes if both dates exist
      let duration = null;
      if (row.started_at && row.ended_at) {
        try {
          const startTime = new Date(row.started_at);
          const endTime = new Date(row.ended_at);
          
          if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime())) {
            const durationMs = endTime.getTime() - startTime.getTime();
            duration = Math.max(1, Math.round(durationMs / (1000 * 60))); // Au moins 1 minute
            console.log(`⏱️ Calculated duration for game ${row.id}: ${duration} minutes`);
          }
        } catch (error) {
          console.error(`❌ Error calculating duration:`, error);
        }
      }
      
      return {
        id: Number(row.id),
        date: row.started_at,
        mode: row.game_mode || 'classic',
        opponent: opponent,
        result: result,
        score: {
          player: Number(playerScore) || 0,
          opponent: Number(opponentScore) || 0
        },
        with_extension: false, // Pour l'instant, on met false par défaut
        duration: duration,
        status: row.status
      };
    });
    
    console.log("✅ Processed games:", games.length);
    
    // Préparer la réponse
    const responseData = {
      games,
      pagination: {
        page,
        limit,
        total: totalGames,
        totalPages: Math.ceil(totalGames / limit)
      }
    };
    
    //Conversion des BigInt en Number pour éviter les erreurs JSON
    ctx.response.body = JSON.parse(JSON.stringify(responseData, (key, value) =>
      typeof value === 'bigint' ? Number(value) : value
    ));
    
  } catch (err) {
    console.error("❌ Error fetching game history:", err);
    console.error("Stack trace:", err.stack);
    ctx.response.status = 500;
    ctx.response.body = { 
      error: "Internal server error",
      message: err.message
    };
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
profileRouter.get("/api/profile/:id", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.params.id;
    
    // Vérifier les permissions pour l'email
    const isAdmin = ctx.state.user?.role === 'admin';
    const isOwnProfile = ctx.state.user?.id == userId;
    const shouldShowEmail = isAdmin || isOwnProfile;
    
    // Adapter la requête selon les permissions
    const selectFields = shouldShowEmail 
      ? 'id, username, email, avatar_url, bio, created_at' 
      : 'id, username, avatar_url, bio, created_at';
    
    // First check if user exists
    const userResult = await client.queryObject(
      `SELECT ${selectFields} FROM users WHERE id = $1`,
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

//Mettre à jour le mot de passe
profileRouter.put("/api/profile/password", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    const { currentPassword, newPassword } = await ctx.request.body({ type: "json" }).value;
    
    // Vérifier que les champs requis sont présents
    if (!currentPassword || !newPassword) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Les champs 'currentPassword' et 'newPassword' sont requis" };
      return;
    }
    
    // Récupérer le mot de passe actuel de l'utilisateur
    const userResult = await client.queryObject(
      "SELECT password FROM users WHERE id = $1",
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { message: "Utilisateur non trouvé" };
      return;
    }
    
    // Vérifier si le mot de passe actuel est correct
    const isPasswordValid = await compare(currentPassword, userResult.rows[0].password);
    if (!isPasswordValid) {
      ctx.response.status = 401;
      ctx.response.body = { message: "Mot de passe actuel incorrect" };
      return;
    }
    
    // Hasher le nouveau mot de passe
    const hashedPassword = await hash(newPassword);
    
    // Mettre à jour le mot de passe dans la base de données
    await client.queryObject(
      "UPDATE users SET password = $1 WHERE id = $2",
      [hashedPassword, userId]
    );
    
    ctx.response.status = 200;
    ctx.response.body = { message: "Mot de passe mis à jour avec succès" };
  } catch (err) {
    console.error("Error updating password:", err);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur lors de la mise à jour du mot de passe" };
  }
});


// PUT /api/profile/username - Mettre à jour le nom d'utilisateur
profileRouter.put("/api/profile/username", authMiddleware, async (ctx) => {
  try {
    const userId = ctx.state.user.id;
    const { username } = await ctx.request.body({ type: "json" }).value;
    
    // Vérifier que le champ username est présent
    if (!username) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Le champ 'username' est requis" };
      return;
    }
    
    // Vérifier que le nom d'utilisateur respecte certaines contraintes (optionnel mais recommandé)
    if (username.length < 3 || username.length > 20) {
      ctx.response.status = 400;
      ctx.response.body = { message: "Le nom d'utilisateur doit contenir entre 3 et 20 caractères" };
      return;
    }
    
    // Vérifier si le nom d'utilisateur est déjà utilisé par un autre utilisateur
    const existingUser = await client.queryObject(
      "SELECT id FROM users WHERE username = $1 AND id != $2",
      [username, userId]
    );
    
    if (existingUser.rows.length > 0) {
      ctx.response.status = 409; // Conflict
      ctx.response.body = { message: "Ce nom d'utilisateur est déjà utilisé" };
      return;
    }
    
    // Mettre à jour le nom d'utilisateur
    await client.queryObject(
      "UPDATE users SET username = $1 WHERE id = $2",
      [username, userId]
    );

    // Créer un nouveau JWT avec le nom d'utilisateur mis à jour
    const payload = {
      id: userId,
      username: username,
      email: ctx.state.user.email,
      role: ctx.state.user.role,
      exp: Math.floor(Date.now() / 1000) + 60 * 60, // Expiration dans 1 heure
    };

    // Créer le JWT avec le même cryptoKey que dans auth_routes.ts
    const jwt = await createJWT(payload);

    // Remplacer le cookie existant par le nouveau
    ctx.cookies.set("authToken", jwt, {
      httpOnly: true,
      secure: false, // Ajustez selon votre environnement
      sameSite: "lax",
      maxAge: 60 * 60 * 1000, // 1 heure
      path: "/"
    });
    
    ctx.response.status = 200;
    ctx.response.body = { message: "Nom d'utilisateur mis à jour avec succès" };
  } catch (err) {
    console.error("Error updating username:", err);
    ctx.response.status = 500;
    ctx.response.body = { message: "Erreur lors de la mise à jour du nom d'utilisateur" };
  }
});


export default profileRouter;
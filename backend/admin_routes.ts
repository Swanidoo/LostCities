import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { requireAdmin } from "./middlewares/require_admin_middleware.ts";
import { client } from "./db_client.ts";

const adminRouter = new Router();

// Route pour récupérer tous les utilisateurs avec pagination
adminRouter.get("/api/admin/users", requireAdmin, async (ctx) => {
  try {
    // Utiliser la même méthode partout
    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // D'abord, mettre à jour les bans expirés dans la base
    await client.queryObject(`
      UPDATE users 
      SET is_banned = false 
      WHERE is_banned = true 
        AND banned_until IS NOT NULL 
        AND banned_until <= NOW()
    `);
    
    // Compter le total des utilisateurs
    const countResult = await client.queryObject<{total: number}>(`
      SELECT COUNT(*) as total FROM users
    `);
    
    const totalUsers = Number(countResult.rows[0].total); // Convertir explicitement en nombre
    
    // Récupérer les utilisateurs avec pagination - avec vérification dynamique des bans
    const users = await client.queryObject(`
      SELECT 
        id, 
        username, 
        email, 
        role, 
        -- Vérifier si le ban est toujours actif
        CASE 
          WHEN is_banned = true AND banned_until IS NOT NULL AND banned_until <= NOW() 
          THEN false 
          ELSE is_banned 
        END as is_banned,
        -- Vérifier si l'utilisateur est muté
        EXISTS (
          SELECT 1 FROM user_mutes 
          WHERE user_id = users.id 
          AND (muted_until IS NULL OR muted_until > NOW())
        ) as is_muted,
        COALESCE(created_at, NOW()) as created_at,
        banned_until,
        ban_reason,
        last_login
      FROM users
      ORDER BY id DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    ctx.response.body = {
      users: users.rows,
      pagination: {
        page,
        limit,
        total: totalUsers,
        totalPages: Math.ceil(totalUsers / limit)
      }
    };
  } catch (err) {
    console.error("Error fetching users:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", details: err.message };
  }
});

// Route pour supprimer un utilisateur
adminRouter.delete("/api/admin/users/:id", requireAdmin, async (ctx) => {
  try {
    const id = ctx.params.id;
    await client.queryObject("DELETE FROM users WHERE id = $1", [id]);
    ctx.response.status = 200;
    ctx.response.body = { message: "User deleted successfully" };
  } catch (err) {
    console.error("Error deleting user:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Muter un utilisateur
adminRouter.post("/api/admin/users/:id/mute", requireAdmin, async (ctx) => {
  const userId = ctx.params.id;
  const { duration, reason } = await ctx.request.body({ type: "json" }).value;
  const adminId = ctx.state.user.id;
  
  // Calculer muted_until
  const mutedUntil = duration ? new Date(Date.now() + duration * 1000) : null;
  
  await client.queryObject(
    `INSERT INTO user_mutes (user_id, muted_until, mute_reason, muted_by)
     VALUES ($1, $2, $3, $4)`,
    [userId, mutedUntil, reason, adminId]
  );
  
  // Logger l'action
  await client.queryObject(
    `INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason)
     VALUES ($1, 'mute', $2, $3)`,
    [adminId, userId, reason]
  );
  
  ctx.response.body = { message: "User muted successfully" };
});

// Dé-muter un utilisateur
adminRouter.post("/api/admin/users/:id/unmute", requireAdmin, async (ctx) => {
  const userId = ctx.params.id;
  const adminId = ctx.state.user.id;
  
  // Mettre à jour tous les mutes actifs de cet utilisateur pour les terminer
  await client.queryObject(
    `UPDATE user_mutes 
     SET muted_until = CURRENT_TIMESTAMP 
     WHERE user_id = $1 
     AND (muted_until IS NULL OR muted_until > NOW())`,
    [userId]
  );
  
  // Logger l'action
  await client.queryObject(
    `INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason)
     VALUES ($1, 'unmute', $2, 'Utilisateur dé-muté')`,
    [adminId, userId]
  );
  
  ctx.response.body = { message: "User unmuted successfully" };
});

// Bannir un utilisateur
adminRouter.post("/api/admin/users/:id/ban", requireAdmin, async (ctx) => {
  const userId = ctx.params.id;
  const { duration, reason } = await ctx.request.body({ type: "json" }).value;
  const adminId = ctx.state.user.id;
  
  const bannedUntil = duration ? new Date(Date.now() + duration * 1000) : null;
  
  // Mettre à jour le statut de ban
  await client.queryObject(
    `UPDATE users 
     SET is_banned = true, 
         banned_at = CURRENT_TIMESTAMP, 
         banned_until = $1,
         ban_reason = $2
     WHERE id = $3`,
    [bannedUntil, reason, userId]
  );
  
  // Gérer le mute automatique
  // D'abord, vérifier s'il y a un mute existant
  const existingMuteResult = await client.queryObject<{ muted_until: Date | null }>(
    `SELECT muted_until 
     FROM user_mutes 
     WHERE user_id = $1 
     AND (muted_until IS NULL OR muted_until > NOW())
     ORDER BY muted_until DESC NULLS FIRST
     LIMIT 1`,
    [userId]
  );
  
  let shouldCreateMute = true;
  
  if (existingMuteResult.rows.length > 0) {
    const existingMuteUntil = existingMuteResult.rows[0].muted_until;
    
    // Si il y a un mute permanent (NULL) ou qui expire après le ban, on ne fait rien
    if (existingMuteUntil === null || 
        (bannedUntil && existingMuteUntil && existingMuteUntil > bannedUntil)) {
      shouldCreateMute = false;
      console.log(`User ${userId} already muted until ${existingMuteUntil || 'permanently'}, keeping existing mute`);
    }
  }
  
  // Créer un nouveau mute si nécessaire
  if (shouldCreateMute) {
    await client.queryObject(
      `INSERT INTO user_mutes (user_id, muted_until, mute_reason, muted_by)
       VALUES ($1, $2, $3, $4)`,
      [userId, bannedUntil, `Mute automatique suite au ban: ${reason}`, adminId]
    );
    
    console.log(`Created automatic mute for user ${userId} until ${bannedUntil}`);
  }
  
  // Logger l'action de ban
  await client.queryObject(
    `INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason)
     VALUES ($1, 'ban', $2, $3)`,
    [adminId, userId, reason]
  );
  
  // Logger l'action de mute si créée
  if (shouldCreateMute) {
    await client.queryObject(
      `INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason)
       VALUES ($1, 'mute', $2, $3)`,
      [adminId, userId, `Mute automatique suite au ban: ${reason}`]
    );
  }
  
  ctx.response.body = { 
    message: "User banned successfully",
    muteCreated: shouldCreateMute
  };
});


// Débannir un utilisateur
adminRouter.post("/api/admin/users/:id/unban", requireAdmin, async (ctx) => {
  const userId = ctx.params.id;
  const adminId = ctx.state.user.id;
  
  // SEULEMENT lever le ban, ne pas toucher aux mutes
  await client.queryObject(
    `UPDATE users 
     SET is_banned = false, 
         banned_at = NULL, 
         banned_until = NULL,
         ban_reason = NULL
     WHERE id = $1`,
    [userId]
  );
  
  // Logger l'action
  await client.queryObject(
    `INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason)
     VALUES ($1, 'unban', $2, 'Utilisateur débanni')`,
    [adminId, userId]
  );
  
  ctx.response.body = { message: "User unbanned successfully" };
});


// Dashboard stats
adminRouter.get("/api/admin/dashboard", requireAdmin, async (ctx) => {
  try {
    const stats = await client.queryObject(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours') as new_users_24h,
        (SELECT COUNT(*) FROM games WHERE status = 'in_progress') as active_games,
        (SELECT COUNT(*) FROM users WHERE is_banned = true) as banned_users,
        (SELECT COUNT(*) FROM reports WHERE status = 'pending') as pending_reports
    `);
    
    // Convert BigInt to numbers
    const result = stats.rows[0];
    const response = {
      total_users: Number(result.total_users || 0),
      new_users_24h: Number(result.new_users_24h || 0),
      active_games: Number(result.active_games || 0),
      banned_users: Number(result.banned_users || 0),
      pending_reports: Number(result.pending_reports || 0)
    };
    
    ctx.response.body = response;
  } catch (err) {
    console.error("Error fetching dashboard stats:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", details: err.message };
  }
});

// Route pour obtenir les utilisateurs détaillés
adminRouter.get("/api/admin/users/detailed", requireAdmin, async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // Récupérer des informations détaillées sur les utilisateurs
    const users = await client.queryObject(`
      SELECT 
        u.id,
        u.username,
        u.email,
        u.role,
        u.is_banned,
        u.is_muted,
        u.created_at,
        u.last_login,
        u.banned_until,
        u.ban_reason,
        -- Ajouter les infos de mute
        (SELECT muted_until FROM user_mutes 
         WHERE user_id = u.id 
         AND (muted_until IS NULL OR muted_until > NOW())
         ORDER BY muted_at DESC LIMIT 1) as muted_until,
        (SELECT mute_reason FROM user_mutes 
         WHERE user_id = u.id 
         AND (muted_until IS NULL OR muted_until > NOW())
         ORDER BY muted_at DESC LIMIT 1) as mute_reason,
        (SELECT COUNT(*) FROM games WHERE player1_id = u.id OR player2_id = u.id) as games_played,
        (SELECT COUNT(*) FROM chat_message WHERE sender_id = u.id) as messages_sent,
        (SELECT COUNT(*) FROM reports WHERE reported_user_id = u.id) as reports_received
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    // Compter le total pour la pagination
    const countResult = await client.queryObject<{total: number}>(`
      SELECT COUNT(*) as total FROM users
    `);
    
    ctx.response.body = {
      users: users.rows,
      pagination: {
        page,
        limit,
        total: Number(countResult.rows[0].total),
        totalPages: Math.ceil(Number(countResult.rows[0].total) / limit)
      }
    };
  } catch (err) {
    console.error("Error fetching detailed users:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", details: err.message };
  }
});

// Route pour obtenir les messages de chat à modérer
adminRouter.get("/api/admin/chat-messages", requireAdmin, async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = (page - 1) * limit;
    
    // Vérifier d'abord si la table existe et compter
    const countResult = await client.queryObject<{total: number}>(`
      SELECT COUNT(*) as total
      FROM chat_message cm
      WHERE cm.timestamp > NOW() - INTERVAL '1 hour'
      AND COALESCE(cm.is_deleted, false) = false
    `);
    
    const totalMessages = Number(countResult.rows[0].total);
    
    // Récupérer les messages avec pagination
    const messages = await client.queryObject(`
      SELECT 
        cm.id,
        cm.message,
        cm.timestamp,
        u.username as sender_username,
        u.id as sender_id,
        0 as report_count  -- Temporairement si la table reports n'existe pas
      FROM chat_message cm
      JOIN users u ON cm.sender_id = u.id
      WHERE cm.timestamp > NOW() - INTERVAL '1 hour'
      AND COALESCE(cm.is_deleted, false) = false
      ORDER BY cm.timestamp DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    ctx.response.body = {
      messages: messages.rows,
      pagination: {
        page,
        limit,
        total: totalMessages,
        totalPages: Math.ceil(totalMessages / limit)
      }
    };
  } catch (err) {
    console.error("Error fetching chat messages:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error", details: err.message };
  }
});

// Route pour supprimer un message de chat
adminRouter.delete("/api/admin/chat-messages/:id", requireAdmin, async (ctx) => {
  const messageId = ctx.params.id;
  const adminId = ctx.state.user.id;
  
  await client.queryObject(
    `UPDATE chat_message 
     SET is_deleted = true, deleted_at = NOW(), deleted_by = $1
     WHERE id = $2`,
    [adminId, messageId]
  );
  
  // Logger l'action
  await client.queryObject(
    `INSERT INTO admin_actions (admin_id, action_type, target_message_id, reason)
     VALUES ($1, 'delete_message', $2, 'Message supprimé par admin')`,
    [adminId, messageId]
  );
  
  ctx.response.body = { message: "Message deleted successfully" };
});

// Route pour obtenir les rapports
adminRouter.get("/api/admin/reports", requireAdmin, async (ctx) => {
  try {
    const url = new URL(ctx.request.url);
    const status = url.searchParams.get('status') || 'pending';
    
    const reports = await client.queryObject(`
      SELECT 
        r.*,
        reporter.username as reporter_username,
        reporter.email as reporter_email,
        reported.username as reported_username,
        reported.email as reported_email,
        cm.message as reported_message
      FROM reports r
      JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users reported ON r.reported_user_id = reported.id
      LEFT JOIN chat_message cm ON r.reported_message_id = cm.id
      WHERE r.status = $1
      ORDER BY r.created_at DESC
    `, [status]);
    
    ctx.response.body = reports.rows;
  } catch (err) {
    console.error("Error fetching reports:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: err.message };
  }
});

// Route pour résoudre un rapport
adminRouter.put("/api/admin/reports/:id/resolve", requireAdmin, async (ctx) => {
  const reportId = ctx.params.id;
  const { resolution, notes } = await ctx.request.body({ type: "json" }).value;
  const adminId = ctx.state.user.id;
  
  await client.queryObject(
    `UPDATE reports 
     SET status = $1, resolution_notes = $2, resolved_by = $3, resolved_at = NOW()
     WHERE id = $4`,
    [resolution, notes, adminId, reportId]
  );
  
  ctx.response.body = { message: "Report resolved successfully" };
});


export default adminRouter;
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { authMiddleware } from "./middlewares/auth_middleware.ts";
import { client } from "./db_client.ts";

const profileRouter = new Router();

// GET /api/profile/:id - Récupérer un profil public
profileRouter.get("/api/profile/:id", async (ctx) => {
  try {
    const userId = ctx.params.id;
    const result = await client.queryObject(
      `SELECT id, username, avatar_url, bio, created_at,
       (SELECT COUNT(*) FROM games WHERE player1_id = $1 OR player2_id = $1) as games_played,
       (SELECT COUNT(*) FROM games WHERE (player1_id = $1 OR player2_id = $1) AND winner_id = $1) as games_won
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "User not found" };
      return;
    }
    
    ctx.response.body = result.rows[0];
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
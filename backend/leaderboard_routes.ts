import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";

const leaderboardRouter = new Router();

// GET /api/leaderboard - Récupérer le leaderboard (avec filtres optionnels)
leaderboardRouter.get("/api/leaderboard", async (ctx) => {
  const { month, year, page, limit, game_mode, with_extension } = ctx.request.url.searchParams;

  let query = "SELECT * FROM leaderboard";
  const params: (string | number | boolean)[] = [];
  let paramIndex = 1;
  let whereClauseAdded = false;

  // Ajout des filtres
  if (month && year) {
    query += " WHERE EXTRACT(MONTH FROM date) = $1 AND EXTRACT(YEAR FROM date) = $2";
    params.push(Number(month), Number(year));
    paramIndex += 2;
    whereClauseAdded = true;
  }

  if (game_mode) {
    query += whereClauseAdded ? " AND" : " WHERE";
    query += ` game_mode = $${paramIndex}`;
    params.push(game_mode);
    paramIndex++;
    whereClauseAdded = true;
  }

  if (with_extension !== undefined) {
    query += whereClauseAdded ? " AND" : " WHERE";
    query += ` with_extension = $${paramIndex}`;
    params.push(with_extension === 'true');
    paramIndex++;
  }

  // Pagination
  const pageNumber = Number(page) || 1;
  const pageSize = Number(limit) || 10;
  const offset = (pageNumber - 1) * pageSize;

  query += " ORDER BY score DESC LIMIT $" + paramIndex + " OFFSET $" + (paramIndex + 1);
  params.push(pageSize, offset);

  const leaderboard = await client.queryObject(query, params);
  ctx.response.body = {
    data: leaderboard.rows,
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total: leaderboard.rows.length,
    },
  };
});

// POST /api/leaderboard - Ajouter une entrée au leaderboard
leaderboardRouter.post("/api/leaderboard", async (ctx) => {
  const { player, score, date } = await ctx.request.body({ type: "json" }).value;

  await client.queryObject(
    "INSERT INTO leaderboard (player, score, date) VALUES ($1, $2, $3)",
    [player, score, date]
  );

  ctx.response.status = 201;
  ctx.response.body = { message: "Leaderboard entry created successfully" };
});

// PUT /api/leaderboard/:id - Mettre à jour une entrée du leaderboard
leaderboardRouter.put("/api/leaderboard/:id", async (ctx) => {
  const id = ctx.params.id;
  const { player, score, date } = await ctx.request.body({ type: "json" }).value;

  await client.queryObject(
    "UPDATE leaderboard SET player = $1, score = $2, date = $3 WHERE id = $4",
    [player, score, date, id]
  );

  ctx.response.status = 200;
  ctx.response.body = { message: "Leaderboard entry updated successfully" };
});

// DELETE /api/leaderboard/:id - Supprimer une entrée du leaderboard
leaderboardRouter.delete("/api/leaderboard/:id", async (ctx) => {
  const id = ctx.params.id;

  await client.queryObject("DELETE FROM leaderboard WHERE id = $1", [id]);

  ctx.response.status = 200;
  ctx.response.body = { message: "Leaderboard entry deleted successfully" };
});

export default leaderboardRouter;
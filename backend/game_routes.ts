import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";

const gameRouter = new Router();

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

export default gameRouter;
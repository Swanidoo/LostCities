import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";

const settingsRouter = new Router();

// GET /api/settings - Récupérer tous les paramètres
settingsRouter.get("/api/settings", async (ctx) => {
  const settings = await client.queryObject("SELECT * FROM settings");
  ctx.response.body = settings.rows;
});

// POST /api/settings - Créer un nouveau paramètre
settingsRouter.post("/api/settings", async (ctx) => {
  const { name, value } = await ctx.request.body({ type: "json" }).value;

  await client.queryObject(
    "INSERT INTO settings (name, value) VALUES ($1, $2)",
    [name, value]
  );

  ctx.response.status = 201;
  ctx.response.body = { message: "Setting created successfully" };
});

// PUT /api/settings/:id - Mettre à jour un paramètre
settingsRouter.put("/api/settings/:id", async (ctx) => {
  const id = ctx.params.id;
  const { name, value } = await ctx.request.body({ type: "json" }).value;

  await client.queryObject(
    "UPDATE settings SET name = $1, value = $2 WHERE id = $3",
    [name, value, id]
  );

  ctx.response.status = 200;
  ctx.response.body = { message: "Setting updated successfully" };
});

// DELETE /api/settings/:id - Supprimer un paramètre
settingsRouter.delete("/api/settings/:id", async (ctx) => {
  const id = ctx.params.id;

  await client.queryObject("DELETE FROM settings WHERE id = $1", [id]);

  ctx.response.status = 200;
  ctx.response.body = { message: "Setting deleted successfully" };
});

export default settingsRouter;
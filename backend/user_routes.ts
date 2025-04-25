import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { client } from "./db_client.ts";

const userRouter = new Router();

// GET /api/users/:id - Récupérer un utilisateur par ID
userRouter.get("/api/users/:id", async (ctx) => {
  const id = ctx.params.id;
  const user = await client.queryObject("SELECT * FROM users WHERE id = $1", [id]);
  if (!user.rows.length) {
    ctx.response.status = 404;
    ctx.response.body = { error: "User not found" };
    return;
  }
  ctx.response.body = user.rows[0];
});

// PUT /api/users/:id - Mettre à jour un utilisateur
userRouter.put("/api/users/:id", async (ctx) => {
  const id = ctx.params.id;
  const { username, email } = await ctx.request.body({ type: "json" }).value;

  await client.queryObject(
    "UPDATE users SET username = $1, email = $2 WHERE id = $3",
    [username, email, id]
  );

  ctx.response.status = 200;
  ctx.response.body = { message: "User updated successfully" };
});

// DELETE /api/users/:id - Supprimer un utilisateur
userRouter.delete("/api/users/:id", async (ctx) => {
  const id = ctx.params.id;

  await client.queryObject("DELETE FROM users WHERE id = $1", [id]);

  ctx.response.status = 200;
  ctx.response.body = { message: "User deleted successfully" };
});

export default userRouter;
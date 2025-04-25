import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { requireAdmin } from "./middlewares/require_admin_middleware.ts";
import { client } from "./db_client.ts";

const adminRouter = new Router();

// Route pour récupérer tous les utilisateurs
adminRouter.get("/api/admin/users", requireAdmin, async (ctx) => {
  try {
    const users = await client.queryObject("SELECT id, username, email, role FROM users");
    ctx.response.body = users.rows;
  } catch (err) {
    console.error("Error fetching users:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
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

export default adminRouter;
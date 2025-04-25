export const requireAdmin = async (ctx, next) => {
  // Vérifie si l'utilisateur est authentifié et possède un rôle admin
  if (!ctx.state.user || ctx.state.user.role !== "admin") {
    ctx.response.status = 403; // Forbidden
    ctx.response.body = { error: "Forbidden: Admin access required" };
    return;
  }

  // Passe au middleware suivant si l'utilisateur est admin
  await next();
};
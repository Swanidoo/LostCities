export const checkUserStatus = async (ctx, next) => {
    if (ctx.state.user) {
      const userResult = await client.queryObject(
        `SELECT is_banned, banned_until FROM users WHERE id = $1`,
        [ctx.state.user.id]
      );
      
      if (userResult.rows.length > 0) {
        const user = userResult.rows[0];
        
        // Vérifier si l'utilisateur est banni
        if (user.is_banned) {
          if (!user.banned_until || new Date(user.banned_until) > new Date()) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Your account has been banned" };
            return;
          } else {
            // Le ban a expiré, le lever
            await client.queryObject(
              `UPDATE users SET is_banned = false WHERE id = $1`,
              [ctx.state.user.id]
            );
          }
        }
      }
    }
    
    await next();
  };
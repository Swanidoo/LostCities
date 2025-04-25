const isProduction = Deno.env.get("ENV") === "production";

export const errorMiddleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Global Error Middleware:", err);

    ctx.response.status = err.status || 500;

    // Sanitize error messages in production
    if (isProduction) {
      ctx.response.body = { error: "Internal server error" };
    } else {
      ctx.response.body = { error: err.message || "Internal server error" };
    }
  }
};
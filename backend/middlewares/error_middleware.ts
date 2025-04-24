export const errorMiddleware = async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("Global Error Middleware:", err);
    ctx.response.status = err.status || 500;
    ctx.response.body = { error: err.message || "Internal Server Error" };
  }
};
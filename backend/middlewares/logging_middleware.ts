export const loggingMiddleware = async (ctx, next) => {
  console.log(`${ctx.request.method} ${ctx.request.url}`);
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ms}ms`);
};
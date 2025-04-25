export const securityHeadersMiddleware = async (ctx, next) => {
  ctx.response.headers.set("X-Content-Type-Options", "nosniff");
  ctx.response.headers.set("X-Frame-Options", "DENY");
  ctx.response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  await next();
};
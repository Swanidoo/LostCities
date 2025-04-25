const requestCounts = new Map<string, { count: number; lastRequest: number }>();
const TIME_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100; // Max requests per IP per time window

export const rateLimitingMiddleware = async (ctx, next) => {
  const clientIP = ctx.request.ip || ctx.request.headers.get("x-forwarded-for") || "unknown";

  const now = Date.now();
  const clientData = requestCounts.get(clientIP) || { count: 0, lastRequest: now };

  if (now - clientData.lastRequest > TIME_WINDOW) {
    // Reset the count if the time window has passed
    clientData.count = 0;
    clientData.lastRequest = now;
  }

  clientData.count += 1;

  if (clientData.count > MAX_REQUESTS) {
    ctx.response.status = 429; // Too Many Requests
    ctx.response.body = { error: "Too many requests. Please try again later." };
    return;
  }

  requestCounts.set(clientIP, clientData);
  await next();
};
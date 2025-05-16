import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const welcomeRouter = new Router();

welcomeRouter.get("/", (ctx) => {
  ctx.response.headers.set("Content-Type", "application/json");
  ctx.response.status = 200;
  ctx.response.body = {
    message: "Welcome to the LostCities' API!",
    status: "API is running",
    routes: {
      websocket: "/ws",
      register: "/register",
      login: "/login",
      profile: "/profile (requires authentication)",
      games: "/games",
    },
  };
});



export default welcomeRouter;
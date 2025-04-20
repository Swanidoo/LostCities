import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const ROOT = `${Deno.cwd()}/`;

const API_URL = Deno.env.get("API_URL") || "https://lostcitiesbackend.onrender.com";
fetch(`${API_URL}/api/endpoint`, { method: "GET" });

app.use(async (ctx) => {
  try {
    await ctx.send({
      root: ROOT,
      index: "index.html",
    });
  } catch {
    ctx.response.status = 404;
    ctx.response.body = "404 File not found";
  }
});

if (Deno.args.length < 1) {
  console.log(`Usage: $ deno run --allow-net --allow-read=./ server.ts PORT [CERT_PATH KEY_PATH]`);
  Deno.exit();
}

const options = {port: Deno.args[0]}

if (Deno.args.length >= 3) {
  options.secure = true
  options.cert = await Deno.readTextFile(Deno.args[1])
  options.key = await Deno.readTextFile(Deno.args[2])
  console.log(`SSL conf ready (use https)`);
}

console.log(`Oak static server running on port ${options.port} for the files in ${ROOT}`);
await app.listen(options);



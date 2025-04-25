import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";

const app = new Application();
const ROOT = `${Deno.cwd()}`; // Use the current directory as the root

app.use(async (ctx) => {
  try {
    const path = ctx.request.url.pathname;

    if (path === "/") {
      // Serve the login page by default
      await ctx.send({ root: `${ROOT}/login`, index: "login.html" });
    } else if (path.startsWith("/login")) {
      // Serve files from the login directory
      await ctx.send({ root: `${ROOT}/login` });
    } else if (path.startsWith("/chat")) {
      // Serve files from the chat directory
      await ctx.send({ root: `${ROOT}/chat`, index: "chat.html" });
    } else if (path.startsWith("/admin")) {
      // Serve files from the admin directory
      await ctx.send({ root: `${ROOT}/admin`, index: "admin.html" });
    } else if (path.startsWith("/shared")) {
      // Serve shared resources
      await ctx.send({ root: `${ROOT}/shared` });
    } else {
      // Serve other files
      await ctx.send({ root: ROOT });
    }
  } catch {
    ctx.response.status = 404;
    ctx.response.body = "404 File not found";
  }
});

if (Deno.args.length < 1) {
  console.log(`Usage: $ deno run --allow-net --allow-read=./ front_server.ts PORT [CERT_PATH KEY_PATH]`);
  Deno.exit();
}

const options = { port: Deno.args[0] };

if (Deno.args.length >= 3) {
  options.secure = true;
  options.cert = await Deno.readTextFile(Deno.args[1]);
  options.key = await Deno.readTextFile(Deno.args[2]);
  console.log(`SSL conf ready (use https)`);
}

console.log(`Oak static server running on port ${options.port} for the files in ${ROOT}`);
await app.listen(options);



import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
console.log("DATABASE_URL:", DATABASE_URL);

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in the environment variables.");
  Deno.exit(1);
}


export const client = new Client(DATABASE_URL);
await client.connect();
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";
import "https://deno.land/x/dotenv@v3.2.2/load.ts";

const DATABASE_URL = Deno.env.get("DATABASE_URL");
console.log("DATABASE_URL:", DATABASE_URL);

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set in the environment variables.");
  Deno.exit(1);
}

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000; // 5 seconds

async function connectWithRetry(attempt = 1): Promise<Client> {
  try {
    console.log(`Attempting to connect to the database (Attempt ${attempt}/${MAX_RETRIES})...`);
    const client = new Client({
        connectionString: DATABASE_URL,
        tls: {
          enforce: true, // Enforce TLS
        },
      });
    await client.connect();
    console.log("Connected to the database successfully!");
    return client;
  } catch (err) {
    console.error(`Database connection failed: ${err.message}`);
    if (attempt >= MAX_RETRIES) {
      console.error("Max retries reached. Exiting...");
      Deno.exit(1);
    }
    console.log(`Retrying in ${RETRY_DELAY_MS / 1000} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return connectWithRetry(attempt + 1);
  }
}

export const client = await connectWithRetry();
// jwt_utils.ts
import { create, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const jwtKey = Deno.env.get("JWT_SECRET");
if (!jwtKey) {
  console.error("JWT_SECRET is not set in the environment variables.");
  Deno.exit(1);
}

const encoder = new TextEncoder();
const keyData = encoder.encode(jwtKey);

// Exporter la clé crypto
export const cryptoKey = await crypto.subtle.importKey(
  "raw",
  keyData,
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

// Fonction utilitaire pour créer un JWT
export async function createJWT(payload) {
  return await create(
    { alg: "HS256", typ: "JWT" },
    payload,
    cryptoKey
  );
}

// Fonction utilitaire pour vérifier un JWT
export async function verifyJWT(token) {
  return await verify(token, cryptoKey);
}
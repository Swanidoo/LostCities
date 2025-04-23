import { assertEquals } from "https://deno.land/std@0.200.0/testing/asserts.ts";

// Dynamically determine the API URL
const API_URL = Deno.env.get("API_URL") || "http://localhost:3000"; // Default to localhost if API_URL is not set

console.log("Using API_URL:", API_URL);

Deno.test("Example test", () => {
  const result = 1 + 1;
  assertEquals(result, 2);
});

Deno.test("API root route", async () => {
  const response = await fetch(`${API_URL}/`);
  const data = await response.json();
  assertEquals(data.message, "Bienvenue sur l'API LostCities !");
});

Deno.test("Register route", async () => {
  const response = await fetch(`${API_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "testuser",
      email: "test@example.com",
      password: "password123",
    }),
  });

  console.log("Response status:", response.status);
  console.log("Response headers:", response.headers);

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON, got content-type: ${contentType}`);
  }

  const data = await response.json();
  assertEquals(response.status, 201);
  assertEquals(data.message, "Utilisateur créé !");
});
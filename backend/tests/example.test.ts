import { assertEquals } from "https://deno.land/std@0.200.0/testing/asserts.ts";

Deno.test("Example test", () => {
  const result = 1 + 1;
  assertEquals(result, 2);
});

Deno.test("API root route", async () => {
  const response = await fetch("http://localhost:3000/");
  const data = await response.json();
  assertEquals(data.message, "Bienvenue sur l'API LostCities !");
});
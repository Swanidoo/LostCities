import { assertEquals } from "https://deno.land/std@0.200.0/testing/asserts.ts";

// Dynamically determine the API URL
const API_URL = Deno.env.get("API_URL") || "http://localhost:3000"; // Default to localhost if API_URL is not set

console.log("Using API_URL:", API_URL);

// Test the root route
Deno.test("API root route", async () => {
  const response = await fetch(`${API_URL}/`);
  const data = await response.json();
  assertEquals(response.status, 200);
  assertEquals(data.message, "Welcome to the LostCities' API!");
});

// Test the register route
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

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON, got content-type: ${contentType}`);
  }

  const data = await response.json();
  assertEquals(response.status, 201);
  assertEquals(data.message, "User registered successfully");
});

// Test the login route
Deno.test("Login route", async () => {
  const response = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
    }),
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON, got content-type: ${contentType}`);
  }

  const data = await response.json();
  assertEquals(response.status, 200);
  assertEquals(data.message, "Login successful");
  assertEquals(typeof data.token, "string"); // Ensure a token is returned
});

// Test the profile route with a valid token
Deno.test("Profile route - valid token", async () => {
  // First, log in to get a token
  const loginResponse = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
    }),
  });

  const loginData = await loginResponse.json();
  const token = loginData.token;

  // Use the token to access the profile route
  const response = await fetch(`${API_URL}/profile`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();
  assertEquals(response.status, 200);
  assertEquals(data.message, "Welcome to your profile!");
  assertEquals(data.user.email, "test@example.com");
});

// Test the profile route without a token
Deno.test("Profile route - no token", async () => {
  const response = await fetch(`${API_URL}/profile`, {
    method: "GET",
  });

  const data = await response.json();
  assertEquals(response.status, 401);
  assertEquals(data.error, "Non autorisé !");
});

// Test WebSocket connection with a valid token
Deno.test("WebSocket route - valid token", async () => {
  // First, log in to get a token
  const loginResponse = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "test@example.com",
      password: "password123",
    }),
  });

  const loginData = await loginResponse.json();
  const token = loginData.token;

  // Connect to WebSocket
  const ws = new WebSocket(`${API_URL.replace("http", "ws")}/ws?token=${token}`);

  await new Promise((resolve, reject) => {
    ws.onopen = () => {
      console.log("WebSocket connection established");
      ws.close();
      resolve(true);
    };

    ws.onerror = (err) => {
      reject(err);
    };
  });
});

// Test WebSocket connection without a token
Deno.test("WebSocket route - no token", async () => {
  const ws = new WebSocket(`${API_URL.replace("http", "ws")}/ws`);

  await new Promise((resolve, reject) => {
    ws.onerror = (err) => {
      console.log("WebSocket connection failed as expected");
      resolve(true);
    };

    ws.onopen = () => {
      reject(new Error("WebSocket connection should not be established without a token"));
    };
  });
});
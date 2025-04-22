const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

console.log("Using API_URL:", API_URL);

document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const email = document.getElementById('username').value; // Use "email" instead of "username"
    const password = document.getElementById('password').value;

    fetch(`${API_URL}/login`, { // Use API_URL here
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password }), // Send "email" in the payload
        credentials: 'include',
    })
    .then(response => response.json())
    .then(data => {
        console.log(data);
        if (data.message === "Login successful") {
            alert("Login successful!");
            window.location.href = 'chat.html'; // Redirect to the chat page
        } else {
            alert(data.error || "Invalid credentials");
        }
    })
    .catch(error => console.error('Error:', error));
});
document.getElementById('loginForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    fetch('http://127.0.0.1:3000/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
    })
    .then(response => response.json())
    .then(data => {
        console.log(data);
        if (data.message === "Login successful") {
            alert("Login successful!");
            window.location.href = 'chat.html'; // Redirection vers la page de chat
        } else {
            alert("Invalid credentials");
        }
    })
    .catch(error => console.error('Error:', error));
});
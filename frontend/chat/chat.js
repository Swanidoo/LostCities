// Retrieve the JWT token from localStorage (or wherever it's stored)
const token = localStorage.getItem("authToken");

if (!token) {
    console.error("❌ No JWT token found! Please log in first.");
} else {
    // Create a WebSocket connection to the server with the token in the query string
    const ws = new WebSocket(`wss://lostcitiesbackend.onrender.com/ws?token=${token}`);

    // WebSocket open event
    ws.addEventListener('open', () => {
        console.log("✅ WebSocket ouvert !");
        // Send a message to confirm the connection
        ws.send(JSON.stringify({ text: "Connexion réussie !" }));
    });

    // WebSocket message event
    ws.addEventListener('message', (event) => {
        console.log('📩 Message reçu du serveur:', event.data);

        try {
            const receivedData = JSON.parse(event.data);

            // Handle chat messages from other users
            if (receivedData.event === "chatMessage" && receivedData.data.message) {
                displayMessage(receivedData.data.message, "other");
            }

            // Handle acknowledgment for the sender
            if (receivedData.event === "messageSent") {
                console.log("✅ Message sent successfully:", receivedData.data.message);
            }
        } catch (error) {
            console.error("❌ Erreur de parsing JSON :", error);
        }
    });

    // WebSocket error event
    ws.addEventListener('error', (error) => {
        console.error("❌ WebSocket error:", error);
    });

    // WebSocket close event
    ws.addEventListener('close', (event) => {
        if (event.wasClean) {
            console.log(`✅ WebSocket fermé proprement, code: ${event.code}, raison: ${event.reason}`);
        } else {
            console.error("❌ WebSocket fermé de manière anormale", event);
        }
    });

    // Handle sending a message via the chat form
    document.getElementById('chatForm').addEventListener('submit', function(event) {
        event.preventDefault();

        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (message) {
            // Send the message to the server via WebSocket
            ws.send(JSON.stringify({ text: message })); 
            displayMessage(message, "self"); // Display the message immediately for the sender
            messageInput.value = ''; // Clear the input after sending
        }
    });

    // Function to display messages in the chat
    function displayMessage(message, sender) {
        const messageContainer = document.getElementById('messages');
        
        if (!messageContainer) {
            console.error("❌ L'élément #messages n'existe pas dans le DOM !");
            return;
        }

        // Create a new div element for each message
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.classList.add('message', sender); // Add CSS classes to differentiate messages

        messageContainer.appendChild(messageElement);
        messageContainer.scrollTop = messageContainer.scrollHeight; // Auto-scroll to the bottom
    }

    // Function to send a message
    function sendMessage() {
        const input = document.getElementById("messageInput");
        if (input.value.trim() !== "") {
            const message = { text: input.value };
            ws.send(JSON.stringify(message)); // Use WebSocket to send the message

            displayMessage(input.value, "self"); // Display the message immediately for the sender
            input.value = ""; // Clear the input after sending
        }
    }

    // Initialize chat elements on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        const chatForm = document.getElementById('chatForm');
        const messageInput = document.getElementById('messageInput');

        // Ensure the form and input exist
        if (!chatForm || !messageInput) {
            console.error("❌ L'élément #chatForm ou #messageInput n'existe pas dans le DOM !");
        }
    });
}
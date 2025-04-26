// Retrieve the JWT token from localStorage
const token = localStorage.getItem("authToken");

if (!token) {
    console.error("❌ No JWT token found! Please log in first.");
} else {
    // Create a WebSocket connection with the token
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = 'lostcitiesbackend.onrender.com';
    const ws = new WebSocket(`${wsProtocol}//${wsHost}/ws?token=${token}`);

    // WebSocket open event
    ws.addEventListener('open', () => {
        console.log("✅ WebSocket connection established!");
    });

    // WebSocket error and close event handlers
    ws.addEventListener('error', (error) => {
        console.error("❌ WebSocket error:", error);
    });

    ws.addEventListener('close', (event) => {
        if (!event.wasClean) {
            console.error("❌ WebSocket closed anormally", event);
        } else {
            console.log(`✅ WebSocket closed cleanly, code: ${event.code}, reason: ${event.reason}`);
        }
    });

    // WebSocket message event
    ws.addEventListener('message', (event) => {
        console.log('📩 Message received from server:', event.data);

        try {
            const receivedData = JSON.parse(event.data);

            // Handle chat messages from other users
            if (receivedData.event === "chatMessage" && receivedData.data) {
                displayMessage(`${receivedData.data.username}: ${receivedData.data.message}`, "other");
            }
        } catch (error) {
            console.error("❌ JSON parsing error:", error);
        }
    });

    // Handle sending a message via the chat form
    document.getElementById('chatForm').addEventListener('submit', function(event) {
        event.preventDefault();

        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (message) {
            // Send the message in the correct format expected by the server
            ws.send(JSON.stringify({ 
                event: "chatMessage", 
                data: { message: message } 
            }));
            
            displayMessage(`You: ${message}`, "self");
            messageInput.value = '';
        }
    });

    // Function to display messages in the chat
    function displayMessage(message, sender) {
        const messageContainer = document.getElementById('messages');
        
        if (!messageContainer) {
            console.error("❌ The #messages element doesn't exist in the DOM!");
            return;
        }

        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageElement.classList.add('message', sender);

        messageContainer.appendChild(messageElement);
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    // Initialize chat elements
    document.addEventListener('DOMContentLoaded', () => {
        const chatForm = document.getElementById('chatForm');
        const messageInput = document.getElementById('messageInput');

        if (!chatForm || !messageInput) {
            console.error("❌ The #chatForm or #messageInput element doesn't exist in the DOM!");
        }
    });
}
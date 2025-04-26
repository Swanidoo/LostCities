// Debug the token from localStorage
const token = localStorage.getItem("authToken");
console.log("Auth Token from localStorage:", token ? "Token exists" : "No token found");

if (!token) {
    console.error("❌ No JWT token found! Please log in first.");
    // Redirect to login page
    window.location.href = "/login.html";
} else {
    // Clean the token and log it for debugging (don't log full token in production)
    const cleanToken = token.trim();
    console.log("Using cleaned token length:", cleanToken.length);

    // Fetch the profile data with additional error handling
    fetch("https://lostcitiesbackend.onrender.com/profile", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${cleanToken}`,
            "Content-Type": "application/json"
        },
        credentials: "same-origin"  // Include cookies if needed
    })
    .then((response) => {
        console.log("Profile response status:", response.status);
        
        if (response.status === 401) {
            console.error("❌ Unauthorized: Token may be expired");
            // Clear invalid token and redirect to login
            localStorage.removeItem("authToken");
            window.location.href = "/login.html";
            throw new Error("Unauthorized: Token may be expired");
        }
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return response.json();
    })
    .then((data) => {
        console.log("✅ Profile data:", data);
        // Maybe show username in UI
        const usernameElement = document.getElementById('username');
        if (usernameElement && data.user && data.user.username) {
            usernameElement.textContent = data.user.username;
        }
    })
    .catch((error) => {
        console.error("❌ Error fetching profile:", error);
    });

    // Create a WebSocket connection with properly encoded token
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = 'lostcitiesbackend.onrender.com';
    const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(cleanToken)}`;
    console.log("Connecting to WebSocket URL:", wsUrl.substring(0, wsUrl.indexOf('?') + 15) + "...");
    
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    let reconnectTimeout;
    
    function connectWebSocket() {
        // Create WebSocket with timeout to handle connection issues
        const ws = new WebSocket(wsUrl);
        
        // Add connection timeout handler
        const connectionTimeout = setTimeout(() => {
            if (ws.readyState !== WebSocket.OPEN) {
                console.error("❌ WebSocket connection timeout");
                ws.close();
            }
        }, 10000); // 10 second timeout
    
        // WebSocket open event
        ws.addEventListener('open', () => {
            clearTimeout(connectionTimeout);
            console.log("✅ WebSocket connection established!");
            reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            
            // Show connection status in UI
            const statusElement = document.getElementById('connectionStatus');
            if (statusElement) {
                statusElement.textContent = "Connected";
                statusElement.className = "status-connected";
            }
        });
    
        // WebSocket error and close event handlers
        ws.addEventListener('error', (error) => {
            console.error("❌ WebSocket error:", error);
        });
    
        ws.addEventListener('close', (event) => {
            clearTimeout(connectionTimeout);
            
            // Update UI to show disconnected status
            const statusElement = document.getElementById('connectionStatus');
            if (statusElement) {
                statusElement.textContent = "Disconnected";
                statusElement.className = "status-disconnected";
            }
            
            if (!event.wasClean) {
                console.error("❌ WebSocket closed abnormally", event);
                
                // Attempt to reconnect with exponential backoff
                if (reconnectAttempts < maxReconnectAttempts) {
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    console.log(`🔄 Attempting to reconnect in ${delay/1000} seconds...`);
                    
                    reconnectAttempts++;
                    reconnectTimeout = setTimeout(connectWebSocket, delay);
                } else {
                    console.error("❌ Maximum reconnection attempts reached");
                    displayMessage("Connection lost. Please refresh the page.", "system");
                }
            } else {
                console.log(`✅ WebSocket closed cleanly, code: ${event.code}, reason: ${event.reason}`);
            }
        });
    
        // WebSocket message event
        ws.addEventListener('message', (event) => {
            console.log('📩 Message received from server:', event.data);
    
            try {
                const receivedData = JSON.parse(event.data);
    
                // Handle different event types
                if (receivedData.event === "chatMessage" && receivedData.data) {
                    displayMessage(`${receivedData.data.username}: ${receivedData.data.message}`, "other");
                } else if (receivedData.event === "systemMessage" && receivedData.data) {
                    displayMessage(receivedData.data.message, "system");
                } else if (receivedData.event === "movePlayed" && receivedData.data) {
                    // Handle game moves if needed
                    console.log(`Move played in game ${receivedData.data.gameId} by ${receivedData.data.username}: ${receivedData.data.move}`);
                }
            } catch (error) {
                console.error("❌ JSON parsing error:", error);
            }
        });
    
        // Handle sending a message via the chat form
        document.getElementById('chatForm')?.addEventListener('submit', function(event) {
            event.preventDefault();
    
            const messageInput = document.getElementById('messageInput');
            if (!messageInput) return;
            
            const message = messageInput.value.trim();
    
            if (message && ws.readyState === WebSocket.OPEN) {
                // Send the message in the correct format expected by the server
                ws.send(JSON.stringify({ 
                    event: "chatMessage", 
                    data: { message: message } 
                }));
                
                displayMessage(`You: ${message}`, "self");
                messageInput.value = '';
            } else if (ws.readyState !== WebSocket.OPEN) {
                displayMessage("Cannot send message: Not connected to server", "system");
            }
        });
        
        return ws;
    }
    
    // Start the initial connection
    const ws = connectWebSocket();

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

    // Cleanup function for page unload
    window.addEventListener('beforeunload', () => {
        clearTimeout(reconnectTimeout);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.close(1000, "Page closed by user");
        }
    });

    // Initialize chat elements
    document.addEventListener('DOMContentLoaded', () => {
        const chatForm = document.getElementById('chatForm');
        const messageInput = document.getElementById('messageInput');

        if (!chatForm || !messageInput) {
            console.error("❌ The #chatForm or #messageInput element doesn't exist in the DOM!");
        }
        
        // Add status indicator to UI if it doesn't exist
        if (!document.getElementById('connectionStatus')) {
            const statusContainer = document.createElement('div');
            statusContainer.innerHTML = '<span id="connectionStatus" class="status-connecting">Connecting...</span>';
            document.querySelector('body').prepend(statusContainer);
            
            // Add some basic styles
            const style = document.createElement('style');
            style.textContent = `
                .status-connected { color: green; }
                .status-disconnected { color: red; }
                .status-connecting { color: orange; }
                .message.system { color: #888; font-style: italic; }
            `;
            document.head.appendChild(style);
        }
    });
}
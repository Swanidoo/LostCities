// Determine the API URL based on the environment
const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

// Determine the WebSocket URL based on the environment
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = window.location.hostname === "localhost" 
    ? 'localhost:3000' 
    : 'lostcitiesbackend.onrender.com';
const WS_URL = `${WS_PROTOCOL}//${WS_HOST}/ws`;

// Matchmaking state
let matchmakingState = {
    searching: false,
    socket: null,
    userId: null,
    username: null,
    onlinePlayers: [],
    gameId: null
};

// DOM Elements
const elements = {
    searchBtn: document.getElementById('search-game-btn'),
    cancelBtn: document.getElementById('cancel-search-btn'),
    statusMessage: document.getElementById('status-message'),
    spinner: document.getElementById('spinner'),
    onlinePlayersList: document.getElementById('online-players')
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in
    const token = localStorage.getItem('authToken');
    if (!token) {
        // Redirect to login page if not logged in
        window.location.href = '/login/login.html';
        return;
    }

    // Get user information from token
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            matchmakingState.userId = payload.id;
            matchmakingState.username = payload.username || payload.email;
        }
    } catch (error) {
        console.error("Error reading token:", error);
    }

    // Set up event listeners
    setupEventListeners();
    
    // Establish WebSocket connection
    connectWebSocket();
});

// Set up event listeners
function setupEventListeners() {
    // Search button
    elements.searchBtn.addEventListener('click', () => {
        if (!matchmakingState.searching) {
            startMatchmaking();
        }
    });
    
    // Cancel button
    elements.cancelBtn.addEventListener('click', () => {
        if (matchmakingState.searching) {
            cancelMatchmaking();
        }
    });
}

// Connect to WebSocket
function connectWebSocket() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Close existing connection if it exists
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        matchmakingState.socket.close();
    }

    // Create new WebSocket connection with authentication token
    // Important change: Use ws:// for localhost, not wss://
    const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
    console.log(`Connecting to WebSocket: ${wsUrl.split('?')[0]}...`);
    
    matchmakingState.socket = new WebSocket(wsUrl);
    
    // Set up WebSocket event listeners
    setupWebSocketEventListeners();
}

// Set up WebSocket event listeners
function setupWebSocketEventListeners() {
    const socket = matchmakingState.socket;
    
    // Connection established
    socket.addEventListener('open', () => {
        console.log("WebSocket connection established");
        updateStatus("Connected to server", false);
        
        // Request online players list
        requestOnlinePlayers();
    });
    
    // Connection error
    socket.addEventListener('error', (error) => {
        console.error("WebSocket error:", error);
        updateStatus("Connection error", false);
    });
    
    // Connection closed
    socket.addEventListener('close', (event) => {
        console.log(`WebSocket disconnected: ${event.code} - ${event.reason}`);
        updateStatus("Disconnected from server", false);
        
        // Try to reconnect after 5 seconds
        setTimeout(() => {
            if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
                connectWebSocket();
            }
        }, 5000);
    });
    
    // Message received
    socket.addEventListener('message', handleWebSocketMessage);
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log("Message received:", data);

        switch (data.event) {
            case "matchmakingStatus":
                // Update matchmaking status
                updateStatus(data.data.message, data.data.status === "searching");
                matchmakingState.searching = data.data.status === "searching";
                toggleMatchmakingUI(matchmakingState.searching);
                break;

            case "matchFound":
                // Match found! Redirect to the game page
                updateStatus(`Opponent found: ${data.data.opponentName}. Redirecting to game...`, false);

                // Store game info if needed
                localStorage.setItem("currentGameId", data.data.gameId);

                // Redirect to game page
                setTimeout(() => {
                    window.location.href = `/game/game.html?gameId=${data.data.gameId}`;
                }, 1500);
                break;

            case "onlinePlayers":
                // Update online players list
                matchmakingState.onlinePlayers = data.data.players || [];
                updateOnlinePlayersList();
                break;

            case "systemMessage":
                // Handle system messages
                if (data.data && data.data.message) {
                    updateStatus(data.data.message, matchmakingState.searching);
                }
                break;

            default:
                console.log("Unknown message type:", data.event);
        }
    } catch (error) {
        console.error("Error parsing message:", error);
    }
}

// Start matchmaking
function startMatchmaking() {
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        // Update UI to show searching state
        updateStatus("Searching for opponent...", true);

        // Send matchmaking request
        matchmakingState.socket.send(JSON.stringify({
            event: "findMatch",
            data: {
                userId: matchmakingState.userId,
                username: matchmakingState.username
            }
        }));

        matchmakingState.searching = true;
        toggleMatchmakingUI(true);
    } else {
        updateStatus("Not connected to server. Unable to search for match.", false);
    }
}

// Cancel matchmaking
function cancelMatchmaking() {
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        // Send cancel matchmaking request
        matchmakingState.socket.send(JSON.stringify({
            event: "cancelMatch",
            data: {
                userId: matchmakingState.userId
            }
        }));

        updateStatus("Search canceled", false);
        matchmakingState.searching = false;
        toggleMatchmakingUI(false);
    } else {
        updateStatus("Not connected to server. Unable to cancel.", false);
    }
}

// Request online players list
function requestOnlinePlayers() {
    if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    // Send request for online players list
    matchmakingState.socket.send(JSON.stringify({
        event: "getOnlinePlayers",
        data: {}
    }));
}

// Update status message
function updateStatus(message, showSpinner) {
    elements.statusMessage.textContent = message;
    elements.spinner.style.display = showSpinner ? 'block' : 'none';
}

// Toggle matchmaking UI
function toggleMatchmakingUI(searching) {
    if (searching) {
        elements.searchBtn.classList.add('hidden');
        elements.cancelBtn.classList.remove('hidden');
    } else {
        elements.searchBtn.classList.remove('hidden');
        elements.cancelBtn.classList.add('hidden');
    }
}

// Update online players list
function updateOnlinePlayersList() {
    const container = elements.onlinePlayersList;
    container.innerHTML = '';
    
    if (matchmakingState.onlinePlayers.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'player';
        emptyMessage.textContent = 'No players online at the moment';
        container.appendChild(emptyMessage);
        return;
    }
    
    matchmakingState.onlinePlayers.forEach(player => {
        if (player.id === matchmakingState.userId) return; // Don't show current player
        
        const playerElement = document.createElement('div');
        playerElement.className = 'player';
        
        const nameElement = document.createElement('span');
        nameElement.textContent = player.username;
        
        const statusElement = document.createElement('div');
        statusElement.className = 'player-stats';
        statusElement.textContent = `${player.status}`;
        
        playerElement.appendChild(nameElement);
        playerElement.appendChild(statusElement);
        
        // Add challenge button if player is available
        if (player.status === 'available') {
            const challengeBtn = document.createElement('button');
            challengeBtn.className = 'btn btn-small';
            challengeBtn.textContent = 'Challenge';
            challengeBtn.addEventListener('click', () => challengePlayer(player.id));
            playerElement.appendChild(challengeBtn);
        }
        
        container.appendChild(playerElement);
    });
}

// Challenge a specific player
function challengePlayer(playerId) {
    if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
        updateStatus("Not connected to server", false);
        return;
    }
    
    // Send challenge request
    matchmakingState.socket.send(JSON.stringify({
        event: "challengePlayer",
        data: { 
            userId: matchmakingState.userId,
            opponentId: playerId 
        }
    }));
    
    updateStatus("Challenge sent, waiting for response...", true);
    matchmakingState.searching = true;
    toggleMatchmakingUI(true);
}

// Refresh online players list periodically
setInterval(requestOnlinePlayers, 30000); // Every 30 seconds
// frontend/game/js/game_websocket.js

class GameWebSocket {
    constructor(gameId, userId) {
        this.gameId = gameId;
        this.userId = userId;
        this.socket = null;
        this.onGameUpdate = null;
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onError = null;
        this.onConnect = null;
        this.onDisconnect = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.isConnected = false;
    }

    connect() {
        // Get auth token from localStorage
        const token = localStorage.getItem("authToken");
        if (!token) {
            console.error("No authentication token found. Please log in.");
            window.location.href = "/login.html";
            return;
        }

        // Determine the WebSocket URL based on the current environment
        const isLocalhost = window.location.hostname === "localhost";
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = isLocalhost ? `${window.location.hostname}:3000` : 'lostcitiesbackend.onrender.com';
        const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(token)}`;

        console.log(`Connecting to WebSocket: ${wsUrl.split('?')[0]}...`);

        // Create WebSocket connection
        this.socket = new WebSocket(wsUrl);

        // Set up event handlers
        this.socket.onopen = () => {
            console.log("WebSocket connection established!");
            this.isConnected = true;
            this.reconnectAttempts = 0;

            // Subscribe to the specific game
            this.subscribeToGame();

            // Trigger the onConnect callback if provided
            if (this.onConnect) {
                this.onConnect();
            }
        };

        this.socket.onclose = (event) => {
            this.isConnected = false;
            console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);

            // Trigger the onDisconnect callback if provided
            if (this.onDisconnect) {
                this.onDisconnect(event);
            }

            // Attempt to reconnect if the connection was closed unexpectedly
            if (event.code !== 1000 && event.code !== 1001) {
                this.attemptReconnect();
            }
        };

        this.socket.onerror = (error) => {
            console.error("WebSocket error:", error);
            if (this.onError) {
                this.onError(error);
            }
        };

        this.socket.onmessage = (event) => {
            this.handleMessage(event);
        };
    }

    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log("Received message:", data);

            switch (data.event) {
                case "gameUpdated":
                    if (this.onGameUpdate) {
                        this.onGameUpdate(data.data.gameState);
                    }
                    break;
                case "playerJoined":
                    if (this.onPlayerJoined) {
                        this.onPlayerJoined(data.data);
                    }
                    break;
                case "playerLeft":
                    if (this.onPlayerLeft) {
                        this.onPlayerLeft(data.data);
                    }
                    break;
                case "gameAction":
                    if (this.onGameUpdate) {
                        // Trigger a game state update when an action is performed
                        this.requestGameState();
                    }
                    break;
                case "systemMessage":
                    console.log("System message:", data.data.message);
                    break;
                default:
                    console.log("Unhandled message event:", data.event);
            }
        } catch (error) {
            console.error("Error handling WebSocket message:", error);
        }
    }

    subscribeToGame() {
        if (!this.isConnected) {
            console.error("Cannot subscribe to game, WebSocket is not connected");
            return false;
        }

        this.socket.send(JSON.stringify({
            event: "subscribeGame",
            data: {
                gameId: this.gameId
            }
        }));

        console.log(`Subscribed to game ${this.gameId}`);
        return true;
    }

    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error("Maximum reconnect attempts reached. Please refresh the page.");
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
        
        this.reconnectAttempts++;
        setTimeout(() => this.connect(), delay);
    }

    disconnect() {
        if (this.socket && this.isConnected) {
            this.socket.close(1000, "User disconnected intentionally");
        }
    }

    // Game-specific methods
    playCard(cardId, color) {
        this.sendGameAction("play_card", { cardId, color });
    }

    discardCard(cardId) {
        this.sendGameAction("discard_card", { cardId });
    }

    drawCardFromDeck() {
        this.sendGameAction("draw_card", { source: "deck" });
    }

    drawCardFromDiscardPile(color) {
        this.sendGameAction("draw_card", { source: "discard_pile", color });
    }

    surrender() {
        this.sendGameAction("surrender");
    }

    requestGameState() {
        this.sendGameAction("request_state");
    }

    sendChatMessage(message) {
        if (!this.isConnected) {
            console.error("Cannot send message, WebSocket is not connected");
            return false;
        }

        this.socket.send(JSON.stringify({
            event: "chatMessage",
            data: {
                gameId: this.gameId,
                message
            }
        }));

        return true;
    }

    sendGameAction(action, data = {}) {
        if (!this.isConnected) {
            console.error(`Cannot send game action ${action}, WebSocket is not connected`);
            return false;
        }

        const payload = {
            event: "gameAction",
            data: {
                gameId: this.gameId,
                action,
                ...data
            }
        };

        console.log(`Sending game action: ${action}`, payload);
        this.socket.send(JSON.stringify(payload));
        return true;
    }
}

export default GameWebSocket;
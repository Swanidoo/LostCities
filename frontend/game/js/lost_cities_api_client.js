/**
 * Lost Cities API Client
 * Handles all API requests and WebSocket communication with the backend
 */

export class LostCitiesApiClient {
    constructor() {
        // Dynamic API URL based on environment
        this.apiUrl = window.location.hostname === "localhost"
            ? "http://localhost:3000"
            : "https://lostcitiesbackend.onrender.com";

        // WebSocket URL (derived from API URL)
        this.wsProtocol = this.apiUrl.startsWith('https') ? 'wss:' : 'ws:';
        this.wsHost = window.location.hostname === "localhost" 
            ? 'localhost:3000' 
            : 'lostcitiesbackend.onrender.com';
        
        // Authentication
        this.token = localStorage.getItem('authToken');
        
        // WebSocket connection
        this.socket = null;
        this.gameSubscriptions = [];
        
        // Callback handlers
        this.onGameUpdate = null;
        this.onChatMessage = null;
        this.onSystemMessage = null;
        this.onConnectionChange = null;
        this.onError = console.error;
    }

    /**
     * Set callback handlers for various events
     * @param {Object} callbacks - Object containing callback functions
     */
    setCallbacks(callbacks) {
        if (callbacks.onGameUpdate) this.onGameUpdate = callbacks.onGameUpdate;
        if (callbacks.onChatMessage) this.onChatMessage = callbacks.onChatMessage;
        if (callbacks.onSystemMessage) this.onSystemMessage = callbacks.onSystemMessage;
        if (callbacks.onConnectionChange) this.onConnectionChange = callbacks.onConnectionChange;
        if (callbacks.onError) this.onError = callbacks.onError;
    }

    /**
     * Initialize WebSocket connection
     */
    initWebSocket() {
        if (!this.token) {
            this.onError('No authentication token found');
            if (this.onConnectionChange) this.onConnectionChange('disconnected');
            return false;
        }

        try {
            const wsUrl = `${this.wsProtocol}//${this.wsHost}/ws?token=${encodeURIComponent(this.token)}`;
            console.log("Connecting to WebSocket...");
            
            this.socket = new WebSocket(wsUrl);
            
            // Connection established
            this.socket.addEventListener('open', () => {
                console.log("WebSocket connection established");
                if (this.onConnectionChange) this.onConnectionChange('connected');
                
                // Resubscribe to previously subscribed games
                this.gameSubscriptions.forEach(gameId => {
                    this.subscribeToGame(gameId);
                });
            });
            
            // Connection closed
            this.socket.addEventListener('close', (event) => {
                console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
                if (this.onConnectionChange) this.onConnectionChange('disconnected');
                
                // Try to reconnect after a delay if it wasn't a clean close
                if (!event.wasClean) {
                    setTimeout(() => this.initWebSocket(), 3000);
                }
            });
            
            // Connection error
            this.socket.addEventListener('error', (error) => {
                console.error("WebSocket error:", error);
                if (this.onError) this.onError('WebSocket connection error');
            });
            
            // Incoming messages
            this.socket.addEventListener('message', (event) => {
                try {
                    const data = JSON.parse(event.data);
                    console.log("Received message:", data);
                    
                    // Handle different message types
                    switch (data.event) {
                        case "chatMessage":
                            if (this.onChatMessage) this.onChatMessage(data.data);
                            break;
                            
                        case "systemMessage":
                            if (this.onSystemMessage) this.onSystemMessage(data.data);
                            break;
                            
                        case "gameUpdated":
                            if (this.onGameUpdate) this.onGameUpdate(data.data.gameState);
                            break;
                            
                        case "movePlayed":
                            if (this.onGameUpdate) this.fetchGameState(data.data.gameId);
                            break;
                            
                        case "gameSubscribed":
                            console.log(`Subscribed to game ${data.data.gameId}`);
                            if (!this.gameSubscriptions.includes(data.data.gameId)) {
                                this.gameSubscriptions.push(data.data.gameId);
                            }
                            break;
                            
                        default:
                            console.log("Unknown message type:", data.event);
                    }
                } catch (error) {
                    console.error("Error parsing WebSocket message:", error);
                }
            });
            
            return true;
        } catch (error) {
            console.error("Error initializing WebSocket:", error);
            if (this.onError) this.onError('Failed to connect to game server');
            return false;
        }
    }
    
    /**
     * Check if WebSocket is connected
     * @returns {boolean} Connection status
     */
    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }
    
    /**
     * Send a message through the WebSocket connection
     * @param {string} event - Event type
     * @param {Object} data - Data to send
     * @returns {boolean} Success status
     */
    sendMessage(event, data) {
        if (!this.isConnected()) {
            this.onError('Not connected to game server');
            return false;
        }
        
        try {
            const message = JSON.stringify({ event, data });
            this.socket.send(message);
            return true;
        } catch (error) {
            console.error("Error sending message:", error);
            this.onError('Failed to send message');
            return false;
        }
    }
    
    /**
     * Subscribe to updates for a specific game
     * @param {string} gameId - Game ID to subscribe to
     */
    subscribeToGame(gameId) {
        if (!this.isConnected()) {
            // Add to list to subscribe when connected
            if (!this.gameSubscriptions.includes(gameId)) {
                this.gameSubscriptions.push(gameId);
            }
            return false;
        }
        
        return this.sendMessage('subscribeGame', { gameId });
    }
    
    /**
     * Unsubscribe from updates for a specific game
     * @param {string} gameId - Game ID to unsubscribe from
     */
    unsubscribeFromGame(gameId) {
        // Remove from subscriptions list
        const index = this.gameSubscriptions.indexOf(gameId);
        if (index !== -1) {
            this.gameSubscriptions.splice(index, 1);
        }
        
        if (!this.isConnected()) return false;
        
        return this.sendMessage('unsubscribeGame', { gameId });
    }
    
    /**
     * Send a chat message in the game
     * @param {string} gameId - Game ID
     * @param {string} message - Message content
     */
    sendChatMessage(gameId, message) {
        return this.sendMessage('chatMessage', { gameId, message });
    }
    
    /**
     * Notify a move played in the game
     * @param {string} gameId - Game ID
     * @param {string} move - Move description
     */
    notifyMovePlayed(gameId, move) {
        return this.sendMessage('movePlayed', { gameId, move });
    }
    
    /**
     * Send a game action (play card, discard, draw)
     * @param {string} gameId - Game ID
     * @param {string} action - Action type
     * @param {Object} actionData - Action data
     */
    sendGameAction(gameId, action, actionData = {}) {
        return this.sendMessage('gameAction', { 
            gameId, 
            action, 
            ...actionData 
        });
    }
    
    // API Requests
    
    /**
     * Make an authenticated API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise} Fetch promise
     */
    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiUrl}${endpoint}`;
        
        // Set default headers
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || `HTTP error! Status: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error(`API request failed: ${endpoint}`, error);
            if (this.onError) this.onError(error.message || 'API request failed');
            throw error;
        }
    }
    
    /**
     * Fetch current game state
     * @param {string} gameId - Game ID
     * @returns {Promise} Game state promise
     */
    async fetchGameState(gameId) {
        try {
            const data = await this.apiRequest(`/lost-cities/games/${gameId}`);
            if (this.onGameUpdate) this.onGameUpdate(data);
            return data;
        } catch (error) {
            console.error('Error fetching game state:', error);
            return null;
        }
    }
    
    /**
     * Create a new game
     * @param {string} opponentId - Opponent user ID
     * @param {boolean} usePurpleExpedition - Whether to use the purple expedition
     * @returns {Promise} Game creation promise
     */
    async createGame(opponentId, usePurpleExpedition = false) {
        return this.apiRequest('/lost-cities/games', {
            method: 'POST',
            body: JSON.stringify({
                opponentId,
                usePurpleExpedition
            })
        });
    }
    
    /**
     * Join an existing game
     * @param {string} gameId - Game ID
     * @returns {Promise} Game join promise
     */
    async joinGame(gameId) {
        return this.apiRequest(`/lost-cities/games/${gameId}/join`, {
            method: 'POST'
        });
    }
    
    /**
     * Make a move in the game
     * @param {string} gameId - Game ID
     * @param {Object} move - Move data
     * @returns {Promise} Move promise
     */
    async makeMove(gameId, move) {
        return this.apiRequest(`/lost-cities/games/${gameId}/moves`, {
            method: 'POST',
            body: JSON.stringify(move)
        });
    }
    
    /**
     * Surrender a game
     * @param {string} gameId - Game ID
     * @returns {Promise} Surrender promise
     */
    async surrenderGame(gameId) {
        return this.apiRequest(`/lost-cities/games/${gameId}/surrender`, {
            method: 'POST'
        });
    }
    
    /**
     * Fetch user profile
     * @returns {Promise} User profile promise
     */
    async fetchProfile() {
        return this.apiRequest('/profile');
    }
    
    /**
     * Fetch leaderboard data
     * @param {number} month - Month (1-12)
     * @param {number} year - Year
     * @param {number} page - Page number
     * @param {number} limit - Items per page
     * @returns {Promise} Leaderboard promise
     */
    async fetchLeaderboard(month, year, page = 1, limit = 10) {
        let url = '/api/leaderboard';
        const params = [];
        
        if (month && year) {
            params.push(`month=${month}&year=${year}`);
        }
        
        params.push(`page=${page}&limit=${limit}`);
        
        if (params.length > 0) {
            url += '?' + params.join('&');
        }
        
        return this.apiRequest(url);
    }
}
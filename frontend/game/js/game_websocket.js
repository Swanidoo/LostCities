/**
 * WebSocket handler for Lost Cities game
 * Manages real-time communication between game client and server
 */

export class GameWebSocket {
    constructor(gameId, token, options = {}) {
      this.gameId = gameId;
      this.token = token;
      this.socket = null;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
      this.reconnectDelay = options.reconnectDelay || 1000;
      this.reconnectBackoffFactor = options.reconnectBackoffFactor || 2;
      this.reconnectTimeoutId = null;
      
      // Event handlers
      this.onConnect = options.onConnect || (() => {});
      this.onMessage = options.onMessage || (() => {});
      this.onDisconnect = options.onDisconnect || (() => {});
      this.onError = options.onError || (() => {});
      this.onReconnecting = options.onReconnecting || (() => {});
      this.onReconnectFailed = options.onReconnectFailed || (() => {});
      
      // Connect immediately if autoConnect is not explicitly set to false
      if (options.autoConnect !== false) {
        this.connect();
      }
    }
    
    /**
     * Establish WebSocket connection
     */
    connect() {
      // Determine the WebSocket URL based on environment
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname === 'localhost' ? 
        'localhost:3000' : 
        'lostcitiesbackend.onrender.com';
      
      // Create WebSocket URL with token
      const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(this.token)}`;
      console.log(`Connecting to WebSocket: ${wsUrl.substring(0, wsUrl.indexOf('?'))}...`);
      
      try {
        this.socket = new WebSocket(wsUrl);
        
        // Setup event handlers
        this.socket.onopen = (event) => {
          console.log('Connected to game server');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // Subscribe to the game channel
          this.send({
            event: 'subscribeGame',
            data: { gameId: this.gameId }
          });
          
          this.onConnect(event);
        };
        
        this.socket.onclose = (event) => {
          console.log(`WebSocket connection closed: ${event.code} - ${event.reason}`);
          this.isConnected = false;
          
          this.onDisconnect(event);
          
          // Attempt to reconnect if it wasn't a clean close
          if (!event.wasClean) {
            this.attemptReconnect();
          }
        };
        
        this.socket.onerror = (error) => {
          console.log('WebSocket error: ', error);
          this.onError(error);
        };
        
        this.socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Game server message:', data);
            this.onMessage(data);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };
      } catch (error) {
        console.error('Error creating WebSocket connection:', error);
        this.onError(error);
      }
    }
    
    /**
     * Send data to the WebSocket server
     */
    send(data) {
      if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.warn('Cannot send message - WebSocket not connected');
        return false;
      }
      
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(message);
        return true;
      } catch (error) {
        console.error('Error sending WebSocket message:', error);
        return false;
      }
    }
    
    /**
     * Send a game move
     */
    sendMove(moveData) {
      return this.send({
        event: 'gameAction',
        data: {
          ...moveData,
          gameId: this.gameId
        }
      });
    }
    
    /**
     * Send a chat message
     */
    sendChat(message) {
      return this.send({
        event: 'chatMessage',
        data: {
          gameId: this.gameId,
          message
        }
      });
    }
    
    /**
     * Attempt to reconnect to the WebSocket server with exponential backoff
     */
    attemptReconnect() {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('Maximum reconnect attempts reached. Please refresh the page.');
        this.onReconnectFailed();
        return;
      }
      
      const delay = this.reconnectDelay * Math.pow(this.reconnectBackoffFactor, this.reconnectAttempts);
      console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
      
      this.onReconnecting(this.reconnectAttempts, delay);
      this.reconnectAttempts++;
      
      this.reconnectTimeoutId = setTimeout(() => {
        this.connect();
      }, delay);
    }
    
    /**
     * Close the WebSocket connection
     */
    close(code = 1000, reason = 'Normal closure') {
      // Clear any pending reconnect attempts
      if (this.reconnectTimeoutId) {
        clearTimeout(this.reconnectTimeoutId);
        this.reconnectTimeoutId = null;
      }
      
      // Close the socket if it exists and is not already closed
      if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
        try {
          this.socket.close(code, reason);
        } catch (error) {
          console.error('Error closing WebSocket:', error);
        }
      }
      
      this.isConnected = false;
    }
    
    /**
     * Check if the WebSocket is currently connected
     */
    isCurrentlyConnected() {
      return this.isConnected && this.socket && this.socket.readyState === WebSocket.OPEN;
    }
  }
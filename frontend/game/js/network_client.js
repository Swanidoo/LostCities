// network_client.js - New consolidated file
export class NetworkClient {
    constructor(gameId, token, options = {}) {
      this.gameId = gameId;
      this.token = token;
      this.socket = null;
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = options.maxReconnectAttempts || 5;
      this.reconnectDelay = options.reconnectDelay || 1000;
      this.callbacks = {
        onConnect: options.onConnect || (() => {}),
        onMessage: options.onMessage || (() => {}),
        onDisconnect: options.onDisconnect || (() => {}),
        onError: options.onError || (() => {})
      };
      
      // Don't auto-connect immediately to prevent multiple connections
      if (options.autoConnect) {
        this.connect();
      }
    }
    
    connect() {
      // Important: Close any existing connections first
      if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
        console.log("Closing existing connection before reconnecting");
        this.socket.close(1000, "Reconnecting");
        
        // Wait a moment before creating new connection
        setTimeout(() => this._createConnection(), 500);
      } else {
        this._createConnection();
      }
    }
    
    _createConnection() {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.hostname === 'localhost' ? 
        'localhost:3000' : 'lostcitiesbackend.onrender.com';
      const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(this.token)}`;
      
      console.log(`Connecting to WebSocket: ${wsUrl.substring(0, wsUrl.indexOf('?'))}...`);
      
      try {
        this.socket = new WebSocket(wsUrl);
        
        this.socket.addEventListener('open', this._handleOpen.bind(this));
        this.socket.addEventListener('message', this._handleMessage.bind(this));
        this.socket.addEventListener('close', this._handleClose.bind(this));
        this.socket.addEventListener('error', this._handleError.bind(this));
      } catch (error) {
        console.error("Error creating WebSocket:", error);
        this.callbacks.onError(error);
      }
    }
    
    // Socket event handlers
    _handleOpen(event) {
      console.log("WebSocket connected");
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.callbacks.onConnect(event);
      
      // Subscribe to game updates
      this.subscribeToGame();
    }
    
    _handleMessage(event) {
      try {
        const data = JSON.parse(event.data);
        this.callbacks.onMessage(data);
      } catch (error) {
        console.error("Error parsing message:", error);
      }
    }
    
    _handleClose(event) {
      console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
      this.isConnected = false;
      this.callbacks.onDisconnect(event);
      
      // Attempt reconnection if not closed cleanly and not at max attempts
      if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        console.log(`Attempting reconnection in ${delay}ms...`);
        this.reconnectAttempts++;
        
        setTimeout(() => this.connect(), delay);
      }
    }
    
    _handleError(error) {
      console.error("WebSocket error:", error);
      this.callbacks.onError(error);
    }
    
    // Game-specific methods
    subscribeToGame() {
      return this.send({
        event: "subscribeGame",
        data: { gameId: this.gameId }
      });
    }
    
    requestGameState() {
      return this.send({
        event: "requestGameState",
        data: { gameId: this.gameId }
      });
    }
    
    sendGameAction(action, actionData = {}) {
      return this.send({
        event: "gameAction",
        data: {
          gameId: this.gameId,
          action,
          ...actionData
        }
      });
    }
    
    sendChatMessage(message) {
      return this.send({
        event: "chatMessage",
        data: {
          gameId: this.gameId,
          message
        }
      });
    }
    
    // Generic send method
    send(data) {
      if (!this.isConnected || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
        console.warn("Cannot send message - WebSocket not connected");
        return false;
      }
      
      try {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(message);
        return true;
      } catch (error) {
        console.error("Error sending message:", error);
        return false;
      }
    }
  }
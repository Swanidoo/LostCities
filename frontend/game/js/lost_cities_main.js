/**
 * Main Game Controller
 * Coordinates WebSocket, UI, and game logic for Lost Cities
 */

import { GameWebSocket } from './game_websocket.js';
import { GameUIController } from './game_ui_controller.js';

class LostCitiesGame {
  constructor() {
    console.log("Initializing game controller");
    
    // Parse game ID and user ID
    this.parseIds();
    
    // Initialize UI controller
    this.ui = new GameUIController(this.gameId, this.userId);
    this.ui.setGameMessage('Connecting to game server...');
    
    // Set up UI event handlers
    this.setupUIHandlers();
    
    // Initialize WebSocket connection
    this.initializeWebSocket();
  }
  
  /**
   * Parse game ID and user ID from page
   */
  parseIds() {
    // Get game ID from URL parameter or hidden input
    this.gameId = document.getElementById('game-id')?.value || 
                  new URLSearchParams(window.location.search).get('id') || 
                  '1';
    
    // Get user ID from hidden input or localStorage
    this.userId = document.getElementById('current-user-id')?.value || 
                  localStorage.getItem('user_id') || 
                  '1';
    
    // Get auth token from localStorage
    this.token = localStorage.getItem('authToken');
    
    if (!this.token) {
      console.error('No authentication token found. Redirecting to login...');
      setTimeout(() => window.location.href = '/login/login.html', 1000);
      return;
    }
    
    console.log(`Game: ${this.gameId}, User: ${this.userId}`);
  }
  
  /**
   * Initialize WebSocket connection
   */
  initializeWebSocket() {
    // Create WebSocket with handlers
    this.ws = new GameWebSocket(this.gameId, this.token, {
      onConnect: this.handleConnect.bind(this),
      onMessage: this.handleMessage.bind(this),
      onDisconnect: this.handleDisconnect.bind(this),
      onError: this.handleError.bind(this),
      onReconnecting: this.handleReconnecting.bind(this),
      onReconnectFailed: this.handleReconnectFailed.bind(this),
      maxReconnectAttempts: 5
    });
  }
  
  /**
   * Set up UI event handlers
   */
  setupUIHandlers() {
    // Handle card moves
    this.ui.setMoveHandler(moveData => {
      console.log('Move:', moveData);
      this.sendMove(moveData);
    });
    
    // Handle surrender
    this.ui.setSurrenderHandler(() => {
      console.log('Surrendering game');
      this.surrender();
    });
    
    // Handle chat messages
    this.ui.setChatHandler(message => {
      console.log('Sending chat message:', message);
      this.sendChatMessage(message);
    });
  }
  
  /**
   * Handle WebSocket connection
   */
  handleConnect(event) {
    console.log('Connected to game server');
    this.ui.setGameMessage('Connected. Waiting for game state...');
    
    // Request initial game state
    this.requestGameState();
  }
  
  /**
   * Handle WebSocket messages
   */
  handleMessage(data) {
    if (!data || !data.event) return;
    
    switch (data.event) {
      case 'gameUpdated':
        this.handleGameUpdate(data.data?.gameState);
        break;
        
      case 'gameSubscribed':
        console.log('Subscribed to game:', data.data?.gameId);
        this.requestGameState();
        break;
        
      case 'chatMessage':
        this.handleChatMessage(data.data);
        break;
        
      case 'systemMessage':
        this.handleSystemMessage(data.data);
        break;
        
      case 'playerJoined':
        this.handlePlayerJoined(data.data);
        break;
        
      case 'playerLeft':
        this.handlePlayerLeft(data.data);
        break;
        
      default:
        console.log('Unknown message type:', data.event);
    }
  }
  
  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(event) {
    console.log('Disconnected from game server', event);
    this.ui.setGameMessage('Disconnected from game server. Trying to reconnect...');
  }
  
  /**
   * Handle WebSocket error
   */
  handleError(error) {
    console.error('Game server error', error);
    this.ui.setGameMessage('Error connecting to game server.');
  }
  
  /**
   * Handle reconnect attempt
   */
  handleReconnecting(attempt, delay) {
    console.log(`Reconnect attempt ${attempt} in ${delay}ms`);
    this.ui.setGameMessage(`Reconnecting to server (attempt ${attempt})...`);
  }
  
  /**
   * Handle reconnect failure
   */
  handleReconnectFailed() {
    console.error('Failed to reconnect to game server');
    this.ui.setGameMessage('Could not reconnect to server. Please reload the page.');
  }
  
  /**
   * Handle game state update
   */
  handleGameUpdate(gameState) {
    console.log('Game state received:', gameState);
    
    if (!gameState) {
      console.error('Invalid game state received');
      return;
    }
    
    // Update UI with new game state
    this.ui.updateGameState(gameState);
  }
  
  /**
   * Handle chat message
   */
  handleChatMessage(data) {
    if (data && data.username && data.message) {
      this.ui.addChatMessage(data.username, data.message);
    }
  }
  
  /**
   * Handle system message
   */
  handleSystemMessage(data) {
    if (data && data.message) {
      this.ui.addSystemMessage(data.message);
    }
  }
  
  /**
   * Handle player joined
   */
  handlePlayerJoined(data) {
    if (data && data.username) {
      this.ui.addSystemMessage(`${data.username} has joined the game.`);
      this.requestGameState();
    }
  }
  
  /**
   * Handle player left
   */
  handlePlayerLeft(data) {
    if (data && data.username) {
      this.ui.addSystemMessage(`${data.username} has left the game.`);
    }
  }
  
  /**
   * Request current game state
   */
  requestGameState() {
    this.ws.sendMove({
      action: 'request_state',
      gameId: this.gameId
    });
  }
  
  /**
   * Send a game move
   */
  sendMove(moveData) {
    // Add game ID to move data
    moveData.gameId = this.gameId;
    
    // Send move via WebSocket
    const success = this.ws.sendMove(moveData);
    
    if (!success) {
      this.ui.setGameMessage('Error sending move. Please try again.');
    }
  }
  
  /**
   * Surrender the game
   */
  surrender() {
    this.ws.sendMove({
      action: 'surrender',
      gameId: this.gameId
    });
  }
  
  /**
   * Send a chat message
   */
  sendChatMessage(message) {
    this.ws.sendChat(message);
  }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    console.log("DOM loaded, creating game controller");
    window.gameController = new LostCitiesGame();
  } catch (error) {
    console.error('Error initializing game controller:', error);
    alert('There was an error initializing the game. Please refresh the page and try again.');
  }
});
import { NetworkClient } from './network_client.js';
import { UIController } from './ui_controller.js';
import { authService, getAuthHeaders } from './auth-service.js';
import { apiClient, handleResponse } from './api-client.js';


export class GameController {
  constructor(gameId) {
    console.log("Initializing game controller for game:", gameId);
    
    // Game properties
    this.gameId = gameId;
    this.userId = authService.getUserId();
    this.token = authService.getAccessToken();
    this.gameState = null;
    
    // Validate required data
    if (!this.token) {
      console.error("No auth token found, redirecting to login");
      setTimeout(() => window.location.href = '/login/login.html', 1000);
      return;
    }
    
    if (!this.userId) {
      console.error("No user ID found");
      // Try to extract from token
      this._extractUserIdFromToken();
    }
    
    // Initialize components
    this._initComponents();
  }
  
  _extractUserIdFromToken() {
    try {
      const tokenParts = this.token.split('.');
      if (tokenParts.length === 3) {
        const payload = JSON.parse(atob(tokenParts[1]));
        this.userId = payload.id;
        console.log("Extracted user ID from token:", this.userId);
      }
    } catch (error) {
      console.error("Failed to extract user ID from token:", error);
    }
  }
  
  _initComponents() {
    // Create UI controller
    this.ui = new UIController(this);
    
    // Initialize network client with callbacks
    this.network = new NetworkClient(this.gameId, this.token, {
      onConnect: this._handleConnect.bind(this),
      onMessage: this._handleMessage.bind(this),
      onDisconnect: this._handleDisconnect.bind(this),
      onError: this._handleError.bind(this),
      autoConnect: true // Explicitly enable auto-connect
    });
    
    // Set up UI event handlers
    this._setupUIHandlers();
  }
  
  // Game state management
  async _fetchInitialGameState() {
    try {
      // Build the API URL
      const response = await apiClient.get(`/lost-cities/games/${this.gameId}`);
      const gameState = await handleResponse(response);
      
      console.log("Initial game state loaded:", gameState);
      
      // Update game state
      this.updateGameState(gameState);
      
    } catch (error) {
      console.error("Error fetching initial game state:", error);
      this.ui.setGameMessage("Error loading game state. Please refresh the page.");
    }
  }
  
  updateGameState(gameState) {
    this.gameState = gameState;
    
    // Log the game state details
    console.log("Game state updated:", {
      gameId: gameState.gameId,
      status: gameState.status,
      currentPlayer: gameState.currentPlayerId,
      phase: gameState.turnPhase,
      cardsInDeck: gameState.cardsInDeck
    });
    
    // Update UI with new state
    this.ui.updateGameState(gameState);
  }
  
  // Game actions
  makeMove(moveData) {
    console.log("Making move:", moveData);
    return this.network.sendGameAction(moveData.action, moveData);
  }
  
  sendChatMessage(message) {
    return this.network.sendChatMessage(message);
  }
  
  surrenderGame() {
    return this.network.sendGameAction('surrender');
  }
}
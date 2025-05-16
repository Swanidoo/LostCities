import { NetworkClient } from './network_client.js';
import { UIController } from './ui_controller.js';

export class GameController {
  constructor(gameId) {
    console.log("Initializing game controller for game:", gameId);
    
    // Game properties
    this.gameId = gameId;
    this.userId = localStorage.getItem('user_id'); // GARDÉ - juste l'ID pour le cache
    // SUPPRIMÉ: this.token = localStorage.getItem('authToken');
    this.gameState = null;
    
    // SUPPRIMÉ: la validation du token
    
    if (!this.userId) {
      console.error("No user ID found");
      // SUPPRIMÉ: Try to extract from token
    }
    
    // Initialize components
    this._initComponents();
  }
  
  // SUPPRIMÉ: _extractUserIdFromToken method
  
  _initComponents() {
    // Create UI controller
    this.ui = new UIController(this);
    
    // Initialize network client with callbacks - PLUS DE TOKEN
    this.network = new NetworkClient(this.gameId, {
      onConnect: this._handleConnect.bind(this),
      onMessage: this._handleMessage.bind(this),
      onDisconnect: this._handleDisconnect.bind(this),
      onError: this._handleError.bind(this),
      autoConnect: true
    });
    
    // Set up UI event handlers
    this._setupUIHandlers();
  }
  
  _setupUIHandlers() {
    // Register UI callbacks
    this.ui.setMoveHandler(this.makeMove.bind(this));
    this.ui.setChatHandler(this.sendChatMessage.bind(this));
    this.ui.setSurrenderHandler(this.surrenderGame.bind(this));
  }
  
  // Network event handlers
  _handleConnect() {
    console.log("Connected to game server");
    this.ui.setGameMessage("Connected to game server. Loading game...");
    
    // Load initial game state
    this._fetchInitialGameState();
  }
  
  _handleMessage(data) {
    console.log("Received game message:", data);
    
    if (!data || !data.event) return;
    
    switch (data.event) {
      case 'gameUpdate':
      case 'gameUpdated':
        if (data.data && data.data.gameState) {
          this.updateGameState(data.data.gameState);
        }
        break;
        
      case 'chatMessage':
        if (data.data) {
          this.ui.addChatMessage(data.data.username, data.data.message);
        }
        break;
        
      case 'systemMessage':
        if (data.data && data.data.message) {
          this.ui.addSystemMessage(data.data.message);
        }
        break;
    }
  }
  
  _handleDisconnect(event) {
    console.log("Disconnected from game server:", event);
    this.ui.setGameMessage("Disconnected from game server. Trying to reconnect...");
  }
  
  _handleError(error) {
    console.error("Game server error:", error);
    this.ui.setGameMessage("Error connecting to game server");
  }
  
  // Game state management
  async _fetchInitialGameState() {
    try {
        // Build the API URL
        const apiUrl = window.location.hostname === "localhost" 
            ? "http://localhost:3000" 
            : "https://lostcitiesbackend.onrender.com";
        
        const response = await fetch(`${apiUrl}/lost-cities/games/${this.gameId}`, {
            credentials: 'include' // AJOUTÉ
        });
        
        if (!response.ok) {
            throw new Error(`Failed to fetch game state: ${response.status}`);
        }
        
        const gameState = await response.json();
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
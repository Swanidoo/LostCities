// frontend/game/js/lost_cities_main.js

import GameWebSocket from './game_websocket.js';
import GameUIController from './game_ui_controller.js';
import FallbackGameLogic from './lost_cities_fallback.js';

class LostCitiesGameController {
    constructor() {
        // Get game ID and user ID from hidden inputs
        this.gameId = document.getElementById('game-id').value;
        this.userId = document.getElementById('current-user-id').value;
        
        // Get player names from the HTML
        this.playerName = document.querySelector('.player-info:first-child .player-name').textContent;
        this.opponentName = document.querySelector('.player-info:last-child .player-name').textContent;
        
        // Initialize UI controller
        this.ui = new GameUIController(this.gameId, this.userId);
        
        // Initialize WebSocket
        this.ws = new GameWebSocket(this.gameId, this.userId);
        
        // Initialize fallback game logic
        this.fallbackLogic = new FallbackGameLogic(
            this.gameId, 
            this.userId, 
            null, // Opponent ID will be set when available
            this.playerName,
            this.opponentName
        );
        
        // Track connection status
        this.isConnected = false;
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3;
        this.usingFallback = false;
        
        // Set up event handlers
        this.setupEventHandlers();
        
        // Initialize the UI
        this.ui.initialize();
        
        // Connect to WebSocket
        this.ws.connect();
        
        // Set a timeout to switch to fallback mode if connection fails
        this.connectionTimeout = setTimeout(() => {
            if (!this.isConnected && !this.usingFallback) {
                this.switchToFallbackMode();
            }
    
    // Switch to fallback mode when server connection fails
    switchToFallbackMode() {
        if (this.usingFallback) {
            return; // Already using fallback
        }
        
        console.log('Switching to fallback mode');
        this.usingFallback = true;
        
        // Update UI to show fallback mode is active
        this.ui.updateGameStatus('Unable to connect to game server. Running in offline mode.');
        
        // Initialize the fallback logic with a starting state
        const initialState = this.fallbackLogic.getGameState();
        this.ui.updateGameState(initialState);
        
        // Show a warning about fallback mode
        setTimeout(() => {
            alert('Unable to connect to the game server. The game will run in offline mode with a simulated opponent. Your progress will not be saved to the server.');
        }, 500);
    }
        }, 5000);
        
        console.log(`Game controller initialized for game ${this.gameId} and user ${this.userId}`);
    }
    
    setupEventHandlers() {
        // WebSocket event handlers
        this.ws.onConnect = () => {
            console.log('Connected to game server');
            this.isConnected = true;
            clearTimeout(this.connectionTimeout);
            
            this.ui.updateGameStatus('Connected to game server. Waiting for game state...');
            
            // Request initial game state
            setTimeout(() => this.ws.requestGameState(), 500);
        };
        
        this.ws.onDisconnect = (event) => {
            console.log('Disconnected from game server', event);
            this.isConnected = false;
            
            // Only show reconnect message if not using fallback
            if (!this.usingFallback) {
                this.ui.updateGameStatus('Disconnected from game server. Trying to reconnect...');
                
                // Try fallback after multiple failed attempts
                this.connectionAttempts++;
                if (this.connectionAttempts >= this.maxConnectionAttempts) {
                    this.switchToFallbackMode();
                }
            }
        };
        
        this.ws.onError = (error) => {
            console.error('Game server error', error);
            
            // Only show error if not using fallback
            if (!this.usingFallback) {
                this.ui.updateGameStatus('Error connecting to game server.');
                
                // Try fallback after error
                this.connectionAttempts++;
                if (this.connectionAttempts >= this.maxConnectionAttempts) {
                    this.switchToFallbackMode();
                }
            }
        };
        
        this.ws.onGameUpdate = (gameState) => {
            console.log('Game state updated', gameState);
            
            // If we get a valid game state from server, disable fallback mode
            if (this.usingFallback) {
                console.log('Switching back to server mode from fallback');
                this.usingFallback = false;
            }
            
            this.ui.updateGameState(gameState);
            
            // If opponent ID wasn't set yet, set it in fallback logic
            if (gameState.player1.id !== this.userId) {
                this.fallbackLogic.opponentId = gameState.player1.id;
            } else if (gameState.player2.id !== this.userId) {
                this.fallbackLogic.opponentId = gameState.player2.id;
            }
        };
        
        this.ws.onPlayerJoined = (data) => {
            console.log('Player joined', data);
            this.ui.updateGameStatus(`${data.username} has joined the game.`);
            
            // Request updated game state
            setTimeout(() => this.ws.requestGameState(), 500);
        };
        
        this.ws.onPlayerLeft = (data) => {
            console.log('Player left', data);
            this.ui.updateGameStatus(`${data.username} has left the game.`);
            
            // Request updated game state
            setTimeout(() => this.ws.requestGameState(), 500);
        };
        
        // Fallback game logic event handler
        this.fallbackLogic.setOnStateChange((gameState) => {
            if (this.usingFallback) {
                console.log('Fallback game state updated', gameState);
                this.ui.updateGameState(gameState);
            }
        });
        
        // UI event handlers
        this.ui.onPlayCard = (cardId, color) => {
            console.log(`Playing card ${cardId} to ${color} expedition`);
            
            if (this.usingFallback) {
                this.fallbackLogic.playCard(cardId, color);
            } else {
                this.ws.playCard(cardId, color);
            }
        };
        
        this.ui.onDiscardCard = (cardId) => {
            console.log(`Discarding card ${cardId}`);
            
            if (this.usingFallback) {
                this.fallbackLogic.discardCard(cardId);
            } else {
                this.ws.discardCard(cardId);
            }
        };
        
        this.ui.onDrawFromDeck = () => {
            console.log('Drawing card from deck');
            
            if (this.usingFallback) {
                this.fallbackLogic.drawFromDeck();
            } else {
                this.ws.drawCardFromDeck();
            }
        };
        
        this.ui.onDrawFromDiscardPile = (color) => {
            console.log(`Drawing card from ${color} discard pile`);
            
            if (this.usingFallback) {
                this.fallbackLogic.drawFromDiscardPile(color);
            } else {
                this.ws.drawCardFromDiscardPile(color);
            }
        };
        
        this.ui.onSurrender = () => {
            console.log('Surrendering game');
            
            if (this.usingFallback) {
                // In fallback mode, just end the game with opponent as winner
                this.fallbackLogic.currentState.status = 'finished';
                this.fallbackLogic.currentState.winner = this.fallbackLogic.opponentId;
                this.fallbackLogic.notifyStateChange();
            } else {
                this.ws.surrender();
            }
        };
        
        this.ui.onSendChatMessage = (message) => {
            console.log('Sending chat message', message);
            
            if (this.usingFallback) {
                // In fallback mode, just show the message locally
                this.ui.addChatMessage(this.playerName, message, true);
            } else {
                this.ws.sendChatMessage(message);
            }
        };
    }
}

// Initialize the game controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.gameController = new LostCitiesGameController();
    } catch (error) {
        console.error('Error initializing game controller:', error);
        alert('There was an error initializing the game. Please refresh the page and try again.');
    }
});
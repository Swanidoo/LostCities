/**
 * Lost Cities Game Logic
 * Handles the core gameplay mechanics and UI interactions
 */

import { LostCitiesApiClient } from './lost_cities_api_client.js';

export class LostCitiesGame {
    constructor() {
        // Game configuration & state
        this.gameId = null;
        this.gameState = null;
        this.userId = null;
        this.isPlayerTurn = false;
        this.currentPhase = null; // 'play' or 'draw'
        this.selectedCard = null;
        this.selectedSource = null;
        
        // DOM elements
        this.elements = {
            board: document.querySelector('.game-board'),
            playerHand: document.querySelector('.player-hand'),
            playerExpeditions: document.querySelector('.player-expeditions'),
            opponentExpeditions: document.querySelector('.opponent-expeditions'),
            discardPiles: document.querySelectorAll('.discard-pile'),
            deck: document.querySelector('.deck'),
            gameMessage: document.querySelector('.game-message'),
            playerTurnIndicator: document.querySelector('.player-info:first-child .player-turn-indicator'),
            opponentTurnIndicator: document.querySelector('.player-info:last-child .player-turn-indicator'),
            playerScore: document.querySelector('.player-info:first-child .player-score'),
            opponentScore: document.querySelector('.player-info:last-child .player-score'),
            gameStats: document.querySelector('.game-stats'),
            btnSurrender: document.getElementById('btn-surrender'),
            btnHelp: document.getElementById('btn-help'),
            btnChat: document.getElementById('btn-chat')
        };
        
        // API client
        this.apiClient = new LostCitiesApiClient();
    }
    
    /**
     * Initialize the game
     */
    async init() {
        // Get game ID from URL or hidden input
        this.gameId = document.getElementById('game-id').value || 
            new URLSearchParams(window.location.search).get('gameId');
        
        // Get current user ID
        this.userId = document.getElementById('current-user-id').value || 
            localStorage.getItem('userId');
        
        if (!this.gameId) {
            this.showError('Game ID not found');
            return false;
        }
        
        if (!this.userId) {
            this.showError('User ID not found');
            return false;
        }
        
        // Set API client callbacks
        this.apiClient.setCallbacks({
            onGameUpdate: this.handleGameUpdate.bind(this),
            onChatMessage: this.handleChatMessage.bind(this),
            onSystemMessage: this.handleSystemMessage.bind(this),
            onConnectionChange: this.handleConnectionChange.bind(this),
            onError: this.showError.bind(this)
        });
        
        // Initialize WebSocket connection
        const connected = this.apiClient.initWebSocket();
        if (!connected) {
            this.showError('Failed to connect to game server');
            return false;
        }
        
        // Subscribe to game updates
        this.apiClient.subscribeToGame(this.gameId);
        
        // Fetch initial game state
        try {
            await this.apiClient.fetchGameState(this.gameId);
        } catch (error) {
            this.showError('Failed to load game state');
            return false;
        }
        
        // Set up event listeners
        this.setupEventListeners();
        
        return true;
    }
    
    /**
     * Set up event listeners for game interactions
     */
    setupEventListeners() {
        // Hand cards
        this.elements.playerHand.addEventListener('click', this.handleCardClick.bind(this));
        
        // Expedition slots
        this.elements.playerExpeditions.addEventListener('click', this.handleExpeditionClick.bind(this));
        
        // Discard piles
        Array.from(this.elements.discardPiles).forEach(pile => {
            pile.addEventListener('click', this.handleDiscardPileClick.bind(this));
        });
        
        // Deck
        this.elements.deck.addEventListener('click', this.handleDeckClick.bind(this));
        
        // Game controls
        this.elements.btnSurrender.addEventListener('click', this.handleSurrenderClick.bind(this));
        this.elements.btnHelp.addEventListener('click', this.handleHelpClick.bind(this));
        this.elements.btnChat.addEventListener('click', this.handleChatClick.bind(this));
    }
    
    /**
     * Handle game state updates
     * @param {Object} gameState - Current game state
     */
    handleGameUpdate(gameState) {
        // Store the game state
        this.gameState = gameState;
        
        // Determine if it's the player's turn
        this.isPlayerTurn = gameState.currentPlayerId === this.userId;
        this.currentPhase = gameState.turnPhase;
        
        // Render game state
        this.renderGameState();
        
        // Check for game end
        if (gameState.status === 'finished') {
            this.showGameEnd();
        }
    }
    
    /**
     * Render the current game state
     */
    renderGameState() {
        if (!this.gameState) return;
        
        // Clear existing card displays
        this.clearGameBoard();
        
        // Determine player side (player1 or player2)
        const playerSide = this.gameState.player1.id === this.userId ? 'player1' : 'player2';
        const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
        
        // Render player hand
        if (this.gameState[playerSide].hand) {
            this.renderPlayerHand(this.gameState[playerSide].hand);
        }
        
        // Render player expeditions
        this.renderExpeditions(this.gameState[playerSide].expeditions, this.elements.playerExpeditions);
        
        // Render opponent expeditions
        this.renderExpeditions(this.gameState[opponentSide].expeditions, this.elements.opponentExpeditions);
        
        // Render discard piles
        this.renderDiscardPiles(this.gameState.discardPiles);
        
        // Update deck count
        this.elements.deck.setAttribute('data-count', this.gameState.cardsInDeck);
        
        // Update scores
        this.updateScores();
        
        // Update turn indicators
        this.updateTurnIndicators();
        
        // Update game message
        this.updateGameMessage();
        
        // Update game stats
        this.updateGameStats();
        
        // Show/hide purple expedition if needed
        this.togglePurpleExpedition(this.gameState.usePurpleExpedition);
    }
    
    /**
     * Clear all cards from the game board
     */
    clearGameBoard() {
        this.elements.playerHand.innerHTML = '';
        
        const expeditionStacks = document.querySelectorAll('.expedition-stack');
        expeditionStacks.forEach(stack => stack.innerHTML = '');
        
        Array.from(this.elements.discardPiles).forEach(pile => {
            while (pile.lastChild) {
                pile.removeChild(pile.lastChild);
            }
        });
    }
    
    /**
     * Render player's hand
     * @param {Array} cards - Array of card objects
     */
    renderPlayerHand(cards) {
        cards.forEach((card, index) => {
            const cardElement = this.createCardElement(card);
            cardElement.dataset.index = index;
            cardElement.dataset.location = 'hand';
            
            // Add click event through delegation (handled in setupEventListeners)
            this.elements.playerHand.appendChild(cardElement);
        });
    }
    
    /**
     * Render expeditions
     * @param {Object} expeditions - Object with color keys and card arrays
     * @param {Element} container - Container element
     */
    renderExpeditions(expeditions, container) {
        const colors = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
        
        colors.forEach(color => {
            const cards = expeditions[color] || [];
            const slotElement = container.querySelector(`.expedition-slot.${color} .expedition-stack`);
            
            if (slotElement) {
                cards.forEach((card, index) => {
                    const cardElement = this.createCardElement(card);
                    cardElement.dataset.index = index;
                    cardElement.dataset.location = 'expedition';
                    cardElement.dataset.color = color;
                    
                    slotElement.appendChild(cardElement);
                });
                
                // Add expedition score if there are cards
                if (cards.length > 0) {
                    const score = this.calculateExpeditionScore(cards);
                    const scoreElement = document.createElement('div');
                    scoreElement.className = `expedition-score ${score >= 0 ? 'positive' : 'negative'}`;
                    scoreElement.textContent = score > 0 ? `+${score}` : score;
                    slotElement.appendChild(scoreElement);
                }
            }
        });
    }
    
    /**
     * Render discard piles
     * @param {Object} discardPiles - Object with color keys and card arrays
     */
    renderDiscardPiles(discardPiles) {
        const colors = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
        
        colors.forEach(color => {
            const pile = this.elements.board.querySelector(`.discard-pile.${color}`);
            const cards = discardPiles[color] || [];
            
            // Show only the top card
            if (cards.length > 0) {
                const topCard = cards[cards.length - 1];
                const cardElement = this.createCardElement(topCard);
                cardElement.dataset.location = 'discard';
                cardElement.dataset.color = color;
                
                pile.appendChild(cardElement);
                
                // Add a count indicator if more than one card
                if (cards.length > 1) {
                    const countElement = document.createElement('div');
                    countElement.className = 'pile-count';
                    countElement.textContent = cards.length;
                    pile.appendChild(countElement);
                }
            }
        });
    }
    
    /**
     * Create a card DOM element
     * @param {Object} card - Card data
     * @returns {Element} Card element
     */
    createCardElement(card) {
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.type}`;
        cardElement.dataset.id = card.id;
        cardElement.dataset.color = card.color;
        cardElement.dataset.type = card.type;
        cardElement.dataset.value = card.value;
        
        const cardInner = document.createElement('div');
        cardInner.className = 'card-inner';
        
        const colorBar = document.createElement('div');
        colorBar.className = `card-color ${card.color}`;
        
        const valueElement = document.createElement('div');
        valueElement.className = 'card-value';
        valueElement.textContent = card.type === 'wager' ? 'W' : card.value;
        
        cardInner.appendChild(colorBar);
        cardInner.appendChild(valueElement);
        cardElement.appendChild(cardInner);
        
        return cardElement;
    }
    
    /**
     * Calculate expedition score
     * @param {Array} cards - Array of card objects
     * @returns {number} Score
     */
    calculateExpeditionScore(cards) {
        // Count wager cards
        const wagerCount = cards.filter(card => card.type === 'wager').length;
        
        // Sum expedition card values
        let expeditionSum = 0;
        cards.forEach(card => {
            if (card.type === 'expedition' && typeof card.value === 'number') {
                expeditionSum += card.value;
            }
        });
        
        // Subtract expedition cost (20 points)
        let expeditionScore = expeditionSum - 20;
        
        // Apply wager multiplier (if any)
        if (wagerCount > 0) {
            expeditionScore *= (wagerCount + 1);
        }
        
        // Apply expedition bonus (if 8 or more cards)
        if (cards.length >= 8) {
            expeditionScore += 20;
        }
        
        return expeditionScore;
    }
    
    /**
     * Update score displays
     */
    updateScores() {
        if (!this.gameState || !this.gameState.scores) return;
        
        const playerSide = this.gameState.player1.id === this.userId ? 'player1' : 'player2';
        const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
        
        this.elements.playerScore.textContent = `Score: ${this.gameState.scores[playerSide].total}`;
        this.elements.opponentScore.textContent = `Score: ${this.gameState.scores[opponentSide].total}`;
    }
    
    /**
     * Update turn indicators
     */
    updateTurnIndicators() {
        this.elements.playerTurnIndicator.textContent = this.isPlayerTurn ? 'Your Turn' : 'Waiting';
        this.elements.opponentTurnIndicator.textContent = this.isPlayerTurn ? 'Waiting' : 'Their Turn';
        
        this.elements.playerTurnIndicator.classList.toggle('active', this.isPlayerTurn);
        this.elements.opponentTurnIndicator.classList.toggle('active', !this.isPlayerTurn);
    }
    
    /**
     * Update game message based on current game state
     */
    updateGameMessage() {
        if (!this.gameState) return;
        
        let message = '';
        
        if (this.gameState.status === 'finished') {
            const isWinner = this.gameState.winner === this.userId;
            message = isWinner ? 'You won the game!' : 'You lost the game.';
        } else if (this.isPlayerTurn) {
            if (this.currentPhase === 'play') {
                message = 'Your turn. Play or discard a card.';
            } else if (this.currentPhase === 'draw') {
                message = 'Now draw a card from the deck or a discard pile.';
            }
        } else {
            message = "Opponent's turn. Please wait...";
        }
        
        this.elements.gameMessage.textContent = message;
    }
    
    /**
     * Update game stats
     */
    updateGameStats() {
        if (!this.gameState) return;
        
        this.elements.gameStats.textContent = 
            `Round: ${this.gameState.currentRound}/${this.gameState.totalRounds} | Cards in deck: ${this.gameState.cardsInDeck}`;
    }
    
    /**
     * Show/hide purple expedition based on game settings
     * @param {boolean} show - Whether to show purple expedition
     */
    togglePurpleExpedition(show) {
        const purpleElements = document.querySelectorAll('.purple');
        
        purpleElements.forEach(element => {
            element.style.display = show ? 'block' : 'none';
        });
    }
    
    /**
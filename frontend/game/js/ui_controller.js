/**
 * UI Controller for Lost Cities Game
 * Handles all DOM manipulation and UI events
 */
export class UIController {
    constructor(gameController) {
      this.gameController = gameController;
      this.gameState = null;
      this.selectedCard = null;
      this.cardElements = new Map();
      
      // Event handlers
      this.onMove = null;
      this.onChat = null;
      this.onSurrender = null;
      
      // Initialize DOM elements
      this.initElements();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Show loading state initially
      this.showLoading(true);
    }
    
    /**
     * Initialize all DOM element references with null checks
     */
    initElements() {
      // Cache DOM elements safely - each with null check
      this.elements = {
        // Game info elements
        gameStatus: document.getElementById('game-status'),
        phaseIndicator: document.getElementById('phase-indicator'),
        playerName: document.getElementById('player-name'),
        opponentName: document.getElementById('opponent-name'),
        playerScore: document.getElementById('player-score'),
        opponentScore: document.getElementById('opponent-score'),
        gameRound: document.getElementById('game-round'),
        deckCount: document.getElementById('deck-count'),
        playerTurn: document.getElementById('player-turn'),
        opponentTurn: document.getElementById('opponent-turn'),
        
        // Game areas
        playerHand: document.getElementById('player-hand'),
        playerArea: document.getElementById('player-area'),
        opponentArea: document.getElementById('opponent-area'),
        deckPile: document.getElementById('deck-pile'),
        
        // Action elements
        actionButtons: document.getElementById('action-buttons'),
        playBtn: document.getElementById('play-btn'),
        discardBtn: document.getElementById('discard-btn'),
        cancelActionBtn: document.getElementById('cancel-action-btn'),
        
        // Game controls
        rulesBtn: document.getElementById('rules-btn'),
        surrenderBtn: document.getElementById('surrender-btn'),
        chatBtn: document.getElementById('chat-btn'),
        
        // Chat elements
        chatArea: document.getElementById('chat-area'),
        closeChatBtn: document.getElementById('close-chat-btn'),
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        sendChatBtn: document.getElementById('send-chat-btn'),
        
        // Modals
        rulesModal: document.getElementById('rules-modal'),
        closeRulesBtn: document.getElementById('close-rules-btn'),
        surrenderModal: document.getElementById('surrender-modal'),
        confirmSurrenderBtn: document.getElementById('confirm-surrender-btn'),
        cancelSurrenderBtn: document.getElementById('cancel-surrender-btn'),
        gameEndModal: document.getElementById('game-end-modal'),
        
        // End game details
        gameResult: document.getElementById('game-result'),
        winnerText: document.getElementById('winner-text'),
        playerFinalName: document.getElementById('player-final-name'),
        opponentFinalName: document.getElementById('opponent-final-name'),
        playerFinalScore: document.getElementById('player-final-score'),
        opponentFinalScore: document.getElementById('opponent-final-score'),
        newGameBtn: document.getElementById('new-game-btn'),
        backBtn: document.getElementById('back-btn'),
        
        // Loading element
        loadingOverlay: document.getElementById('loading-overlay')
      };
      
      // Log missing elements (for debugging)
      const missingElements = Object.entries(this.elements)
        .filter(([key, element]) => !element)
        .map(([key]) => key);
      
      if (missingElements.length > 0) {
        console.warn("Missing UI elements:", missingElements.join(', '));
      }
    }
    
    /**
     * Set up all event listeners for UI elements
     */
    setupEventListeners() {
      // Set up handlers only if elements exist
      
      // Card action buttons
      if (this.elements.playBtn) {
        this.elements.playBtn.addEventListener('click', () => this.handlePlayButtonClick());
      }
      
      if (this.elements.discardBtn) {
        this.elements.discardBtn.addEventListener('click', () => this.handleDiscardButtonClick());
      }
      
      if (this.elements.cancelActionBtn) {
        this.elements.cancelActionBtn.addEventListener('click', () => this.cancelCardSelection());
      }
      
      // Game control buttons
      if (this.elements.rulesBtn) {
        this.elements.rulesBtn.addEventListener('click', () => this.showRules(true));
      }
      
      if (this.elements.closeRulesBtn) {
        this.elements.closeRulesBtn.addEventListener('click', () => this.showRules(false));
      }
      
      if (this.elements.surrenderBtn) {
        this.elements.surrenderBtn.addEventListener('click', () => this.showSurrenderConfirm(true));
      }
      
      if (this.elements.confirmSurrenderBtn) {
        this.elements.confirmSurrenderBtn.addEventListener('click', () => this.handleSurrender());
      }
      
      if (this.elements.cancelSurrenderBtn) {
        this.elements.cancelSurrenderBtn.addEventListener('click', () => this.showSurrenderConfirm(false));
      }
      
      // Chat controls
      if (this.elements.chatBtn) {
        this.elements.chatBtn.addEventListener('click', () => this.toggleChat());
      }
      
      if (this.elements.closeChatBtn) {
        this.elements.closeChatBtn.addEventListener('click', () => this.toggleChat(false));
      }
      
      if (this.elements.sendChatBtn) {
        this.elements.sendChatBtn.addEventListener('click', () => this.handleSendChat());
      }
      
      if (this.elements.chatInput) {
        this.elements.chatInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            this.handleSendChat();
          }
        });
      }
      
      // End game buttons
      if (this.elements.newGameBtn) {
        this.elements.newGameBtn.addEventListener('click', () => {
          window.location.href = '/matchmaking.html';
        });
      }
      
      if (this.elements.backBtn) {
        this.elements.backBtn.addEventListener('click', () => {
          window.location.href = '/index.html';
        });
      }
    }
    
    /**
     * Update the game state and refresh UI
     */
    updateGameState(gameState) {
      if (!gameState) {
        console.error("Invalid game state provided");
        return;
      }
      
      // Store the new game state
      this.gameState = gameState;
      
      // Determine player side (player1 or player2)
      const userId = this.gameController.userId;
      this.isPlayer1 = gameState.player1.id == userId;
      this.playerSide = this.isPlayer1 ? 'player1' : 'player2';
      this.opponentSide = this.isPlayer1 ? 'player2' : 'player1';
      
      // Determine if it's the player's turn
      this.isPlayerTurn = gameState.currentPlayerId == userId;
      this.currentPhase = gameState.turnPhase;
      
      // Hide loading screen
      this.showLoading(false);
      
      // Update UI components
      this.updateGameInfo();
      this.updatePlayerHand();
      this.updateExpeditions();
      this.updateDiscardPiles();
      this.updateTurnIndicators();
      this.updateGameStatusMessage();
      
      // Check if game is over
      if (gameState.status === 'finished') {
        this.showGameEnd();
      }
    }
    
    /**
     * Update general game information
     */
    updateGameInfo() {
      // Safely update elements with null checks
      if (!this.gameState) return;
      
      // Update player names
      if (this.elements.playerName) {
        this.elements.playerName.textContent = this.gameState[this.playerSide].name || 
          (this.isPlayer1 ? 'Vous (J1)' : 'Vous (J2)');
      }
      
      if (this.elements.opponentName) {
        this.elements.opponentName.textContent = this.gameState[this.opponentSide].name || 
          (this.isPlayer1 ? 'Adversaire (J2)' : 'Adversaire (J1)');
      }
      
      // Update scores
      if (this.elements.playerScore) {
        this.elements.playerScore.textContent = `Score: ${this.gameState.scores[this.playerSide].total}`;
      }
      
      if (this.elements.opponentScore) {
        this.elements.opponentScore.textContent = `Score: ${this.gameState.scores[this.opponentSide].total}`;
      }
      
      // Update round and deck info
      if (this.elements.gameRound) {
        this.elements.gameRound.textContent = `Manche: ${this.gameState.currentRound}/${this.gameState.totalRounds}`;
      }
      
      if (this.elements.deckCount) {
        this.elements.deckCount.textContent = `Cartes: ${this.gameState.cardsInDeck}`;
      }
      
      // Update phase indicator
      if (this.elements.phaseIndicator) {
        this.elements.phaseIndicator.textContent = `Phase: ${this.currentPhase === 'play' ? 'Jouer' : 'Piocher'}`;
      }
      
      // Update deck pile count
      if (this.elements.deckPile) {
        this.elements.deckPile.dataset.count = this.gameState.cardsInDeck;
      }
    }
    
    /**
     * Update the player's hand display
     */
    updatePlayerHand() {
      const handElement = this.elements.playerHand;
      if (!handElement || !this.gameState) return;
      
      // Clear existing cards
      handElement.innerHTML = '';
      this.cardElements.clear();
      
      // Get player hand
      const hand = this.gameState[this.playerSide].hand || [];
      
      if (hand.length === 0) {
        // Show empty hand message
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'empty-hand';
        emptyMsg.textContent = 'Votre main est vide';
        handElement.appendChild(emptyMsg);
        return;
      }
      
      // Create and add cards
      hand.forEach(card => {
        const cardElement = this.createCardElement(card);
        
        // Add selectable class if it's player's turn and play phase
        if (this.isPlayerTurn && this.currentPhase === 'play') {
          cardElement.classList.add('selectable');
        }
        
        // Add click handler
        cardElement.addEventListener('click', () => {
          this.handleCardClick(card, cardElement);
        });
        
        // Store reference to card element
        this.cardElements.set(card.id, cardElement);
        
        // Add to hand
        handElement.appendChild(cardElement);
      });
    }
    
    /**
     * Update expedition areas for both players
     */
    updateExpeditions() {
      if (!this.gameState) return;
      
      const playerExpeditions = this.gameState[this.playerSide].expeditions;
      const opponentExpeditions = this.gameState[this.opponentSide].expeditions;
      
      // Update player expeditions
      this.updatePlayerExpeditionArea(playerExpeditions, this.elements.playerArea);
      
      // Update opponent expeditions
      this.updatePlayerExpeditionArea(opponentExpeditions, this.elements.opponentArea, true);
    }
    
    /**
     * Update a player's expedition area
     */
    updatePlayerExpeditionArea(expeditions, areaElement, isOpponent = false) {
      if (!areaElement || !expeditions) return;
      
      // Get all expedition slots in this area
      const expeditionSlots = areaElement.querySelectorAll('.expedition-slot');
      
      // Process each slot
      expeditionSlots.forEach(slot => {
        // Clear current cards
        slot.innerHTML = '';
        
        // Get color from slot
        const color = slot.dataset.color;
        if (!color) return;
        
        // Get cards for this expedition
        const cards = expeditions[color] || [];
        
        // Create a stack container
        const stackElement = document.createElement('div');
        stackElement.className = 'expedition-stack';
        slot.appendChild(stackElement);
        
        // Add cards to stack
        cards.forEach((card, index) => {
          const cardElement = this.createCardElement(card);
          cardElement.style.position = 'absolute';
          cardElement.style.top = `${index * 20}px`;
          stackElement.appendChild(cardElement);
        });
        
        // Add click handler for player expedition slots
        if (!isOpponent && this.isPlayerTurn && this.currentPhase === 'play' && this.selectedCard) {
          // Check if selected card can be played to this expedition
          const selectedCard = this.selectedCard;
          if (selectedCard.color === color) {
            slot.classList.add('valid-target');
            slot.addEventListener('click', () => {
              this.handleExpeditionClick(color);
            });
          }
        }
      });
    }
    
    /**
     * Update discard piles
     */
    updateDiscardPiles() {
      if (!this.gameState) return;
      
      // Get all discard piles
      const discardPiles = document.querySelectorAll('.discard-pile');
      if (!discardPiles.length) return;
      
      // Update each pile
      discardPiles.forEach(pile => {
        // Clear current cards
        pile.innerHTML = '';
        
        // Get color from element
        const color = pile.dataset.color;
        if (!color) return;
        
        // Get cards for this pile
        const cards = this.gameState.discardPiles[color] || [];
        
        // If empty, show empty state
        if (cards.length === 0) {
          pile.classList.add('empty');
          
          const emptyElement = document.createElement('div');
          emptyElement.className = 'empty-pile';
          pile.appendChild(emptyElement);
          
        } else {
          // Show top card
          pile.classList.remove('empty');
          const topCard = cards[cards.length - 1];
          const cardElement = this.createCardElement(topCard);
          pile.appendChild(cardElement);
          
          // Add card count if multiple cards
          if (cards.length > 1) {
            const countElement = document.createElement('div');
            countElement.className = 'pile-count';
            countElement.textContent = cards.length;
            pile.appendChild(countElement);
          }
        }
        
        // Add interactivity based on game phase
        if (this.isPlayerTurn) {
          if (this.currentPhase === 'play' && this.selectedCard) {
            // In play phase with selected card, discard pile is a target if card color matches
            if (this.selectedCard.color === color) {
              pile.classList.add('valid-target');
              pile.addEventListener('click', () => {
                this.handleDiscardClick(color);
              });
            }
          } else if (this.currentPhase === 'draw' && cards.length > 0) {
            // In draw phase, discard piles with cards are targets
            pile.classList.add('valid-target');
            pile.addEventListener('click', () => {
              this.handleDiscardPileClick(color);
            });
          }
        }
      });
      
      // Add click handler to deck in draw phase
      if (this.elements.deckPile && this.isPlayerTurn && this.currentPhase === 'draw') {
        this.elements.deckPile.classList.add('valid-target');
        this.elements.deckPile.addEventListener('click', () => {
          this.handleDeckClick();
        });
      } else if (this.elements.deckPile) {
        this.elements.deckPile.classList.remove('valid-target');
      }
    }
    
    /**
     * Update turn indicators
     */
    updateTurnIndicators() {
      if (!this.elements.playerTurn || !this.elements.opponentTurn) return;
      
      // Update player turn indicator
      this.elements.playerTurn.textContent = this.isPlayerTurn ? 'Votre tour' : 'En attente';
      this.elements.playerTurn.classList.toggle('active', this.isPlayerTurn);
      
      // Update opponent turn indicator
      this.elements.opponentTurn.textContent = this.isPlayerTurn ? 'En attente' : 'Tour adverse';
      this.elements.opponentTurn.classList.toggle('active', !this.isPlayerTurn);
    }
    
    /**
     * Update the game status message
     */
    updateGameStatusMessage() {
      if (!this.elements.gameStatus || !this.gameState) return;
      
      let message = '';
      
      if (this.gameState.status === 'finished') {
        const isWinner = this.gameState.winner == this.gameController.userId;
        message = isWinner ? 'Partie terminée. Vous avez gagné !' : 'Partie terminée. Vous avez perdu.';
      } else if (this.isPlayerTurn) {
        message = this.currentPhase === 'play' ?
          'À vous de jouer. Jouez ou défaussez une carte.' :
          'Piochez une carte du paquet ou d\'une défausse.';
      } else {
        message = 'En attente de l\'autre joueur...';
      }
      
      this.elements.gameStatus.textContent = message;
    }
    
    /**
     * Create a card element from card data
     */
    createCardElement(card) {
      if (!card) return null;
      
      const cardElement = document.createElement('div');
      cardElement.className = `card ${card.color} ${card.type}`;
      cardElement.dataset.id = card.id;
      cardElement.dataset.color = card.color;
      cardElement.dataset.type = card.type;
      cardElement.dataset.value = card.value;
      
      const cardContent = document.createElement('div');
      cardContent.className = 'card-content';
      
      const valueElement = document.createElement('div');
      valueElement.className = 'card-value';
      valueElement.textContent = card.type === 'wager' ? 'W' : card.value;
      
      cardContent.appendChild(valueElement);
      cardElement.appendChild(cardContent);
      
      return cardElement;
    }
    
    /**
     * Handle card click
     */
    handleCardClick(card, cardElement) {
      if (!this.isPlayerTurn || this.currentPhase !== 'play') {
        return;
      }
      
      // Toggle selection
      if (this.selectedCard && this.selectedCard.id === card.id) {
        this.cancelCardSelection();
      } else {
        // Deselect any previously selected card
        document.querySelectorAll('.card.selected').forEach(el => {
          el.classList.remove('selected');
        });
        
        // Select this card
        this.selectedCard = card;
        cardElement.classList.add('selected');
        
        // Show action buttons
        if (this.elements.actionButtons) {
          this.elements.actionButtons.classList.add('visible');
        }
        
        // Update UI to show potential targets
        this.updateExpeditions();
        this.updateDiscardPiles();
      }
    }
    
    /**
     * Cancel current card selection
     */
    cancelCardSelection() {
      this.selectedCard = null;
      
      // Remove selection highlights
      document.querySelectorAll('.card.selected, .valid-target').forEach(el => {
        el.classList.remove('selected', 'valid-target');
      });
      
      // Hide action buttons
      if (this.elements.actionButtons) {
        this.elements.actionButtons.classList.remove('visible');
      }
      
      // Update UI
      this.updateExpeditions();
      this.updateDiscardPiles();
      this.setGameMessage('Sélection annulée');
    }
    
    /**
     * Handle play button click
     */
    handlePlayButtonClick() {
      if (!this.selectedCard) {
        this.setGameMessage("Vous devez d'abord sélectionner une carte");
        return;
      }
      
      // Look for valid expedition to play to
      const color = this.selectedCard.color;
      this.handleExpeditionClick(color);
    }
    
    /**
     * Handle expedition click
     */
    handleExpeditionClick(color) {
      if (!this.selectedCard || this.currentPhase !== 'play') {
        return;
      }
      
      const cardColor = this.selectedCard.color;
      
      // Check if card can be played to this expedition
      if (cardColor !== color) {
        this.setGameMessage("La couleur de la carte doit correspondre à l'expédition");
        return;
      }
      
      // Trigger move callback
      if (this.onMove) {
        this.onMove({
          action: 'play_card',
          cardId: this.selectedCard.id,
          color: color,
          destination: 'expedition'
        });
      }
      
      // Reset selection
      this.cancelCardSelection();
    }
    
    /**
     * Handle discard button click
     */
    handleDiscardButtonClick() {
      if (!this.selectedCard) {
        this.setGameMessage("Vous devez d'abord sélectionner une carte");
        return;
      }
      
      this.handleDiscardClick(this.selectedCard.color);
    }
    
    /**
     * Handle discard pile click during play phase
     */
    handleDiscardClick(color) {
      if (!this.selectedCard || this.currentPhase !== 'play') {
        return;
      }
      
      // Trigger move callback
      if (this.onMove) {
        this.onMove({
          action: 'discard_card',
          cardId: this.selectedCard.id,
          color: this.selectedCard.color
        });
      }
      
      // Reset selection
      this.cancelCardSelection();
    }
    
    /**
     * Handle discard pile click during draw phase
     */
    handleDiscardPileClick(color) {
      if (this.currentPhase !== 'draw') {
        return;
      }
      
      // Trigger move callback
      if (this.onMove) {
        this.onMove({
          action: 'draw_card',
          source: 'discard_pile',
          color: color
        });
      }
    }
    
    /**
     * Handle deck click
     */
    handleDeckClick() {
      if (this.currentPhase !== 'draw') {
        return;
      }
      
      // Trigger move callback
      if (this.onMove) {
        this.onMove({
          action: 'draw_card',
          source: 'deck'
        });
      }
    }
    
    /**
     * Handle surrender confirmation
     */
    handleSurrender() {
      // Close modal
      this.showSurrenderConfirm(false);
      
      // Trigger surrender callback
      if (this.onSurrender) {
        this.onSurrender();
      }
      
      this.setGameMessage('Vous avez abandonné la partie');
    }
    
    /**
     * Handle sending chat message
     */
    handleSendChat() {
      const chatInput = this.elements.chatInput;
      if (!chatInput) return;
      
      const message = chatInput.value.trim();
      if (!message) return;
      
      // Trigger chat callback
      if (this.onChat) {
        this.onChat(message);
      }
      
      // Add message to chat area
      this.addChatMessage('Vous', message, true);
      
      // Clear input
      chatInput.value = '';
    }
    
    /**
     * Show game rules
     */
    showRules(show = true) {
      if (this.elements.rulesModal) {
        this.elements.rulesModal.classList.toggle('visible', show);
      }
    }
    
    /**
     * Show surrender confirmation
     */
    showSurrenderConfirm(show = true) {
      if (this.elements.surrenderModal) {
        this.elements.surrenderModal.classList.toggle('visible', show);
      }
    }
    
    /**
     * Toggle chat visibility
     */
    toggleChat(show) {
      if (!this.elements.chatArea) return;
      
      if (show === undefined) {
        // Toggle if no value provided
        this.elements.chatArea.classList.toggle('open');
      } else {
        // Set to specified value
        this.elements.chatArea.classList.toggle('open', show);
      }
      
      // Focus chat input if opening
      if (this.elements.chatArea.classList.contains('open') && this.elements.chatInput) {
        this.elements.chatInput.focus();
      }
    }
    
    /**
     * Show loading overlay
     */
    showLoading(show = true) {
      if (this.elements.loadingOverlay) {
        this.elements.loadingOverlay.classList.toggle('hidden', !show);
      }
    }
    
    /**
     * Show game end screen
     */
    showGameEnd() {
      if (!this.elements.gameEndModal || !this.gameState) return;
      
      const playerScore = this.gameState.scores[this.playerSide].total;
      const opponentScore = this.gameState.scores[this.opponentSide].total;
      const isWinner = this.gameState.winner == this.gameController.userId;
      
      // Set title
      if (this.elements.gameResult) {
        this.elements.gameResult.textContent = isWinner ? 'Victoire !' : 'Défaite';
      }
      
      // Set winner text
      if (this.elements.winnerText) {
        this.elements.winnerText.textContent = isWinner ? 
          'Vous avez gagné la partie !' : 
          'Votre adversaire a gagné la partie.';
      }
      
      // Set player names
      if (this.elements.playerFinalName) {
        this.elements.playerFinalName.textContent = 'Vous';
      }
      
      if (this.elements.opponentFinalName) {
        this.elements.opponentFinalName.textContent = 'Adversaire';
      }
      
      // Set scores
      if (this.elements.playerFinalScore) {
        this.elements.playerFinalScore.textContent = playerScore;
      }
      
      if (this.elements.opponentFinalScore) {
        this.elements.opponentFinalScore.textContent = opponentScore;
      }
      
      // Show modal
      this.elements.gameEndModal.classList.add('visible');
    }
    
    /**
     * Add a chat message to the chat area
     */
    addChatMessage(sender, message, isSelf = false) {
      if (!this.elements.chatMessages) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = `chat-message ${isSelf ? 'self' : 'other'}`;
      
      const senderElement = document.createElement('div');
      senderElement.className = 'chat-sender';
      senderElement.textContent = sender;
      
      const textElement = document.createElement('div');
      textElement.className = 'chat-text';
      textElement.textContent = message;
      
      messageElement.appendChild(senderElement);
      messageElement.appendChild(textElement);
      
      this.elements.chatMessages.appendChild(messageElement);
      
      // Scroll to bottom
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
    
    /**
     * Add a system message to the chat
     */
    addSystemMessage(message) {
      if (!this.elements.chatMessages) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message system';
      
      const textElement = document.createElement('div');
      textElement.className = 'chat-text';
      textElement.textContent = message;
      
      messageElement.appendChild(textElement);
      
      this.elements.chatMessages.appendChild(messageElement);
      
      // Scroll to bottom
      this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    }
    
    /**
     * Set a game status message
     */
    setGameMessage(message) {
      if (this.elements.gameStatus) {
        this.elements.gameStatus.textContent = message;
      }
    }
    
    /**
     * Set callback handlers
     */
    setMoveHandler(callback) {
      this.onMove = callback;
    }
    
    setChatHandler(callback) {
      this.onChat = callback;
    }
    
    setSurrenderHandler(callback) {
      this.onSurrender = callback;
    }
  }
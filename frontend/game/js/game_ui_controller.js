/**
 * Game UI Controller
 * Manages the UI state and DOM manipulation for the game
 */

export class GameUIController {
    constructor(gameId, playerId) {
      this.gameId = gameId;
      this.playerId = playerId;
      this.gameState = null;
      this.selectedCard = null;
      this.gamePhase = 'loading'; // 'loading', 'play', 'draw', 'waiting', 'finished'
      
      // DOM elements cache
      this.elements = {
        gameBoard: document.querySelector('.game-board'),
        playerHand: document.querySelector('.player-hand'),
        playerExpeditions: document.querySelector('.player-expeditions'),
        opponentExpeditions: document.querySelector('.opponent-expeditions'),
        discardPiles: document.querySelectorAll('.discard-pile'),
        deck: document.querySelector('.deck'),
        gameMessage: document.querySelector('.game-message'),
        player1Name: document.querySelector('.player-info:first-child .player-name'),
        player1Score: document.querySelector('.player-info:first-child .player-score'),
        player2Name: document.querySelector('.player-info:last-child .player-name'),
        player2Score: document.querySelector('.player-info:last-child .player-score'),
        player1TurnIndicator: document.querySelector('.player-info:first-child .player-turn-indicator'),
        player2TurnIndicator: document.querySelector('.player-info:last-child .player-turn-indicator'),
        gameStats: document.querySelector('.game-stats'),
        btnSurrender: document.getElementById('btn-surrender'),
        btnHelp: document.getElementById('btn-help'),
        btnChat: document.getElementById('btn-chat')
      };
      
      // Set up event listeners
      this.setupEventListeners();
    }
    
    /**
     * Update the UI based on the current game state
     */
    updateGameState(gameState) {
      console.log('Updating game state:', gameState);
      
      if (!gameState) {
        console.error('Cannot update UI: gameState is undefined');
        return;
      }
      
      this.gameState = gameState;
      
      // Update the game phase
      if (gameState.status === 'finished') {
        this.gamePhase = 'finished';
      } else if (gameState.currentPlayerId === this.playerId) {
        this.gamePhase = gameState.turnPhase; // 'play' or 'draw'
      } else {
        this.gamePhase = 'waiting';
      }
      
      // Update game info (round, cards in deck)
      this.elements.gameStats.textContent = `Round: ${gameState.currentRound}/${gameState.totalRounds} | Cards in deck: ${gameState.cardsInDeck}`;
      
      // Update player information
      const isPlayer1 = this.playerId === gameState.player1.id;
      const player = isPlayer1 ? gameState.player1 : gameState.player2;
      const opponent = isPlayer1 ? gameState.player2 : gameState.player1;
      
      // Update scores
      this.elements.player1Score.textContent = `Score: ${gameState.scores.player1.total}`;
      this.elements.player2Score.textContent = `Score: ${gameState.scores.player2.total}`;
      
      // Update turn indicators
      if (gameState.status === 'finished') {
        this.elements.player1TurnIndicator.textContent = gameState.winner === gameState.player1.id ? 'Winner!' : '';
        this.elements.player2TurnIndicator.textContent = gameState.winner === gameState.player2.id ? 'Winner!' : '';
      } else {
        this.elements.player1TurnIndicator.textContent = gameState.currentPlayerId === gameState.player1.id ? 'Your Turn' : '';
        this.elements.player2TurnIndicator.textContent = gameState.currentPlayerId === gameState.player2.id ? 'Your Turn' : '';
      }
      
      // Update the game message
      this.updateGameMessage();
      
      // Update player's hand
      this.updatePlayerHand(player.hand);
      
      // Update expeditions
      this.updateExpeditions(player.expeditions, opponent.expeditions);
      
      // Update discard piles
      this.updateDiscardPiles(gameState.discardPiles);
      
      // Update deck
      this.elements.deck.setAttribute('data-count', gameState.cardsInDeck);
      
      // Enable/disable UI based on game phase
      this.updateUIInteractivity();
    }
    
    /**
     * Update the player's hand display
     */
    updatePlayerHand(cards) {
      const handElement = this.elements.playerHand;
      handElement.innerHTML = '';
      
      // If we don't have cards, show empty hand message
      if (!cards || cards.length === 0) {
        handElement.innerHTML = '<div class="empty-hand-message">Waiting for cards...</div>';
        return;
      }
      
      // Sort cards by color and value for a better display
      const sortedCards = [...cards].sort((a, b) => {
        if (a.color !== b.color) {
          const colorOrder = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
          return colorOrder.indexOf(a.color) - colorOrder.indexOf(b.color);
        }
        
        // Sort wagers before expedition cards
        if (a.type !== b.type) {
          return a.type === 'wager' ? -1 : 1;
        }
        
        // Sort by value for expedition cards
        if (a.type === 'expedition') {
          return a.value - b.value;
        }
        
        return 0;
      });
      
      // Create DOM elements for each card
      sortedCards.forEach(card => {
        const cardElement = document.createElement('div');
        cardElement.className = `game-card card-${card.color} ${card.type} ${this.selectedCard === card.id ? 'selected' : ''}`;
        cardElement.setAttribute('data-card-id', card.id);
        cardElement.setAttribute('data-color', card.color);
        cardElement.setAttribute('data-type', card.type);
        cardElement.setAttribute('data-value', card.value);
        
        // Card content
        const valueDisplay = card.type === 'wager' ? 'W' : card.value;
        cardElement.innerHTML = `
          <div class="card-inner">
            <div class="card-value">${valueDisplay}</div>
            <div class="card-symbol"></div>
          </div>
        `;
        
        // Add click handler
        cardElement.addEventListener('click', () => this.handleCardClick(card));
        
        handElement.appendChild(cardElement);
      });
    }
    
    /**
     * Update the expedition displays for both players
     */
    updateExpeditions(playerExpeditions, opponentExpeditions) {
      // Update player expeditions
      const colors = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
      
      colors.forEach(color => {
        // Player expeditions
        const playerExpSlot = this.elements.playerExpeditions.querySelector(`.expedition-slot.${color} .expedition-stack`);
        playerExpSlot.innerHTML = '';
        
        // Skip if color isn't in the game (purple may be disabled)
        if (!playerExpeditions[color]) {
          return;
        }
        
        // Create cards for this expedition
        playerExpeditions[color].forEach((card, index) => {
          const cardElement = document.createElement('div');
          cardElement.className = `game-card card-${card.color} ${card.type} expedition-card`;
          cardElement.setAttribute('data-card-id', card.id);
          cardElement.setAttribute('data-color', card.color);
          cardElement.setAttribute('data-type', card.type);
          cardElement.setAttribute('data-value', card.value);
          cardElement.setAttribute('data-position', index);
          
          // Card content
          const valueDisplay = card.type === 'wager' ? 'W' : card.value;
          cardElement.innerHTML = `
            <div class="card-inner">
              <div class="card-value">${valueDisplay}</div>
              <div class="card-symbol"></div>
            </div>
          `;
          
          playerExpSlot.appendChild(cardElement);
        });
        
        // Add empty expedition slot visual if expedition has no cards
        if (playerExpeditions[color].length === 0) {
          const emptySlot = document.createElement('div');
          emptySlot.className = `expedition-empty-slot ${color}-expedition`;
          
          // Add click handler for empty expedition slots
          if (this.gamePhase === 'play' && this.selectedCard) {
            const selectedCardElement = document.querySelector(`[data-card-id="${this.selectedCard}"]`);
            const selectedCardColor = selectedCardElement?.getAttribute('data-color');
            
            if (selectedCardColor === color) {
              emptySlot.classList.add('drop-target');
              emptySlot.addEventListener('click', () => this.handleExpeditionClick(color));
            }
          }
          
          playerExpSlot.appendChild(emptySlot);
        }
        
        // Opponent expeditions
        const opponentExpSlot = this.elements.opponentExpeditions.querySelector(`.expedition-slot.${color} .expedition-stack`);
        opponentExpSlot.innerHTML = '';
        
        // Skip if color isn't in the game
        if (!opponentExpeditions[color]) {
          return;
        }
        
        // Create cards for opponent's expedition
        opponentExpeditions[color].forEach((card, index) => {
          const cardElement = document.createElement('div');
          cardElement.className = `game-card card-${card.color} ${card.type} expedition-card`;
          cardElement.setAttribute('data-card-id', card.id);
          cardElement.setAttribute('data-color', card.color);
          cardElement.setAttribute('data-type', card.type);
          cardElement.setAttribute('data-value', card.value);
          cardElement.setAttribute('data-position', index);
          
          // Card content
          const valueDisplay = card.type === 'wager' ? 'W' : card.value;
          cardElement.innerHTML = `
            <div class="card-inner">
              <div class="card-value">${valueDisplay}</div>
              <div class="card-symbol"></div>
            </div>
          `;
          
          opponentExpSlot.appendChild(cardElement);
        });
        
        // Add empty expedition slot visual if expedition has no cards
        if (opponentExpeditions[color].length === 0) {
          const emptySlot = document.createElement('div');
          emptySlot.className = `expedition-empty-slot ${color}-expedition`;
          opponentExpSlot.appendChild(emptySlot);
        }
      });
      
      // Show/hide purple expedition based on game settings
      const purpleSlots = document.querySelectorAll('.expedition-slot.purple');
      purpleSlots.forEach(slot => {
        slot.style.display = this.gameState?.usePurpleExpedition ? 'block' : 'none';
      });
      
      const purpleDiscard = document.querySelector('.discard-pile.purple');
      if (purpleDiscard) {
        purpleDiscard.style.display = this.gameState?.usePurpleExpedition ? 'block' : 'none';
      }
    }
    
    /**
     * Update the discard piles
     */
    updateDiscardPiles(discardPiles) {
      const colors = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
      
      colors.forEach(color => {
        const pileElement = document.querySelector(`.discard-pile.${color}`);
        if (!pileElement) return;
        
        // Skip if color isn't in the game
        if (!discardPiles[color]) {
          return;
        }
        
        // Clear existing cards
        pileElement.innerHTML = '';
        
        // If pile is empty, show empty pile visual
        if (discardPiles[color].length === 0) {
          pileElement.classList.add('empty');
          
          const emptyPile = document.createElement('div');
          emptyPile.className = `discard-empty-slot ${color}-discard`;
          pileElement.appendChild(emptyPile);
          
          return;
        }
        
        // If pile has cards, show the top card
        pileElement.classList.remove('empty');
        const topCard = discardPiles[color][discardPiles[color].length - 1];
        
        const cardElement = document.createElement('div');
        cardElement.className = `game-card card-${topCard.color} ${topCard.type} discard-card`;
        cardElement.setAttribute('data-card-id', topCard.id);
        cardElement.setAttribute('data-color', topCard.color);
        cardElement.setAttribute('data-type', topCard.type);
        cardElement.setAttribute('data-value', topCard.value);
        
        // Card content
        const valueDisplay = topCard.type === 'wager' ? 'W' : topCard.value;
        cardElement.innerHTML = `
          <div class="card-inner">
            <div class="card-value">${valueDisplay}</div>
            <div class="card-symbol"></div>
          </div>
        `;
        
        // Add click handler for discard piles during draw phase
        if (this.gamePhase === 'draw') {
          cardElement.classList.add('drop-target');
          cardElement.addEventListener('click', () => this.handleDiscardPileClick(color));
        }
        
        // Add number indicator for number of cards in the pile
        if (discardPiles[color].length > 1) {
          const countBadge = document.createElement('div');
          countBadge.className = 'discard-count';
          countBadge.textContent = discardPiles[color].length;
          cardElement.appendChild(countBadge);
        }
        
        pileElement.appendChild(cardElement);
      });
      
      // Add click handler for discard when a card is selected (during play phase)
      if (this.gamePhase === 'play' && this.selectedCard) {
        const selectedCardElement = document.querySelector(`[data-card-id="${this.selectedCard}"]`);
        const selectedCardColor = selectedCardElement?.getAttribute('data-color');
        
        if (selectedCardColor) {
          const discardPile = document.querySelector(`.discard-pile.${selectedCardColor}`);
          if (discardPile) {
            discardPile.classList.add('drop-target');
            discardPile.addEventListener('click', () => this.handleDiscardClick(selectedCardColor));
          }
        }
      }
    }
    
    /**
     * Update the game message based on current state
     */
    updateGameMessage() {
      if (!this.gameState) {
        this.setGameMessage('Loading game...');
        return;
      }
      
      const { currentPlayerId, status, turnPhase } = this.gameState;
      
      if (status === 'finished') {
        if (this.gameState.winner === this.playerId) {
          this.setGameMessage('Congratulations! You won the game!');
        } else if (this.gameState.winner) {
          this.setGameMessage('Game over. Your opponent won.');
        } else {
          this.setGameMessage('Game over. It\'s a tie!');
        }
      } else if (currentPlayerId === this.playerId) {
        if (turnPhase === 'play') {
          this.setGameMessage('Your turn. Play a card to an expedition or discard.');
        } else if (turnPhase === 'draw') {
          this.setGameMessage('Draw a card from the deck or a discard pile.');
        }
      } else {
        this.setGameMessage('Waiting for opponent to make their move...');
      }
    }
    
    /**
     * Set the game message text
     */
    setGameMessage(message) {
      if (this.elements.gameMessage) {
        this.elements.gameMessage.textContent = message;
      }
    }
    
    /**
     * Update UI interactivity based on game phase
     */
    updateUIInteractivity() {
      // If game is finished, disable all gameplay interactions
      if (this.gamePhase === 'finished') {
        this.elements.gameBoard.classList.add('game-over');
        return;
      }
      
      // If it's not the player's turn, disable interactions
      if (this.gamePhase === 'waiting') {
        this.elements.gameBoard.classList.add('opponent-turn');
        this.elements.gameBoard.classList.remove('player-turn', 'play-phase', 'draw-phase');
        return;
      }
      
      // It's the player's turn
      this.elements.gameBoard.classList.add('player-turn');
      this.elements.gameBoard.classList.remove('opponent-turn', 'game-over');
      
      // Set phase-specific classes
      if (this.gamePhase === 'play') {
        this.elements.gameBoard.classList.add('play-phase');
        this.elements.gameBoard.classList.remove('draw-phase');
      } else if (this.gamePhase === 'draw') {
        this.elements.gameBoard.classList.add('draw-phase');
        this.elements.gameBoard.classList.remove('play-phase');
        
        // Add click handler to deck
        const deckElement = this.elements.deck;
        deckElement.classList.add('drop-target');
        deckElement.addEventListener('click', () => this.handleDeckClick());
        
        // Add click handlers to discard piles
        this.updateDiscardPiles(this.gameState.discardPiles);
      }
    }
    
    /**
     * Handle a card click in the player's hand
     */
    handleCardClick(card) {
      // Cannot select cards if it's not play phase
      if (this.gamePhase !== 'play') {
        return;
      }
      
      // Toggle selection
      if (this.selectedCard === card.id) {
        this.selectedCard = null;
      } else {
        this.selectedCard = card.id;
      }
      
      // Update UI to reflect selection
      document.querySelectorAll('.game-card.selected').forEach(el => {
        el.classList.remove('selected');
      });
      
      if (this.selectedCard) {
        const cardElement = document.querySelector(`[data-card-id="${card.id}"]`);
        if (cardElement) {
          cardElement.classList.add('selected');
        }
        
        // Update possible drop targets
        this.updateDropTargets(card);
      } else {
        // Clear drop targets
        document.querySelectorAll('.drop-target').forEach(el => {
          el.classList.remove('drop-target');
        });
      }
    }
    
    /**
     * Update the UI to show valid drop targets for the selected card
     */
    updateDropTargets(card) {
      // Clear existing drop targets
      document.querySelectorAll('.drop-target').forEach(el => {
        el.classList.remove('drop-target');
      });
      
      if (!card) return;
      
      // Show expedition slot as drop target
      const expeditionSlot = this.elements.playerExpeditions.querySelector(`.expedition-slot.${card.color}`);
      if (expeditionSlot) {
        // Check if the play would be valid
        const expedition = this.gameState.player1.id === this.playerId ? 
          this.gameState.player1.expeditions[card.color] : 
          this.gameState.player2.expeditions[card.color];
        
        let isValidPlay = true;
        
        // If expedition has cards, check if play is valid
        if (expedition && expedition.length > 0) {
          // If there are only wager cards, any expedition card is valid
          if (expedition.every(c => c.type === 'wager')) {
            // Can add another wager or start expedition
          } 
          // If the last card is an expedition card, new card must have higher value
          else {
            const lastExpeditionCard = [...expedition].filter(c => c.type === 'expedition').pop();
            if (lastExpeditionCard && card.type === 'expedition') {
              if (typeof lastExpeditionCard.value === 'number' && 
                  typeof card.value === 'number' && 
                  card.value <= lastExpeditionCard.value) {
                isValidPlay = false;
              }
            }
            if (lastExpeditionCard && card.type === 'wager') {
              isValidPlay = false;
            }
          }
        }
        
        if (isValidPlay) {
          expeditionSlot.classList.add('drop-target');
          const emptySlot = expeditionSlot.querySelector('.expedition-empty-slot');
          if (emptySlot) {
            emptySlot.classList.add('drop-target');
            emptySlot.addEventListener('click', () => this.handleExpeditionClick(card.color));
          } else {
            // If expedition already has cards, make the expedition stack a drop target
            const expeditionStack = expeditionSlot.querySelector('.expedition-stack');
            if (expeditionStack) {
              expeditionStack.classList.add('drop-target');
              expeditionStack.addEventListener('click', () => this.handleExpeditionClick(card.color));
            }
          }
        }
      }
      
      // Show discard pile as drop target
      const discardPile = document.querySelector(`.discard-pile.${card.color}`);
      if (discardPile) {
        discardPile.classList.add('drop-target');
        discardPile.addEventListener('click', () => this.handleDiscardClick(card.color));
      }
    }
    
    /**
     * Handle a click on an expedition
     */
    handleExpeditionClick(color) {
      if (this.gamePhase !== 'play' || !this.selectedCard) {
        return;
      }
      
      // Get the selected card details
      const cardElement = document.querySelector(`[data-card-id="${this.selectedCard}"]`);
      if (!cardElement) return;
      
      const cardColor = cardElement.getAttribute('data-color');
      
      // Verify the card color matches the expedition color
      if (cardColor !== color) {
        this.setGameMessage('Card color must match expedition color');
        return;
      }
      
      // Trigger the move callback
      if (this.onMoveCard) {
        this.onMoveCard({
          action: 'play_card',
          cardId: this.selectedCard,
          color,
          destination: 'expedition'
        });
      }
      
      // Reset selection
      this.selectedCard = null;
      document.querySelectorAll('.game-card.selected, .drop-target').forEach(el => {
        el.classList.remove('selected', 'drop-target');
      });
    }
    
    /**
     * Handle a click on a discard pile
     */
    handleDiscardClick(color) {
      if (this.gamePhase !== 'play' || !this.selectedCard) {
        return;
      }
      
      // Trigger the move callback
      if (this.onMoveCard) {
        this.onMoveCard({
          action: 'discard_card',
          cardId: this.selectedCard,
          color,
          destination: 'discard_pile'
        });
      }
      
      // Reset selection
      this.selectedCard = null;
      document.querySelectorAll('.game-card.selected, .drop-target').forEach(el => {
        el.classList.remove('selected', 'drop-target');
      });
    }
    
    /**
     * Handle a click on a discard pile during draw phase
     */
    handleDiscardPileClick(color) {
      if (this.gamePhase !== 'draw') {
        return;
      }
      
      // Check if the discard pile has cards
      const discardPile = this.gameState.discardPiles[color];
      if (!discardPile || discardPile.length === 0) {
        this.setGameMessage('This discard pile is empty');
        return;
      }
      
      // Trigger the move callback
      if (this.onMoveCard) {
        this.onMoveCard({
          action: 'draw_card',
          source: 'discard_pile',
          color
        });
      }
    }
    
    /**
     * Handle a click on the deck
     */
    handleDeckClick() {
      if (this.gamePhase !== 'draw') {
        return;
      }
      
      // Check if the deck has cards
      if (this.gameState.cardsInDeck <= 0) {
        this.setGameMessage('The deck is empty');
        return;
      }
      
      // Trigger the move callback
      if (this.onMoveCard) {
        this.onMoveCard({
          action: 'draw_card',
          source: 'deck'
        });
      }
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
      // Set up help button
      if (this.elements.btnHelp) {
        this.elements.btnHelp.addEventListener('click', () => this.showRules());
      }
      
      // Set up surrender button
      if (this.elements.btnSurrender) {
        this.elements.btnSurrender.addEventListener('click', () => this.handleSurrender());
      }
      
      // Set up chat button
      if (this.elements.btnChat) {
        this.elements.btnChat.addEventListener('click', () => this.toggleChat());
      }
    }
    
    /**
     * Show game rules
     */
    showRules() {
      const rulesHTML = `
        <div class="rules-dialog">
          <h2>Lost Cities: Rules</h2>
          <p>Lost Cities is a card game where you try to mount profitable expeditions.</p>
          
          <h3>Game Flow:</h3>
          <ul>
            <li>On your turn, first play or discard a card, then draw a card</li>
            <li>Play cards of the same color in ascending order on your expeditions</li>
            <li>Wager cards (marked with W) must be played before number cards</li>
            <li>Starting an expedition costs 20 points, which you need to overcome</li>
          </ul>
          
          <h3>Scoring:</h3>
          <ul>
            <li>Sum all card values in each expedition</li>
            <li>Subtract 20 points for each expedition you started</li>
            <li>Wager cards multiply an expedition's score (1 wager = 2x, 2 wagers = 3x, etc.)</li>
            <li>If you have 8+ cards in an expedition, you get a 20-point bonus</li>
          </ul>
          
          <button id="close-rules">Close</button>
        </div>
      `;
      
      const rulesOverlay = document.createElement('div');
      rulesOverlay.className = 'overlay';
      rulesOverlay.innerHTML = rulesHTML;
      document.body.appendChild(rulesOverlay);
      
      document.getElementById('close-rules').addEventListener('click', () => {
        document.body.removeChild(rulesOverlay);
      });
    }
    
    /**
     * Handle surrender
     */
    handleSurrender() {
      if (confirm('Are you sure you want to surrender this game?')) {
        if (this.onSurrender) {
          this.onSurrender();
        }
      }
    }
    
    /**
     * Toggle chat window
     */
    toggleChat() {
      const chatContainer = document.querySelector('.chat-container');
      
      if (chatContainer) {
        chatContainer.classList.toggle('visible');
      } else {
        this.createChatWindow();
      }
    }
    
    /**
     * Create the chat window
     */
    createChatWindow() {
      const chatHTML = `
        <div class="chat-container">
          <div class="chat-header">
            <h3>Game Chat</h3>
            <button class="close-chat">×</button>
          </div>
          <div class="chat-messages"></div>
          <div class="chat-input">
            <input type="text" placeholder="Type a message..." id="chat-message-input">
            <button id="send-chat-message">Send</button>
          </div>
        </div>
      `;
      
      const chatElement = document.createElement('div');
      chatElement.innerHTML = chatHTML;
      document.body.appendChild(chatElement.firstChild);
      
      // Add event listeners
      document.querySelector('.close-chat').addEventListener('click', () => {
        document.querySelector('.chat-container').classList.remove('visible');
      });
      
      document.getElementById('send-chat-message').addEventListener('click', () => {
        this.sendChatMessage();
      });
      
      document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.sendChatMessage();
        }
      });
      
      // Show the chat
      document.querySelector('.chat-container').classList.add('visible');
    }
    
    /**
     * Send a chat message
     */
    sendChatMessage() {
      const inputElement = document.getElementById('chat-message-input');
      const message = inputElement.value.trim();
      
      if (message) {
        // Add the message to the chat
        this.addChatMessage('You', message, true);
        
        // Clear the input
        inputElement.value = '';
        
        // Trigger the callback
        if (this.onChatMessage) {
          this.onChatMessage(message);
        }
      }
    }
    
    /**
     * Add a chat message to the chat window
     */
    addChatMessage(sender, message, isPlayer = false) {
      const chatMessages = document.querySelector('.chat-messages');
      if (!chatMessages) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = `chat-message ${isPlayer ? 'self' : 'other'}`;
      messageElement.innerHTML = `
        <div class="chat-sender">${sender}</div>
        <div class="chat-text">${message}</div>
      `;
      
      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    /**
     * Add a system message to the chat
     */
    addSystemMessage(message) {
      const chatMessages = document.querySelector('.chat-messages');
      if (!chatMessages) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = 'chat-message system';
      messageElement.innerHTML = `<div class="chat-text">${message}</div>`;
      
      chatMessages.appendChild(messageElement);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    /**
     * Register move handler
     */
    setMoveHandler(callback) {
      this.onMoveCard = callback;
    }
    
    /**
     * Register surrender handler
     */
    setSurrenderHandler(callback) {
      this.onSurrender = callback;
    }
    
    /**
     * Register chat message handler
     */
    setChatHandler(callback) {
      this.onChatMessage = callback;
    }
  }
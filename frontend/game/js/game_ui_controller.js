// frontend/game/js/game_ui_controller.js

class GameUIController {
    constructor(gameId, userId) {
        this.gameId = gameId;
        this.userId = userId;
        this.currentGameState = null;
        this.isMyTurn = false;
        this.turnPhase = 'play'; // 'play' or 'draw'
        this.selectedCard = null;
        this.cardElements = new Map(); // Map of card ID to DOM element
    }

    initialize() {
        this.setupEventListeners();
        this.updateGameStatus("Connecting to game...");
    }

    setupEventListeners() {
        // Board elements
        document.querySelectorAll('.expedition-slot').forEach(slot => {
            slot.addEventListener('click', (e) => this.handleExpeditionSlotClick(e));
        });

        document.querySelectorAll('.discard-pile').forEach(pile => {
            pile.addEventListener('click', (e) => this.handleDiscardPileClick(e));
        });

        document.querySelector('.deck').addEventListener('click', () => this.handleDeckClick());

        // Control buttons
        document.getElementById('btn-surrender').addEventListener('click', () => this.handleSurrenderClick());
        document.getElementById('btn-help').addEventListener('click', () => this.showRules());
        document.getElementById('btn-chat').addEventListener('click', () => this.toggleChat());
    }

    // Game state updates
    updateGameState(gameState) {
        console.log("Updating game state:", gameState);
        this.currentGameState = gameState;

        // Update turn status
        this.isMyTurn = gameState.currentPlayerId === this.userId;
        this.turnPhase = gameState.turnPhase;

        // Update UI based on game state
        this.updateGameInfo(gameState);
        this.updateExpeditions(gameState);
        this.updateDiscardPiles(gameState);
        this.updateDeck(gameState);
        this.updateHand(gameState);
        this.updateTurnIndicators(gameState);

        // Update game status message
        this.updateGameStatusMessage(gameState);
    }

    updateGameInfo(gameState) {
        // Update round and score info
        const gameStats = document.querySelector('.game-stats');
        const player1Score = document.querySelector('.player-info:first-child .player-score');
        const player2Score = document.querySelector('.player-info:last-child .player-score');

        gameStats.textContent = `Round: ${gameState.currentRound}/${gameState.totalRounds} | Cards in deck: ${gameState.cardsInDeck}`;

        // Determine which score belongs to the current player
        const isPlayer1 = gameState.player1.id === this.userId;
        const myScore = isPlayer1 ? gameState.scores.player1.total : gameState.scores.player2.total;
        const opponentScore = isPlayer1 ? gameState.scores.player2.total : gameState.scores.player1.total;

        player1Score.textContent = `Score: ${isPlayer1 ? myScore : opponentScore}`;
        player2Score.textContent = `Score: ${isPlayer1 ? opponentScore : myScore}`;
    }

    updateExpeditions(gameState) {
        // Clear current expeditions
        document.querySelectorAll('.expedition-stack').forEach(stack => {
            stack.innerHTML = '';
        });

        // Determine which player is which
        const isPlayer1 = gameState.player1.id === this.userId;
        const myExpeditions = isPlayer1 ? gameState.player1.expeditions : gameState.player2.expeditions;
        const opponentExpeditions = isPlayer1 ? gameState.player2.expeditions : gameState.player1.expeditions;

        // Update my expeditions
        for (const [color, cards] of Object.entries(myExpeditions)) {
            const expeditionSlot = document.querySelector(`.player-expeditions .expedition-slot.${color} .expedition-stack`);
            this.renderCardStack(expeditionSlot, cards, true);
        }

        // Update opponent expeditions
        for (const [color, cards] of Object.entries(opponentExpeditions)) {
            const expeditionSlot = document.querySelector(`.opponent-expeditions .expedition-slot.${color} .expedition-stack`);
            this.renderCardStack(expeditionSlot, cards, true);
        }

        // Hide purple expedition if not used
        const purpleSlots = document.querySelectorAll('.expedition-slot.purple');
        if (!gameState.usePurpleExpedition) {
            purpleSlots.forEach(slot => slot.style.display = 'none');
        } else {
            purpleSlots.forEach(slot => slot.style.display = 'block');
        }
    }

    updateDiscardPiles(gameState) {
        // Clear and update discard piles
        for (const [color, cards] of Object.entries(gameState.discardPiles)) {
            const pileElement = document.querySelector(`.discard-pile.${color}`);
            pileElement.innerHTML = '';

            if (cards.length > 0) {
                // Show only the top card
                const topCard = cards[cards.length - 1];
                const cardElement = this.createCardElement(topCard, false);
                pileElement.appendChild(cardElement);
                pileElement.dataset.count = cards.length;
                pileElement.classList.add('has-cards');
            } else {
                // Empty pile
                pileElement.dataset.count = 0;
                pileElement.classList.remove('has-cards');
                // Add empty placeholder with dashed border
                const placeholder = document.createElement('div');
                placeholder.className = 'card-placeholder';
                placeholder.style.borderColor = color;
                pileElement.appendChild(placeholder);
            }
        }

        // Hide purple discard pile if not used
        const purplePile = document.querySelector('.discard-pile.purple');
        if (!this.currentGameState.usePurpleExpedition) {
            purplePile.style.display = 'none';
        } else {
            purplePile.style.display = 'block';
        }
    }

    updateDeck(gameState) {
        const deckElement = document.querySelector('.deck');
        deckElement.dataset.count = gameState.cardsInDeck;

        // Add visual feedback based on deck size
        if (gameState.cardsInDeck === 0) {
            deckElement.classList.add('empty');
            deckElement.innerHTML = '';
        } else {
            deckElement.classList.remove('empty');
            if (deckElement.innerHTML === '') {
                const cardBackElement = document.createElement('div');
                cardBackElement.className = 'card card-back';
                deckElement.appendChild(cardBackElement);
            }
        }
    }

    updateHand(gameState) {
        const handElement = document.querySelector('.player-hand');
        handElement.innerHTML = '';
        this.cardElements.clear();

        // Find my hand data
        const isPlayer1 = gameState.player1.id === this.userId;
        const myHand = isPlayer1 ? gameState.player1.hand : gameState.player2.hand;

        // If the hand data is available (it should be for the current player)
        if (myHand) {
            myHand.forEach(card => {
                const cardElement = this.createCardElement(card, true);
                handElement.appendChild(cardElement);
                this.cardElements.set(card.id, cardElement);

                // Add click handler for cards in hand
                cardElement.addEventListener('click', () => this.handleCardClick(card, cardElement));
            });
        }
    }

    updateTurnIndicators(gameState) {
        const myTurnIndicator = document.querySelector('.player-info:first-child .player-turn-indicator');
        const opponentTurnIndicator = document.querySelector('.player-info:last-child .player-turn-indicator');

        if (gameState.status === 'finished') {
            myTurnIndicator.textContent = gameState.winner === this.userId ? 'Winner!' : 'Game Over';
            opponentTurnIndicator.textContent = gameState.winner === this.userId ? 'Defeated' : 'Winner!';
            myTurnIndicator.className = 'player-turn-indicator ' + (gameState.winner === this.userId ? 'winner' : 'loser');
            opponentTurnIndicator.className = 'player-turn-indicator ' + (gameState.winner === this.userId ? 'loser' : 'winner');
        } else {
            myTurnIndicator.textContent = this.isMyTurn ? 'Your Turn' : 'Waiting...';
            opponentTurnIndicator.textContent = this.isMyTurn ? 'Waiting...' : 'Their Turn';
            myTurnIndicator.className = 'player-turn-indicator ' + (this.isMyTurn ? 'active' : 'inactive');
            opponentTurnIndicator.className = 'player-turn-indicator ' + (this.isMyTurn ? 'inactive' : 'active');
        }
    }

    updateGameStatusMessage(gameState) {
        let message = '';

        if (gameState.status === 'waiting') {
            message = 'Waiting for opponent to join...';
        } else if (gameState.status === 'finished') {
            if (gameState.winner === this.userId) {
                message = 'Congratulations! You won the game.';
            } else if (gameState.winner === null) {
                message = 'Game ended in a tie!';
            } else {
                message = 'Game over. Your opponent won.';
            }
        } else if (this.isMyTurn) {
            if (this.turnPhase === 'play') {
                message = 'Your turn. Play a card to an expedition or discard it.';
            } else {
                message = 'Draw a card from the deck or a discard pile.';
            }
        } else {
            message = 'Waiting for opponent to make a move...';
        }

        this.updateGameStatus(message);
    }

    updateGameStatus(message) {
        document.querySelector('.game-message').textContent = message;
    }

    // UI Helper Methods
    createCardElement(card, isInHand) {
        const cardElement = document.createElement('div');
        cardElement.className = `card ${card.color} ${card.type}`;
        cardElement.dataset.cardId = card.id;
        cardElement.dataset.color = card.color;
        cardElement.dataset.type = card.type;
        cardElement.dataset.value = card.value;

        // Add content to the card
        const valueElement = document.createElement('span');
        valueElement.className = 'card-value';
        valueElement.textContent = card.type === 'wager' ? 'W' : card.value;
        cardElement.appendChild(valueElement);

        // If the card is in the player's hand, make it interactive
        if (isInHand) {
            cardElement.classList.add('in-hand');
        }

        return cardElement;
    }

    renderCardStack(container, cards, showAllCards) {
        container.innerHTML = '';
        
        if (cards.length === 0) {
            return;
        }

        if (showAllCards) {
            // Show all cards in a stacked format
            cards.forEach((card, index) => {
                const cardElement = this.createCardElement(card, false);
                cardElement.style.zIndex = index;
                cardElement.style.top = `${index * 15}px`; // Stagger cards
                container.appendChild(cardElement);
            });
        } else {
            // Just show the top card
            const topCard = cards[cards.length - 1];
            const cardElement = this.createCardElement(topCard, false);
            container.appendChild(cardElement);
        }
    }

    // Event handlers
    handleCardClick(card, cardElement) {
        // Only allow card selection if it's the player's turn and in play phase
        if (!this.isMyTurn || this.turnPhase !== 'play') {
            return;
        }

        // Toggle card selection
        if (this.selectedCard === card.id) {
            this.selectedCard = null;
            document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
        } else {
            this.selectedCard = card.id;
            document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
            cardElement.classList.add('selected');
        }
    }

    handleExpeditionSlotClick(event) {
        if (!this.isMyTurn || this.turnPhase !== 'play' || !this.selectedCard) {
            return;
        }

        // Get the color of the expedition
        const slot = event.currentTarget;
        const color = slot.classList[1]; // The second class is the color
        const cardElement = this.cardElements.get(this.selectedCard);
        const cardColor = cardElement.dataset.color;

        // Check if card color matches expedition color
        if (cardColor !== color) {
            this.updateGameStatus(`Cards can only be played on expeditions of the same color!`);
            return;
        }

        // Trigger the playCard event for the game controller
        if (this.onPlayCard) {
            this.onPlayCard(this.selectedCard, color);
        }
    }

    handleDiscardPileClick(event) {
        const pile = event.currentTarget;
        const color = pile.classList[1]; // The second class is the color

        if (this.isMyTurn) {
            if (this.turnPhase === 'play' && this.selectedCard) {
                // Discard a card
                if (this.onDiscardCard) {
                    this.onDiscardCard(this.selectedCard);
                }
            } else if (this.turnPhase === 'draw') {
                // Draw from discard pile
                if (pile.classList.contains('has-cards') && this.onDrawFromDiscardPile) {
                    this.onDrawFromDiscardPile(color);
                }
            }
        }
    }

    handleDeckClick() {
        if (this.isMyTurn && this.turnPhase === 'draw') {
            if (this.onDrawFromDeck) {
                this.onDrawFromDeck();
            }
        }
    }

    handleSurrenderClick() {
        if (confirm('Are you sure you want to surrender this game?')) {
            if (this.onSurrender) {
                this.onSurrender();
            }
        }
    }

    showRules() {
        const rulesHTML = `
            <div class="rules-dialog">
                <h2>Lost Cities: Rules</h2>
                <p>Lost Cities is a 2-player card game where you try to mount profitable expeditions in different colors.</p>
                
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
                    <li>Expeditions with 8+ cards get a 20-point bonus</li>
                </ul>
                
                <button id="close-rules">Close</button>
            </div>
        `;

        const rulesContainer = document.createElement('div');
        rulesContainer.className = 'overlay';
        rulesContainer.innerHTML = rulesHTML;
        document.body.appendChild(rulesContainer);

        document.getElementById('close-rules').addEventListener('click', () => {
            document.body.removeChild(rulesContainer);
        });
    }

    toggleChat() {
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
            chatContainer.classList.toggle('visible');
        } else {
            this.initializeChat();
        }
    }

    initializeChat() {
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
        document.querySelector('.game-container').appendChild(chatElement.firstChild);

        document.querySelector('.close-chat').addEventListener('click', () => {
            document.querySelector('.chat-container').classList.remove('visible');
        });

        document.getElementById('send-chat-message').addEventListener('click', () => {
            const input = document.getElementById('chat-message-input');
            if (input.value.trim() && this.onSendChatMessage) {
                this.onSendChatMessage(input.value);
                input.value = '';
            }
        });

        document.getElementById('chat-message-input').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const input = document.getElementById('chat-message-input');
                if (input.value.trim() && this.onSendChatMessage) {
                    this.onSendChatMessage(input.value);
                    input.value = '';
                }
            }
        });

        document.querySelector('.chat-container').classList.add('visible');
    }

    addChatMessage(sender, message, isMe = false) {
        const chatMessages = document.querySelector('.chat-messages');
        if (!chatMessages) return;

        const messageElement = document.createElement('div');
        messageElement.className = `chat-message ${isMe ? 'chat-message-mine' : 'chat-message-other'}`;
        
        const senderElement = document.createElement('div');
        senderElement.className = 'chat-sender';
        senderElement.textContent = isMe ? 'You' : sender;
        
        const textElement = document.createElement('div');
        textElement.className = 'chat-text';
        textElement.textContent = message;
        
        messageElement.appendChild(senderElement);
        messageElement.appendChild(textElement);
        chatMessages.appendChild(messageElement);
        
        // Auto-scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Event registration methods
    onPlayCard(callback) {
        this.onPlayCard = callback;
    }

    onDiscardCard(callback) {
        this.onDiscardCard = callback;
    }

    onDrawFromDeck(callback) {
        this.onDrawFromDeck = callback;
    }

    onDrawFromDiscardPile(callback) {
        this.onDrawFromDiscardPile = callback;
    }

    onSurrender(callback) {
        this.onSurrender = callback;
    }

    onSendChatMessage(callback) {
        this.onSendChatMessage = callback;
    }
}

export default GameUIController;
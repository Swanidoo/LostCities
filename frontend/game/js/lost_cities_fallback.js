// frontend/game/js/lost_cities_fallback.js

/**
 * Fallback game logic for Lost Cities
 * This provides a basic implementation that works locally when the server connection isn't ready
 */

class FallbackGameLogic {
    constructor(gameId, userId, opponentId, playerName, opponentName) {
        this.gameId = gameId;
        this.userId = userId;
        this.opponentId = opponentId || 'opponent';
        this.playerName = playerName || 'You';
        this.opponentName = opponentName || 'Opponent';
        
        this.currentState = {
            gameId: this.gameId,
            status: 'in_progress',
            currentRound: 1,
            totalRounds: 3,
            currentPlayerId: this.userId, // Start with player's turn
            turnPhase: 'play',
            usePurpleExpedition: false,
            cardsInDeck: 44,
            player1: {
                id: this.userId,
                hand: this.generateInitialHand(),
                expeditions: {
                    red: [],
                    green: [],
                    white: [],
                    blue: [],
                    yellow: [],
                    purple: []
                },
                handSize: 8
            },
            player2: {
                id: this.opponentId,
                expeditions: {
                    red: [],
                    green: [],
                    white: [],
                    blue: [],
                    yellow: [],
                    purple: []
                },
                handSize: 8
            },
            discardPiles: {
                red: [],
                green: [],
                white: [],
                blue: [],
                yellow: [],
                purple: []
            },
            scores: {
                player1: { round1: 0, round2: 0, round3: 0, total: 0 },
                player2: { round1: 0, round2: 0, round3: 0, total: 0 }
            },
            winner: null
        };
        
        this.deck = this.generateDeck();
        this.onStateChange = null;
    }
    
    // Generate a randomized deck of cards
    generateDeck() {
        const colors = ['red', 'green', 'white', 'blue', 'yellow'];
        const deck = [];
        
        // Create all cards for each color
        colors.forEach(color => {
            // Number cards (2-10)
            for (let i = 2; i <= 10; i++) {
                deck.push({
                    id: `${color}_${i}`,
                    color,
                    type: 'expedition',
                    value: i
                });
            }
            
            // Wager cards (3 per color)
            for (let i = 0; i < 3; i++) {
                deck.push({
                    id: `${color}_wager_${i}`,
                    color,
                    type: 'wager',
                    value: 'W'
                });
            }
        });
        
        // Shuffle the deck
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        
        return deck;
    }
    
    // Generate initial hand of 8 random cards
    generateInitialHand() {
        const hand = [];
        for (let i = 0; i < 8; i++) {
            if (this.deck.length > 0) {
                hand.push(this.deck.pop());
            }
        }
        return hand;
    }
    
    // Get current game state
    getGameState() {
        return this.currentState;
    }
    
    // Play a card from hand to expedition
    playCard(cardId, color) {
        // Only allow actions on the player's turn
        if (this.currentState.currentPlayerId !== this.userId || this.currentState.turnPhase !== 'play') {
            return false;
        }
        
        // Find the card in the player's hand
        const handIndex = this.currentState.player1.hand.findIndex(card => card.id === cardId);
        if (handIndex === -1) {
            return false;
        }
        
        const card = this.currentState.player1.hand[handIndex];
        
        // Verify the card color matches the expedition color
        if (card.color !== color) {
            return false;
        }
        
        // Check if the play is valid according to expedition rules
        const expedition = this.currentState.player1.expeditions[color];
        
        // If expedition is empty, any card of that color is valid
        if (expedition.length === 0) {
            // All good
        } 
        // If there are only wager cards, any expedition card is valid
        else if (expedition.every(c => c.type === 'wager')) {
            if (card.type === 'wager') {
                // Can add another wager
            } else {
                // Adding expedition card after wagers is valid
            }
        } 
        // If the last card is an expedition card, new card must have higher value
        else {
            const lastExpeditionCard = [...expedition].filter(c => c.type === 'expedition').pop();
            if (lastExpeditionCard && card.type === 'expedition') {
                if (typeof lastExpeditionCard.value === 'number' && 
                    typeof card.value === 'number' && 
                    card.value <= lastExpeditionCard.value) {
                    return false;
                }
            }
            if (lastExpeditionCard && card.type === 'wager') {
                return false;
            }
        }
        
        // Move card from hand to expedition
        this.currentState.player1.hand.splice(handIndex, 1);
        this.currentState.player1.expeditions[color].push(card);
        
        // Change to draw phase
        this.currentState.turnPhase = 'draw';
        
        // Notify state change
        this.notifyStateChange();
        
        return true;
    }
    
    // Discard a card from the player's hand
    discardCard(cardId) {
        // Only allow actions on the player's turn
        if (this.currentState.currentPlayerId !== this.userId || this.currentState.turnPhase !== 'play') {
            return false;
        }
        
        // Find the card in the player's hand
        const handIndex = this.currentState.player1.hand.findIndex(card => card.id === cardId);
        if (handIndex === -1) {
            return false;
        }
        
        const card = this.currentState.player1.hand[handIndex];
        
        // Move card from hand to discard pile
        this.currentState.player1.hand.splice(handIndex, 1);
        this.currentState.discardPiles[card.color].push(card);
        
        // Change to draw phase
        this.currentState.turnPhase = 'draw';
        
        // Notify state change
        this.notifyStateChange();
        
        return true;
    }
    
    // Draw a card from the deck
    drawFromDeck() {
        // Only allow actions on the player's turn
        if (this.currentState.currentPlayerId !== this.userId || this.currentState.turnPhase !== 'draw') {
            return false;
        }
        
        // Check if deck is empty
        if (this.deck.length === 0) {
            this.endRound();
            return true;
        }
        
        // Draw a card
        const card = this.deck.pop();
        this.currentState.player1.hand.push(card);
        
        // Update cards in deck count
        this.currentState.cardsInDeck = this.deck.length;
        
        // End turn
        this.endTurn();
        
        return true;
    }
    
    // Draw a card from a discard pile
    drawFromDiscardPile(color) {
        // Only allow actions on the player's turn
        if (this.currentState.currentPlayerId !== this.userId || this.currentState.turnPhase !== 'draw') {
            return false;
        }
        
        // Check if the discard pile has cards
        if (this.currentState.discardPiles[color].length === 0) {
            return false;
        }
        
        // Draw the top card from the discard pile
        const card = this.currentState.discardPiles[color].pop();
        this.currentState.player1.hand.push(card);
        
        // End turn
        this.endTurn();
        
        return true;
    }
    
    // End the current turn and switch players
    endTurn() {
        // Switch to opponent's turn
        this.currentState.currentPlayerId = this.opponentId;
        this.currentState.turnPhase = 'play';
        
        this.notifyStateChange();
        
        // Simulate opponent's turn after a delay
        setTimeout(() => this.simulateOpponentTurn(), 2000);
    }
    
    // Simulate opponent's turn (basic AI)
    simulateOpponentTurn() {
        if (this.currentState.currentPlayerId !== this.opponentId) {
            return;
        }
        
        // 50% chance to play a card, 50% chance to discard
        const playCard = Math.random() > 0.5;
        
        if (playCard) {
            // Choose a random expedition color
            const colors = ['red', 'green', 'white', 'blue', 'yellow'];
            if (this.currentState.usePurpleExpedition) {
                colors.push('purple');
            }
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // Add a card to the opponent's expedition
            const expedition = this.currentState.player2.expeditions[color];
            
            // Determine the next card value
            let nextValue = 2;
            if (expedition.length > 0) {
                const lastCard = expedition[expedition.length - 1];
                if (lastCard.type === 'expedition') {
                    nextValue = lastCard.value + 1;
                }
            }
            
            // Create a card
            const card = {
                id: `${color}_${nextValue}_ai`,
                color,
                type: 'expedition',
                value: nextValue
            };
            
            // Add to expedition
            this.currentState.player2.expeditions[color].push(card);
        } else {
            // Simulate discarding a card
            const colors = ['red', 'green', 'white', 'blue', 'yellow'];
            if (this.currentState.usePurpleExpedition) {
                colors.push('purple');
            }
            
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            // Create a discard card
            const card = {
                id: `${color}_${Math.floor(Math.random() * 9) + 2}_ai_discard`,
                color,
                type: 'expedition',
                value: Math.floor(Math.random() * 9) + 2
            };
            
            // Add to discard pile
            this.currentState.discardPiles[color].push(card);
        }
        
        // Set to draw phase
        this.currentState.turnPhase = 'draw';
        this.notifyStateChange();
        
        // Simulate drawing after a delay
        setTimeout(() => {
            // 70% chance to draw from deck, 30% chance to draw from discard pile
            const drawFromDeck = Math.random() > 0.3;
            
            if (drawFromDeck || this.allDiscardPilesEmpty()) {
                // Simulate drawing from deck
                this.currentState.cardsInDeck--;
                
                // Check if deck is empty
                if (this.currentState.cardsInDeck <= 0) {
                    this.endRound();
                    return;
                }
            } else {
                // Draw from a non-empty discard pile
                const nonEmptyPiles = Object.entries(this.currentState.discardPiles)
                    .filter(([_, cards]) => cards.length > 0)
                    .map(([color, _]) => color);
                
                if (nonEmptyPiles.length > 0) {
                    const color = nonEmptyPiles[Math.floor(Math.random() * nonEmptyPiles.length)];
                    this.currentState.discardPiles[color].pop();
                }
            }
            
            // End opponent's turn
            this.currentState.currentPlayerId = this.userId;
            this.currentState.turnPhase = 'play';
            this.notifyStateChange();
            
        }, 1000);
    }
    
    // Check if all discard piles are empty
    allDiscardPilesEmpty() {
        return Object.values(this.currentState.discardPiles).every(pile => pile.length === 0);
    }
    
    // End the current round
    endRound() {
        // Calculate scores
        const player1Score = this.calculateScore(this.currentState.player1.expeditions);
        const player2Score = this.calculateScore(this.currentState.player2.expeditions);
        
        // Update round scores
        const roundKey = `round${this.currentState.currentRound}`;
        this.currentState.scores.player1[roundKey] = player1Score;
        this.currentState.scores.player2[roundKey] = player2Score;
        
        // Update total scores
        this.currentState.scores.player1.total = 
            (this.currentState.scores.player1.round1 || 0) + 
            (this.currentState.scores.player1.round2 || 0) + 
            (this.currentState.scores.player1.round3 || 0);
        
        this.currentState.scores.player2.total = 
            (this.currentState.scores.player2.round1 || 0) + 
            (this.currentState.scores.player2.round2 || 0) + 
            (this.currentState.scores.player2.round3 || 0);
        
        // Check if game is over
        if (this.currentState.currentRound >= this.currentState.totalRounds) {
            this.endGame();
        } else {
            // Start next round
            this.startNewRound();
        }
    }
    
    // Start a new round
    startNewRound() {
        this.currentState.currentRound++;
        
        // Reset expeditions
        const colors = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
        colors.forEach(color => {
            this.currentState.player1.expeditions[color] = [];
            this.currentState.player2.expeditions[color] = [];
            this.currentState.discardPiles[color] = [];
        });
        
        // Reset deck and deal new cards
        this.deck = this.generateDeck();
        this.currentState.cardsInDeck = this.deck.length;
        this.currentState.player1.hand = this.generateInitialHand();
        
        // Reset turn
        this.currentState.currentPlayerId = this.userId;
        this.currentState.turnPhase = 'play';
        
        this.notifyStateChange();
    }
    
    // End the game
    endGame() {
        this.currentState.status = 'finished';
        
        // Determine winner
        if (this.currentState.scores.player1.total > this.currentState.scores.player2.total) {
            this.currentState.winner = this.userId;
        } else if (this.currentState.scores.player2.total > this.currentState.scores.player1.total) {
            this.currentState.winner = this.opponentId;
        } else {
            this.currentState.winner = null; // Tie
        }
        
        this.notifyStateChange();
    }
    
    // Calculate score for a set of expeditions
    calculateScore(expeditions) {
        let totalScore = 0;
        
        // Calculate score for each expedition
        Object.values(expeditions).forEach(expedition => {
            // Skip empty expeditions
            if (expedition.length === 0) {
                return;
            }
            
            // Count wager cards
            const wagerCount = expedition.filter(card => card.type === 'wager').length;
            
            // Sum card values
            let sum = 0;
            expedition.forEach(card => {
                if (card.type === 'expedition' && typeof card.value === 'number') {
                    sum += card.value;
                }
            });
            
            // Subtract expedition cost (20 points)
            let expeditionScore = sum - 20;
            
            // Apply wager multiplier
            if (wagerCount > 0) {
                expeditionScore *= (wagerCount + 1);
            }
            
            // Apply expedition bonus (if 8 or more cards)
            if (expedition.length >= 8) {
                expeditionScore += 20;
            }
            
            // Add to total
            totalScore += expeditionScore;
        });
        
        return totalScore;
    }
    
    // Notify state change to listeners
    notifyStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.currentState);
        }
    }
    
    // Register state change listener
    setOnStateChange(callback) {
        this.onStateChange = callback;
    }
}
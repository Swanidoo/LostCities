/**
 * Fallback game logic for Lost Cities
 * Used when server connection is unavailable or interrupted
 */
export class FallbackGameLogic {
    constructor(gameId, userId, opponentId = null) {
      this.gameId = gameId;
      this.userId = userId;
      this.opponentId = opponentId || 'opponent-' + Math.floor(Math.random() * 1000);
      this.onStateChange = null;
      this.currentState = this.createInitialState();
    }
    
    /**
     * Create an initial game state
     */
    createInitialState() {
      // Generate a deck
      const deck = this.generateDeck();
      
      // Deal cards to players
      const player1Hand = [];
      const player2Hand = [];
      
      for (let i = 0; i < 8; i++) {
        player1Hand.push(deck.pop());
        player2Hand.push(deck.pop());
      }
      
      // Initial game state
      return {
        gameId: this.gameId,
        status: 'in_progress',
        currentRound: 1,
        totalRounds: 3,
        currentPlayerId: this.userId, // Player starts first in fallback mode
        turnPhase: 'play',
        usePurpleExpedition: true,
        cardsInDeck: deck.length,
        player1: {
          id: this.userId,
          hand: player1Hand,
          expeditions: {
            red: [],
            green: [],
            white: [],
            blue: [],
            yellow: [],
            purple: []
          },
          handSize: player1Hand.length
        },
        player2: {
          id: this.opponentId,
          hand: player2Hand, // We include this for the AI opponent's logic
          expeditions: {
            red: [],
            green: [],
            white: [],
            blue: [],
            yellow: [],
            purple: []
          },
          handSize: player2Hand.length
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
        winner: null,
        deck: deck // Include for fallback logic
      };
    }
    
    /**
     * Generate a full deck of cards
     */
    generateDeck() {
      const colors = ['red', 'green', 'white', 'blue', 'yellow', 'purple'];
      const deck = [];
      
      // For each color, create the cards
      colors.forEach(color => {
        // Create expedition cards (2-10)
        for (let value = 2; value <= 10; value++) {
          deck.push({
            id: `${color}_${value}`,
            color,
            type: 'expedition',
            value
          });
        }
        
        // Create wager cards (3 per color)
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
      return this.shuffleArray(deck);
    }
    
    /**
     * Shuffle an array using Fisher-Yates algorithm
     */
    shuffleArray(array) {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    }
    
    /**
     * Set the state change callback
     */
    setOnStateChange(callback) {
      this.onStateChange = callback;
    }
    
    /**
     * Notify listeners of state changes
     */
    notifyStateChange() {
      if (this.onStateChange) {
        // In the fallback mode, we should only send player1 hand for the client
        const player1 = this.userId === this.currentState.player1.id ? 
          this.currentState.player1 : this.currentState.player2;
          
        const player2 = this.userId === this.currentState.player1.id ? 
          this.currentState.player2 : this.currentState.player1;
        
        // Create a sanitized version of the state to send to the UI
        const sanitizedState = {
          ...this.currentState,
          player1: {
            ...player1,
            // Only include hand for player1 (the user)
            hand: player1.hand
          },
          player2: {
            ...player2,
            // Don't include hand for player2 (opponent)
            hand: undefined
          },
          // Don't include the full deck in the state sent to UI
          deck: undefined
        };
        
        this.onStateChange(sanitizedState);
      }
    }
    
    /**
     * Play a card to an expedition
     */
    playCard(cardId, color) {
      // Check if it's the player's turn and in play phase
      if (this.currentState.currentPlayerId !== this.userId || 
          this.currentState.turnPhase !== 'play') {
        return false;
      }
      
      const player = this.currentState.player1.id === this.userId ? 
        this.currentState.player1 : this.currentState.player2;
      
      // Find the card in the player's hand
      const cardIndex = player.hand.findIndex(card => card.id === cardId);
      if (cardIndex === -1) {
        return false;
      }
      
      const card = player.hand[cardIndex];
      
      // Check if card color matches expedition color
      if (card.color !== color) {
        return false;
      }
      
      // Check if play is valid according to expedition rules
      const expedition = player.expeditions[color];
      
      let isValidPlay = true;
      
      // If there are cards in the expedition, check rules
      if (expedition.length > 0) {
        // If there are only wager cards, any expedition card is valid
        if (expedition.every(c => c.type === 'wager')) {
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
              isValidPlay = false;
            }
          }
          if (lastExpeditionCard && card.type === 'wager') {
            isValidPlay = false;
          }
        }
      }
      
      if (!isValidPlay) {
        return false;
      }
      
      // Move card from hand to expedition
      player.hand.splice(cardIndex, 1);
      player.expeditions[color].push(card);
      
      // Update hand size
      player.handSize = player.hand.length;
      
      // Change to draw phase
      this.currentState.turnPhase = 'draw';
      
      // Notify state change
      this.notifyStateChange();
      
      return true;
    }
    
    /**
     * Discard a card
     */
    discardCard(cardId) {
      // Check if it's the player's turn and in play phase
      if (this.currentState.currentPlayerId !== this.userId || 
          this.currentState.turnPhase !== 'play') {
        return false;
      }
      
      const player = this.currentState.player1.id === this.userId ? 
        this.currentState.player1 : this.currentState.player2;
      
      // Find the card in the player's hand
      const cardIndex = player.hand.findIndex(card => card.id === cardId);
      if (cardIndex === -1) {
        return false;
      }
      
      const card = player.hand[cardIndex];
      
      // Move card from hand to discard pile
      player.hand.splice(cardIndex, 1);
      this.currentState.discardPiles[card.color].push(card);
      
      // Update hand size
      player.handSize = player.hand.length;
      
      // Change to draw phase
      this.currentState.turnPhase = 'draw';
      
      // Notify state change
      this.notifyStateChange();
      
      return true;
    }
    
    /**
     * Draw a card from the deck
     */
    drawFromDeck() {
      // Check if it's the player's turn and in draw phase
      if (this.currentState.currentPlayerId !== this.userId || 
          this.currentState.turnPhase !== 'draw') {
        return false;
      }
      
      // Check if deck is empty
      if (this.currentState.deck.length === 0) {
        this.endRound();
        return true;
      }
      
      const player = this.currentState.player1.id === this.userId ? 
        this.currentState.player1 : this.currentState.player2;
      
      // Draw a card from the deck
      const card = this.currentState.deck.pop();
      player.hand.push(card);
      
      // Update deck and hand sizes
      this.currentState.cardsInDeck = this.currentState.deck.length;
      player.handSize = player.hand.length;
      
      // End turn
      this.endTurn();
      
      return true;
    }
    
    /**
     * Draw a card from a discard pile
     */
    drawFromDiscardPile(color) {
      // Check if it's the player's turn and in draw phase
      if (this.currentState.currentPlayerId !== this.userId || 
          this.currentState.turnPhase !== 'draw') {
        return false;
      }
      
      // Check if the discard pile has cards
      if (this.currentState.discardPiles[color].length === 0) {
        return false;
      }
      
      const player = this.currentState.player1.id === this.userId ? 
        this.currentState.player1 : this.currentState.player2;
      
      // Draw the top card from the discard pile
      const card = this.currentState.discardPiles[color].pop();
      player.hand.push(card);
      
      // Update hand size
      player.handSize = player.hand.length;
      
      // End turn
      this.endTurn();
      
      return true;
    }
    
    /**
     * End the current turn
     */
    endTurn() {
      // Switch current player
      this.currentState.currentPlayerId = this.currentState.currentPlayerId === this.userId ? 
        this.opponentId : this.userId;
      
      // Reset to play phase
      this.currentState.turnPhase = 'play';
      
      // Notify state change
      this.notifyStateChange();
      
      // If it's the opponent's turn, simulate their move
      if (this.currentState.currentPlayerId === this.opponentId) {
        setTimeout(() => this.simulateOpponentTurn(), 1000);
      }
    }
    
    /**
     * Simulate opponent's turn
     */
    simulateOpponentTurn() {
      const opponent = this.currentState.player1.id === this.opponentId ? 
        this.currentState.player1 : this.currentState.player2;
      
      // Play phase
      if (this.currentState.turnPhase === 'play') {
        // Decide whether to play or discard (60% play, 40% discard)
        const playCard = Math.random() < 0.6;
        
        if (playCard) {
          // Try to play a card to an expedition
          this.simulateOpponentPlayCard(opponent);
        } else {
          // Discard a card
          this.simulateOpponentDiscardCard(opponent);
        }
      }
      
      // Draw phase happens after play phase
      if (this.currentState.turnPhase === 'draw') {
        // Decide whether to draw from deck or discard pile (70% deck, 30% discard)
        const drawFromDeck = Math.random() < 0.7;
        
        if (drawFromDeck || this.allDiscardPilesEmpty()) {
          // Draw from deck
          this.simulateOpponentDrawFromDeck(opponent);
        } else {
          // Draw from a discard pile
          this.simulateOpponentDrawFromDiscardPile(opponent);
        }
      }
    }
    
    /**
     * Simulate opponent playing a card
     */
    simulateOpponentPlayCard(opponent) {
      // Group cards by color
      const cardsByColor = {};
      opponent.hand.forEach(card => {
        if (!cardsByColor[card.color]) {
          cardsByColor[card.color] = [];
        }
        cardsByColor[card.color].push(card);
      });
      
      // Try to find a valid play
      let validPlay = null;
      
      // Try to continue existing expeditions first
      for (const color in opponent.expeditions) {
        if (opponent.expeditions[color].length > 0 && cardsByColor[color]?.length > 0) {
          const expedition = opponent.expeditions[color];
          const cards = cardsByColor[color];
          
          // Check if there are only wager cards in the expedition
          const onlyWagers = expedition.every(c => c.type === 'wager');
          
          if (onlyWagers) {
            // Can play any card of this color
            const card = cards[0]; // Just take the first one
            validPlay = { card, color };
            break;
          } else {
            // Need to play cards in ascending order
            const lastCard = [...expedition].filter(c => c.type === 'expedition').pop();
            if (lastCard && typeof lastCard.value === 'number') {
              // Find a card with higher value
              const validCard = cards.find(c => 
                c.type === 'expedition' && 
                typeof c.value === 'number' && 
                c.value > lastCard.value
              );
              
              if (validCard) {
                validPlay = { card: validCard, color };
                break;
              }
            }
          }
        }
      }
      
      // If no valid play found for existing expeditions, try to start a new one
      if (!validPlay) {
        for (const color in cardsByColor) {
          if (opponent.expeditions[color].length === 0 && cardsByColor[color].length > 0) {
            // Sort cards by type (wagers first) then by value
            const cards = [...cardsByColor[color]].sort((a, b) => {
              if (a.type !== b.type) {
                return a.type === 'wager' ? -1 : 1;
              }
              
              if (a.type === 'expedition' && b.type === 'expedition') {
                return a.value - b.value;
              }
              
              return 0;
            });
            
            validPlay = { card: cards[0], color };
            break;
          }
        }
      }
      
      // If we found a valid play, execute it
      if (validPlay) {
        const { card, color } = validPlay;
        
        // Find the card index in hand
        const cardIndex = opponent.hand.findIndex(c => c.id === card.id);
        if (cardIndex !== -1) {
          // Move card from hand to expedition
          opponent.hand.splice(cardIndex, 1);
          opponent.expeditions[color].push(card);
          
          // Update hand size
          opponent.handSize = opponent.hand.length;
          
          // Change to draw phase
          this.currentState.turnPhase = 'draw';
          
          // Notify state change
          this.notifyStateChange();
        }
      } else {
        // If no valid play, discard a card
        this.simulateOpponentDiscardCard(opponent);
      }
    }
    
    /**
     * Simulate opponent discarding a card
     */
    simulateOpponentDiscardCard(opponent) {
      if (opponent.hand.length === 0) {
        // No cards to discard
        this.currentState.turnPhase = 'draw';
        this.notifyStateChange();
        return;
      }
      
      // Choose a card to discard
      // Prefer to discard high-value cards or cards with no matching expedition
      let cardToDiscard = null;
      
      // Check for cards that aren't useful for current expeditions
      for (const card of opponent.hand) {
        const expedition = opponent.expeditions[card.color];
        
        if (expedition.length === 0) {
          // Haven't started this expedition yet, might want to
          continue;
        }
        
        // If there are only wager cards, we might want to play more
        if (expedition.every(c => c.type === 'wager') && card.type === 'wager') {
          continue;
        }
        
        // If we have expedition cards, check if this one is too low
        if (card.type === 'expedition') {
          const lastExpCard = [...expedition].filter(c => c.type === 'expedition').pop();
          if (lastExpCard && typeof lastExpCard.value === 'number' && 
              typeof card.value === 'number' && card.value <= lastExpCard.value) {
            // This card is too low to play, discard it
            cardToDiscard = card;
            break;
          }
        }
        
        // Wager cards after expedition cards can't be played
        if (card.type === 'wager' && expedition.some(c => c.type === 'expedition')) {
          cardToDiscard = card;
          break;
        }
      }
      
      // If we didn't find a specific bad card, just pick one randomly
      if (!cardToDiscard && opponent.hand.length > 0) {
        cardToDiscard = opponent.hand[Math.floor(Math.random() * opponent.hand.length)];
      }
      
      if (cardToDiscard) {
        // Find the card index in hand
        const cardIndex = opponent.hand.findIndex(c => c.id === cardToDiscard.id);
        if (cardIndex !== -1) {
          // Move card from hand to discard pile
          opponent.hand.splice(cardIndex, 1);
          this.currentState.discardPiles[cardToDiscard.color].push(cardToDiscard);
          
          // Update hand size
          opponent.handSize = opponent.hand.length;
          
          // Change to draw phase
          this.currentState.turnPhase = 'draw';
          
          // Notify state change
          this.notifyStateChange();
        }
      }
    }
    
    /**
     * Simulate opponent drawing from deck
     */
    simulateOpponentDrawFromDeck(opponent) {
      // Check if deck is empty
      if (this.currentState.deck.length === 0) {
        this.endRound();
        return;
      }
      
      // Draw a card from the deck
      const card = this.currentState.deck.pop();
      opponent.hand.push(card);
      
      // Update deck and hand sizes
      this.currentState.cardsInDeck = this.currentState.deck.length;
      opponent.handSize = opponent.hand.length;
      
      // End turn
      this.endTurn();
    }
    
    /**
     * Simulate opponent drawing from a discard pile
     */
    simulateOpponentDrawFromDiscardPile(opponent) {
      // Find non-empty discard piles
      const nonEmptyPiles = Object.entries(this.currentState.discardPiles)
        .filter(([_, cards]) => cards.length > 0)
        .map(([color, _]) => color);
      
      if (nonEmptyPiles.length === 0) {
        // No cards in discard piles, draw from deck instead
        this.simulateOpponentDrawFromDeck(opponent);
        return;
      }
      
      // Choose a pile - prefer to take cards of colors we're already playing
      let chosenColor = null;
      for (const color of nonEmptyPiles) {
        if (opponent.expeditions[color].length > 0) {
          chosenColor = color;
          break;
        }
      }
      
      // If no color matches expeditions, pick randomly
      if (!chosenColor) {
        chosenColor = nonEmptyPiles[Math.floor(Math.random() * nonEmptyPiles.length)];
      }
      
      // Draw the top card from the chosen discard pile
      const card = this.currentState.discardPiles[chosenColor].pop();
      opponent.hand.push(card);
      
      // Update hand size
      opponent.handSize = opponent.hand.length;
      
      // End turn
      this.endTurn();
    }
    
    /**
     * Check if all discard piles are empty
     */
    allDiscardPilesEmpty() {
      return Object.values(this.currentState.discardPiles).every(pile => pile.length === 0);
    }
    
    /**
     * End the current round
     */
    endRound() {
      // Calculate scores
      const player1Score = this.calculateScore(this.currentState.player1.expeditions);
      const player2Score = this.calculateScore(this.currentState.player2.expeditions);
      
      // Update scores
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
      
      // Notify state change
      this.notifyStateChange();
    }
    
    /**
     * Calculate score for expeditions
     */
    calculateScore(expeditions) {
      let totalScore = 0;
      
      // Calculate score for each expedition
      for (const color in expeditions) {
        const expedition = expeditions[color];
        
        // Skip empty expeditions
        if (expedition.length === 0) {
          continue;
        }
        
        // Count wager cards
        const wagerCount = expedition.filter(card => card.type === 'wager').length;
        
        // Sum expedition card values
        let expeditionSum = 0;
        expedition.forEach(card => {
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
        if (expedition.length >= 8) {
          expeditionScore += 20;
        }
        
        // Add to total
        totalScore += expeditionScore;
      }
      
      return totalScore;
    }
    
    /**
     * Start a new round
     */
    startNewRound() {
      this.currentState.currentRound++;
      
      // Generate a new deck
      this.currentState.deck = this.generateDeck();
      
      // Reset expeditions
      for (const color in this.currentState.player1.expeditions) {
        this.currentState.player1.expeditions[color] = [];
        this.currentState.player2.expeditions[color] = [];
      }
      
      // Reset discard piles
      for (const color in this.currentState.discardPiles) {
        this.currentState.discardPiles[color] = [];
      }
      
      // Deal new hands
      this.currentState.player1.hand = [];
      this.currentState.player2.hand = [];
      
      for (let i = 0; i < 8; i++) {
        this.currentState.player1.hand.push(this.currentState.deck.pop());
        this.currentState.player2.hand.push(this.currentState.deck.pop());
      }
      
      // Update hand sizes
      this.currentState.player1.handSize = this.currentState.player1.hand.length;
      this.currentState.player2.handSize = this.currentState.player2.hand.length;
      
      // Update deck size
      this.currentState.cardsInDeck = this.currentState.deck.length;
      
      // Reset turn phase
      this.currentState.turnPhase = 'play';
      
      // Alternate starting player between rounds
      this.currentState.currentPlayerId = 
        this.currentState.currentRound % 2 === 1 ? this.userId : this.opponentId;
      
      // If it's the opponent's turn, simulate their move
      if (this.currentState.currentPlayerId === this.opponentId) {
        setTimeout(() => this.simulateOpponentTurn(), 1000);
      }
    }
    
    /**
     * End the game
     */
    endGame() {
      this.currentState.status = 'finished';
      
      // Determine winner
      if (this.currentState.scores.player1.total > this.currentState.scores.player2.total) {
        this.currentState.winner = this.currentState.player1.id;
      } else if (this.currentState.scores.player2.total > this.currentState.scores.player1.total) {
        this.currentState.winner = this.currentState.player2.id;
      } else {
        this.currentState.winner = null; // Tie
      }
    }
  }
  
  export default FallbackGameLogic;
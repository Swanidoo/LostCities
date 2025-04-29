/**
 * Lost Cities Game Controller
 * 
 * This file handles the core game logic for Lost Cities card game
 */

export interface Card {
    id: string;
    color: string;
    type: 'expedition' | 'wager';
    value: number | string;
  }
  
  export interface Player {
    id: string;
    hand: Card[];
    expeditions: {
      [key: string]: Card[];
    };
  }
  
  export interface GameOptions {
    gameId: string | number;
    usePurpleExpedition?: boolean;
    totalRounds?: number;
    player1?: Partial<Player>;
    player2?: Partial<Player>;
    onGameStateChanged?: (gameState: any) => void;
    onError?: (message: string) => void;
  }
  
  export interface GameScores {
    player1: {
      round1: number;
      round2: number;
      round3: number;
      total: number;
    };
    player2: {
      round1: number;
      round2: number;
      round3: number;
      total: number;
    };
  }
  
  export interface MoveRecord {
    playerId: string;
    action: string;
    cardId?: string;
    destination?: string;
    color?: string;
    source?: string;
  }
  
  export class LostCitiesGame {
    // Game configuration
    gameId: string | number;
    usePurpleExpedition: boolean;
    totalRounds: number;
    
    // Game state
    player1: Player;
    player2: Player;
    currentRound: number;
    currentPlayerId: string;
    deck: Card[];
    discardPiles: {
      [key: string]: Card[];
    };
    gameStatus: 'waiting' | 'in_progress' | 'finished';
    turnPhase: 'play' | 'draw';
    moveHistory: MoveRecord[];
    scores: GameScores;
    winner: string | null;
    
    // Event handlers
    onGameStateChanged: (gameState: any) => void;
    onError: (message: string) => void;
    
    constructor(options: GameOptions) {
      // Game configuration
      this.gameId = options.gameId;
      this.usePurpleExpedition = options.usePurpleExpedition || false;
      this.totalRounds = options.totalRounds || 3;
      
      // Game state
      this.player1 = {
        id: options.player1?.id || '',
        hand: options.player1?.hand || [],
        expeditions: options.player1?.expeditions || {
          red: [],
          green: [],
          white: [],
          blue: [],
          yellow: [],
          purple: []
        }
      };
      
      this.player2 = {
        id: options.player2?.id || '',
        hand: options.player2?.hand || [],
        expeditions: options.player2?.expeditions || {
          red: [],
          green: [],
          white: [],
          blue: [],
          yellow: [],
          purple: []
        }
      };
      
      this.currentRound = 1;
      this.currentPlayerId = '';
      this.deck = [];
      this.discardPiles = {
        red: [],
        green: [],
        white: [],
        blue: [],
        yellow: [],
        purple: []
      };
      
      this.gameStatus = 'waiting';
      this.turnPhase = 'play';
      this.moveHistory = [];
      this.scores = {
        player1: { round1: 0, round2: 0, round3: 0, total: 0 },
        player2: { round1: 0, round2: 0, round3: 0, total: 0 }
      };
      this.winner = null;
      
      // Event handlers
      this.onGameStateChanged = options.onGameStateChanged || (() => {});
      this.onError = options.onError || console.error;
    }
    
    /**
     * Initialize a new game
     */
    initGame(player1Id: string, player2Id: string): void {
      this.player1 = {
        id: player1Id,
        hand: [],
        expeditions: {
          red: [],
          green: [],
          white: [],
          blue: [],
          yellow: [],
          purple: []
        }
      };
      
      this.player2 = {
        id: player2Id,
        hand: [],
        expeditions: {
          red: [],
          green: [],
          white: [],
          blue: [],
          yellow: [],
          purple: []
        }
      };
      
      this.currentPlayerId = player1Id;
      this.gameStatus = 'in_progress';
      this.initRound();
    }
    
    /**
     * Initialize a new round
     */
    initRound(): void {
      // Reset deck, hands, and expeditions
      this.deck = [];
      
      // Reset discard piles
      Object.keys(this.discardPiles).forEach(color => {
        this.discardPiles[color] = [];
      });
      
      // Reset expeditions
      const colors = ['red', 'green', 'white', 'blue', 'yellow'];
      if (this.usePurpleExpedition) {
        colors.push('purple');
      }
      
      colors.forEach(color => {
        this.player1.expeditions[color] = [];
        this.player2.expeditions[color] = [];
      });
      
      // Reset hands
      this.player1.hand = [];
      this.player2.hand = [];
      
      // Create deck
      this.createDeck();
      
      // Shuffle deck
      this.shuffleDeck();
      
      // Deal cards
      this.dealInitialHands();
      
      // Set game state
      this.turnPhase = 'play';
      
      // Notify state change
      this.onGameStateChanged(this.getGameState());
    }
    
    /**
     * Create a new deck of cards
     */
    createDeck(): void {
      const colors = ['red', 'green', 'white', 'blue', 'yellow'];
      
      // Add purple if enabled
      if (this.usePurpleExpedition) {
        colors.push('purple');
      }
      
      // Create expedition cards (values 2-10)
      colors.forEach(color => {
        for (let value = 2; value <= 10; value++) {
          this.deck.push({
            id: `${color}_${value}`,
            color,
            type: 'expedition',
            value
          });
        }
        
        // Create wager cards (3 per color)
        for (let i = 0; i < 3; i++) {
          this.deck.push({
            id: `${color}_wager_${i}`,
            color,
            type: 'wager',
            value: 'W'
          });
        }
      });
    }
    
    /**
     * Shuffle the deck
     */
    shuffleDeck(): void {
      for (let i = this.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.deck[i], this.deck[j]] = [this.deck[j], this.deck[i]];
      }
    }
    
    /**
     * Deal initial hands
     */
    dealInitialHands(): void {
      // Deal 8 cards to each player
      for (let i = 0; i < 8; i++) {
        this.player1.hand.push(this.deck.pop()!);
        this.player2.hand.push(this.deck.pop()!);
      }
    }
    
    /**
     * Play a card from hand to expedition
     */
    playCardToExpedition(playerId: string, cardId: string, color: string): boolean {
      const player = this.getPlayerById(playerId);
      if (!player) {
        this.onError('Invalid player ID');
        return false;
      }
      
      // Verify it's the player's turn
      if (this.currentPlayerId !== playerId) {
        this.onError('Not your turn');
        return false;
      }
      
      // Verify we're in the play phase
      if (this.turnPhase !== 'play') {
        this.onError('Wrong turn phase');
        return false;
      }
      
      // Find the card in the player's hand
      const cardIndex = player.hand.findIndex(card => card.id === cardId);
      if (cardIndex === -1) {
        this.onError('Card not in hand');
        return false;
      }
      
      const card = player.hand[cardIndex];
      
      // Verify the card color matches the expedition color
      if (card.color !== color) {
        this.onError('Card color does not match expedition color');
        return false;
      }
      
      // Verify the play is valid according to expedition rules
      const expedition = player.expeditions[color];
      
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
            this.onError('Expedition cards must be placed in ascending order');
            return false;
          }
        }
        if (lastExpeditionCard && card.type === 'wager') {
          this.onError('Wager cards must be placed before expedition cards');
          return false;
        }
      }
      
      // Move card from hand to expedition
      player.hand.splice(cardIndex, 1);
      player.expeditions[color].push(card);
      
      // Record the move
      this.moveHistory.push({
        playerId,
        action: 'play_card',
        cardId,
        destination: 'expedition',
        color
      });
      
      // Change to draw phase
      this.turnPhase = 'draw';
      
      // Notify state change
      this.onGameStateChanged(this.getGameState());
      
      return true;
    }
    
    /**
     * Discard a card from hand
     */
    discardCard(playerId: string, cardId: string): boolean {
      const player = this.getPlayerById(playerId);
      if (!player) {
        this.onError('Invalid player ID');
        return false;
      }
      
      // Verify it's the player's turn
      if (this.currentPlayerId !== playerId) {
        this.onError('Not your turn');
        return false;
      }
      
      // Verify we're in the play phase
      if (this.turnPhase !== 'play') {
        this.onError('Wrong turn phase');
        return false;
      }
      
      // Find the card in the player's hand
      const cardIndex = player.hand.findIndex(card => card.id === cardId);
      if (cardIndex === -1) {
        this.onError('Card not in hand');
        return false;
      }
      
      const card = player.hand[cardIndex];
      
      // Move card from hand to discard pile
      player.hand.splice(cardIndex, 1);
      this.discardPiles[card.color].push(card);
      
      // Record the move
      this.moveHistory.push({
        playerId,
        action: 'discard_card',
        cardId,
        destination: 'discard_pile',
        color: card.color
      });
      
      // Change to draw phase
      this.turnPhase = 'draw';
      
      // Notify state change
      this.onGameStateChanged(this.getGameState());
      
      return true;
    }
    
    /**
     * Draw a card from the deck
     */
    drawCardFromDeck(playerId: string): boolean {
      const player = this.getPlayerById(playerId);
      if (!player) {
        this.onError('Invalid player ID');
        return false;
      }
      
      // Verify it's the player's turn
      if (this.currentPlayerId !== playerId) {
        this.onError('Not your turn');
        return false;
      }
      
      // Verify we're in the draw phase
      if (this.turnPhase !== 'draw') {
        this.onError('Wrong turn phase');
        return false;
      }
      
      // Check if deck is empty
      if (this.deck.length === 0) {
        // End of round
        this.endRound();
        return true;
      }
      
      // Draw a card
      const card = this.deck.pop()!;
      player.hand.push(card);
      
      // Record the move
      this.moveHistory.push({
        playerId,
        action: 'draw_card',
        source: 'deck'
      });
      
      // End turn, switch to other player
      this.endTurn();
      
      return true;
    }
    
    /**
     * Draw a card from a discard pile
     */
    drawCardFromDiscardPile(playerId: string, color: string): boolean {
      const player = this.getPlayerById(playerId);
      if (!player) {
        this.onError('Invalid player ID');
        return false;
      }
      
      // Verify it's the player's turn
      if (this.currentPlayerId !== playerId) {
        this.onError('Not your turn');
        return false;
      }
      
      // Verify we're in the draw phase
      if (this.turnPhase !== 'draw') {
        this.onError('Wrong turn phase');
        return false;
      }
      
      // Check if the discard pile has cards
      if (this.discardPiles[color].length === 0) {
        this.onError('Discard pile is empty');
        return false;
      }
      
      // Draw a card from the discard pile
      const card = this.discardPiles[color].pop()!;
      player.hand.push(card);
      
      // Record the move
      this.moveHistory.push({
        playerId,
        action: 'draw_card',
        source: 'discard_pile',
        color
      });
      
      // End turn, switch to other player
      this.endTurn();
      
      return true;
    }
    
    /**
     * End the current turn
     */
    endTurn(): void {
      // Switch current player
      this.currentPlayerId = this.currentPlayerId === this.player1.id ? this.player2.id : this.player1.id;
      this.turnPhase = 'play';
      
      // Notify state change
      this.onGameStateChanged(this.getGameState());
    }
    
    /**
     * End the current round and calculate scores
     */
    endRound(): void {
      // Calculate scores for player 1
      const player1Score = this.calculatePlayerScore(this.player1);
      
      // Calculate scores for player 2
      const player2Score = this.calculatePlayerScore(this.player2);
      
      // Save scores for this round
      const roundKey = `round${this.currentRound}` as keyof GameScores['player1'];
      this.scores.player1[roundKey] = player1Score;
      this.scores.player2[roundKey] = player2Score;
      
      // Update total scores
      this.scores.player1.total += player1Score;
      this.scores.player2.total += player2Score;
      
      // Check if game is over
      if (this.currentRound >= this.totalRounds) {
        this.endGame();
      } else {
        // Start next round
        this.currentRound++;
        this.initRound();
      }
    }
    
    /**
     * Calculate score for a player
     */
    calculatePlayerScore(player: Player): number {
      let totalScore = 0;
      
      // Calculate score for each expedition
      Object.keys(player.expeditions).forEach(color => {
        const expedition = player.expeditions[color];
        
        // Skip empty expeditions
        if (expedition.length === 0) {
          return;
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
      });
      
      return totalScore;
    }
    
    /**
     * End the game
     */
    endGame(): void {
      this.gameStatus = 'finished';
      
      // Determine winner
      if (this.scores.player1.total > this.scores.player2.total) {
        this.winner = this.player1.id;
      } else if (this.scores.player2.total > this.scores.player1.total) {
        this.winner = this.player2.id;
      } else {
        this.winner = null; // Tie
      }
      
      // Notify state change
      this.onGameStateChanged(this.getGameState());
    }
    
    /**
     * Get player object by ID
     */
    getPlayerById(playerId: string): Player | null {
      if (playerId === this.player1.id) {
        return this.player1;
      } else if (playerId === this.player2.id) {
        return this.player2;
      }
      return null;
    }
    
    /**
     * Get current game state (for UI updates and API responses)
     */
    getGameState(forPlayerId?: string): any {
      const state = {
        gameId: this.gameId,
        status: this.gameStatus,
        currentRound: this.currentRound,
        totalRounds: this.totalRounds,
        currentPlayerId: this.currentPlayerId,
        turnPhase: this.turnPhase,
        usePurpleExpedition: this.usePurpleExpedition,
        cardsInDeck: this.deck.length,
        player1: {
          id: this.player1.id,
          expeditions: this.player1.expeditions,
          handSize: this.player1.hand.length
        },
        player2: {
          id: this.player2.id,
          expeditions: this.player2.expeditions,
          handSize: this.player2.hand.length
        },
        discardPiles: this.discardPiles,
        scores: this.scores,
        winner: this.winner
      };
      
      // Include hands only for the requesting player
      if (forPlayerId) {
        if (forPlayerId === this.player1.id) {
          (state.player1 as any).hand = this.player1.hand;
        } else if (forPlayerId === this.player2.id) {
          (state.player2 as any).hand = this.player2.hand;
        }
      }
      
      return state;
    }
    
    /**
     * Serialize game state to JSON (for saving to database)
     */
    serialize(): string {
      return JSON.stringify({
        gameId: this.gameId,
        usePurpleExpedition: this.usePurpleExpedition,
        totalRounds: this.totalRounds,
        currentRound: this.currentRound,
        currentPlayerId: this.currentPlayerId,
        turnPhase: this.turnPhase,
        gameStatus: this.gameStatus,
        player1: this.player1,
        player2: this.player2,
        deck: this.deck,
        discardPiles: this.discardPiles,
        moveHistory: this.moveHistory,
        scores: this.scores,
        winner: this.winner
      });
    }
    
    /**
     * Recreate game from serialized state
     */
    static deserialize(jsonString: string, options: Partial<GameOptions> = {}): LostCitiesGame {
      const data = JSON.parse(jsonString);
      const game = new LostCitiesGame({
        ...options,
        gameId: data.gameId,
        usePurpleExpedition: data.usePurpleExpedition,
        totalRounds: data.totalRounds,
        player1: data.player1,
        player2: data.player2
      });
      
      game.currentRound = data.currentRound;
      game.currentPlayerId = data.currentPlayerId;
      game.turnPhase = data.turnPhase;
      game.gameStatus = data.gameStatus;
      game.deck = data.deck;
      game.discardPiles = data.discardPiles;
      game.moveHistory = data.moveHistory;
      game.scores = data.scores;
      game.winner = data.winner;
      
      return game;
    }
  }
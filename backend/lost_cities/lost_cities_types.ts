/**
 * Lost Cities Game Type Definitions
 * 
 * This file contains types and interfaces for the Lost Cities card game
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
  gameMode?: string;
  player1?: Partial<Player>;
  player2?: Partial<Player>;
  onGameStateChanged?: (gameState: any) => void;
  onError?: (message: string) => void;
  lastDiscardedPile?: string; // Couleur de la dernière pile défaussée par le joueur actuel
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

export interface GameState {
  gameId: string | number;
  status: 'waiting' | 'in_progress' | 'finished';
  currentRound: number;
  totalRounds: number;
  currentPlayerId: string;
  turnPhase: 'play' | 'draw';
  usePurpleExpedition: boolean;
  cardsInDeck: number;
  lastDiscardedPile: string | null;
  player1: {
    id: string;
    expeditions: {
      [key: string]: Card[];
    };
    handSize: number;
    hand?: Card[];
    // Ajouter ces champs
    username?: string;
    avatar_url?: string;
  };
  player2: {
    id: string;
    expeditions: {
      [key: string]: Card[];
    };
    handSize: number;
    hand?: Card[];
    // Ajouter ces champs
    username?: string;
    avatar_url?: string;
  };
  discardPiles: {
    [key: string]: Card[];
  };
  scores: GameScores;
  winner: string | null;
}

export interface ExpeditionData {
  id: number;
  board_id: number;
  player_id: string;
  color: string;
  wager_count: number;
  card_count: number;
  total_value: number;
  score: number;
  has_started: boolean;
}

export interface GameCardData {
  id: number;
  game_id: number;
  card_id: string;
  location: string;
  expedition_id: number | null;
  pile_id: number | null;
  position: number;
  played_at: string | null;
}

export interface DiscardPileData {
  id: number;
  board_id: number;
  color: string;
  top_card_id: string | null;
}

export interface BoardData {
  id: number;
  game_id: number;
  use_purple_expedition: boolean;
  remaining_cards_in_deck: number;
  current_round: number;
  round1_score_player1: number;
  round1_score_player2: number;
  round2_score_player1: number;
  round2_score_player2: number;
  round3_score_player1: number;
  round3_score_player2: number;
  created_at: string;
  updated_at: string;
}

export interface GameData {
  id: number;
  player1_id: string;
  player2_id: string;
  status: 'waiting' | 'in_progress' | 'finished';
  winner_id: string | null;
  score_player1: number;
  score_player2: number;
  current_turn_player_id: string;
  turn_count: number;
  turn_phase: 'play' | 'draw';
  started_at: string | null;
  ended_at: string | null;
  current_round: number;
  board_id: number;
}
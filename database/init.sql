-- Update the Game table structure to add turn tracking
ALTER TABLE Game ADD COLUMN current_turn_player_id INTEGER REFERENCES User(id);
ALTER TABLE Game ADD COLUMN turn_phase TEXT CHECK (turn_phase IN ('play', 'draw')) DEFAULT 'play';
ALTER TABLE Game ADD COLUMN current_round INTEGER DEFAULT 1;

-- Board table for game configuration and state
CREATE TABLE Board (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES Game(id) ON DELETE CASCADE,
    use_purple_expedition BOOLEAN DEFAULT FALSE,
    remaining_cards_in_deck INTEGER DEFAULT 60,
    current_round INTEGER DEFAULT 1,
    round1_score_player1 INTEGER DEFAULT 0,
    round1_score_player2 INTEGER DEFAULT 0,
    round2_score_player1 INTEGER DEFAULT 0,
    round2_score_player2 INTEGER DEFAULT 0,
    round3_score_player1 INTEGER DEFAULT 0,
    round3_score_player2 INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Card table - reference for all cards in the game
CREATE TABLE Card (
    id VARCHAR(20) PRIMARY KEY,  -- e.g. "red_5", "yellow_wager_2"
    color TEXT NOT NULL CHECK (color IN ('red', 'green', 'white', 'blue', 'yellow', 'purple')),
    type TEXT NOT NULL CHECK (type IN ('expedition', 'wager')),
    value INTEGER,
    image_path TEXT
);

-- GameCard table - links cards to specific games and tracks their location
CREATE TABLE GameCard (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES Game(id) ON DELETE CASCADE,
    card_id VARCHAR(20) NOT NULL REFERENCES Card(id),
    location TEXT NOT NULL CHECK (location IN ('deck', 'player1_hand', 'player2_hand', 'player1_expedition', 'player2_expedition', 'discard_pile', 'removed')),
    expedition_id INTEGER REFERENCES Expedition(id),
    pile_id INTEGER REFERENCES DiscardPile(id),
    position INTEGER NOT NULL,
    played_at TIMESTAMP,
    UNIQUE (game_id, card_id)
);

-- Expedition table - tracks each player's expeditions
CREATE TABLE Expedition (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES Board(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES User(id),
    color TEXT NOT NULL CHECK (color IN ('red', 'green', 'white', 'blue', 'yellow', 'purple')),
    wager_count INTEGER DEFAULT 0,
    card_count INTEGER DEFAULT 0,
    total_value INTEGER DEFAULT 0,
    score INTEGER DEFAULT 0,
    has_started BOOLEAN DEFAULT FALSE,
    UNIQUE (board_id, player_id, color)
);

-- DiscardPile table - tracks discard piles
CREATE TABLE DiscardPile (
    id SERIAL PRIMARY KEY,
    board_id INTEGER NOT NULL REFERENCES Board(id) ON DELETE CASCADE,
    color TEXT NOT NULL CHECK (color IN ('red', 'green', 'white', 'blue', 'yellow', 'purple')),
    top_card_id VARCHAR(20) REFERENCES Card(id),
    UNIQUE (board_id, color)
);

-- Move table - tracks game moves for replay and analysis
CREATE TABLE Move (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES Game(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES User(id),
    turn_number INTEGER NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('play_card', 'discard_card', 'draw_card')),
    card_id VARCHAR(20) REFERENCES Card(id),
    destination TEXT CHECK (destination IN ('expedition', 'discard_pile')),
    source TEXT CHECK (source IN ('hand', 'discard_pile', 'deck')),
    color TEXT CHECK (color IN ('red', 'green', 'white', 'blue', 'yellow', 'purple')),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Populate the Card table with all possible cards
INSERT INTO Card (id, color, type, value, image_path) VALUES
-- Red cards
('red_2', 'red', 'expedition', 2, '/assets/cards/red_2.png'),
('red_3', 'red', 'expedition', 3, '/assets/cards/red_3.png'),
('red_4', 'red', 'expedition', 4, '/assets/cards/red_4.png'),
('red_5', 'red', 'expedition', 5, '/assets/cards/red_5.png'),
('red_6', 'red', 'expedition', 6, '/assets/cards/red_6.png'),
('red_7', 'red', 'expedition', 7, '/assets/cards/red_7.png'),
('red_8', 'red', 'expedition', 8, '/assets/cards/red_8.png'),
('red_9', 'red', 'expedition', 9, '/assets/cards/red_9.png'),
('red_10', 'red', 'expedition', 10, '/assets/cards/red_10.png'),
('red_wager_0', 'red', 'wager', NULL, '/assets/cards/red_wager_0.png'),
('red_wager_1', 'red', 'wager', NULL, '/assets/cards/red_wager_1.png'),
('red_wager_2', 'red', 'wager', NULL, '/assets/cards/red_wager_2.png'),

-- Green cards
('green_2', 'green', 'expedition', 2, '/assets/cards/green_2.png'),
('green_3', 'green', 'expedition', 3, '/assets/cards/green_3.png'),
('green_4', 'green', 'expedition', 4, '/assets/cards/green_4.png'),
('green_5', 'green', 'expedition', 5, '/assets/cards/green_5.png'),
('green_6', 'green', 'expedition', 6, '/assets/cards/green_6.png'),
('green_7', 'green', 'expedition', 7, '/assets/cards/green_7.png'),
('green_8', 'green', 'expedition', 8, '/assets/cards/green_8.png'),
('green_9', 'green', 'expedition', 9, '/assets/cards/green_9.png'),
('green_10', 'green', 'expedition', 10, '/assets/cards/green_10.png'),
('green_wager_0', 'green', 'wager', NULL, '/assets/cards/green_wager_0.png'),
('green_wager_1', 'green', 'wager', NULL, '/assets/cards/green_wager_1.png'),
('green_wager_2', 'green', 'wager', NULL, '/assets/cards/green_wager_2.png'),

-- White cards
('white_2', 'white', 'expedition', 2, '/assets/cards/white_2.png'),
('white_3', 'white', 'expedition', 3, '/assets/cards/white_3.png'),
('white_4', 'white', 'expedition', 4, '/assets/cards/white_4.png'),
('white_5', 'white', 'expedition', 5, '/assets/cards/white_5.png'),
('white_6', 'white', 'expedition', 6, '/assets/cards/white_6.png'),
('white_7', 'white', 'expedition', 7, '/assets/cards/white_7.png'),
('white_8', 'white', 'expedition', 8, '/assets/cards/white_8.png'),
('white_9', 'white', 'expedition', 9, '/assets/cards/white_9.png'),
('white_10', 'white', 'expedition', 10, '/assets/cards/white_10.png'),
('white_wager_0', 'white', 'wager', NULL, '/assets/cards/white_wager_0.png'),
('white_wager_1', 'white', 'wager', NULL, '/assets/cards/white_wager_1.png'),
('white_wager_2', 'white', 'wager', NULL, '/assets/cards/white_wager_2.png'),

-- Blue cards
('blue_2', 'blue', 'expedition', 2, '/assets/cards/blue_2.png'),
('blue_3', 'blue', 'expedition', 3, '/assets/cards/blue_3.png'),
('blue_4', 'blue', 'expedition', 4, '/assets/cards/blue_4.png'),
('blue_5', 'blue', 'expedition', 5, '/assets/cards/blue_5.png'),
('blue_6', 'blue', 'expedition', 6, '/assets/cards/blue_6.png'),
('blue_7', 'blue', 'expedition', 7, '/assets/cards/blue_7.png'),
('blue_8', 'blue', 'expedition', 8, '/assets/cards/blue_8.png'),
('blue_9', 'blue', 'expedition', 9, '/assets/cards/blue_9.png'),
('blue_10', 'blue', 'expedition', 10, '/assets/cards/blue_10.png'),
('blue_wager_0', 'blue', 'wager', NULL, '/assets/cards/blue_wager_0.png'),
('blue_wager_1', 'blue', 'wager', NULL, '/assets/cards/blue_wager_1.png'),
('blue_wager_2', 'blue', 'wager', NULL, '/assets/cards/blue_wager_2.png'),

-- Yellow cards
('yellow_2', 'yellow', 'expedition', 2, '/assets/cards/yellow_2.png'),
('yellow_3', 'yellow', 'expedition', 3, '/assets/cards/yellow_3.png'),
('yellow_4', 'yellow', 'expedition', 4, '/assets/cards/yellow_4.png'),
('yellow_5', 'yellow', 'expedition', 5, '/assets/cards/yellow_5.png'),
('yellow_6', 'yellow', 'expedition', 6, '/assets/cards/yellow_6.png'),
('yellow_7', 'yellow', 'expedition', 7, '/assets/cards/yellow_7.png'),
('yellow_8', 'yellow', 'expedition', 8, '/assets/cards/yellow_8.png'),
('yellow_9', 'yellow', 'expedition', 9, '/assets/cards/yellow_9.png'),
('yellow_10', 'yellow', 'expedition', 10, '/assets/cards/yellow_10.png'),
('yellow_wager_0', 'yellow', 'wager', NULL, '/assets/cards/yellow_wager_0.png'),
('yellow_wager_1', 'yellow', 'wager', NULL, '/assets/cards/yellow_wager_1.png'),
('yellow_wager_2', 'yellow', 'wager', NULL, '/assets/cards/yellow_wager_2.png'),

-- Purple cards (for the variant)
('purple_2', 'purple', 'expedition', 2, '/assets/cards/purple_2.png'),
('purple_3', 'purple', 'expedition', 3, '/assets/cards/purple_3.png'),
('purple_4', 'purple', 'expedition', 4, '/assets/cards/purple_4.png'),
('purple_5', 'purple', 'expedition', 5, '/assets/cards/purple_5.png'),
('purple_6', 'purple', 'expedition', 6, '/assets/cards/purple_6.png'),
('purple_7', 'purple', 'expedition', 7, '/assets/cards/purple_7.png'),
('purple_8', 'purple', 'expedition', 8, '/assets/cards/purple_8.png'),
('purple_9', 'purple', 'expedition', 9, '/assets/cards/purple_9.png'),
('purple_10', 'purple', 'expedition', 10, '/assets/cards/purple_10.png'),
('purple_wager_0', 'purple', 'wager', NULL, '/assets/cards/purple_wager_0.png'),
('purple_wager_1', 'purple', 'wager', NULL, '/assets/cards/purple_wager_1.png'),
('purple_wager_2', 'purple', 'wager', NULL, '/assets/cards/purple_wager_2.png');

-- Create indexes for performance
CREATE INDEX idx_gamecards_game_id ON GameCard(game_id);
CREATE INDEX idx_gamecards_location ON GameCard(location);
CREATE INDEX idx_gamecards_expedition_id ON GameCard(expedition_id);
CREATE INDEX idx_expedition_board_id ON Expedition(board_id);
CREATE INDEX idx_expedition_player_id ON Expedition(player_id);
CREATE INDEX idx_discardpile_board_id ON DiscardPile(board_id);
CREATE INDEX idx_move_game_id ON Move(game_id);
CREATE INDEX idx_move_player_id ON Move(player_id);
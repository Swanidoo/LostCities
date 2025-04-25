-- Create the "users" table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role TEXT DEFAULT 'user'
);

-- Create the "game_settings" table
CREATE TABLE game_settings (
    id SERIAL PRIMARY KEY,
    use_purple_cards BOOLEAN DEFAULT FALSE,
    other_variants TEXT
);

-- Create the "games" table
CREATE TABLE games (
    id SERIAL PRIMARY KEY,
    player1_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    player2_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT CHECK (status IN ('waiting', 'in_progress', 'finished')) NOT NULL,
    winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    score_player1 INTEGER DEFAULT 0,
    score_player2 INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    settings_id INTEGER REFERENCES game_settings(id) ON DELETE CASCADE
);

-- Create the "moves" table
CREATE TABLE moves (
    id SERIAL PRIMARY KEY,
    game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    turn_number INTEGER NOT NULL,
    action TEXT NOT NULL,
    card_played TEXT,
    pile_color TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the "chat_messages" table
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create the "leaderboard" table
CREATE TABLE leaderboard (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    year INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default user with a hashed password
INSERT INTO users (username, email, password) 
VALUES ('tom', 'tom@example.com', '$2a$10$45exHZM9P9A34pfhEYebJ.Fom0QjUXq3dVLVllYu3BXOXo0nB93mW');
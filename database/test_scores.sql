-- Créer des utilisateurs de test si nécessaire
INSERT INTO users (username, email, password, role) 
VALUES 
    ('Alice', 'alice@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('Bob', 'bob@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('Charlie', 'charlie@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('Diana', 'diana@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('Ethan', 'ethan@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('Fiona', 'fiona@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('George', 'george@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
    ('Helena', 'helena@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user')
ON CONFLICT (email) DO NOTHING;

-- Récupérer les IDs des utilisateurs
DO $$
DECLARE
    alice_id INTEGER;
    bob_id INTEGER;
    charlie_id INTEGER;
    diana_id INTEGER;
    ethan_id INTEGER;
    fiona_id INTEGER;
    george_id INTEGER;
    helena_id INTEGER;
BEGIN
    SELECT id INTO alice_id FROM users WHERE email = 'alice@test.com';
    SELECT id INTO bob_id FROM users WHERE email = 'bob@test.com';
    SELECT id INTO charlie_id FROM users WHERE email = 'charlie@test.com';
    SELECT id INTO diana_id FROM users WHERE email = 'diana@test.com';
    SELECT id INTO ethan_id FROM users WHERE email = 'ethan@test.com';
    SELECT id INTO fiona_id FROM users WHERE email = 'fiona@test.com';
    SELECT id INTO george_id FROM users WHERE email = 'george@test.com';
    SELECT id INTO helena_id FROM users WHERE email = 'helena@test.com';

    -- Insérer des scores pour le mode classique sans extension
    INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension, date) VALUES
        (alice_id, 'Alice', 125, 'classic', false, NOW() - INTERVAL '5 days'),
        (bob_id, 'Bob', 118, 'classic', false, NOW() - INTERVAL '4 days'),
        (charlie_id, 'Charlie', 110, 'classic', false, NOW() - INTERVAL '3 days'),
        (diana_id, 'Diana', 105, 'classic', false, NOW() - INTERVAL '2 days'),
        (ethan_id, 'Ethan', 98, 'classic', false, NOW() - INTERVAL '1 day'),
        (fiona_id, 'Fiona', 95, 'classic', false, NOW()),
        (george_id, 'George', 88, 'classic', false, NOW() - INTERVAL '6 days'),
        (helena_id, 'Helena', 82, 'classic', false, NOW() - INTERVAL '7 days'),
        (alice_id, 'Alice', 79, 'classic', false, NOW() - INTERVAL '8 days'),
        (bob_id, 'Bob', 75, 'classic', false, NOW() - INTERVAL '9 days'),
        (charlie_id, 'Charlie', 72, 'classic', false, NOW() - INTERVAL '10 days'),
        (diana_id, 'Diana', 70, 'classic', false, NOW() - INTERVAL '11 days');

    -- Insérer des scores pour le mode classique avec extension
    INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension, date) VALUES
        (diana_id, 'Diana', 145, 'classic', true, NOW() - INTERVAL '3 days'),
        (ethan_id, 'Ethan', 138, 'classic', true, NOW() - INTERVAL '2 days'),
        (alice_id, 'Alice', 132, 'classic', true, NOW() - INTERVAL '4 days'),
        (bob_id, 'Bob', 128, 'classic', true, NOW() - INTERVAL '1 day'),
        (fiona_id, 'Fiona', 122, 'classic', true, NOW()),
        (charlie_id, 'Charlie', 118, 'classic', true, NOW() - INTERVAL '5 days'),
        (george_id, 'George', 112, 'classic', true, NOW() - INTERVAL '6 days'),
        (helena_id, 'Helena', 108, 'classic', true, NOW() - INTERVAL '7 days'),
        (bob_id, 'Bob', 105, 'classic', true, NOW() - INTERVAL '8 days'),
        (alice_id, 'Alice', 102, 'classic', true, NOW() - INTERVAL '9 days'),
        (diana_id, 'Diana', 98, 'classic', true, NOW() - INTERVAL '10 days');

    -- Insérer des scores pour le mode rapide sans extension
    INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension, date) VALUES
        (helena_id, 'Helena', 48, 'quick', false, NOW() - INTERVAL '1 day'),
        (george_id, 'George', 45, 'quick', false, NOW() - INTERVAL '2 days'),
        (fiona_id, 'Fiona', 42, 'quick', false, NOW()),
        (ethan_id, 'Ethan', 40, 'quick', false, NOW() - INTERVAL '3 days'),
        (diana_id, 'Diana', 38, 'quick', false, NOW() - INTERVAL '4 days'),
        (charlie_id, 'Charlie', 35, 'quick', false, NOW() - INTERVAL '5 days'),
        (bob_id, 'Bob', 32, 'quick', false, NOW() - INTERVAL '6 days'),
        (alice_id, 'Alice', 30, 'quick', false, NOW() - INTERVAL '7 days'),
        (helena_id, 'Helena', 28, 'quick', false, NOW() - INTERVAL '8 days'),
        (george_id, 'George', 25, 'quick', false, NOW() - INTERVAL '9 days'),
        (fiona_id, 'Fiona', 22, 'quick', false, NOW() - INTERVAL '10 days');

    -- Insérer des scores pour le mode rapide avec extension
    INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension, date) VALUES
        (charlie_id, 'Charlie', 58, 'quick', true, NOW() - INTERVAL '2 days'),
        (bob_id, 'Bob', 55, 'quick', true, NOW() - INTERVAL '1 day'),
        (alice_id, 'Alice', 52, 'quick', true, NOW()),
        (diana_id, 'Diana', 50, 'quick', true, NOW() - INTERVAL '3 days'),
        (ethan_id, 'Ethan', 48, 'quick', true, NOW() - INTERVAL '4 days'),
        (fiona_id, 'Fiona', 45, 'quick', true, NOW() - INTERVAL '5 days'),
        (george_id, 'George', 42, 'quick', true, NOW() - INTERVAL '6 days'),
        (helena_id, 'Helena', 40, 'quick', true, NOW() - INTERVAL '7 days'),
        (alice_id, 'Alice', 38, 'quick', true, NOW() - INTERVAL '8 days'),
        (bob_id, 'Bob', 35, 'quick', true, NOW() - INTERVAL '9 days'),
        (charlie_id, 'Charlie', 32, 'quick', true, NOW() - INTERVAL '10 days');

END $$;

-- Vérifier les résultats
SELECT game_mode, with_extension, COUNT(*) as count, AVG(score) as avg_score 
FROM leaderboard 
GROUP BY game_mode, with_extension 
ORDER BY game_mode, with_extension;
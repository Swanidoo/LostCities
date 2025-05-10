INSERT INTO users (username, email, password, role) VALUES
('admin_user', 'admin@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'admin'),
('toxic_player', 'toxic@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
('spammer', 'spammer@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
('cheater', 'cheater@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user'),
('innocent_user', 'innocent@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user')
ON CONFLICT (email) DO NOTHING;

-- Simuler des temps de connexion
DO $$
DECLARE
    admin_id INTEGER;
    alice_id INTEGER;
    bob_id INTEGER;
    toxic_id INTEGER;
    spammer_id INTEGER;
    cheater_id INTEGER;
BEGIN
    SELECT id INTO admin_id FROM users WHERE email = 'admin@test.com';
    SELECT id INTO alice_id FROM users WHERE email = 'alice@test.com';
    SELECT id INTO bob_id FROM users WHERE email = 'bob@test.com';
    SELECT id INTO toxic_id FROM users WHERE email = 'toxic@test.com';
    SELECT id INTO spammer_id FROM users WHERE email = 'spammer@test.com';
    SELECT id INTO cheater_id FROM users WHERE email = 'cheater@test.com';
    
    -- Mettre à jour les dernières connexions
    UPDATE users SET last_login = NOW() - INTERVAL '1 hour' WHERE id = admin_id;
    UPDATE users SET last_login = NOW() - INTERVAL '2 hours' WHERE id = alice_id;
    UPDATE users SET last_login = NOW() - INTERVAL '12 hours' WHERE id = bob_id;
    UPDATE users SET last_login = NOW() - INTERVAL '1 day' WHERE id = toxic_id;
    UPDATE users SET last_login = NOW() - INTERVAL '3 days' WHERE id = spammer_id;
    
    -- Créer des parties de test
    INSERT INTO games (id, player1_id, player2_id, status, started_at) VALUES
    (1001, alice_id, bob_id, 'in_progress', NOW() - INTERVAL '30 minutes'),
    (1002, toxic_id, spammer_id, 'finished', NOW() - INTERVAL '2 hours'),
    (1003, cheater_id, alice_id, 'in_progress', NOW() - INTERVAL '15 minutes'),
    (1004, bob_id, toxic_id, 'finished', NOW() - INTERVAL '1 day');
    
    -- Ajouter des messages de chat de test
    INSERT INTO chat_message (game_id, sender_id, message, timestamp) VALUES
    -- Messages normaux
    (1001, alice_id, 'Bonne partie !', NOW() - INTERVAL '25 minutes'),
    (1001, bob_id, 'Merci, bonne chance à toi aussi !', NOW() - INTERVAL '24 minutes'),
    
    -- Messages toxiques
    (1002, toxic_id, 'Tu es nul !', NOW() - INTERVAL '2 hours'),
    (1002, toxic_id, 'Apprends à jouer noob', NOW() - INTERVAL '1 hour 50 minutes'),
    (1002, spammer_id, 'Arrête de m''insulter !', NOW() - INTERVAL '1 hour 45 minutes'),
    
    -- Spam
    (1004, spammer_id, 'ACHETEZ DES CREDITS ICI: fake-site.com', NOW() - INTERVAL '23 hours'),
    (1004, spammer_id, 'PROMO SPECIALE !!! fake-site.com', NOW() - INTERVAL '22 hours'),
    (1004, spammer_id, 'CLIQUEZ ICI POUR GAGNER: fake-site.com', NOW() - INTERVAL '21 hours'),
    
    -- Messages suspicieux
    (1003, cheater_id, 'J''ai un bug qui me permet de voir tes cartes lol', NOW() - INTERVAL '10 minutes'),
    (1003, alice_id, 'Quoi ?? C''est de la triche !', NOW() - INTERVAL '9 minutes');
    
    -- Ajouter des mutes de test
    INSERT INTO user_mutes (user_id, muted_until, mute_reason, muted_by) VALUES
    (toxic_id, NOW() + INTERVAL '24 hours', 'Comportement toxique répété', admin_id),
    (spammer_id, NOW() - INTERVAL '1 hour', 'Spam publicitaire', admin_id); -- Expiré
    
    -- Ajouter des bans de test
    UPDATE users SET 
        is_banned = true, 
        banned_at = NOW() - INTERVAL '1 hour',
        banned_until = NOW() + INTERVAL '7 days',
        ban_reason = 'Triche avérée'
    WHERE id = cheater_id;
    
    -- Ajouter des rapports de test
    INSERT INTO reports (reporter_id, reported_user_id, reported_message_id, report_type, description, status) VALUES
    (alice_id, toxic_id, 
        (SELECT id FROM chat_message WHERE sender_id = toxic_id AND message = 'Tu es nul !' LIMIT 1),
        'chat_abuse', 'Insultes répétées pendant la partie', 'resolved'),
    
    (bob_id, spammer_id, 
        (SELECT id FROM chat_message WHERE sender_id = spammer_id AND message LIKE '%fake-site.com%' LIMIT 1),
        'spam', 'Publicité pour un site externe', 'pending'),
    
    (alice_id, cheater_id, NULL, 
        'cheating', 'Le joueur prétend pouvoir voir mes cartes', 'reviewed');
    
    -- Ajouter des actions admin de test
    INSERT INTO admin_actions (admin_id, action_type, target_user_id, reason, created_at) VALUES
    (admin_id, 'mute', toxic_id, 'Comportement toxique répété', NOW() - INTERVAL '24 hours'),
    (admin_id, 'mute', spammer_id, 'Spam publicitaire', NOW() - INTERVAL '25 hours'),
    (admin_id, 'unmute', spammer_id, 'Mute expiré', NOW() - INTERVAL '1 hour'),
    (admin_id, 'ban', cheater_id, 'Triche avérée', NOW() - INTERVAL '1 hour');
    
END $$;

-- Vérifier les données insérées
SELECT 'Users with moderation status:' as info;
SELECT username, role, is_banned, 
       (SELECT COUNT(*) FROM user_mutes WHERE user_id = u.id AND (muted_until IS NULL OR muted_until > NOW())) as active_mutes
FROM users u 
WHERE role = 'admin' OR is_banned = true OR username IN ('toxic_player', 'spammer', 'cheater');

SELECT 'Recent chat messages:' as info;
SELECT cm.id, u.username, cm.message, cm.timestamp, cm.is_deleted 
FROM chat_message cm 
JOIN users u ON cm.sender_id = u.id 
ORDER BY cm.timestamp DESC 
LIMIT 10;

SELECT 'Pending reports:' as info;
SELECT r.id, reporter.username as reporter, reported.username as reported_user, r.report_type, r.status
FROM reports r
JOIN users reporter ON r.reporter_id = reporter.id
JOIN users reported ON r.reported_user_id = reported.id;

SELECT 'Admin dashboard stats:' as info;
SELECT * FROM admin_dashboard_stats;
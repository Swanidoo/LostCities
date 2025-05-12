-- Fichier de test unifié pour Lost Cities
-- Fusionne 02_test_scores.sql et 03_test_admin_data.sql
-- Ajoute des données complètes pour tester tous les aspects du site

-- Supprimer les données existantes si nécessaire
DELETE FROM admin_actions;
DELETE FROM reports;
DELETE FROM user_mutes;
DELETE FROM chat_message;
DELETE FROM move;
DELETE FROM game_card;
DELETE FROM expedition;
DELETE FROM discard_pile;
DELETE FROM board;
DELETE FROM games;
DELETE FROM leaderboard;
DELETE FROM users WHERE email LIKE '%test.com%';

-- 1. Créer les utilisateurs de test avec des profils variés
INSERT INTO users (username, email, password, role, bio, avatar_url) VALUES
-- Admin
('AdminUser', 'admin@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'admin', 
 'Administrateur système. Passionné de Lost Cities depuis 5 ans.', 
 'https://api.dicebear.com/7.x/avataaars/svg?seed=AdminUser'),

-- Joueurs réguliers avec profils complets
('Alice_Walker', 'alice@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 'Joueuse expérimentée, spécialiste du mode rapide. J''adore les expéditions risquées !', 
 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice'),

('Bob_Builder', 'bob@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 'Stratège patient, préfère le mode classique. 1000+ parties jouées !', 
 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob'),

('Charlie_Chen', 'charlie@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 'Nouveau joueur, apprend encore les règles. Toujours prêt pour une partie amicale !', 
 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie'),

('Diana_Dark', 'diana@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 'Joueuse compétitive, spécialiste des extensions. Record personnel : 200 points en une partie !', 
 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana'),

-- Utilisateurs problématiques
('ToxicPlayer', 'toxic@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 '', NULL),

('SpamBot', 'spam@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 'Compte suspendu pour spam', NULL),

('Cheater_X', 'cheater@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 '', NULL),

-- Utilisateur innocent pour les rapports
('NiceUser', 'nice@test.com', '$2a$10$Nh7x7fI9f2Oy6.ZM4Xu2oeJGQDyJfJPeWNzNh54n1bGr.6WOZJa.O', 'user',
 'Joueur respectueux et fair-play. Toujours de bonne humeur !', 
 'https://api.dicebear.com/7.x/avataaars/svg?seed=Nice')
ON CONFLICT (email) DO NOTHING;

-- 2. Mettre à jour les temps de connexion pour plus de réalisme
DO $$
DECLARE
    admin_id INTEGER;
    alice_id INTEGER;
    bob_id INTEGER;
    charlie_id INTEGER;
    diana_id INTEGER;
    toxic_id INTEGER;
    spam_id INTEGER;
    cheater_id INTEGER;
    nice_id INTEGER;
BEGIN
    -- Récupérer les IDs
    SELECT id INTO admin_id FROM users WHERE email = 'admin@test.com';
    SELECT id INTO alice_id FROM users WHERE email = 'alice@test.com';
    SELECT id INTO bob_id FROM users WHERE email = 'bob@test.com';
    SELECT id INTO charlie_id FROM users WHERE email = 'charlie@test.com';
    SELECT id INTO diana_id FROM users WHERE email = 'diana@test.com';
    SELECT id INTO toxic_id FROM users WHERE email = 'toxic@test.com';
    SELECT id INTO spam_id FROM users WHERE email = 'spam@test.com';
    SELECT id INTO cheater_id FROM users WHERE email = 'cheater@test.com';
    SELECT id INTO nice_id FROM users WHERE email = 'nice@test.com';
    
    -- Mettre à jour les dernières connexions
    UPDATE users SET 
        last_login = NOW() - INTERVAL '30 minutes',
        created_at = NOW() - INTERVAL '3 months'
    WHERE id = admin_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '5 minutes',
        created_at = NOW() - INTERVAL '8 months'
    WHERE id = alice_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '2 hours',
        created_at = NOW() - INTERVAL '1 year'
    WHERE id = bob_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '1 day',
        created_at = NOW() - INTERVAL '2 weeks'
    WHERE id = charlie_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '12 hours',
        created_at = NOW() - INTERVAL '6 months'
    WHERE id = diana_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '3 days',
        created_at = NOW() - INTERVAL '4 months'
    WHERE id = toxic_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '1 week',
        created_at = NOW() - INTERVAL '5 months'
    WHERE id = spam_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '2 days',
        created_at = NOW() - INTERVAL '3 months'
    WHERE id = cheater_id;
    
    UPDATE users SET 
        last_login = NOW() - INTERVAL '6 hours',
        created_at = NOW() - INTERVAL '1 month'
    WHERE id = nice_id;
    
    -- 3. Créer des parties variées avec résultats détaillés
    INSERT INTO games (id, player1_id, player2_id, status, started_at, ended_at, winner_id, score_player1, score_player2, game_mode) VALUES
    -- Parties récentes entre différents joueurs
    (1001, alice_id, bob_id, 'finished', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour 45 minutes', alice_id, 125, 98, 'classic'),
    (1002, diana_id, charlie_id, 'finished', NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', diana_id, 156, 87, 'classic'),
    (1003, bob_id, alice_id, 'finished', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day 22 hours', bob_id, 134, 112, 'classic'),
    (1004, charlie_id, nice_id, 'finished', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days 23 hours', nice_id, 145, 89, 'classic'),
    (1005, toxic_id, spam_id, 'finished', NOW() - INTERVAL '1 week', NOW() - INTERVAL '6 days 23 hours', spam_id, 67, 234, 'classic'),
    
    -- Parties rapides
    (1006, alice_id, diana_id, 'finished', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '4 hours 30 minutes', diana_id, 42, 58, 'quick'),
    (1007, bob_id, nice_id, 'finished', NOW() - INTERVAL '8 hours', NOW() - INTERVAL '7 hours 45 minutes', bob_id, 48, 35, 'quick'),
    (1008, charlie_id, alice_id, 'finished', NOW() - INTERVAL '1 day 5 hours', NOW() - INTERVAL '1 day 4 hours 30 minutes', alice_id, 52, 31, 'quick'),
    
    -- Parties avec extension
    (1009, diana_id, bob_id, 'finished', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours 30 minutes', diana_id, 178, 145, 'classic'),
    (1010, alice_id, charlie_id, 'finished', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '5 hours 15 minutes', alice_id, 198, 123, 'classic'),
    
    -- Parties en cours ou récemment abandonnées
    (1011, bob_id, diana_id, 'in_progress', NOW() - INTERVAL '30 minutes', NULL, NULL, 0, 0, 'classic'),
    (1012, cheater_id, nice_id, 'finished', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour 45 minutes', nice_id, 89, 176, 'classic'),
    
    -- Parties anciennes pour tester l'historique
    (1013, alice_id, diana_id, 'finished', NOW() - INTERVAL '1 month', NOW() - INTERVAL '1 month' + INTERVAL '45 minutes', alice_id, 167, 134, 'classic'),
    (1014, bob_id, charlie_id, 'finished', NOW() - INTERVAL '2 months', NOW() - INTERVAL '2 months' + INTERVAL '1 hour', bob_id, 145, 89, 'classic'),
    (1015, diana_id, nice_id, 'finished', NOW() - INTERVAL '3 months', NOW() - INTERVAL '3 months' + INTERVAL '50 minutes', diana_id, 189, 156, 'classic');
    
    -- 4. Créer les plateaux de jeu pour les parties
    INSERT INTO board (game_id, use_purple_expedition, remaining_cards_in_deck, current_round,
                       round1_score_player1, round1_score_player2, round2_score_player1, round2_score_player2,
                       round3_score_player1, round3_score_player2) VALUES
    -- Parties avec extension (plateau avec extension violette)
    (1009, true, 0, 3, 58, 48, 63, 52, 57, 45),
    (1010, true, 0, 3, 67, 41, 71, 43, 60, 39),
    
    -- Parties classiques sans extension
    (1001, false, 0, 3, 42, 32, 41, 33, 42, 33),
    (1002, false, 0, 3, 52, 29, 54, 31, 50, 27),
    (1003, false, 0, 3, 44, 37, 45, 38, 45, 37),
    
    -- Parties rapides (généralement plus courtes)
    (1006, false, 8, 2, 25, 32, 17, 26, 0, 0),
    (1007, false, 5, 2, 22, 15, 26, 20, 0, 0),
    (1008, false, 2, 2, 28, 16, 24, 15, 0, 0),
    
    -- Partie en cours
    (1011, false, 45, 1, 15, 18, 0, 0, 0, 0);
    
    -- 5. Ajouter des scores au leaderboard
    INSERT INTO leaderboard (player_id, player, score, game_mode, with_extension, date) VALUES
    -- Scores classiques sans extension
    (alice_id, 'Alice_Walker', 125, 'classic', false, NOW() - INTERVAL '2 hours'),
    (diana_id, 'Diana_Dark', 156, 'classic', false, NOW() - INTERVAL '1 day'),
    (bob_id, 'Bob_Builder', 134, 'classic', false, NOW() - INTERVAL '2 days'),
    (nice_id, 'NiceUser', 145, 'classic', false, NOW() - INTERVAL '3 days'),
    (charlie_id, 'Charlie_Chen', 89, 'classic', false, NOW() - INTERVAL '3 days'),
    
    -- Scores classiques avec extension
    (diana_id, 'Diana_Dark', 178, 'classic', true, NOW() - INTERVAL '3 hours'),
    (alice_id, 'Alice_Walker', 198, 'classic', true, NOW() - INTERVAL '6 hours'),
    (bob_id, 'Bob_Builder', 145, 'classic', true, NOW() - INTERVAL '2 months'),
    (diana_id, 'Diana_Dark', 189, 'classic', true, NOW() - INTERVAL '3 months'),
    
    -- Scores rapides sans extension
    (diana_id, 'Diana_Dark', 58, 'quick', false, NOW() - INTERVAL '5 hours'),
    (bob_id, 'Bob_Builder', 48, 'quick', false, NOW() - INTERVAL '8 hours'),
    (alice_id, 'Alice_Walker', 52, 'quick', false, NOW() - INTERVAL '1 day 5 hours'),
    
    -- Scores rapides avec extension
    (alice_id, 'Alice_Walker', 62, 'quick', true, NOW() - INTERVAL '3 days'),
    (diana_id, 'Diana_Dark', 71, 'quick', true, NOW() - INTERVAL '1 week'),
    (bob_id, 'Bob_Builder', 59, 'quick', true, NOW() - INTERVAL '2 weeks');
    
    -- 6. Ajouter des messages de chat variés
    INSERT INTO chat_message (game_id, sender_id, message, timestamp) VALUES
    -- Messages récents dans le chat général
    (NULL, alice_id, 'Salut tout le monde ! Quelqu''un veut faire une partie rapide ?', NOW() - INTERVAL '5 minutes'),
    (NULL, bob_id, 'Bonjour Alice ! Je suis partant pour une partie classique.', NOW() - INTERVAL '4 minutes'),
    (NULL, diana_id, 'Bonne chance à tous pour vos parties d''aujourd''hui !', NOW() - INTERVAL '3 minutes'),
    (NULL, nice_id, 'Merci Diana ! J''espère m''améliorer avec de la pratique.', NOW() - INTERVAL '2 minutes'),
    (NULL, charlie_id, 'Des conseils pour un débutant ?', NOW() - INTERVAL '1 minute'),
    
    -- Messages dans des parties spécifiques
    (1001, alice_id, 'Bonne partie Bob ! Cette dernière manche était serrée.', NOW() - INTERVAL '1 hour 45 minutes'),
    (1001, bob_id, 'Merci ! Tu joues vraiment bien avec les cartes wager.', NOW() - INTERVAL '1 hour 44 minutes'),
    (1002, diana_id, 'Première partie Charlie ? Tu t''en sors bien !', NOW() - INTERVAL '23 hours'),
    (1002, charlie_id, 'Merci ! J''apprends encore les bonnes stratégies.', NOW() - INTERVAL '22 hours 59 minutes'),
    
    -- Messages toxiques (pour tests admin)
    (1005, toxic_id, 'Tu es vraiment nul !', NOW() - INTERVAL '6 days 23 hours'),
    (1005, toxic_id, 'J''ai déjà vu des débutants jouer mieux que toi', NOW() - INTERVAL '6 days 22 hours 58 minutes'),
    (1005, spam_id, 'Toi aussi tu critiques ? Au moins moi je ne rage pas', NOW() - INTERVAL '6 days 22 hours 55 minutes'),
    
    -- Messages de spam
    (NULL, spam_id, 'SUPER OFFRE !!! Achetez des crédits ici : fake-site.com', NOW() - INTERVAL '1 week'),
    (NULL, spam_id, 'GRATUIT GRATUIT GRATUIT !!! Cliquez ici : spam-link.net', NOW() - INTERVAL '6 days 23 hours'),
    (NULL, spam_id, 'Promo spéciale ! -50% sur tous les packs ! fake-promo.org', NOW() - INTERVAL '6 days 22 hours'),
    
    -- Message de triche
    (1012, cheater_id, 'Haha j''ai un bug qui me montre toutes tes cartes ! Trop facile !', NOW() - INTERVAL '1 hour 50 minutes'),
    (1012, nice_id, 'C''est de la triche ! Je signale ça aux admins.', NOW() - INTERVAL '1 hour 49 minutes');
    
    -- 7. Gérer les bans et mutes
    -- Bans actifs
    UPDATE users SET
        is_banned = true,
        banned_at = NOW() - INTERVAL '2 hours',
        banned_until = NOW() + INTERVAL '5 days',
        ban_reason = 'Triche confirmée - utilisation d''exploits'
    WHERE id = cheater_id;
    
    -- Mutes actifs
    INSERT INTO user_mutes (user_id, muted_until, mute_reason, muted_by) VALUES
    (toxic_id, NOW() + INTERVAL '12 hours', 'Comportement toxique répété envers d''autres joueurs', admin_id),
    (spam_id, NULL, 'Spam publicitaire massif dans le chat général', admin_id); -- Mute permanent
    
    -- 8. Ajouter des rapports pour test
    INSERT INTO reports (reporter_id, reported_user_id, reported_message_id, report_type, description, status, created_at) VALUES
    -- Rapports en attente
    (alice_id, toxic_id, 
        (SELECT id FROM chat_message WHERE sender_id = toxic_id AND message = 'Tu es vraiment nul !' LIMIT 1),
        'chat_abuse', 
        'Insultes répétées pendant notre partie. Ce joueur a été très agressif.', 
        'pending', NOW() - INTERVAL '6 days'),
    
    (bob_id, spam_id, 
        (SELECT id FROM chat_message WHERE sender_id = spam_id AND message LIKE '%fake-site.com%' LIMIT 1),
        'spam', 
        'Messages publicitaires répétés dans le chat général. Dérange l''expérience de jeu.', 
        'pending', NOW() - INTERVAL '1 week'),
    
    (nice_id, cheater_id, NULL, 
        'cheating', 
        'Le joueur prétend pouvoir voir mes cartes grâce à un bug. Probable utilisation de triche.', 
        'pending', NOW() - INTERVAL '1 hour 45 minutes'),
    
    -- Rapports déjà traités
    (charlie_id, toxic_id, 
        (SELECT id FROM chat_message WHERE sender_id = toxic_id AND message LIKE '%débutants%' LIMIT 1),
        'harassment', 
        'Moqueries constantes sur mon niveau de jeu. Très désagréable pour un nouveau joueur.', 
        'resolved', NOW() - INTERVAL '5 days'),
    
    (diana_id, spam_id, 
        (SELECT id FROM chat_message WHERE sender_id = spam_id AND message LIKE '%spam-link.net%' LIMIT 1),
        'spam', 
        'Spam de liens suspects dans le chat.', 
        'resolved', NOW() - INTERVAL '6 days');
    
    -- 9. Logger les actions admin
    INSERT INTO admin_actions (admin_id, action_type, target_user_id, target_message_id, reason, created_at) VALUES
    -- Actions récentes
    (admin_id, 'ban', cheater_id, NULL, 'Triche confirmée après investigation', NOW() - INTERVAL '2 hours'),
    (admin_id, 'mute', cheater_id, NULL, 'Mute automatique suite au ban', NOW() - INTERVAL '2 hours'),
    (admin_id, 'mute', toxic_id, NULL, 'Comportement toxique répété', NOW() - INTERVAL '1 day'),
    (admin_id, 'mute', spam_id, NULL, 'Spam publicitaire', NOW() - INTERVAL '1 week'),
    
    -- Actions plus anciennes
    (admin_id, 'unmute', toxic_id, NULL, 'Première infraction - avertissement', NOW() - INTERVAL '2 weeks'),
    (admin_id, 'delete_message', NULL, 
        (SELECT id FROM chat_message WHERE sender_id = spam_id AND message LIKE '%fake-promo.org%' LIMIT 1),
        'Suppression de message publicitaire', NOW() - INTERVAL '6 days 22 hours'),
    (admin_id, 'warn', charlie_id, NULL, 'Avertissement pour langage inapproprié (première fois)', NOW() - INTERVAL '1 month');
    
END $$;


-- 10. Ajouter des moves de test pour les parties terminées
DO $$
DECLARE
    alice_id INTEGER;
    bob_id INTEGER;
    diana_id INTEGER;
    charlie_id INTEGER;
    nice_id INTEGER;
BEGIN
    -- Récupérer les IDs
    SELECT id INTO alice_id FROM users WHERE email = 'alice@test.com';
    SELECT id INTO bob_id FROM users WHERE email = 'bob@test.com';
    SELECT id INTO diana_id FROM users WHERE email = 'diana@test.com';
    SELECT id INTO charlie_id FROM users WHERE email = 'charlie@test.com';
    SELECT id INTO nice_id FROM users WHERE email = 'nice@test.com';
    
    -- Moves pour la partie 1001 (Alice vs Bob)
    INSERT INTO move (game_id, player_id, turn_number, action, card_id, destination, color, timestamp) VALUES
    (1001, alice_id, 1, 'play_card', 'red_wager_0', 'expedition', 'red', NOW() - INTERVAL '2 hours'),
    (1001, bob_id, 2, 'discard_card', 'blue_3', 'discard_pile', 'blue', NOW() - INTERVAL '2 hours' + INTERVAL '2 minutes'),
    (1001, alice_id, 3, 'draw_card', null, null, null, NOW() - INTERVAL '2 hours' + INTERVAL '4 minutes'),
    (1001, bob_id, 4, 'play_card', 'green_5', 'expedition', 'green', NOW() - INTERVAL '2 hours' + INTERVAL '6 minutes'),
    (1001, alice_id, 5, 'play_card', 'red_6', 'expedition', 'red', NOW() - INTERVAL '2 hours' + INTERVAL '8 minutes'),
    (1001, bob_id, 6, 'draw_card', null, null, null, NOW() - INTERVAL '2 hours' + INTERVAL '10 minutes'),
    
    -- Moves pour la partie 1002 (Diana vs Charlie)
    (1002, diana_id, 1, 'play_card', 'yellow_wager_0', 'expedition', 'yellow', NOW() - INTERVAL '1 day'),
    (1002, charlie_id, 2, 'play_card', 'white_4', 'expedition', 'white', NOW() - INTERVAL '1 day' + INTERVAL '3 minutes'),
    (1002, diana_id, 3, 'discard_card', 'blue_8', 'discard_pile', 'blue', NOW() - INTERVAL '1 day' + INTERVAL '6 minutes'),
    (1002, charlie_id, 4, 'draw_card', null, null, null, NOW() - INTERVAL '1 day' + INTERVAL '9 minutes'),
    
    -- Moves pour une partie rapide 1006 (Alice vs Diana)
    (1006, alice_id, 1, 'play_card', 'green_3', 'expedition', 'green', NOW() - INTERVAL '5 hours'),
    (1006, diana_id, 2, 'play_card', 'red_5', 'expedition', 'red', NOW() - INTERVAL '5 hours' + INTERVAL '1 minute'),
    (1006, alice_id, 3, 'discard_card', 'yellow_7', 'discard_pile', 'yellow', NOW() - INTERVAL '5 hours' + INTERVAL '2 minutes'),
    (1006, diana_id, 4, 'draw_card', null, null, null, NOW() - INTERVAL '5 hours' + INTERVAL '3 minutes');
    
END $$;

-- 11. Ajouter quelques messages supplémentaires récents pour le chat
DO $$
DECLARE
    alice_id INTEGER;
    bob_id INTEGER;
    diana_id INTEGER;
    charlie_id INTEGER;
    nice_id INTEGER;
BEGIN
    SELECT id INTO alice_id FROM users WHERE email = 'alice@test.com';
    SELECT id INTO bob_id FROM users WHERE email = 'bob@test.com';
    SELECT id INTO diana_id FROM users WHERE email = 'diana@test.com';
    SELECT id INTO charlie_id FROM users WHERE email = 'charlie@test.com';
    SELECT id INTO nice_id FROM users WHERE email = 'nice@test.com';
    
    INSERT INTO chat_message (game_id, sender_id, message, timestamp) VALUES
    (NULL, alice_id, 'Excellent match Diana ! Tu maîtrises vraiment les extensions.', NOW() - INTERVAL '30 seconds'),
    (NULL, diana_id, 'Merci Alice ! Ça fait plaisir de jouer contre une adversaire de ton niveau.', NOW() - INTERVAL '15 seconds'),
    (NULL, bob_id, 'Qui est partant pour un tournoi cette semaine ?', NOW() - INTERVAL '10 seconds'),
    (NULL, nice_id, 'Moi ! Même si je ne suis pas très fort encore.', NOW() - INTERVAL '5 seconds'),
    (NULL, charlie_id, 'Charlie aussi est motivé !', NOW() - INTERVAL '2 seconds');
END $$;

-- Afficher un résumé des données créées
SELECT 'RÉSUMÉ DES DONNÉES DE TEST' as info;
SELECT 'Utilisateurs créés:' as info;
SELECT username, role, is_banned, 
       (SELECT COUNT(*) FROM user_mutes WHERE user_id = u.id AND (muted_until IS NULL OR muted_until > NOW())) as active_mutes
FROM users u WHERE email LIKE '%@test.com';

SELECT 'Parties créées:' as info;
SELECT COUNT(*) as total_games, 
       SUM(CASE WHEN status = 'finished' THEN 1 ELSE 0 END) as finished_games,
       SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_games
FROM games WHERE id >= 1001;

SELECT 'Messages dans le chat:' as info;
SELECT COUNT(*) as total_messages,
       COUNT(CASE WHEN game_id IS NULL THEN 1 END) as general_chat_messages,
       COUNT(CASE WHEN game_id IS NOT NULL THEN 1 END) as game_chat_messages
FROM chat_message WHERE sender_id IN (SELECT id FROM users WHERE email LIKE '%@test.com');

SELECT 'Rapports créés:' as info;
SELECT COUNT(*) as total_reports,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reports,
       COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_reports
FROM reports;

SELECT 'Actions admin:' as info;
SELECT action_type, COUNT(*) as count FROM admin_actions GROUP BY action_type;

SELECT 'Données prêtes pour les tests !' as info;
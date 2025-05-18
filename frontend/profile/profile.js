const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

// État global de l'application
let currentUserId = null;
let isOwnProfile = false;
let isAdmin = false;

// État pour la pagination
let currentPage = 1;
let totalPages = 1;
let isLoadingGames = false;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('id');
    
    if (!userId) {
        window.location.href = '/';
        return;
    }
    
    currentUserId = userId;
    
    // Ajouter un loader élégant
    showPageLoader();
    
    // Vérifier les permissions utilisateur via l'API
    try {
        const authResponse = await fetch(`${API_URL}/check-auth`, {
            credentials: 'include'
        });
        
        if (authResponse.ok) {
            const authData = await authResponse.json();
            if (authData.authenticated && authData.user) {
                const user = authData.user;
                isOwnProfile = user.id === parseInt(userId);
                isAdmin = user.role === 'admin';
            }
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
    
    try {
        // Configuration de l'interface basée sur les permissions
        setupUI();
        
        // Charger le profil
        await loadProfile();
        
        // Charger l'historique des parties
        await loadGameHistory();
        
        // Si admin, charger les messages
        if (isAdmin) {
            await loadUserMessages(userId);
        }
        
        // Configurer les gestionnaires d'événements
        setupEventListeners();
        
        // Animer l'apparition du contenu
        animateContentAppearance();
        
    } catch (error) {
        console.error('Error initializing profile:', error);
        showNotification('Erreur lors du chargement du profil', 'error');
    } finally {
        hidePageLoader();
    }
});

// Loader de page
function showPageLoader() {
    const loader = document.createElement('div');
    loader.id = 'page-loader';
    loader.className = 'page-loader';
    loader.innerHTML = `
        <div class="loader-spinner">
            <div class="spinner"></div>
            <p>Chargement du profil...</p>
        </div>
    `;
    document.body.appendChild(loader);
}

function hidePageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 300);
    }
}

// Animation d'apparition du contenu
function animateContentAppearance() {
    const elementsToAnimate = [
        '.profile-sidebar',
        '.profile-content',
        '.quick-stats .stat-item'
    ];
    
    elementsToAnimate.forEach((selector, index) => {
        const elements = document.querySelectorAll(selector);
        elements.forEach((element, elementIndex) => {
            element.style.opacity = '0';
            element.style.transform = 'translateY(30px)';
            element.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
            
            setTimeout(() => {
                element.style.opacity = '1';
                element.style.transform = 'translateY(0)';
            }, (index * 100) + (elementIndex * 50));
        });
    });
}

function setupUI() {
    // Montrer/cacher les éléments selon les permissions
    if (isOwnProfile) {
        // Montrer les boutons d'édition
        document.getElementById('edit-avatar-btn').style.display = 'block';
        document.getElementById('edit-bio-btn').style.display = 'block';
        
        // Montrer l'onglet paramètres
        const settingsTab = document.querySelector('[data-tab="settings"]');
        settingsTab.style.display = 'flex';
    }
    
    if (isAdmin) {
        // Montrer l'onglet messages
        const messagesTab = document.getElementById('admin-messages-tab');
        messagesTab.style.display = 'flex';
    }
}

function setupEventListeners() {
    // Gestion des onglets
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => switchTab(button.dataset.tab));
    });
    
    // Boutons d'édition
    document.getElementById('edit-avatar-btn').addEventListener('click', openAvatarModal);
    document.getElementById('edit-bio-btn').addEventListener('click', openBioModal);
    
    // Formulaires
    setupFormHandlers();
    
    // Validation temps réel pour username (format seulement)
    const usernameInput = document.getElementById('new-username');
    if (usernameInput) {
        usernameInput.addEventListener('input', validateUsername);
    }
    
    // Aperçu avatar
    const avatarUrlInput = document.getElementById('avatar-url');
    if (avatarUrlInput) {
        avatarUrlInput.addEventListener('input', previewAvatar);
    }
    
    // Compteur de caractères bio
    const bioTextarea = document.getElementById('bio-text');
    if (bioTextarea) {
        bioTextarea.addEventListener('input', updateCharCount);
    }
    
    // Amélioration des effets de hover
    setTimeout(setupEnhancedHoverEffects, 1000);
}

// Amélioration de la gestion des onglets avec animations
function switchTab(tabName) {
    // Désactiver tous les onglets
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Masquer tous les contenus avec animation
    document.querySelectorAll('.tab-pane').forEach(pane => {
        if (pane.classList.contains('active')) {
            pane.style.opacity = '0';
            pane.style.transform = 'translateX(-20px)';
            
            setTimeout(() => {
                pane.classList.remove('active');
            }, 200);
        }
    });
    
    // Activer l'onglet sélectionné
    setTimeout(() => {
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        const targetPane = document.getElementById(`${tabName}-tab`);
        targetPane.classList.add('active');
        
        // Animer l'apparition
        requestAnimationFrame(() => {
            targetPane.style.opacity = '1';
            targetPane.style.transform = 'translateX(0)';
        });
    }, 200);
    
    // Effet sonore subtil (optionnel)
    playTabSound();
}

// Son subtil pour les onglets (optionnel)
function playTabSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.02, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        // Ignore errors in sound creation
    }
}

// Chargement du profil
async function loadProfile() {
    try {
        const response = await fetch(`${API_URL}/api/profile/${currentUserId}`, {
            credentials: 'include' // AJOUTÉ
        });
        
        if (!response.ok) {
            throw new Error('Profile not found');
        }
        
        const profile = await response.json();
        
        // Mettre à jour l'interface
        document.getElementById('user-username').textContent = profile.username;
        // Afficher l'email s'il est disponible
        const emailElement = document.getElementById('user-email');
        if (profile.email) {
            emailElement.textContent = profile.email;
            emailElement.style.display = 'block';
        } else {
            emailElement.style.display = 'none';
        }
        document.getElementById('user-bio').textContent = profile.bio || 'Aucune biographie pour le moment.';
        document.getElementById('member-date').textContent = new Date(profile.created_at).toLocaleDateString('fr-FR');
        document.getElementById('games-played').textContent = profile.games_played;
        document.getElementById('games-won').textContent = profile.games_won;
        
        // Calculer le taux de victoire
        const winRate = profile.games_played > 0 
            ? Math.round((profile.games_won / profile.games_played) * 100) 
            : 0;
        document.getElementById('win-rate').textContent = `${winRate}%`;
        
        // Avatar
        if (profile.avatar_url) {
            document.getElementById('user-avatar').src = profile.avatar_url;
        }
        
    } catch (error) {
        console.error('Error loading profile:', error);
        showNotification('Erreur lors du chargement du profil', 'error');
    }
}

// Chargement de l'historique des parties avec pagination
async function loadGameHistory(page = 1) {
    if (isLoadingGames) return;
    
    try {
        isLoadingGames = true;
        const gamesListContainer = document.getElementById('games-list');
        
        // Afficher le loader seulement si c'est la première page
        if (page === 1) {
            gamesListContainer.innerHTML = '<div class="loading">Chargement de l\'historique...</div>';
        } else {
            // Pour les pages suivantes, afficher un loader en bas
            const existingLoader = document.querySelector('.pagination-loader');
            if (!existingLoader) {
                const loader = document.createElement('div');
                loader.className = 'pagination-loader loading';
                loader.textContent = 'Chargement...';
                gamesListContainer.appendChild(loader);
            }
        }
        
        // Charger l'historique depuis l'API
        const response = await fetch(`${API_URL}/api/profile/${currentUserId}/games?page=${page}&limit=10`, {
            credentials: 'include' // AJOUTÉ
        });
        
        if (!response.ok) {
            throw new Error('Failed to load game history');
        }
        
        const data = await response.json();
        currentPage = page;
        totalPages = data.pagination.totalPages;
        
        // Afficher les résultats
        if (page === 1) {
            displayGameHistory(data.games);
        } else {
            appendGameHistory(data.games);
        }
        
        // Ajouter la pagination
        updatePagination(data.pagination);
        
    } catch (error) {
        console.error('Error loading game history:', error);
        showNotification('Erreur lors du chargement de l\'historique', 'error');
        
        // Afficher un message d'erreur dans le conteneur
        const gamesListContainer = document.getElementById('games-list');
        if (currentPage === 1) {
            gamesListContainer.innerHTML = '<div class="loading">Erreur lors du chargement de l\'historique</div>';
        }
    } finally {
        isLoadingGames = false;
        // Supprimer le loader de pagination s'il existe
        const loader = document.querySelector('.pagination-loader');
        if (loader) {
            loader.remove();
        }
    }
}

function displayGameHistory(games) {
    const gamesListContainer = document.getElementById('games-list');
    
    if (games.length === 0) {
        gamesListContainer.innerHTML = `
            <div class="no-games-message">
                <div class="no-games-icon">🎮</div>
                <h3>Aucune partie récente</h3>
                <p>Aucune partie trouvée dans les 30 derniers jours</p>
                <p><small>Les statistiques globales incluent toutes vos parties</small></p>
            </div>
        `;
        return;
    }
    
    const gamesHTML = games.map(game => {
        const isVictory = game.result === 'victory';
        const resultClass = isVictory ? 'victory' : 'defeat';
        const resultIcon = isVictory ? '🏆' : '❌';
        const resultText = isVictory ? 'Victoire' : 'Défaite';
        
        // Formater la date et l'heure
        const gameDate = new Date(game.date);
        const formattedDate = gameDate.toLocaleDateString('fr-FR');
        const formattedTime = gameDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        
        // Déterminer le mode de jeu avec icônes
        let modeText = game.mode === 'quick' ? '⚡ Mode Rapide' : '🎯 Mode Classique';
        if (game.with_extension) {
            modeText += ' 🟣';
        }
        
        // Afficher la durée avec formatage
        let durationDisplay = '';
        if (game.duration !== null) {
            const hours = Math.floor(game.duration / 60);
            const minutes = game.duration % 60;
            if (hours > 0) {
                durationDisplay = `⏱️ ${hours}h${minutes}m`;
            } else {
                durationDisplay = `⏱️ ${minutes}m`;
            }
        }
        
        // Calcul du différentiel de score
        const scoreDiff = Math.abs(game.score.player - game.score.opponent);
        let victoryType = '';
        if (isVictory) {
            if (scoreDiff > 50) victoryType = ' • Victoire écrasante!';
            else if (scoreDiff > 20) victoryType = ' • Victoire confortable';
            else if (scoreDiff <= 5) victoryType = ' • Victoire serrée!';
        }
        
        return `
            <div class="game-item" data-game-id="${game.id}">
                <div class="game-info">
                    <div class="game-header">
                        <h4>vs ${game.opponent}</h4>
                        <span class="game-mode">${modeText}</span>
                    </div>
                    <div class="game-details">
                        <span class="game-date">📅 ${formattedDate} à ${formattedTime}</span>
                        ${durationDisplay ? `<span class="game-duration">${durationDisplay}</span>` : ''}
                    </div>
                </div>
                <div class="game-result ${resultClass}">
                    <div class="result-header">
                        <span class="result-icon">${resultIcon}</span>
                        <span class="result-text">${resultText}${victoryType}</span>
                    </div>
                    <div class="game-score">
                        <span class="score-player ${isVictory ? 'winning-score' : ''}">${game.score.player}</span>
                        <span class="score-separator">-</span>
                        <span class="score-opponent ${!isVictory ? 'winning-score' : ''}">${game.score.opponent}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    gamesListContainer.innerHTML = gamesHTML;
    
    // Ajouter les gestionnaires d'événements pour les détails
    addGameDetailHandlers();
}

// Ajouter des parties à la liste existante (pagination)
function appendGameHistory(games) {
    const gamesListContainer = document.getElementById('games-list');
    
    games.forEach(game => {
        const isVictory = game.result === 'victory';
        const resultClass = isVictory ? 'victory' : 'defeat';
        const resultIcon = isVictory ? '🏆' : '❌';
        const resultText = isVictory ? 'Victoire' : 'Défaite';
        
        const gameDate = new Date(game.date);
        const formattedDate = gameDate.toLocaleDateString('fr-FR');
        const formattedTime = gameDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        
        let modeText = game.mode === 'quick' ? '⚡ Mode Rapide' : '🎯 Mode Classique';
        if (game.with_extension) {
            modeText += ' 🟣';
        }
        
        let durationDisplay = '';
        if (game.duration !== null) {
            const hours = Math.floor(game.duration / 60);
            const minutes = game.duration % 60;
            if (hours > 0) {
                durationDisplay = `⏱️ ${hours}h${minutes}m`;
            } else {
                durationDisplay = `⏱️ ${minutes}m`;
            }
        }
        
        const scoreDiff = Math.abs(game.score.player - game.score.opponent);
        let victoryType = '';
        if (isVictory) {
            if (scoreDiff > 50) victoryType = ' • Victoire écrasante!';
            else if (scoreDiff > 20) victoryType = ' • Victoire confortable';
            else if (scoreDiff <= 5) victoryType = ' • Victoire serrée!';
        }
        
        const gameElement = document.createElement('div');
        gameElement.className = 'game-item';
        gameElement.dataset.gameId = game.id;
        gameElement.innerHTML = `
            <div class="game-info">
                <div class="game-header">
                    <h4>vs ${game.opponent}</h4>
                    <span class="game-mode">${modeText}</span>
                </div>
                <div class="game-details">
                    <span class="game-date">📅 ${formattedDate} à ${formattedTime}</span>
                    ${durationDisplay ? `<span class="game-duration">${durationDisplay}</span>` : ''}
                </div>
            </div>
            <div class="game-result ${resultClass}">
                <div class="result-header">
                    <span class="result-icon">${resultIcon}</span>
                    <span class="result-text">${resultText}${victoryType}</span>
                </div>
                <div class="game-score">
                    <span class="score-player ${isVictory ? 'winning-score' : ''}">${game.score.player}</span>
                    <span class="score-separator">-</span>
                    <span class="score-opponent ${!isVictory ? 'winning-score' : ''}">${game.score.opponent}</span>
                </div>
            </div>
        `;
        
        // Ajouter avec animation
        gameElement.style.opacity = '0';
        gameElement.style.transform = 'translateY(20px)';
        gamesListContainer.appendChild(gameElement);
        
        // Animer l'apparition
        requestAnimationFrame(() => {
            gameElement.style.transition = 'all 0.3s ease';
            gameElement.style.opacity = '1';
            gameElement.style.transform = 'translateY(0)';
        });
    });
    
    addGameDetailHandlers();
}

// Mise à jour de la pagination
function updatePagination(pagination) {
    let paginationContainer = document.querySelector('.games-pagination');
    
    // Créer le conteneur s'il n'existe pas
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.className = 'games-pagination';
        document.getElementById('games-list').parentNode.appendChild(paginationContainer);
    }
    
    // Masquer la pagination s'il n'y a qu'une page
    if (pagination.totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    // Créer les boutons de pagination
    let paginationHTML = `
        <div class="pagination-info">
            Page ${pagination.page} sur ${pagination.totalPages}
        </div>
        <div class="pagination-buttons">
    `;
    
    // Bouton Précédent
    paginationHTML += `
        <button class="pagination-btn" onclick="loadGameHistory(${pagination.page - 1})" 
                ${pagination.page <= 1 ? 'disabled' : ''}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/>
            </svg>
            Précédent
        </button>
    `;
    
    // Numéros de page
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.totalPages, pagination.page + 2);
    
    if (startPage > 1) {
        paginationHTML += `<button class="pagination-btn" onclick="loadGameHistory(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += '<span class="pagination-dots">...</span>';
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="pagination-btn ${i === pagination.page ? 'active' : ''}" 
                    onclick="loadGameHistory(${i})">${i}</button>
        `;
    }
    
    if (endPage < pagination.totalPages) {
        if (endPage < pagination.totalPages - 1) {
            paginationHTML += '<span class="pagination-dots">...</span>';
        }
        paginationHTML += `<button class="pagination-btn" onclick="loadGameHistory(${pagination.totalPages})">${pagination.totalPages}</button>`;
    }
    
    // Bouton Suivant
    paginationHTML += `
        <button class="pagination-btn" onclick="loadGameHistory(${pagination.page + 1})" 
                ${pagination.page >= pagination.totalPages ? 'disabled' : ''}>
            Suivant
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/>
            </svg>
        </button>
    `;
    
    paginationHTML += '</div>';
    
    paginationContainer.innerHTML = paginationHTML;
}

// Gestionnaires d'événements pour les détails des parties
function addGameDetailHandlers() {
    document.querySelectorAll('.game-item').forEach(item => {
        item.addEventListener('click', () => {
            const gameId = item.dataset.gameId;
            if (gameId) {
                showGameDetail(gameId);
            }
        });
        
        // Effet hover amélioré
        item.addEventListener('mouseenter', () => {
            item.style.transform = 'translateY(-4px)';
            item.style.boxShadow = '0 8px 25px rgba(76, 175, 80, 0.15)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.transform = 'translateY(0)';
            item.style.boxShadow = 'none';
        });
    });
}

// Modal de détail de partie (placeholder)
async function showGameDetail(gameId) {
    const modal = document.createElement('div');
    modal.className = 'modal game-detail-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <h2>Détails de la partie #${gameId}</h2>
            <div class="game-detail-content">
                <div class="loading">Chargement des détails...</div>
            </div>
            <div class="modal-buttons">
                <button type="button" onclick="closeGameDetail()">Fermer</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.classList.add('visible');
    
    // Charger les détails depuis l'API
    try {
        const response = await fetch(`${API_URL}/api/games/${gameId}/details`, {
            credentials: 'include' // AJOUTÉ
        });
        if (!response.ok) {
            throw new Error('Failed to load game details');
        }
        
        const details = await response.json();
        displayGameDetails(details, modal);
        
    } catch (error) {
        console.error('Error loading game details:', error);
        const content = modal.querySelector('.game-detail-content');
        content.innerHTML = `
            <div class="error-message">
                <p>❌ Erreur lors du chargement des détails</p>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function displayGameDetails(details, modal) {
    const content = modal.querySelector('.game-detail-content');
    
    // Extraire les informations du vainqueur
    const winner = details.basic.winner ? 
        (typeof details.basic.winner === 'object' ? details.basic.winner.name : details.basic.winner) : 
        'Égalité';

    // CORRECTION: Extraire les scores des manches et les totaliser
    let player1Score = 0, player2Score = 0;
    
    // Vérifier si nous avons des données de manche
    if (Array.isArray(details.rounds)) {
        // Calculer les scores à partir des scores des manches
        details.rounds.forEach(round => {
            const roundScoreP1 = typeof round.score_p1 === 'object' ? 0 : Number(round.score_p1 || 0);
            const roundScoreP2 = typeof round.score_p2 === 'object' ? 0 : Number(round.score_p2 || 0);
            
            player1Score += roundScoreP1;
            player2Score += roundScoreP2;
        });
    } 
    // Vérifier si nous avons les scores directement dans le round1/2/3_score_player1/2
    else if (details.basic.round1_score_player1 !== undefined) {
        // Additionner les scores des 3 manches possibles
        player1Score = Number(details.basic.round1_score_player1 || 0) +
                      Number(details.basic.round2_score_player1 || 0) +
                      Number(details.basic.round3_score_player1 || 0);
                      
        player2Score = Number(details.basic.round1_score_player2 || 0) +
                      Number(details.basic.round2_score_player2 || 0) +
                      Number(details.basic.round3_score_player2 || 0);
    } 
    // Fallback sur les scores principaux
    else if (details.basic.scores) {
        if (typeof details.basic.scores === 'object') {
            player1Score = Number(details.basic.scores.player1) || 0;
            player2Score = Number(details.basic.scores.player2) || 0;
        } else if (Array.isArray(details.basic.scores)) {
            [player1Score, player2Score] = details.basic.scores.map(s => Number(s) || 0);
        }
    } 
    // Dernier fallback sur score_player1/2
    else if (details.basic.score_player1 !== undefined) {
        player1Score = Number(details.basic.score_player1) || 0;
        player2Score = Number(details.basic.score_player2) || 0;
    }
    
    // Calculer la marge de manière sécurisée
    const margin = Math.abs(player1Score - player2Score);
    
    // Créer l'affichage du score
    const scoresDisplay = `${player1Score} - ${player2Score}`;
    
    // Reste de la fonction identique...
    
    // Formater la durée
    let durationText = 'Durée inconnue';
    if (details.basic.duration) {
        const hours = Math.floor(details.basic.duration / 60);
        const minutes = details.basic.duration % 60;
        durationText = hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
    }

    // Extraire le mode de jeu de manière sécurisée
    const gameMode = details.basic.mode === 'quick' ? 'Rapide' : 'Classique';
    const withExtension = details.basic.withExtension ? ' + Extension' : '';
    
    // Préparer l'extraction des joueurs
    const player1Name = details.basic.player1_name || 
        (Array.isArray(details.basic.players) && details.basic.players.length > 0 ?
            (typeof details.basic.players[0] === 'object' ? details.basic.players[0].name : details.basic.players[0]) :
            'Joueur 1');
    
    const player2Name = details.basic.player2_name || 
        (Array.isArray(details.basic.players) && details.basic.players.length > 1 ?
            (typeof details.basic.players[1] === 'object' ? details.basic.players[1].name : details.basic.players[1]) :
            'Joueur 2');
    
    content.innerHTML = `
        <div class="game-detail-tabs">
            <button class="detail-tab-btn active" data-tab="resume">Résumé</button>
            <button class="detail-tab-btn" data-tab="moves">Chronologie</button>
            <button class="detail-tab-btn" data-tab="stats">Statistiques</button>
        </div>
        
        <div class="detail-tab-content">
            <!-- Onglet Résumé -->
            <div class="detail-tab-pane active" id="resume-pane">
                <div class="game-summary">
                    <div class="summary-row">
                        <span class="summary-label">🏆 Vainqueur :</span>
                        <span class="summary-value winner-name">${winner}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">📊 Score final :</span>
                        <span class="summary-value">${scoresDisplay}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">🎯 Marge de victoire :</span>
                        <span class="summary-value">${margin} points</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">⏱️ Durée :</span>
                        <span class="summary-value">${durationText}</span>
                    </div>
                    <div class="summary-row">
                        <span class="summary-label">🎮 Mode :</span>
                        <span class="summary-value">${gameMode}${withExtension}</span>
                    </div>
                </div>
                
                <div class="rounds-summary">
                    <h3>Scores par manche</h3>
                    <div class="rounds-grid">
                        ${getRoundsHTML(details, player1Name, player2Name)}
                    </div>
                </div>
            </div>
            
            <!-- Onglet Chronologie -->
            <div class="detail-tab-pane" id="moves-pane">
                <div class="moves-timeline">
                    ${details.moves.map(move => {
                        // Assurer que player est une chaîne
                        const playerName = typeof move.player === 'object' ? 
                            (move.player.name || JSON.stringify(move.player)) : move.player;
                        
                        return `
                            <div class="move-item">
                                <div class="move-time">${new Date(move.timestamp).toLocaleTimeString('fr-FR')}</div>
                                <div class="move-player ${playerName === player1Name ? 'player1' : 'player2'}">${playerName}</div>
                                <div class="move-action">${formatMoveAction(move)}</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            
            <!-- Onglet Statistiques -->
            <div class="detail-tab-pane" id="stats-pane">
                <div class="stats-grid">
                    <div class="stat-card">
                        <h4>Actions totales</h4>
                        <div class="stat-value">${details.statistics.totalMoves}</div>
                    </div>
                    <div class="stat-card">
                        <h4>Cartes jouées</h4>
                        <div class="stat-value">${details.statistics.cardsByAction.played}</div>
                    </div>
                    <div class="stat-card">
                        <h4>Cartes défaussées</h4>
                        <div class="stat-value">${details.statistics.cardsByAction.discarded}</div>
                    </div>
                    <div class="stat-card">
                        <h4>Cartes piochées</h4>
                        <div class="stat-value">${details.statistics.cardsByAction.drawn}</div>
                    </div>
                </div>
                
                <div class="player-stats">
                    <h4>Actions par joueur</h4>
                    ${Object.entries(details.statistics.movesPerPlayer).map(([player, count]) => `
                        <div class="player-stat-row">
                            <span class="player-name">${player}</span>
                            <span class="stat-value">${count} actions</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;
    
    // Activer la navigation entre onglets
    setupDetailTabs(modal);
}

function getRoundsHTML(details, player1Name, player2Name) {
    // Si nous avons des données de manches dans le format d'array attendu
    if (Array.isArray(details.rounds) && details.rounds.length > 0) {
        return details.rounds.map(round => {
            const scoreP1 = typeof round.score_p1 === 'object' ? 0 : (round.score_p1 || 0);
            const scoreP2 = typeof round.score_p2 === 'object' ? 0 : (round.score_p2 || 0);
            
            return `
                <div class="round-item">
                    <div class="round-number">Manche ${round.round}</div>
                    <div class="round-scores">
                        <span>${player1Name}: ${scoreP1}</span>
                        <span>${player2Name}: ${scoreP2}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
    // Si nous avons des données formatées comme round1_score_player1, etc.
    else if (details.basic.round1_score_player1 !== undefined) {
        let roundsHTML = '';
        
        // Ajouter chaque manche qui a un score non-nul pour au moins un joueur
        for (let i = 1; i <= 3; i++) {
            const p1ScoreKey = `round${i}_score_player1`;
            const p2ScoreKey = `round${i}_score_player2`;
            
            if ((details.basic[p1ScoreKey] !== 0 && details.basic[p1ScoreKey] !== null) || 
                (details.basic[p2ScoreKey] !== 0 && details.basic[p2ScoreKey] !== null)) {
                
                roundsHTML += `
                    <div class="round-item">
                        <div class="round-number">Manche ${i}</div>
                        <div class="round-scores">
                            <span>${player1Name}: ${details.basic[p1ScoreKey] || 0}</span>
                            <span>${player2Name}: ${details.basic[p2ScoreKey] || 0}</span>
                        </div>
                    </div>
                `;
            }
        }
        
        return roundsHTML;
    }
    
    // Fallback si aucun format reconnu
    return `<div class="no-rounds">Aucune information de manche disponible</div>`;
}

function formatMoveAction(move) {
    const actionTexts = {
        'play_card': 'a joué',
        'discard_card': 'a défaussé',
        'draw_card': 'a pioché'
    };
    
    let description = actionTexts[move.action] || move.action;
    
    // CORRECTION : Vérifier si card est un objet et accéder à ses propriétés
    if (move.card) {
        // Si c'est un objet, accéder à l'ID ou créer une description lisible
        if (typeof move.card === 'object') {
            // Formatter la carte en texte lisible, par exemple "rouge 5" ou "bleu wager"
            const cardText = move.card.color && move.card.type ? 
                `${move.card.color}_${move.card.value || move.card.type}` : 
                move.card.id || JSON.stringify(move.card);
            description += ` <span class="card-name">${cardText}</span>`;
        } else {
            // Si c'est déjà une chaîne, l'utiliser directement
            description += ` <span class="card-name">${move.card}</span>`;
        }
    }
    
    if (move.destination === 'expedition') {
        description += ` sur l'expédition ${move.color}`;
    } else if (move.destination === 'discard_pile') {
        description += ` dans la défausse ${move.color}`;
    }
    
    if (move.source === 'discard_pile') {
        description += ` depuis la défausse ${move.color}`;
    } else if (move.source === 'deck') {
        description += ` depuis le deck`;
    }
    
    return description;
}

function setupDetailTabs(modal) {
    const tabBtns = modal.querySelectorAll('.detail-tab-btn');
    const tabPanes = modal.querySelectorAll('.detail-tab-pane');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            
            // Retirer l'état actif de tous les onglets et panneaux
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Activer l'onglet et le panneau cliqué
            btn.classList.add('active');
            modal.querySelector(`#${targetTab}-pane`).classList.add('active');
        });
    });
}

function closeGameDetail() {
    const modal = document.querySelector('.game-detail-modal');
    if (modal) {
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 300);
    }
}

// Chargement des messages pour les admins
async function loadUserMessages(userId) {
    if (!isAdmin) return;
    
    try {
        const response = await fetch(`${API_URL}/api/profile/${userId}/messages`, {
            credentials: 'include' // AJOUTÉ
        });
        
        if (!response.ok) {
            throw new Error('Failed to load messages');
        }
        
        const messages = await response.json();
        displayMessages(messages);
        
    } catch (error) {
        console.error('Error loading user messages:', error);
    }
}

function displayMessages(messages) {
    const tbody = document.getElementById('user-messages');
    tbody.innerHTML = '';
    
    if (messages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4">Aucun message récent</td></tr>';
        return;
    }
    
    messages.forEach(msg => {
        const row = document.createElement('tr');
        const date = new Date(msg.timestamp).toLocaleString('fr-FR');
        const statusClass = msg.is_deleted ? 'message-deleted' : '';
        
        row.innerHTML = `
            <td>${date}</td>
            <td>${msg.context}</td>
            <td class="${statusClass}">${msg.message}</td>
            <td>${msg.is_deleted ? 'Supprimé' : 'Actif'}</td>
        `;
        tbody.appendChild(row);
    });
}

// Gestion des modals
function openAvatarModal() {
    const modal = document.getElementById('avatar-modal');
    modal.classList.add('visible');
    
    // Préremplir avec l'avatar actuel s'il existe
    const currentAvatar = document.getElementById('user-avatar').src;
    if (!currentAvatar.includes('default-avatar.png')) {
        document.getElementById('avatar-url').value = currentAvatar;
        document.getElementById('avatar-preview-img').src = currentAvatar;
    }
}

function openBioModal() {
    const modal = document.getElementById('edit-bio-modal');
    modal.classList.add('visible');
    
    // Préremplir avec la bio actuelle
    const currentBio = document.getElementById('user-bio').textContent;
    if (currentBio !== 'Aucune biographie pour le moment.') {
        document.getElementById('bio-text').value = currentBio;
        updateCharCount();
    }
}

function openUsernameModal() {
    const modal = document.getElementById('username-modal');
    modal.classList.add('visible');
    
    // Préremplir avec le username actuel
    const currentUsername = document.getElementById('user-username').textContent;
    document.getElementById('new-username').value = currentUsername;
}

function openPasswordModal() {
    const modal = document.getElementById('password-modal');
    modal.classList.add('visible');
}

// Fermeture des modals
function closeAvatarModal() {
    document.getElementById('avatar-modal').classList.remove('visible');
}

function closeBioModal() {
    document.getElementById('edit-bio-modal').classList.remove('visible');
}

function closeUsernameModal() {
    document.getElementById('username-modal').classList.remove('visible');
}

function closePasswordModal() {
    document.getElementById('password-modal').classList.remove('visible');
}

// Fermer les modals en cliquant à l'extérieur
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('visible');
    }
});

// Prévisualisation de l'avatar
function previewAvatar() {
    const url = document.getElementById('avatar-url').value;
    const preview = document.getElementById('avatar-preview-img');
    
    if (url && isValidImageUrl(url)) {
        preview.src = url;
        preview.onerror = () => {
            preview.src = '/assets/default-avatar.png';
        };
    } else {
        preview.src = '/assets/default-avatar.png';
    }
}

function isValidImageUrl(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
}

// Validation du username (format seulement, PAS d'unicité)
function validateUsername() {
    const input = document.getElementById('new-username');
    const validationMsg = document.getElementById('username-validation');
    const username = input.value.trim();
    
    // Reset styles
    validationMsg.className = 'validation-message';
    validationMsg.textContent = '';
    
    if (username.length < 3) {
        validationMsg.textContent = 'Le nom d\'utilisateur doit contenir au moins 3 caractères';
        validationMsg.classList.add('error');
        return false;
    }
    
    if (username.length > 20) {
        validationMsg.textContent = 'Le nom d\'utilisateur ne peut pas dépasser 20 caractères';
        validationMsg.classList.add('error');
        return false;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        validationMsg.textContent = 'Seuls les lettres, chiffres et _ sont autorisés';
        validationMsg.classList.add('error');
        return false;
    }
    
    // PAS de vérification d'unicité - les usernames ne sont pas uniques
    validationMsg.textContent = 'Format valide ✓';
    validationMsg.classList.add('success');
    return true;
}

// Mise à jour du compteur de caractères
function updateCharCount() {
    const textarea = document.getElementById('bio-text');
    const counter = document.querySelector('.char-count');
    
    if (textarea && counter) {
        const length = textarea.value.length;
        counter.textContent = `${length}/500`;
        
        if (length > 450) {
            counter.style.color = 'var(--error-color)';
        } else if (length > 400) {
            counter.style.color = 'var(--warning-color)';
        } else {
            counter.style.color = 'var(--text-muted)';
        }
    }
}

// Configuration des gestionnaires de formulaires
function setupFormHandlers() {
    // Formulaire bio
    document.getElementById('bio-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const bio = document.getElementById('bio-text').value;
        await updateProfile({ bio });
    });
    
    // Formulaire username
    document.getElementById('username-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-username').value;
        await updateUsername(username);
    });
    
    // Formulaire password
    document.getElementById('password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-password').value;
        
        if (newPassword !== confirmPassword) {
            showNotification('Les mots de passe ne correspondent pas', 'error');
            return;
        }
        
        await updatePassword(currentPassword, newPassword);
    });
    
    // Formulaire avatar
    document.getElementById('avatar-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const avatarUrl = document.getElementById('avatar-url').value;
        await updateProfile({ avatar_url: avatarUrl });
    });
}

// Fonctions de mise à jour
async function updateProfile(data) {
    try {
        const response = await fetch(`${API_URL}/api/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // AJOUTÉ
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showNotification('Profil mis à jour avec succès', 'success');
            await loadProfile();
            
            // Fermer les modals appropriés
            if (data.bio !== undefined) closeBioModal();
            if (data.avatar_url !== undefined) closeAvatarModal();
        } else {
            throw new Error('Erreur lors de la mise à jour');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        showNotification('Erreur lors de la mise à jour du profil', 'error');
    }
}

async function updateUsername(username) {
    try {
        const response = await fetch(`${API_URL}/api/profile/username`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // AJOUTÉ
            body: JSON.stringify({ username })
        });
        
        if (response.ok) {
            showNotification('Nom d\'utilisateur mis à jour avec succès', 'success');
            await loadProfile();
            closeUsernameModal();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Erreur lors de la mise à jour', 'error');
        }
    } catch (error) {
        console.error('Error updating username:', error);
        showNotification('Erreur lors de la mise à jour du nom d\'utilisateur', 'error');
    }
}

async function updatePassword(currentPassword, newPassword) {
    try {
        const response = await fetch(`${API_URL}/api/profile/password`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include', // AJOUTÉ
            body: JSON.stringify({ currentPassword, newPassword })
        });
        
        if (response.ok) {
            showNotification('Mot de passe mis à jour avec succès', 'success');
            closePasswordModal();
            
            // Réinitialiser le formulaire
            document.getElementById('password-form').reset();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Erreur lors de la mise à jour', 'error');
        }
    } catch (error) {
        console.error('Error updating password:', error);
        showNotification('Erreur lors de la mise à jour du mot de passe', 'error');
    }
}

// Système de notifications amélioré avec pile
const notificationStack = [];
const maxNotifications = 3;

function showNotification(message, type = 'info', duration = 5000) {
    // Limiter le nombre de notifications
    while (notificationStack.length >= maxNotifications) {
        const oldest = notificationStack.shift();
        oldest.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Icônes pour chaque type
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${icons[type] || icons.info}</span>
            <span class="notification-message">${message}</span>
        </div>
        <button class="notification-close" onclick="closeNotification(this)">×</button>
    `;
    
    notification.style.cssText = `
        position: fixed;
        top: ${2 + (notificationStack.length * 80)}px;
        right: 2rem;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        color: white;
        z-index: 1001;
        min-width: 300px;
        opacity: 0;
        transform: translateX(100%);
        animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        box-shadow: 0 4px 25px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(10px);
    `;
    
    switch (type) {
        case 'success':
            notification.style.background = 'linear-gradient(135deg, #4CAF50, #45a049)';
            break;
        case 'error':
            notification.style.background = 'linear-gradient(135deg, #f44336, #da190b)';
            break;
        case 'warning':
            notification.style.background = 'linear-gradient(135deg, #ff9800, #f57c00)';
            break;
        default:
            notification.style.background = 'linear-gradient(135deg, #2196F3, #1976D2)';
    }
    
    document.body.appendChild(notification);
    notificationStack.push(notification);
    
    // Auto-suppression
    setTimeout(() => {
        closeNotification(notification.querySelector('.notification-close'));
    }, duration);
}

function closeNotification(closeBtn) {
    const notification = closeBtn.parentElement;
    const index = notificationStack.indexOf(notification);
    
    if (index > -1) {
        notification.style.animation = 'slideOutRight 0.3s ease forwards';
        
        // Réajuster les positions des autres notifications
        notificationStack.slice(index + 1).forEach((notif, i) => {
            notif.style.top = `${parseInt(notif.style.top) - 80}px`;
        });
        
        setTimeout(() => {
            notification.remove();
            notificationStack.splice(index, 1);
        }, 300);
    }
}

// Amélioration des effets de hover avec animations
function setupEnhancedHoverEffects() {
    // Boutons avec effet de hover amélioré
    document.querySelectorAll('button:not(.no-hover)').forEach(button => {
        button.addEventListener('mouseenter', () => {
            button.style.transform = 'translateY(-2px)';
            button.style.filter = 'brightness(1.1)';
        });
        
        button.addEventListener('mouseleave', () => {
            button.style.transform = 'translateY(0)';
            button.style.filter = 'brightness(1)';
        });
        
        button.addEventListener('mousedown', () => {
            button.style.transform = 'translateY(0) scale(0.98)';
        });
        
        button.addEventListener('mouseup', () => {
            button.style.transform = 'translateY(-2px) scale(1)';
        });
    });
    
    // Cards avec effet de hover
    document.querySelectorAll('.profile-info-card, .games-history-card, .settings-card, .messages-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            card.style.transform = 'translateY(-4px)';
            card.style.boxShadow = '0 12px 30px rgba(76, 175, 80, 0.1)';
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = 'none';
        });
    });
}

// Styles d'animation pour les notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
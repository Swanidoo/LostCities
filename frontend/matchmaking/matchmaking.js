// Configuration des URLs en fonction de l'environnement
const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // URL du backend local
  : "https://lostcitiesbackend.onrender.com"; // URL de production

// Configuration WebSocket - using the same pattern as chat.js
const isLocalhost = window.location.hostname === "localhost";
const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:';
const wsHost = isLocalhost ? 'localhost:3000' : 'lostcitiesbackend.onrender.com';
const WS_URL = `${wsProtocol}//${wsHost}/ws`;

// État du matchmaking
let matchmakingState = {
    searching: false,
    socket: null,
    userId: null,
    username: null,
    onlinePlayers: [],
    gameId: null
};

// Éléments DOM
const elements = {
    searchBtn: document.getElementById('search-game-btn'),
    cancelBtn: document.getElementById('cancel-search-btn'),
    statusMessage: document.getElementById('status-message'),
    spinner: document.getElementById('spinner'),
    onlinePlayersList: document.getElementById('online-players')
};

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '../login/login.html';
        return;
    }

    // Vérifier le statut de ban
    const banInfo = await checkBanStatus();
    if (banInfo) {
        alert(`Vous êtes banni. ${banInfo.reason ? 'Raison: ' + banInfo.reason : ''}`);
        window.location.href = '/';
        return;
    }

    // Clean the token and log it for debugging (like in chat.js)
    const cleanToken = token.trim();
    console.log("Using cleaned token length:", cleanToken.length);

    // Récupérer les informations de l'utilisateur depuis le token
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            matchmakingState.userId = payload.id;
            matchmakingState.username = payload.username || payload.email;
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du token:", error);
    }

    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Établir la connexion WebSocket
    connectWebSocket(cleanToken);
});

async function checkBanStatus() {
    const token = localStorage.getItem('authToken');
    if (!token) return false;
    
    try {
        const response = await fetch(`${API_URL}/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 403) {
            const data = await response.json();
            if (data.banInfo) {
                return data.banInfo;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking ban status:', error);
        return false;
    }
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Bouton de recherche de partie
    elements.searchBtn.addEventListener('click', () => {
        if (!matchmakingState.searching) {
            startMatchmaking();
        }
    });
    
    // Bouton d'annulation de recherche
    elements.cancelBtn.addEventListener('click', () => {
        if (matchmakingState.searching) {
            cancelMatchmaking();
        }
    });
}

// Connexion au WebSocket
function connectWebSocket(cleanToken) {
    if (!cleanToken) return;

    // Fermer la connexion existante si elle existe
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        matchmakingState.socket.close();
    }

    // Create WebSocket URL with same pattern as chat.js
    const wsUrl = `${WS_URL}?token=${encodeURIComponent(cleanToken)}`;
    console.log("Connecting to WebSocket URL:", wsUrl.substring(0, wsUrl.indexOf('?') + 15) + "...");
    
    matchmakingState.socket = new WebSocket(wsUrl);
    
    // Gestion des événements WebSocket
    setupWebSocketEventListeners();
}

// Configuration des écouteurs d'événements WebSocket
function setupWebSocketEventListeners() {
    const socket = matchmakingState.socket;
    
    // Connexion établie
    socket.addEventListener('open', () => {
        console.log("✅ WebSocket connection established");
        updateStatus("Connecté au serveur", false);
        
        // Demander la liste des joueurs en ligne
        requestOnlinePlayers();
    });
    
    // Erreur de connexion
    socket.addEventListener('error', (error) => {
        console.error("❌ WebSocket error:", error);
        updateStatus("Erreur de connexion au serveur", false);
    });
    
    // Fermeture de la connexion
    socket.addEventListener('close', (event) => {
        console.log(`WebSocket disconnected: ${event.code} - ${event.reason}`);
        updateStatus("Déconnecté du serveur", false);
        
        // Tentative de reconnexion après 5 secondes
        setTimeout(() => {
            if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
                connectWebSocket(localStorage.getItem('authToken')?.trim());
            }
        }, 5000);
    });
    
    // Réception de message
    socket.addEventListener('message', handleWebSocketMessage);
}

// Handle incoming WebSocket messages
function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log("📩 Message received:", data);

        switch (data.event) {
            case "error":
                if (data.data && data.data.type === "ban_error") {
                    alert(`Vous êtes banni. ${data.data.banInfo?.reason ? 'Raison: ' + data.data.banInfo.reason : ''}`);
                    window.location.href = '/';
                    return;
                }
                // Gérer les autres erreurs
                updateStatus(data.data?.message || "Une erreur est survenue", false);
                break;

            case "matchmakingStatus":
                // Update matchmaking status
                updateStatus(data.data.message, data.data.status === "searching");
                matchmakingState.searching = data.data.status === "searching";
                toggleMatchmakingUI(matchmakingState.searching);
                break;

            case "matchFound":
                // Match found! Redirect to the game page
                updateStatus(`Adversaire trouvé: ${data.data.opponentName}. Redirection vers la partie...`, false);

                // Store game info if needed
                localStorage.setItem("currentGameId", data.data.gameId);

                // Redirect to game page
                setTimeout(() => {
                    window.location.href = `../game/game.html?gameId=${data.data.gameId}`;
                }, 1500);
                break;

            case "onlinePlayers":
                // Update online players list
                matchmakingState.onlinePlayers = data.data.players || [];
                updateOnlinePlayersList();
                break;

            case "systemMessage":
                // Handle system messages
                if (data.data && data.data.message) {
                    updateStatus(data.data.message, matchmakingState.searching);
                }
                break;

            default:
                console.log("Unknown message type:", data.event);
        }
    } catch (error) {
        console.error("❌ Error parsing message:", error);
    }
}

// Démarrer la recherche de partie
function startMatchmaking() {
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        // Récupérer les options sélectionnées
        const gameMode = document.querySelector('input[name="game-mode"]:checked')?.value || 'classic';
        const useExtension = document.querySelector('#use-extension')?.checked || false;
        
        // Update UI to show searching state
        updateStatus("Recherche d'un adversaire en cours...", true);

        // Send matchmaking request with game options
        matchmakingState.socket.send(JSON.stringify({
            event: "findMatch",
            data: {
              userId: matchmakingState.userId,
              username: matchmakingState.username,
              gameMode: gameMode,         // 'classic' ou 'quick'
              useExtension: useExtension  // true ou false
            }
        }));

        matchmakingState.searching = true;
        toggleMatchmakingUI(true);
    } else {
        updateStatus("Déconnecté du serveur. Impossible de rechercher une partie.", false);
    }
}

// Annuler la recherche de partie
function cancelMatchmaking() {
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        // Send cancel matchmaking request
        matchmakingState.socket.send(JSON.stringify({
            event: "cancelMatch",
            data: {
                userId: matchmakingState.userId
            }
        }));

        updateStatus("Recherche annulée", false);
        matchmakingState.searching = false;
        toggleMatchmakingUI(false);
    } else {
        updateStatus("Déconnecté du serveur. Impossible d'annuler la recherche.", false);
    }
}

// Demander la liste des joueurs en ligne
function requestOnlinePlayers() {
    if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
        return;
    }
    
    // Envoyer une demande pour obtenir la liste des joueurs en ligne
    matchmakingState.socket.send(JSON.stringify({
        event: "getOnlinePlayers",
        data: {}
    }));
}

// Mettre à jour le message d'état
function updateStatus(message, showSpinner) {
    elements.statusMessage.textContent = message;
    elements.spinner.style.display = showSpinner ? 'block' : 'none';
}

// Basculer l'interface de matchmaking
function toggleMatchmakingUI(searching) {
    if (searching) {
        elements.searchBtn.classList.add('hidden');
        elements.cancelBtn.classList.remove('hidden');
    } else {
        elements.searchBtn.classList.remove('hidden');
        elements.cancelBtn.classList.add('hidden');
    }
}

// Mettre à jour la liste des joueurs en ligne
function updateOnlinePlayersList() {
    const container = elements.onlinePlayersList;
    container.innerHTML = '';
    
    if (matchmakingState.onlinePlayers.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'player';
        emptyMessage.textContent = 'Aucun joueur en ligne pour le moment';
        container.appendChild(emptyMessage);
        return;
    }
    
    matchmakingState.onlinePlayers.forEach(player => {
        if (player.id === matchmakingState.userId) return; // Ne pas afficher le joueur actuel
        
        const playerElement = document.createElement('div');
        playerElement.className = 'player';
        
        const nameElement = document.createElement('span');
        nameElement.textContent = player.username;
        
        const statsElement = document.createElement('div');
        statsElement.className = 'player-stats';
        statsElement.textContent = `${player.status}`;
        
        playerElement.appendChild(nameElement);
        playerElement.appendChild(statsElement);
        
        // Ajouter un bouton pour défier le joueur si disponible
        if (player.status === 'available') {
            const challengeBtn = document.createElement('button');
            challengeBtn.className = 'btn btn-small';
            challengeBtn.textContent = 'Défier';
            challengeBtn.addEventListener('click', () => challengePlayer(player.id));
            playerElement.appendChild(challengeBtn);
        }
        
        container.appendChild(playerElement);
    });
}

// Défier un joueur spécifique
function challengePlayer(playerId) {
    if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
        updateStatus("Non connecté au serveur", false);
        return;
    }
    
    // Envoyer une demande de défi
    matchmakingState.socket.send(JSON.stringify({
        event: "challengePlayer",
        data: { 
            userId: matchmakingState.userId,
            opponentId: playerId 
        }
    }));
    
    updateStatus("Défi envoyé, en attente de réponse...", true);
    matchmakingState.searching = true;
    toggleMatchmakingUI(true);
}

// Actualiser périodiquement la liste des joueurs en ligne
setInterval(requestOnlinePlayers, 30000); // Toutes les 30 secondes
// Détermine l'URL de l'API en fonction de l'environnement
const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // URL du backend local
  : "https://lostcitiesbackend.onrender.com"; // URL de production

// Détermine l'URL WebSocket en fonction de l'environnement
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = window.location.hostname === "localhost" 
    ? 'localhost:3000' 
    : 'lostcitiesbackend.onrender.com';
const WS_URL = `${WS_PROTOCOL}//${WS_HOST}/ws`;

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
document.addEventListener('DOMContentLoaded', () => {
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('authToken');
    if (!token) {
        // Rediriger vers la page de connexion si non connecté
        window.location.href = '/login/login.html';
        return;
    }

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
    connectWebSocket();
});

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
function connectWebSocket() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Fermer la connexion existante si elle existe
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        matchmakingState.socket.close();
    }

    // Créer une nouvelle connexion WebSocket avec le token d'authentification
    const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
    matchmakingState.socket = new WebSocket(wsUrl);
    
    // Gestion des événements WebSocket
    setupWebSocketEventListeners();
}

// Configuration des écouteurs d'événements WebSocket
function setupWebSocketEventListeners() {
    const socket = matchmakingState.socket;
    
    // Connexion établie
    socket.addEventListener('open', () => {
        console.log("WebSocket connexion établie");
        updateStatus("Connecté au serveur", false);
        
        // Demander la liste des joueurs en ligne
        requestOnlinePlayers();
    });
    
    // Erreur de connexion
    socket.addEventListener('error', (error) => {
        console.error("Erreur WebSocket:", error);
        updateStatus("Erreur de connexion au serveur", false);
    });
    
    // Fermeture de la connexion
    socket.addEventListener('close', (event) => {
        console.log(`WebSocket déconnecté: ${event.code} - ${event.reason}`);
        updateStatus("Déconnecté du serveur", false);
        
        // Tentative de reconnexion après 5 secondes
        setTimeout(() => {
            if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
                connectWebSocket();
            }
        }, 5000);
    });
    
    // Réception de message
    socket.addEventListener('message', handleWebSocketMessage);
}

// Traitement des messages WebSocket
function handleWebSocketMessage(event) {
    try {
        const data = JSON.parse(event.data);
        console.log("Message reçu:", data);
        
        switch (data.event) {
            case "systemMessage":
                handleSystemMessage(data.data);
                break;
                
            case "onlinePlayers":
                handleOnlinePlayers(data.data);
                break;
                
            case "matchmakingUpdate":
                handleMatchmakingUpdate(data.data);
                break;
                
            case "gameCreated":
                handleGameCreated(data.data);
                break;
                
            default:
                console.log("Type de message non reconnu:", data.event);
        }
    } catch (error) {
        console.error("Erreur lors de l'analyse du message:", error);
    }
}

// Gestion des messages système
function handleSystemMessage(data) {
    if (data.message) {
        updateStatus(data.message, false);
    }
}

// Gestion de la liste des joueurs en ligne
function handleOnlinePlayers(data) {
    if (data.players) {
        matchmakingState.onlinePlayers = data.players;
        updateOnlinePlayersList();
    }
}

// Gestion des mises à jour de matchmaking
function handleMatchmakingUpdate(data) {
    if (data.status === "searching") {
        updateStatus("Recherche en cours...", true);
        matchmakingState.searching = true;
        toggleMatchmakingUI(true);
    } else if (data.status === "cancelled") {
        updateStatus("Recherche annulée", false);
        matchmakingState.searching = false;
        toggleMatchmakingUI(false);
    } else if (data.status === "matched") {
        updateStatus(`Adversaire trouvé: ${data.opponent}`, true);
        // La redirection sera gérée par l'événement gameCreated
    }
}

// Gestion de la création d'une partie
function handleGameCreated(data) {
    if (data.gameId) {
        matchmakingState.gameId = data.gameId;
        updateStatus(`Partie créée! Redirection...`, false);
        
        // Rediriger vers la page de jeu
        setTimeout(() => {
            window.location.href = `/game/game.html?gameId=${data.gameId}`;
        }, 1500);
    }
}

// Démarrer la recherche de partie
function startMatchmaking() {
    if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
        updateStatus("Non connecté au serveur, reconnexion...", false);
        connectWebSocket();
        return;
    }
    
    // Envoyer une demande de matchmaking
    matchmakingState.socket.send(JSON.stringify({
        event: "startMatchmaking",
        data: { userId: matchmakingState.userId }
    }));
    
    updateStatus("Recherche d'un adversaire...", true);
    matchmakingState.searching = true;
    toggleMatchmakingUI(true);
}

// Annuler la recherche de partie
function cancelMatchmaking() {
    if (!matchmakingState.socket || matchmakingState.socket.readyState !== WebSocket.OPEN) {
        updateStatus("Non connecté au serveur", false);
        matchmakingState.searching = false;
        toggleMatchmakingUI(false);
        return;
    }
    
    // Envoyer une demande d'annulation de matchmaking
    matchmakingState.socket.send(JSON.stringify({
        event: "cancelMatchmaking",
        data: { userId: matchmakingState.userId }
    }));
    
    updateStatus("Annulation de la recherche...", false);
    // Le statut sera mis à jour définitivement quand le serveur confirmera l'annulation
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
        if (player.status === 'disponible') {
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
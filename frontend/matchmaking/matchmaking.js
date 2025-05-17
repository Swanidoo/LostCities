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
    gameId: null
};

// Éléments DOM
const elements = {
    searchBtn: document.getElementById('search-game-btn'),
    cancelBtn: document.getElementById('cancel-search-btn'),
    statusMessage: document.getElementById('status-message'),
    spinner: document.getElementById('spinner')
};

// Initialisation
document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier si l'utilisateur est connecté
    try {
        const authResponse = await fetch(`${API_URL}/check-auth`, {
            credentials: 'include'
        });
        
        if (!authResponse.ok) {
            window.location.href = '../login/login.html';
            return;
        }
        
        const authData = await authResponse.json();
        if (!authData.authenticated) {
            window.location.href = '../login/login.html';
            return;
        }
        
        // Récupérer les informations de l'utilisateur depuis la réponse
        const user = authData.user;
        matchmakingState.userId = user.id;
        matchmakingState.username = user.username || user.email;
    } catch (error) {
        console.error("Erreur lors de la vérification d'auth:", error);
        window.location.href = '../login/login.html';
        return;
    }

    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Établir la connexion WebSocket
    connectWebSocket();
});

async function checkBanStatus() {
    try {
        const response = await fetch(`${API_URL}/ban-status`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            if (data.banned) {
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
function connectWebSocket() {
    // Fermer la connexion existante si elle existe
    if (matchmakingState.socket && matchmakingState.socket.readyState === WebSocket.OPEN) {
        matchmakingState.socket.close();
    }

    // Create WebSocket URL - ATTENTION: PAS DE TOKEN dans l'URL
    const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:';
    const wsHost = isLocalhost ? 'localhost:3000' : 'lostcitiesbackend.onrender.com';
    const wsUrl = `${wsProtocol}//${wsHost}/ws`; // Plus de token dans l'URL
    
    console.log("Connecting to WebSocket URL:", wsUrl);
    
    try {
        matchmakingState.socket = new WebSocket(wsUrl);
        
        // Gestion des événements WebSocket
        setupWebSocketEventListeners();
    } catch (error) {
        console.error("Error creating WebSocket:", error);
        // Ajout d'un callback ou gestion d'erreur si nécessaire
    }
}

// Configuration des écouteurs d'événements WebSocket
function setupWebSocketEventListeners() {
    const socket = matchmakingState.socket;
    
    // Connexion établie
    socket.addEventListener('open', () => {
        console.log("✅ WebSocket connection established");
        updateStatus("Connecté au serveur", false);
    });
    
    // Erreur de connexion
    socket.addEventListener('error', (error) => {
        console.error("❌ WebSocket error:", error);
        updateStatus("Erreur de connexion au serveur", false);
        showSystemMessage("Erreur de connexion au serveur", "system-message error");
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
                showSystemMessage(data.data?.message || "Une erreur est survenue", "system-message error");
                break;

            case "matchmakingStatus":
                // Update matchmaking status
                updateStatus(data.data.message, data.data.status === "searching");
                matchmakingState.searching = data.data.status === "searching";
                toggleMatchmakingUI(matchmakingState.searching);
                
                // Afficher message système si recherche annulée
                if (data.data.status !== "searching" && data.data.message.includes("annulé")) {
                    showSystemMessage(data.data.message, "system-message warning");
                }
                break;

            case "matchFound":
                // Match found! Redirect to the game page
                updateStatus(`Adversaire trouvé: ${data.data.opponentName}. Redirection vers la partie...`, false);
                showSystemMessage(`Adversaire trouvé: ${data.data.opponentName}`, "system-message");

                // Store game info if needed
                localStorage.setItem("currentGameId", data.data.gameId);

                // Redirect to game page
                setTimeout(() => {
                    window.location.href = `../game/game.html?gameId=${data.data.gameId}`;
                }, 1500);
                break;

            case "systemMessage":
                // Handle system messages - filtrer les messages join/leave
                if (data.data && data.data.message) {
                    // Ne pas afficher les messages join/leave
                    if (!data.data.message.includes("a rejoint") && 
                        !data.data.message.includes("a quitté") &&
                        !data.data.message.includes("Bienvenue"))
                        {
                        updateStatus(data.data.message, matchmakingState.searching);
                        
                        // Déterminer le type de message système
                        let messageType = "system-message";
                        if (data.data.message.includes("erreur") || data.data.message.includes("error")) {
                            messageType = "system-message error";
                        } else if (data.data.message.includes("attention") || data.data.message.includes("warning")) {
                            messageType = "system-message warning";
                        } else if (data.data.message.includes("info") || data.data.message.includes("connexion")) {
                            messageType = "system-message info";
                        }
                        
                        showSystemMessage(data.data.message, messageType);
                    }
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
        
        showSystemMessage(`Recherche en cours: ${gameMode === 'quick' ? 'Mode Rapide' : 'Mode Classique'}${useExtension ? ' avec extension' : ''}`, "system-message info");
    } else {
        updateStatus("Déconnecté du serveur. Impossible de rechercher une partie.", false);
        showSystemMessage("Déconnecté du serveur", "system-message error");
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
        
        showSystemMessage("Recherche de partie annulée", "system-message warning");
    } else {
        updateStatus("Déconnecté du serveur. Impossible d'annuler la recherche.", false);
        showSystemMessage("Déconnecté du serveur", "system-message error");
    }
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

// Afficher un message système avec animation
function showSystemMessage(message, type = "system-message") {
    // Créer ou récupérer le conteneur des messages
    let container = document.querySelector('.system-message-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'system-message-container';
        document.body.appendChild(container);
    }
    
    // Créer l'élément message
    const messageElement = document.createElement('div');
    messageElement.className = type;
    messageElement.textContent = message;
    
    // Ajouter le message au conteneur
    container.appendChild(messageElement);
    
    // Supprimer le message après 5 secondes
    setTimeout(() => {
        if (messageElement && messageElement.parentNode) {
            messageElement.style.opacity = '0';
            messageElement.style.transform = 'translateX(100%)';
            setTimeout(() => {
                messageElement.remove();
            }, 300);
        }
    }, 5000);
    
    // Limiter le nombre de messages affichés (max 3)
    const messages = container.querySelectorAll('.system-message, .system-message.error, .system-message.warning, .system-message.info');
    if (messages.length > 3) {
        const oldestMessage = messages[0];
        oldestMessage.style.opacity = '0';
        oldestMessage.style.transform = 'translateX(100%)';
        setTimeout(() => {
            oldestMessage.remove();
        }, 300);
    }
}
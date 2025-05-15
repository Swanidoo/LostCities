// Configuration des URLs en fonction de l'environnement
const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // URL du backend local
  : "https://lostcitiesbackend.onrender.com"; // URL de production

// Configuration WebSocket
const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const WS_HOST = window.location.hostname === "localhost" 
    ? 'localhost:3000' 
    : 'lostcitiesbackend.onrender.com';
const WS_URL = `${WS_PROTOCOL}//${WS_HOST}/ws`;

// État du jeu
const gameState = {
    gameId: null,
    userId: null,
    username: null,
    socket: null,
    gameData: null,
    selectedCard: null,
    selectedPile: null,
    currentPhase: null, // 'play' ou 'draw'
    isPlayerTurn: false,
    isConnected: false,
    cardElements: new Map(), // Pour stocker les références aux éléments DOM des cartes
    playerSide: null,
    opponentSide: null
};

// Éléments DOM
let elements = {};

// Initialisation principale
document.addEventListener('DOMContentLoaded', () => {
    // Cache all DOM elements
    initDOMElements();
    
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('authToken');
    if (!token) {
        window.location.href = '/login/login.html';
        return;
    }

    // Récupérer les informations de l'utilisateur depuis le token
    try {
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
            const payload = JSON.parse(atob(tokenParts[1]));
            gameState.userId = payload.id;
            gameState.username = payload.username || payload.email;
            elements.userId.value = gameState.userId;
            elements.playerName.textContent = gameState.username;
        }
    } catch (error) {
        console.error("Erreur lors de la lecture du token:", error);
    }

    // Récupérer l'ID de la partie depuis l'URL
    const urlParams = new URLSearchParams(window.location.search);
    gameState.gameId = urlParams.get('gameId');
    
    if (!gameState.gameId) {
        showError("ID de partie manquant");
        return;
    }
    
    elements.gameId.value = gameState.gameId;
    
    // Create expedition tooltip element
    const expeditionTooltip = document.createElement('div');
    expeditionTooltip.id = 'expedition-tooltip';
    expeditionTooltip.style.display = 'none';
    document.body.appendChild(expeditionTooltip);
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Établir la connexion WebSocket
    connectWebSocket();

    // Hide action buttons container completely
    const actionButtons = document.getElementById('action-buttons');
    if (actionButtons) {
        // Only remove background and border but keep the buttons accessible
        actionButtons.style.background = 'none';
        actionButtons.style.border = 'none';
        
        // Initially hidden, but can be shown later
        actionButtons.classList.remove('visible');
    }
});

// Initialize all DOM elements
function initDOMElements() {
    elements = {
        // Infos générales
        gameId: document.getElementById('game-id'),
        userId: document.getElementById('user-id'),
        gameStatus: document.getElementById('game-status'),
        phaseIndicator: document.getElementById('phase-indicator'),
        playerName: document.getElementById('player-name'),
        opponentName: document.getElementById('opponent-name'),
        playerScore: document.getElementById('player-score'),
        opponentScore: document.getElementById('opponent-score'),
        gameRound: document.getElementById('game-round'),
        deckCount: document.getElementById('deck-count'),
        playerTurn: document.getElementById('player-turn'),
        opponentTurn: document.getElementById('opponent-turn'),
        
        // Zones de jeu
        playerHand: document.getElementById('player-hand'),
        playerArea: document.getElementById('player-area'),
        opponentArea: document.getElementById('opponent-area'),
        deckPile: document.getElementById('deck-pile'),
        discardPiles: document.getElementById('discard-piles'),
    
        
        // Contrôles de jeu
        rulesBtn: document.getElementById('rules-btn'),
        surrenderBtn: document.getElementById('surrender-btn'),
        chatBtn: document.getElementById('chat-btn'),
        
        // Chat
        chatArea: document.getElementById('chat-area'),
        closeChatBtn: document.getElementById('close-chat-btn'),
        chatMessages: document.getElementById('chat-messages'),
        chatInput: document.getElementById('chat-input'),
        sendChatBtn: document.getElementById('send-chat-btn'),
        
        // Modals
        rulesModal: document.getElementById('rules-modal'),
        closeRulesBtn: document.getElementById('close-rules-btn'),
        surrenderModal: document.getElementById('surrender-modal'),
        confirmSurrenderBtn: document.getElementById('confirm-surrender-btn'),
        cancelSurrenderBtn: document.getElementById('cancel-surrender-btn'),
        gameEndModal: document.getElementById('game-end-modal'),
        gameResult: document.getElementById('game-result'),
        winnerText: document.getElementById('winner-text'),
        playerFinalName: document.getElementById('player-final-name'),
        opponentFinalName: document.getElementById('opponent-final-name'),
        playerFinalScore: document.getElementById('player-final-score'),
        opponentFinalScore: document.getElementById('opponent-final-score'),
        newGameBtn: document.getElementById('new-game-btn'),
        backBtn: document.getElementById('back-btn'),
        
        // Écran de chargement
        loadingOverlay: document.getElementById('loading-overlay')
    };
}

// Connexion au WebSocket
function connectWebSocket() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Clean the token
    const cleanToken = token.trim();
    
    // Use the same WebSocket protocol detection
    const isLocalhost = window.location.hostname === "localhost";
    const wsProtocol = API_URL.startsWith('https') ? 'wss:' : 'ws:';
    const wsHost = isLocalhost ? 'localhost:3000' : 'lostcitiesbackend.onrender.com';
    const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(cleanToken)}`;
    
    console.log("Connecting to WebSocket URL:", wsUrl.substring(0, wsUrl.indexOf('?') + 15) + "...");
    
    gameState.socket = new WebSocket(wsUrl);
    
    // Gestion des événements WebSocket
    setupWebSocketEventListeners();
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Boutons de contrôle
    elements.rulesBtn.addEventListener('click', () => {
        elements.rulesModal.classList.add('visible');
    });
    
    elements.closeRulesBtn.addEventListener('click', () => {
        elements.rulesModal.classList.remove('visible');
    });
    
    elements.surrenderBtn.addEventListener('click', () => {
        elements.surrenderModal.classList.add('visible');
    });
    
    elements.confirmSurrenderBtn.addEventListener('click', surrenderGame);
    
    elements.cancelSurrenderBtn.addEventListener('click', () => {
        elements.surrenderModal.classList.remove('visible');
    });
    
    // Boutons de fin de partie
    elements.newGameBtn.addEventListener('click', () => {
        window.location.href = '/matchmaking.html';
    });
    
    elements.backBtn.addEventListener('click', () => {
        window.location.href = '/index.html';
    });
    
    // Chat - Fix: Ensure the chat button toggles the 'open' class properly
    elements.chatBtn.addEventListener('click', toggleChat);
    
    elements.closeChatBtn.addEventListener('click', () => {
        elements.chatArea.classList.remove('open');
    });
    
    elements.sendChatBtn.addEventListener('click', sendChatMessage);
    
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendChatMessage();
        }
    });
}

// Toggle chat visibility
function toggleChat() {
    console.log("Toggle chat clicked"); // Debug
    if (elements.chatArea.classList.contains('open')) {
        elements.chatArea.classList.remove('open');
    } else {
        elements.chatArea.classList.add('open');
    }
}

// Function to cancel a card selection
function cancelCardSelection() {
    gameState.selectedCard = null;
    
    // Only remove the 'selected' class from cards, not their color classes
    document.querySelectorAll('.card.selected').forEach(el => {
        el.classList.remove('selected');
        // Don't remove color classes!
    });
    
    // Remove valid-target class from all elements
    document.querySelectorAll('.valid-target').forEach(el => {
        el.classList.remove('valid-target');
    });
    
    updateGameStatus("Sélectionnez une carte à jouer ou défausser");
}

// Function to play a card to an expedition
function playCard(cardId, color) {
    if (!gameState.isConnected || !gameState.isPlayerTurn || gameState.currentPhase !== 'play') {
        return;
    }
    
    // Send the move to the server
    gameState.socket.send(JSON.stringify({
        event: "gameAction",
        data: {
            gameId: gameState.gameId,
            action: "play_card",
            cardId: cardId,
            color: color,
            destination: "expedition"
        }
    }));
    
    // Reset selection
    cancelCardSelection();
}

// Function to discard a card
function discardCard(cardId) {
    if (!gameState.isConnected || !gameState.isPlayerTurn || gameState.currentPhase !== 'play') {
        return;
    }
    
    // Send the move to the server
    gameState.socket.send(JSON.stringify({
        event: "gameAction",
        data: {
            gameId: gameState.gameId,
            action: "discard_card",
            cardId: cardId
        }
    }));
    
    // Reset selection
    cancelCardSelection();
}

// Function to draw a card from the deck or discard pile
function drawCard(source, color) {
    if (!gameState.isConnected || !gameState.isPlayerTurn || gameState.currentPhase !== 'draw') {
        return;
    }
    
    // Send the move to the server
    gameState.socket.send(JSON.stringify({
        event: "gameAction",
        data: {
            gameId: gameState.gameId,
            action: "draw_card",
            source: source,
            color: color
        }
    }));
}

// Function to surrender the game
function surrenderGame() {
    if (!gameState.isConnected) {
        return;
    }
    
    // Send surrender action to the server
    gameState.socket.send(JSON.stringify({
        event: "gameAction",
        data: {
            gameId: gameState.gameId,
            action: "surrender"
        }
    }));
    
    // Close the surrender modal
    elements.surrenderModal.classList.remove('visible');
    
    updateGameStatus("Vous avez abandonné la partie.");
}

// Function to send a chat message
function sendChatMessage() {
    if (!gameState.isConnected) {
        return;
    }
    
    const chatInput = elements.chatInput;
    const message = chatInput.value.trim();
    
    if (message) {
        // Send the chat message
        gameState.socket.send(JSON.stringify({
            event: "chatMessage",
            data: {
                gameId: gameState.gameId,
                message: message
            }
        }));
        
        // Clear the input field
        chatInput.value = '';
    }
}

// Handle chat messages from other players
function handleChatMessage(data) {
    if (!data || !data.username || !data.message) {
        return;
    }
    
    // Add the message to the chat area
    const chatMessages = elements.chatMessages;
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message other';
    messageElement.innerHTML = `<div class="chat-sender">${data.username}</div><div class="chat-text">${data.message}</div>`;
    chatMessages.appendChild(messageElement);
    
    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle system messages
function handleSystemMessage(data) {
    if (!data || !data.message) {
        return;
    }
    
    // Add the message to the chat area
    const chatMessages = elements.chatMessages;
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message system';
    messageElement.innerHTML = `<div class="chat-text">${data.message}</div>`;
    chatMessages.appendChild(messageElement);
    
    // Scroll to the bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update game status message
function updateGameStatus(message) {
    if (elements.gameStatus) {
        elements.gameStatus.textContent = message;
    }
}

// Create a card element
function createCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.color} ${card.type}`;
    cardElement.dataset.id = card.id;
    cardElement.dataset.color = card.color;
    cardElement.dataset.type = card.type;
    cardElement.dataset.value = card.value;
    
    // Set the background image properly
    if (card.type === 'wager') {
        cardElement.style.backgroundImage = `url('/game/assets/cards/${card.color}_wager_${card.value || 0}.png')`;
    } else {
        cardElement.style.backgroundImage = `url('/game/assets/cards/${card.color}_${card.value}.png')`;
    }
    
    return cardElement;
}

// Handle card click in the player's hand
function handleCardClick(card, cardElement) {
    if (!gameState.isPlayerTurn || gameState.currentPhase !== 'play') {
        return;
    }
    
    // Clear any previous selection first
    cancelCardSelection();
    
    // Select this card
    gameState.selectedCard = card;
    
    // Add selected class AND the card's color class
    cardElement.classList.add('selected');
    cardElement.classList.add(card.color); // This ensures the color-specific highlight
    
    // Update UI to show potential targets
    highlightValidTargets(card.color);
    
    // Update game status
    updateGameStatus(`Carte sélectionnée. Choisissez l'expédition ou la défausse ${card.color}.`);
}

function highlightValidTargets(color) {
    // Get the selected card
    const selectedCard = gameState.selectedCard;
    if (!selectedCard) return;
    
    // Get the player's expedition for this color
    const playerExpedition = gameState.gameData[gameState.playerSide].expeditions[color] || [];
    
    // Check if the card can be played to the expedition
    let canPlayToExpedition = true;
    
    // If the expedition has cards, check placement rules
    if (playerExpedition.length > 0) {
        // If selected card is a wager but expedition already has non-wager cards, can't play it
        if (selectedCard.type === 'wager') {
            const hasNonWagerCards = playerExpedition.some(card => card.type !== 'wager');
            if (hasNonWagerCards) {
                canPlayToExpedition = false;
            }
        } 
        // If selected card is expedition (numbered) card, check if value is higher than highest card
        else if (selectedCard.type === 'expedition') {
            // Get highest expedition card (excluding wagers)
            const expeditionCards = playerExpedition.filter(card => card.type === 'expedition');
            if (expeditionCards.length > 0) {
                const highestCard = expeditionCards.reduce((highest, card) => 
                    (card.value > highest.value) ? card : highest, expeditionCards[0]);
                
                // If selected card value is lower, can't play it
                if (selectedCard.value <= highestCard.value) {
                    canPlayToExpedition = false;
                }
            }
        }
    }

    // Highlight expedition slot only if placement is valid
    if (canPlayToExpedition) {
        const expeditionSlot = document.querySelector(`#player-area .expedition-slot[data-color="${color}"]`);
        if (expeditionSlot) {
            expeditionSlot.classList.add('valid-target');
            
            expeditionSlot.addEventListener('click', () => {
                if (gameState.selectedCard) {
                    playCard(gameState.selectedCard.id, color);
                }
            });
        }
    }
    
    // Always highlight discard pile (discarding is always valid)
    const discardPile = document.querySelector(`.discard-pile[data-color="${color}"]`);
    if (discardPile) {
        discardPile.classList.add('valid-target');
        
        discardPile.addEventListener('click', () => {
            if (gameState.selectedCard) {
                discardCard(gameState.selectedCard.id);
            }
        });
    }
}

// Handle expedition click
function handleExpeditionClick(color) {
    if (!gameState.selectedCard || gameState.currentPhase !== 'play') {
        return;
    }
    
    const cardElement = document.querySelector(`.card[data-id="${gameState.selectedCard.id}"]`);
    if (!cardElement) return;
    
    const cardColor = cardElement.dataset.color;
    
    // Check if the card can be played to this expedition
    if (cardColor !== color) {
        updateGameStatus("La couleur de la carte doit correspondre à l'expédition");
        return;
    }
    
    // Play the card
    playCard(gameState.selectedCard.id, color);
}

// Handle discard pile click during draw phase
function handleDiscardPileClick(color) {
    if (gameState.currentPhase !== 'draw') {
        return;
    }
    
    // Draw a card from this discard pile
    drawCard('discard_pile', color);
}

// Handle deck click
function handleDeckClick() {
    if (gameState.currentPhase !== 'draw') {
        return;
    }
    
    // Draw a card from the deck
    drawCard('deck');
}

// Show game end screen
function showGameEnd() {
    // Fill in the game end modal with results
    const playerScore = gameState.gameData.scores[gameState.playerSide].total;
    const opponentScore = gameState.gameData.scores[gameState.opponentSide].total;
    const isWinner = gameState.gameData.winner === Number(gameState.userId);
    
    elements.gameResult.textContent = isWinner ? "Victoire !" : "Défaite";
    elements.winnerText.textContent = isWinner ? "Vous avez gagné la partie !" : "Votre adversaire a gagné la partie.";
    
    elements.playerFinalName.textContent = gameState.username;
    elements.opponentFinalName.textContent = elements.opponentName.textContent;
    
    elements.playerFinalScore.textContent = playerScore;
    elements.opponentFinalScore.textContent = opponentScore;
    
    // Show the modal
    elements.gameEndModal.classList.add('visible');
}

// Show error message
function showError(message) {
    // Create and show an error notification
    const errorElement = document.getElementById('error-message');
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        // Hide after 5 seconds
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }
}

// Update turn indicators
function updateTurnIndicators() {
    if (gameState.isPlayerTurn) {
        elements.playerTurn.textContent = "Votre tour";
        elements.playerTurn.classList.add('active');
        elements.opponentTurn.textContent = "En attente";
        elements.opponentTurn.classList.remove('active');
    } else {
        elements.playerTurn.textContent = "En attente";
        elements.playerTurn.classList.remove('active');
        elements.opponentTurn.textContent = "Tour adverse";
        elements.opponentTurn.classList.add('active');
    }
}

// Update game status message based on current game state
function updateGameStatusMessage() {
    if (gameState.gameData.status === 'finished') {
        updateGameStatus(gameState.gameData.winner === Number(gameState.userId) ? 
            "Partie terminée. Vous avez gagné !" : 
            "Partie terminée. Vous avez perdu.");
    } else if (gameState.isPlayerTurn) {
        updateGameStatus(gameState.currentPhase === 'play' ?
            "À vous de jouer. Jouez ou défaussez une carte." :
            "Piochez une carte du paquet ou d'une défausse.");
    } else {
        updateGameStatus("En attente de l'autre joueur...");
    }
}

// WebSocket event listeners
function setupWebSocketEventListeners() {
    const socket = gameState.socket;
    
    // Connexion établie
    socket.addEventListener('open', () => {
        console.log("WebSocket connexion établie");
        gameState.isConnected = true;
        updateGameStatus("Connecté au serveur de jeu");
        
        // S'abonner aux mises à jour de la partie
        subscribeToGame();
    });
    
    // Erreur de connexion
    socket.addEventListener('error', (error) => {
        console.error("Erreur WebSocket:", error);
        gameState.isConnected = false;
        updateGameStatus("Erreur de connexion au serveur");
    });
    
    // Fermeture de la connexion
    socket.addEventListener('close', (event) => {
        console.log(`WebSocket déconnecté: ${event.code} - ${event.reason}`);
        gameState.isConnected = false;
        updateGameStatus("Déconnecté du serveur");
        
        // Tentative de reconnexion après 5 secondes
        setTimeout(() => {
            if (!gameState.isConnected) {
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
            case "gameUpdate":
            case "gameUpdated":
                handleGameUpdate(data.data);
                break;
                
            case "gameSubscribed":
                console.log(`Abonné à la partie ${data.data.gameId}`);
                // Demander l'état actuel de la partie
                requestGameState();
                break;
                
            case "chatMessage":
                handleChatMessage(data.data);
                break;
                
            case "systemMessage":
                handleSystemMessage(data.data);
                break;
                
            default:
                console.log("Type de message non reconnu:", data.event);
        }
    } catch (error) {
        console.error("Erreur lors de l'analyse du message:", error);
    }
}

// S'abonner aux mises à jour de la partie
function subscribeToGame() {
    if (!gameState.isConnected || !gameState.gameId) {
        return;
    }
    
    gameState.socket.send(JSON.stringify({
        event: "subscribeGame",
        data: { gameId: gameState.gameId }
    }));
}

// Demander l'état actuel de la partie
function requestGameState() {
    if (!gameState.isConnected || !gameState.gameId) {
        return;
    }
    
    gameState.socket.send(JSON.stringify({
        event: "gameAction",
        data: { 
            gameId: gameState.gameId,
            action: "request_state"
        }
    }));
}

// Gestion des mises à jour de la partie
function handleGameUpdate(data) {
    if (!data.gameState) return;
    
    console.log('🔍 Raw game state received:', data.gameState);
    console.log('🔍 Player1 data:', data.gameState.player1);
    console.log('🔍 Player2 data:', data.gameState.player2);
    
    // Store the game state
    gameState.gameData = data.gameState;
    
    // Determine player side
    const playerSide = data.gameState.player1.id === Number(gameState.userId) ? 'player1' : 'player2';
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    gameState.playerSide = playerSide;
    gameState.opponentSide = opponentSide;
    
    console.log('🔍 Player side:', playerSide, 'Opponent side:', opponentSide);
    console.log('🔍 Player data:', gameState.gameData[playerSide]);
    console.log('🔍 Opponent data:', gameState.gameData[opponentSide]);
    
    // Update current phase and turn
    gameState.currentPhase = data.gameState.turnPhase;
    gameState.isPlayerTurn = data.gameState.currentPlayerId === Number(gameState.userId);
    
    // Update interface
    updateGameInterface();
    
    // Hide loading overlay
    elements.loadingOverlay.classList.add('hidden');

    // Vérifier si la partie est terminée
    if (gameState.gameData.status === 'finished') {
        showGameEnd();
    }
}

// Mettre à jour l'interface du jeu
function updateGameInterface() {

    document.body.classList.toggle('opponent-turn', !gameState.isPlayerTurn);
    document.body.classList.toggle('player-turn', gameState.isPlayerTurn);
    document.body.classList.toggle('play-phase', gameState.currentPhase === 'play');
    document.body.classList.toggle('draw-phase', gameState.currentPhase === 'draw');

    clearAllTargetHighlighting();

    // Mettre à jour les informations générales
    updateGameInfo();
    
    // Mettre à jour la main du joueur
    updatePlayerHand();
    
    // Mettre à jour les expéditions
    updateExpeditions();
    
    // Mettre à jour les défausses et le paquet
    updateDiscardAndDeck();
    
    // Mettre à jour les indicateurs de tour
    updateTurnIndicators();
    
    // Mise à jour du message de statut
    updateGameStatusMessage();

    // Setup expedition hover preview after updating the interface
    setupExpeditionHoverPreview();
}

function clearAllTargetHighlighting() {
    document.querySelectorAll('.valid-target').forEach(el => {
        el.classList.remove('valid-target');
    });
}

// Mettre à jour les informations générales du jeu
function updateGameInfo() {
    if (!gameState.gameData) return;
    
    // Récupérer les données des joueurs
    const playerData = gameState.gameData[gameState.playerSide];
    const opponentData = gameState.gameData[gameState.opponentSide];
    
    // Mettre à jour les noms et avatars
    elements.playerName.textContent = playerData.username || 'Vous';
    elements.opponentName.textContent = opponentData.username || 'Adversaire';
    updatePlayerAvatar('player', playerData.avatar_url);
    updatePlayerAvatar('opponent', opponentData.avatar_url);
    
    // Calculer les scores
    const currentRoundScores = gameState.gameData.scores;
    const currentRound = gameState.gameData.currentRound;
    
    // Score des manches précédentes (seulement les manches déjà finalisées)
    let playerPreviousRounds = 0;
    let opponentPreviousRounds = 0;
    
    // Additionner les scores des manches précédentes terminées
    for (let round = 1; round < currentRound; round++) {
        const roundKey = `round${round}`;
        playerPreviousRounds += currentRoundScores[gameState.playerSide][roundKey] || 0;
        opponentPreviousRounds += currentRoundScores[gameState.opponentSide][roundKey] || 0;
    }
    
    // Score de la manche actuelle (calculé en temps réel)
    const playerCurrentRoundScore = calculateTotalScore(playerData.expeditions);
    const opponentCurrentRoundScore = calculateTotalScore(opponentData.expeditions);
    
    // Score total affiché
    const playerTotalScore = playerPreviousRounds + playerCurrentRoundScore;
    const opponentTotalScore = opponentPreviousRounds + opponentCurrentRoundScore;
    
    // Formatage des scores avec signe pour la manche actuelle
    const playerCurrentFormatted = playerCurrentRoundScore > 0 ? `+${playerCurrentRoundScore}` : `${playerCurrentRoundScore}`;
    const opponentCurrentFormatted = opponentCurrentRoundScore > 0 ? `+${opponentCurrentRoundScore}` : `${opponentCurrentRoundScore}`;
    
    // Mettre à jour l'affichage des scores avec indication de la manche actuelle
    elements.playerScore.textContent = `Score: ${playerTotalScore} (${playerCurrentFormatted})`;
    elements.opponentScore.textContent = `Score: ${opponentTotalScore} (${opponentCurrentFormatted})`;
    
    // Mettre à jour la manche et le nombre de cartes
    elements.gameRound.textContent = `Manche: ${gameState.gameData.currentRound}/${gameState.gameData.totalRounds}`;
    elements.deckCount.textContent = `Cartes: ${gameState.gameData.cardsInDeck}`;
    
    // Mettre à jour l'indicateur de phase
    elements.phaseIndicator.textContent = `Phase: ${gameState.currentPhase === 'play' ? 'Jouer' : 'Piocher'}`;
}

function updatePlayerAvatar(type, avatarUrl) {
    const avatarElement = document.getElementById(`${type}-avatar`);
    
    if (!avatarElement) {
        console.log(`❌ Avatar element not found for ${type}`);
        return;
    }
    
    console.log(`🔍 Updating ${type} avatar with:`, avatarUrl);
    
    // Vider d'abord tout contenu
    avatarElement.textContent = '';
    
    // Si avatarUrl est null, undefined ou vide, utiliser l'avatar par défaut
    const imageUrl = (avatarUrl && avatarUrl !== 'null') ? avatarUrl : '/assets/default-avatar.png';
    
    console.log(`🔍 Using image URL for ${type}:`, imageUrl);
    
    // Afficher l'image
    avatarElement.style.backgroundImage = `url(${imageUrl})`;
    avatarElement.style.backgroundSize = 'cover';
    avatarElement.style.backgroundPosition = 'center';
    avatarElement.style.backgroundRepeat = 'no-repeat';
    
    // Test si l'image charge
    const img = new Image();
    img.onload = () => console.log(`✅ Avatar loaded successfully for ${type}`);
    img.onerror = () => {
        console.log(`❌ Failed to load avatar for ${type}`);
        if (imageUrl !== '/assets/default-avatar.png') {
            avatarElement.style.backgroundImage = `url(/assets/default-avatar.png)`;
        }
    };
    img.src = imageUrl;
}


// Mettre à jour la main du joueur
function updatePlayerHand() {
    // Vider la main actuelle
    elements.playerHand.innerHTML = '';
    gameState.cardElements.clear();
    
    // Récupérer les cartes de la main
    const hand = gameState.gameData[gameState.playerSide].hand || [];
    
    if (hand.length === 0) {
        return;
    }
    
    // Calculs pour l'éventail basés sur le nombre de cartes
    const totalCards = hand.length;
    
    // Paramètres de l'arc
    const arcRadius = 400;
    const arcAngle = Math.min(60, totalCards * 5);
    const cardWidth = 70;
    const centerYOffset = -50;
    
    // NOUVEAU: Calculer les z-index de gauche à droite
    // La carte la plus à gauche a le z-index le plus bas, la plus à droite le plus élevé
    const baseZIndex = 10;
    
    hand.forEach((card, index) => {
        const cardElement = createCardElement(card);
        
        // Calculer l'angle de cette carte dans l'arc
        const totalAngleInRadians = (arcAngle * Math.PI) / 180;
        const cardAngleInRadians = totalAngleInRadians * (index / (totalCards - 1) - 0.5);
        const cardAngleInDegrees = (cardAngleInRadians * 180) / Math.PI;
        
        const x = Math.sin(cardAngleInRadians) * arcRadius;
        const y = Math.cos(cardAngleInRadians) * arcRadius - arcRadius + centerYOffset;
        
        // MODIFICATION: Calcul du z-index basé sur la position horizontale
        // La carte la plus à gauche (x négatif élevé) a le z-index le plus bas
        // La carte la plus à droite (x positif élevé) a le z-index le plus élevé
        const zIndex = baseZIndex + index; // Plus simple et plus cohérent
        
        // Appliquer transformation
        cardElement.style.position = 'absolute';
        cardElement.style.left = `calc(50% + ${x}px - ${cardWidth/2}px)`;
        cardElement.style.bottom = `${y}px`;
        cardElement.style.transform = `rotate(${cardAngleInDegrees}deg)`;
        cardElement.style.transformOrigin = 'bottom center';
        cardElement.style.zIndex = zIndex;
        
        // Stocker le z-index original dans un attribut data pour pouvoir y revenir
        cardElement.dataset.originalZIndex = zIndex;
        
        // Effet de survol
        cardElement.addEventListener('mouseenter', () => {
            const hoverDistance = 20;
            const hoverX = Math.sin(cardAngleInRadians) * hoverDistance;
            const hoverY = Math.cos(cardAngleInRadians) * hoverDistance;
            
            const upwardMovement = 40;
            
            cardElement.style.transform = `rotate(${cardAngleInDegrees}deg) translate(${hoverX}px, ${hoverY - upwardMovement}px) scale(1.1)`;
            cardElement.style.zIndex = 100 + index; // Ajouter l'index pour préserver l'ordre relatif
        });
        
        // CORRECTION: S'assurer que le z-index revient à sa valeur d'origine
        cardElement.addEventListener('mouseleave', () => {
            cardElement.style.transform = `rotate(${cardAngleInDegrees}deg)`;
            cardElement.style.zIndex = cardElement.dataset.originalZIndex;
        });
        
        // Ajouter la classe selectable si nécessaire
        if (gameState.isPlayerTurn && gameState.currentPhase === 'play') {
            cardElement.classList.add('selectable');
        }
        
        // Ajouter un gestionnaire d'événements pour la sélection
        cardElement.addEventListener('click', () => {
            handleCardClick(card, cardElement);
        });
        
        // Stocker l'élément pour référence future
        gameState.cardElements.set(card.id, cardElement);
        
        elements.playerHand.appendChild(cardElement);
    });
}

// Calculer le score d'une expédition
function calculateExpeditionScore(cards) {
    if (cards.length === 0) return 0;
    
    // Compter les cartes wager
    const wagerCount = cards.filter(card => card.type === 'wager').length;
    const multiplier = wagerCount > 0 ? wagerCount + 1 : 1;
    
    // Sommer les valeurs des cartes expédition
    const expeditionCards = cards.filter(card => card.type === 'expedition');
    const totalValue = expeditionCards.reduce((sum, card) => sum + (card.value || 0), 0);
    
    // Calculer le score de base (valeur totale - 20 points de démarrage)
    let baseScore = totalValue - 20;
    
    // Appliquer le multiplicateur
    baseScore *= multiplier;
    
    // Bonus pour 8+ cartes (ajouté après multiplication)
    if (cards.length >= 8) {
        baseScore += 20;
    }
    
    return baseScore;
}

// Calculer le score total d'un joueur
function calculateTotalScore(expeditions) {
    let totalScore = 0;
    Object.values(expeditions).forEach(expedition => {
        totalScore += calculateExpeditionScore(expedition);
    });
    return totalScore;
}

// Mettre à jour les expéditions
function updateExpeditions() {
    // Get player and opponent expeditions
    const playerExpeditions = gameState.gameData[gameState.playerSide].expeditions;
    const opponentExpeditions = gameState.gameData[gameState.opponentSide].expeditions;
    
    // Check if purple expedition is enabled
    const isPurpleEnabled = gameState.gameData.usePurpleExpedition;
    
    // Get all existing expedition slots
    const playerSlots = elements.playerArea.querySelectorAll('.expedition-slot');
    const opponentSlots = elements.opponentArea.querySelectorAll('.expedition-slot');
    
    // Clear existing content from slots
    playerSlots.forEach(slot => {
        slot.innerHTML = '';
        // Remove any previous event listeners by cloning the node
        const newSlot = slot.cloneNode(false);
        slot.parentNode.replaceChild(newSlot, slot);
    });
    
    opponentSlots.forEach(slot => {
        slot.innerHTML = '';
        // Remove any previous event listeners
        const newSlot = slot.cloneNode(false);
        slot.parentNode.replaceChild(newSlot, slot);
    });
    
    // If purple is enabled, make sure the UI includes it
    if (isPurpleEnabled) {
        // Check if purple slots already exist
        if (!elements.playerArea.querySelector('.expedition-slot.purple')) {
            const playerPurpleSlot = document.createElement('div');
            playerPurpleSlot.className = 'expedition-slot purple';
            playerPurpleSlot.dataset.color = 'purple';
            elements.playerArea.appendChild(playerPurpleSlot);
            
            const opponentPurpleSlot = document.createElement('div');
            opponentPurpleSlot.className = 'expedition-slot purple';
            opponentPurpleSlot.dataset.color = 'purple';
            elements.opponentArea.appendChild(opponentPurpleSlot);
        }
    }
    
    // Get fresh references to slots after potential DOM changes
    const freshPlayerSlots = elements.playerArea.querySelectorAll('.expedition-slot');
    const freshOpponentSlots = elements.opponentArea.querySelectorAll('.expedition-slot');
    
    // Helper function to fill expedition slots
    function fillExpeditionSlots(expeditions, slots, isOpponent = false) {
        slots.forEach(slot => {
            const color = slot.dataset.color;
            const cards = expeditions[color] || [];
            
            // Create a stack container
            const stackElement = document.createElement('div');
            stackElement.className = 'expedition-stack';
            
            if (isOpponent) {
                stackElement.classList.add('opponent-stack');
            }
            
            slot.appendChild(stackElement);
            
            // Sort cards by value (wager cards first, then ascending value)
            const sortedCards = [...cards].sort((a, b) => {
                // Wager cards always come first
                if (a.type === 'wager' && b.type !== 'wager') return -1;
                if (a.type !== 'wager' && b.type === 'wager') return 1;
                
                // For expedition cards, sort by value
                if (a.type === 'expedition' && b.type === 'expedition') {
                    return a.value - b.value;
                }
                
                return 0;
            });
            
            // Add cards to the stack (in sorted order)
            sortedCards.forEach(card => {
                const cardElement = createCardElement(card);
                if (isOpponent) {
                    cardElement.classList.add('opponent-card');
                }
                stackElement.appendChild(cardElement);
            });
            
            // Create summary info if there are cards
            if (cards.length > 0) {
                // Calculate total value and wager multiplier
                const wagerCount = cards.filter(c => c.type === 'wager').length;
                const multiplier = wagerCount > 0 ? wagerCount + 1 : 1;
                const expValues = cards.filter(c => c.type !== 'wager')
                    .map(c => typeof c.value === 'number' ? c.value : 0);
                const valueSum = expValues.reduce((sum, val) => sum + val, 0);
                
                // Calculate actual score with the 20-point cost subtracted
                const expeditionScore = (valueSum - 20) * multiplier;
                const finalScore = expeditionScore + (cards.length >= 8 ? 20 : 0);
                const scoreDisplay = finalScore >= 0 ? `+${finalScore}` : `${finalScore}`;
                const scoreClass = finalScore >= 0 ? 'score-positive' : 'score-negative';
                
                // Add summary element if useful
                if (cards.length > 1) {
                    const summaryElement = document.createElement('div');
                    summaryElement.className = 'expedition-summary';
                    summaryElement.innerHTML = `${cards.length} cards • <span class="${scoreClass}">${scoreDisplay}</span> pts • x${multiplier}`;
                    stackElement.appendChild(summaryElement);
                }
            }
        });
    }
    
    // Fill player and opponent expedition slots
    fillExpeditionSlots(playerExpeditions, freshPlayerSlots, false);
    fillExpeditionSlots(opponentExpeditions, freshOpponentSlots, true);
    
    // Add highlighting and event handlers for selected card
    if (gameState.isPlayerTurn && gameState.currentPhase === 'play' && gameState.selectedCard) {
        freshPlayerSlots.forEach(slot => {
            const color = slot.dataset.color;
            
            // If the selected card color matches this expedition slot, highlight it as a valid target
            if (gameState.selectedCard.color === color) {
                slot.classList.add('valid-target', color);
                
                // Add click handler for direct play
                slot.addEventListener('click', () => {
                    playCard(gameState.selectedCard.id, color);
                });
            }
        });
    }
}

function updateDiscardAndDeck() {
    // Update deck pile counter
    elements.deckPile.dataset.count = gameState.gameData.cardsInDeck;
    
    // Check if purple expedition is enabled
    const isPurpleEnabled = gameState.gameData.usePurpleExpedition;
    
    // Make sure we have a purple discard pile if needed
    if (isPurpleEnabled && !document.querySelector('.discard-pile.purple')) {
        const purpleDiscard = document.createElement('div');
        purpleDiscard.className = 'discard-pile purple';
        purpleDiscard.dataset.color = 'purple';
        elements.discardPiles.appendChild(purpleDiscard);
    }
    
    // Get all discard piles (including potential purple one)
    const discardPiles = document.querySelectorAll('.discard-pile');
    
    // *** AJOUTEZ CES LIGNES POUR NETTOYER LES CLASSES ***
    // First, clear all recently-discarded classes from all piles
    discardPiles.forEach(pile => {
        pile.classList.remove('recently-discarded');
    });
    
    // Process each discard pile
    discardPiles.forEach(pile => {
        // Clone to remove previous event listeners
        const newPile = pile.cloneNode(false);
        pile.parentNode.replaceChild(newPile, pile);
        
        // *** AJOUTEZ CETTE LIGNE AUSSI ***
        // Make sure recently-discarded is removed from the new element too
        newPile.classList.remove('recently-discarded');
        
        const color = newPile.dataset.color;
        const cards = gameState.gameData.discardPiles[color] || [];
        
        // IMPORTANT: Make sure position is set to relative
        newPile.style.position = 'relative';
        
        // Display all cards in the pile with proper z-index
        cards.forEach((card, index) => {
            const cardElement = createCardElement(card);
            
            // Position cards to create stacking/fan effect
            cardElement.style.position = 'absolute';
            cardElement.style.top = '0';
            cardElement.style.left = '0';
            cardElement.style.zIndex = index + 1;
            
            newPile.appendChild(cardElement);
        });
        
        // Add a counter if there are more cards than shown
        if (cards.length > 5) {
            const counter = document.createElement('div');
            counter.className = 'pile-counter';
            counter.textContent = cards.length;
            counter.style.position = 'absolute';
            counter.style.top = '-10px';
            counter.style.right = '-10px';
            counter.style.zIndex = '10'; // Higher than any card
            
            newPile.appendChild(counter);
        }
        
        // Add highlighting and event handlers based on game phase
        if (gameState.isPlayerTurn) {
            if (gameState.currentPhase === 'play' && gameState.selectedCard) {
                // During play phase, highlight matching discard pile for selected card
                if (gameState.selectedCard.color === color) {
                    newPile.classList.add('valid-target', color);
                    
                    // Add click handler for direct discard
                    newPile.addEventListener('click', () => {
                        discardCard(gameState.selectedCard.id);
                    });
                }
            } else if (gameState.currentPhase === 'draw' && cards.length > 0) {
                // During draw phase, check if this is the pile just discarded to
                const isLastDiscardedPile = gameState.gameData.lastDiscardedPile === color;
                
                console.log(`Color ${color}: lastDiscardedPile=${gameState.gameData.lastDiscardedPile}, isLastDiscardedPile=${isLastDiscardedPile}`);
                
                if (!isLastDiscardedPile) {
                    // Highlight non-empty discard piles (except the one just discarded to)
                    newPile.classList.add('valid-target', color);
                    
                    // Add click handler for drawing from discard
                    newPile.addEventListener('click', () => {
                        drawCard('discard_pile', color);
                    });
                } else {
                    // Add a visual indication that this pile is not available
                    newPile.classList.add('recently-discarded');
                    
                    // Add click handler to show error message
                    newPile.addEventListener('click', () => {
                        updateGameStatus("Vous ne pouvez pas reprendre la carte que vous venez de défausser.");
                    });
                }
            }
        }
    });
    
    // Handle deck pile interaction
    // Remove previous event listeners by cloning
    const newDeckPile = elements.deckPile.cloneNode(true);
    elements.deckPile.parentNode.replaceChild(newDeckPile, elements.deckPile);
    elements.deckPile = newDeckPile;
    
    // Add highlighting and event handler for draw phase
    if (gameState.isPlayerTurn && gameState.currentPhase === 'draw') {
        elements.deckPile.classList.add('valid-target', 'white'); // Use white for deck highlighting
        
        // Add click handler
        elements.deckPile.addEventListener('click', () => {
            drawCard('deck');
        });
    } else {
        elements.deckPile.classList.remove('valid-target', 'white');
    }
}

// Setup expedition hover preview
function setupExpeditionHoverPreview() {
    const tooltip = document.getElementById('expedition-tooltip');
    if (!tooltip) return;
    
    // For expedition SLOTS (these contain the stacks)
    document.querySelectorAll('.expedition-slot').forEach(slot => {
        // Remove any existing listeners by cloning
        const newSlot = slot.cloneNode(true);
        slot.parentNode.replaceChild(newSlot, slot);
        
        // Create mouseover handler for the entire slot
        newSlot.addEventListener('mouseenter', (e) => {
            showExpeditionTooltip(newSlot, tooltip, e);
        });
        
        newSlot.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
        });
        
        // Track mouse movement to update tooltip position
        newSlot.addEventListener('mousemove', (e) => {
            if (tooltip.style.display === 'flex') {
                tooltip.style.left = `${e.clientX + 15}px`;
                tooltip.style.top = `${e.clientY - 15}px`;
            }
        });
    });
}

// Helper function to show tooltip for an expedition
function showExpeditionTooltip(slot, tooltip, event) {
    const stackElement = slot.querySelector('.expedition-stack');
    if (!stackElement || stackElement.children.length === 0) {
        tooltip.style.display = 'none';
        return;
    }
    
    // Get all cards in the expedition (exclude summary elements)
    const cardElements = Array.from(stackElement.querySelectorAll('.card'));
    if (cardElements.length === 0) {
        tooltip.style.display = 'none';
        return;
    }
    
    // Convertir les éléments DOM en objets carte pour le calcul
    const cards = cardElements.map(cardEl => ({
        type: cardEl.dataset.type,
        value: cardEl.dataset.type === 'expedition' ? parseInt(cardEl.dataset.value) : null
    }));
    
    // Calculer le score en temps réel
    const score = calculateExpeditionScore(cards);
    const scoreDisplay = score >= 0 ? `+${score}` : `${score}`;
    const scoreClass = score >= 0 ? 'score-positive' : 'score-negative';
    
    // Calcul des détails pour le tooltip
    const wagerCount = cards.filter(c => c.type === 'wager').length;
    const multiplier = wagerCount > 0 ? wagerCount + 1 : 1;
    
    // Gestion du pluriel
    const cardText = cards.length === 1 ? 'carte' : 'cartes';
    
    // Update tooltip content
    tooltip.innerHTML = `
        <div>${cards.length} ${cardText}</div>
        <div class="${scoreClass}">${scoreDisplay} pts</div>
        <div>×${multiplier}</div>
    `;
    
    // Position and show tooltip
    tooltip.style.left = `${event.clientX + 15}px`;
    tooltip.style.top = `${event.clientY - 15}px`;
    tooltip.style.display = 'flex';
}

// Export des fonctions pour l'objet global gameController
window.gameController = {
    cancelCardSelection,
    playCard,
    discardCard,
    drawCard,
    surrenderGame,
    sendChatMessage
};
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
    cardElements: new Map() // Pour stocker les références aux éléments DOM des cartes
};

// At the beginning of your game.js file
document.addEventListener('DOMContentLoaded', () => {
    // Get gameId from URL
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    
    if (!gameId) {
      console.error("No game ID found in URL");
      // Show error message to user
      document.getElementById('game-status').textContent = "Error: No game ID found";
      return;
    }
    
    console.log("Loading game with ID:", gameId);
    
    // Store gameId in hidden input for later use
    document.getElementById('game-id').value = gameId;
    
  });


// Éléments DOM
const elements = {
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
    
    // Boutons d'action
    actionButtons: document.getElementById('action-buttons'),
    playBtn: document.getElementById('play-btn'),
    discardBtn: document.getElementById('discard-btn'),
    cancelActionBtn: document.getElementById('cancel-action-btn'),
    
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

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
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
    
    // Configurer les écouteurs d'événements
    setupEventListeners();
    
    // Établir la connexion WebSocket
    connectWebSocket();
});

// Connexion au WebSocket
function connectWebSocket() {
    const token = localStorage.getItem('authToken');
    if (!token) return;

    // Fermer la connexion existante si elle existe
    if (gameState.socket && gameState.socket.readyState === WebSocket.OPEN) {
        gameState.socket.close();
    }

    // Créer une nouvelle connexion WebSocket avec le token d'authentification
    const wsUrl = `${WS_URL}?token=${encodeURIComponent(token)}`;
    console.log(`Connexion au WebSocket: ${wsUrl.split('?')[0]}...`);
    
    gameState.socket = new WebSocket(wsUrl);
    
    // Gestion des événements WebSocket
    setupWebSocketEventListeners();
}

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Boutons d'action
    elements.playBtn.addEventListener('click', () => {
        if (gameState.selectedCard) {
            const color = gameState.selectedCard.color;
            playCard(gameState.selectedCard.id, color);
        } else {
            updateGameStatus("Vous devez d'abord sélectionner une carte");
        }
    });
    
    elements.discardBtn.addEventListener('click', () => {
        if (gameState.selectedCard) {
            discardCard(gameState.selectedCard.id);
        } else {
            updateGameStatus("Vous devez d'abord sélectionner une carte");
        }
    });
    
    elements.cancelActionBtn.addEventListener('click', cancelCardSelection);
    
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
        // Rediriger vers la page de matchmaking
        window.location.href = '/matchmaking.html';
    });
    
    elements.backBtn.addEventListener('click', () => {
        // Rediriger vers la page d'accueil
        window.location.href = '/index.html';
    });
    
    // Chat
    elements.chatBtn.addEventListener('click', () => {
        elements.chatArea.classList.toggle('open');
    });
    
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


// Function to cancel a card selection
function cancelCardSelection() {
    gameState.selectedCard = null;
    gameState.selectedPile = null;
    
    // Remove highlights from all cards
    document.querySelectorAll('.card.selected, .drop-target').forEach(el => {
        el.classList.remove('selected', 'drop-target');
    });
    
    updateGameStatus("Sélection annulée");
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
        
        // Add the message to the chat area
        const chatMessages = elements.chatMessages;
        const messageElement = document.createElement('div');
        messageElement.className = 'chat-message self';
        messageElement.innerHTML = `<div class="chat-sender">Vous</div><div class="chat-text">${message}</div>`;
        chatMessages.appendChild(messageElement);
        
        // Clear the input field
        chatInput.value = '';
        
        // Scroll to the bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
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
    
    const cardInner = document.createElement('div');
    cardInner.className = 'card-inner';
    
    const valueElement = document.createElement('div');
    valueElement.className = 'card-value';
    valueElement.textContent = card.type === 'wager' ? 'W' : card.value;
    
    cardInner.appendChild(valueElement);
    cardElement.appendChild(cardInner);
    
    return cardElement;
}

// Handle card click in the player's hand
function handleCardClick(card, cardElement) {
    if (!gameState.isPlayerTurn || gameState.currentPhase !== 'play') {
        return;
    }
    
    // Toggle selection
    if (gameState.selectedCard === card.id) {
        cancelCardSelection();
    } else {
        // Deselect any previously selected card
        document.querySelectorAll('.card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Select this card
        gameState.selectedCard = card.id;
        cardElement.classList.add('selected');
        
        // Show action buttons
        elements.actionButtons.classList.add('visible');
    }
}

// Handle expedition click
function handleExpeditionClick(color) {
    if (!gameState.selectedCard || gameState.currentPhase !== 'play') {
        return;
    }
    
    const cardElement = gameState.cardElements.get(gameState.selectedCard);
    if (!cardElement) return;
    
    const cardColor = cardElement.dataset.color;
    
    // Check if the card can be played to this expedition
    if (cardColor !== color) {
        updateGameStatus("La couleur de la carte doit correspondre à l'expédition");
        return;
    }
    
    // Play the card
    playCard(gameState.selectedCard, color);
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
    const isWinner = gameState.gameData.winner === gameState.userId;
    
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
    const errorElement = document.createElement('div');
    errorElement.className = 'error-message';
    errorElement.textContent = message;
    
    document.body.appendChild(errorElement);
    
    // Remove after a few seconds
    setTimeout(() => {
        errorElement.remove();
    }, 5000);
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
        updateGameStatus(gameState.gameData.winner === gameState.userId ? 
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

// Exporter les fonctions nécessaires
window.gameController = {
    cancelCardSelection,
    playCard,
    discardCard,
    drawCard,
    surrenderGame,
    sendChatMessage
}; WebSocket
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
    
    // Masquer l'écran de chargement
    elements.loadingOverlay.classList.add('hidden');
    
    // Mettre à jour l'état du jeu
    gameState.gameData = data.gameState;
    
    // Déterminer quel joueur est le joueur actuel
    const playerSide = gameState.gameData.player1.id === gameState.userId ? 'player1' : 'player2';
    const opponentSide = playerSide === 'player1' ? 'player2' : 'player1';
    gameState.playerSide = playerSide;
    gameState.opponentSide = opponentSide;
    
    // Mettre à jour la phase actuelle et le tour
    gameState.currentPhase = gameState.gameData.turnPhase;
    gameState.isPlayerTurn = gameState.gameData.currentPlayerId === gameState.userId;
    
    // Mettre à jour l'interface
    updateGameInterface();
    
    // Vérifier si la partie est terminée
    if (gameState.gameData.status === 'finished') {
        showGameEnd();
    }
}

// Mettre à jour l'interface du jeu
function updateGameInterface() {
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
}

// Mettre à jour les informations générales du jeu
function updateGameInfo() {
    // Mettre à jour les noms des joueurs (si disponibles)
    if (gameState.gameData.player1.name) {
        elements.playerName.textContent = gameState.playerSide === 'player1' 
            ? gameState.gameData.player1.name 
            : gameState.gameData.player2.name;
            
        elements.opponentName.textContent = gameState.playerSide === 'player1' 
            ? gameState.gameData.player2.name 
            : gameState.gameData.player1.name;
    }
    
    // Mettre à jour les scores
    elements.playerScore.textContent = `Score: ${gameState.gameData.scores[gameState.playerSide].total}`;
    elements.opponentScore.textContent = `Score: ${gameState.gameData.scores[gameState.opponentSide].total}`;
    
    // Mettre à jour la manche et le nombre de cartes
    elements.gameRound.textContent = `Manche: ${gameState.gameData.currentRound}/${gameState.gameData.totalRounds}`;
    elements.deckCount.textContent = `Cartes: ${gameState.gameData.cardsInDeck}`;
    
    // Mettre à jour l'indicateur de phase
    elements.phaseIndicator.textContent = `Phase: ${gameState.currentPhase === 'play' ? 'Jouer' : 'Piocher'}`;
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
    
    // Créer et ajouter chaque carte
    hand.forEach(card => {
        const cardElement = createCardElement(card);
        
        // Ajouter la classe selectable si c'est le tour du joueur
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

// Mettre à jour les expéditions
function updateExpeditions() {
    // Récupérer les références aux expéditions des joueurs
    const playerExpeditions = gameState.gameData[gameState.playerSide].expeditions;
    const opponentExpeditions = gameState.gameData[gameState.opponentSide].expeditions;
    
    // Effacer les expéditions actuelles
    const playerSlots = elements.playerArea.querySelectorAll('.expedition-slot');
    const opponentSlots = elements.opponentArea.querySelectorAll('.expedition-slot');
    
    playerSlots.forEach(slot => {
        slot.innerHTML = '';
    });
    
    opponentSlots.forEach(slot => {
        slot.innerHTML = '';
    });
    
    // Fonction d'aide pour remplir les expéditions
    function fillExpeditionSlots(expeditions, slots) {
        slots.forEach(slot => {
            const color = slot.dataset.color;
            const cards = expeditions[color] || [];
            
            cards.forEach((card, index) => {
                const cardElement = createCardElement(card);
                cardElement.style.position = 'absolute';
                cardElement.style.top = `${index * 20}px`;
                slot.appendChild(cardElement);
            });
        });
    }
    
    // Remplir les expéditions du joueur
    fillExpeditionSlots(playerExpeditions, playerSlots);
    
    // Remplir les expéditions de l'adversaire
    fillExpeditionSlots(opponentExpeditions, opponentSlots);
    
    // Ajouter des gestionnaires d'événements pour les expéditions du joueur
    if (gameState.isPlayerTurn && gameState.currentPhase === 'play' && gameState.selectedCard) {
        playerSlots.forEach(slot => {
            slot.addEventListener('click', () => {
                handleExpeditionClick(slot.dataset.color);
            });
            
            // Mettre en évidence les expéditions valides
            const color = slot.dataset.color;
            if (gameState.selectedCard && gameState.selectedCard.color === color) {
                slot.classList.add('valid-target');
            }
        });
    }
}

// Mettre à jour les défausses et le paquet
function updateDiscardAndDeck() {
    // Mettre à jour le nombre de cartes dans le paquet
    elements.deckPile.dataset.count = gameState.gameData.cardsInDeck;
    
    // Effacer les défausses actuelles
    const discardPiles = document.querySelectorAll('.discard-pile');
    
    discardPiles.forEach(pile => {
        pile.innerHTML = '';
        const color = pile.dataset.color;
        const cards = gameState.gameData.discardPiles[color] || [];
        
        // Afficher seulement la carte du dessus
        if (cards.length > 0) {
            const topCard = cards[cards.length - 1];
            const cardElement = createCardElement(topCard);
            pile.appendChild(cardElement);
            
            // Ajouter un compteur si plusieurs cartes
            if (cards.length > 1) {
                const counter = document.createElement('div');
                counter.className = 'pile-counter';
                counter.textContent = cards.length;
                pile.appendChild(counter);
            }
            
            // Ajouter un gestionnaire pour la phase de pioche
            if (gameState.isPlayerTurn && gameState.currentPhase === 'draw') {
                pile.classList.add('selectable');
                pile.addEventListener('click', () => handleDiscardPileClick(color));
            }
        }
    });
    
    // Ajouter un gestionnaire pour le paquet
    if (gameState.isPlayerTurn && gameState.currentPhase === 'draw') {
        elements.deckPile.classList.add('selectable');
        elements.deckPile.addEventListener('click', handleDeckClick);
    } else {
        elements.deckPile.classList.remove('selectable');
    }
}
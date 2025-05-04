// Configuration des URLs en fonction de l'environnement
const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // URL du backend local
  : "https://lostcitiesbackend.onrender.com"; // URL de production

// État du jeu
const gameState = {
    gameId: null,
    userId: null,
    username: null,
    gameData: null,
    selectedCard: null,
    selectedPile: null,
    currentPhase: null, // 'play' ou 'draw'
    isPlayerTurn: false,
    cardElements: new Map() // Pour stocker les références aux éléments DOM des cartes
};

// Initial DOMContentLoaded for gameId parsing
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
});

// Configuration des écouteurs d'événements
function setupEventListeners() {
    // Boutons d'action
    elements.playBtn.addEventListener('click', () => {
        if (gameState.selectedCard) {
            const color = gameState.selectedCard.color;
            // Let the main controller handle this
            if (window.gameController && window.gameController.playCard) {
                window.gameController.playCard(gameState.selectedCard.id, color);
            }
        } else {
            updateGameStatus("Vous devez d'abord sélectionner une carte");
        }
    });
    
    elements.discardBtn.addEventListener('click', () => {
        if (gameState.selectedCard) {
            // Let the main controller handle this
            if (window.gameController && window.gameController.discardCard) {
                window.gameController.discardCard(gameState.selectedCard.id);
            }
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
    
    elements.confirmSurrenderBtn.addEventListener('click', () => {
        // Let the main controller handle surrender
        if (window.gameController && window.gameController.surrender) {
            window.gameController.surrender();
        }
        elements.surrenderModal.classList.remove('visible');
    });
    
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
    
    // Chat
    elements.chatBtn.addEventListener('click', () => {
        elements.chatArea.classList.toggle('open');
    });
    
    elements.closeChatBtn.addEventListener('click', () => {
        elements.chatArea.classList.remove('open');
    });
    
    elements.sendChatBtn.addEventListener('click', handleSendChatMessage);
    
    elements.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSendChatMessage();
        }
    });
}

// Handle sending chat message
function handleSendChatMessage() {
    const message = elements.chatInput.value.trim();
    if (message && window.gameController && window.gameController.sendChatMessage) {
        window.gameController.sendChatMessage(message);
        elements.chatInput.value = '';
    }
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

// Update game status message
function updateGameStatus(message) {
    if (elements.gameStatus) {
        elements.gameStatus.textContent = message;
    }
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

// Create a card element
function createCardElement(card) {
    const cardElement = document.createElement('div');
    cardElement.className = `card ${card.color} ${card.type}`;
    cardElement.dataset.id = card.id;
    cardElement.dataset.color = card.color;
    cardElement.dataset.type = card.type;
    cardElement.dataset.value = card.value;
    
    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';
    
    const valueElement = document.createElement('div');
    valueElement.className = 'card-value';
    valueElement.textContent = card.type === 'wager' ? 'W' : card.value;
    
    cardContent.appendChild(valueElement);
    cardElement.appendChild(cardContent);
    
    return cardElement;
}

// UI helper functions that will be used by the new architecture
// Keeping these for now until they're fully moved to game_ui_controller.js

// Handle card click in the player's hand
function handleCardClick(card, cardElement) {
    if (!gameState.isPlayerTurn || gameState.currentPhase !== 'play') {
        return;
    }
    
    // Toggle selection
    if (gameState.selectedCard && gameState.selectedCard.id === card.id) {
        cancelCardSelection();
    } else {
        // Deselect any previously selected card
        document.querySelectorAll('.card.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        // Select this card
        gameState.selectedCard = card; // Store the entire card object
        cardElement.classList.add('selected');
        
        // Show action buttons
        elements.actionButtons.classList.add('visible');
    }
}

// These functions will eventually be moved to game_ui_controller.js
function updateGameInterface() {
    updateGameInfo();
    updatePlayerHand();
    updateExpeditions();
    updateDiscardAndDeck();
    updateTurnIndicators();
    updateGameStatusMessage();
}

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

// Export functions to be used by the main controller
window.gameUtils = {
    elements,
    gameState,
    updateGameInterface,
    updateGameStatus,
    showError,
    cancelCardSelection
};
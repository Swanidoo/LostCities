const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

let chatWebSocket = null;
let chatConnected = false;
const MAX_MESSAGE_LENGTH = 500; // Limite de 500 caractères

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const userSection = document.getElementById('user-section');
    const usernameSpan = document.getElementById('username');
    
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                usernameSpan.textContent = payload.username || payload.email;
                
                // Vérifier si l'utilisateur est admin
                if (payload.role === 'admin') {
                    const adminBtn = document.getElementById('admin-btn');
                    if (adminBtn) {
                        adminBtn.style.display = 'block';
                        adminBtn.addEventListener('click', () => {
                            window.location.href = '/admin/admin.html';
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Erreur lors de la lecture du token:", error);
        }
    
        // Initialiser le chat automatiquement pour les utilisateurs connectés
        initializeChat();
        
        // Afficher la section utilisateur
        loginSection.classList.add('hidden');
        userSection.classList.remove('hidden');
    }
    
    // Gestionnaires d'événements pour les boutons
    document.getElementById('login-btn').addEventListener('click', () => {
        window.location.href = '/login/login.html';
    });
    
    document.getElementById('register-btn').addEventListener('click', () => {
        window.location.href = '/login/register.html';
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.reload();
    });

    document.getElementById('play-btn').addEventListener('click', () => {
        window.location.href = '/matchmaking/matchmaking.html';
    });

    // UN SEUL gestionnaire pour le bouton toggle chat
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    if (chatToggleBtn) {
        chatToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const chatPanel = document.getElementById('chat-panel');
            const centerPanel = document.querySelector('.center-panel');
            
            if (chatPanel) {
                if (chatPanel.classList.contains('hidden')) {
                    chatPanel.classList.remove('hidden');
                    chatToggleBtn.textContent = 'Cacher le chat';
                    
                    // Initialiser le chat si ce n'est pas déjà fait
                    if (!chatWebSocket) {
                        initializeChat();
                    }
                } else {
                    chatPanel.classList.add('hidden');
                    chatToggleBtn.textContent = 'Afficher le chat';
                }
            }
        });
    }
    
    // Initialiser le leaderboard
    loadLeaderboard('classic', false);
    
    // Gestionnaires pour les onglets du leaderboard
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const isMode = button.dataset.mode !== undefined;
            const sameCategoryButtons = Array.from(tabButtons).filter(btn => 
                isMode ? btn.dataset.mode !== undefined : btn.dataset.extension !== undefined
            );
            
            sameCategoryButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            
            const mode = document.querySelector('.tab-button[data-mode].active').dataset.mode;
            const withExtension = document.querySelector('.tab-button[data-extension].active').dataset.extension === 'true';
            
            loadLeaderboard(mode, withExtension);
        });
    });

    console.log('Chat panel:', document.getElementById('chat-panel'));
    console.log('Chat toggle button:', document.getElementById('chat-toggle-btn'));
});

async function loadLeaderboard(mode, withExtension) {
    try {
        const url = `${API_URL}/api/leaderboard?game_mode=${mode}&with_extension=${withExtension}&limit=10`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        displayLeaderboard(data.data);
        
    } catch (error) {
        console.error('Erreur lors du chargement du leaderboard:', error);
        displayError();
    }
}

function displayLeaderboard(entries) {
    const tableBody = document.getElementById('leaderboard-data');
    tableBody.innerHTML = '';
    
    if (entries.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="3" style="text-align: center;">Aucune donnée disponible</td>';
        tableBody.appendChild(row);
        return;
    }
    
    entries.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${entry.player}</td>
            <td>${entry.score}</td>
        `;
        tableBody.appendChild(row);
    });
}

function displayError() {
    const tableBody = document.getElementById('leaderboard-data');
    tableBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #ff5252;">Erreur lors du chargement</td></tr>';
}

function initializeChat() {
    const token = localStorage.getItem('authToken');
    if (!token) return;
    
    // Connexion WebSocket pour le chat
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : 'lostcitiesbackend.onrender.com';
    const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(token)}`;

    const sendButton = document.querySelector('.chat-send');
    if (sendButton) {
        sendButton.addEventListener('click', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
    }
    
    chatWebSocket = new WebSocket(wsUrl);
    
    chatWebSocket.addEventListener('open', () => {
        console.log('Chat WebSocket connected');
        chatConnected = true;
        addSystemMessage('Connecté au chat');
    });
    
    chatWebSocket.addEventListener('message', (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.event === 'chatMessage' && data.data) {
                addChatMessage(data.data.username, data.data.message);
            } else if (data.event === 'systemMessage' && data.data) {
                addSystemMessage(data.data.message);
            }
        } catch (error) {
            console.error('Error parsing message:', error);
        }
    });
    
    chatWebSocket.addEventListener('close', () => {
        console.log('Chat WebSocket disconnected');
        chatConnected = false;
        addSystemMessage('Déconnecté du chat');
    });

    // Fonction pour auto-resize le textarea
    function autoResizeTextarea(textarea) {
        textarea.style.height = 'auto'; // Réinitialise la hauteur pour recalculer
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'; // Ajuste la hauteur avec une limite maximale
    }

    // Gérer l'envoi de messages
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');

    if (chatForm) {
        // Empêcher la soumission normale du formulaire
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
        
        // Gérer les touches Entrée et Shift+Entrée
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Entrée sans Shift = envoyer
                e.preventDefault();
                sendChatMessage();
            }
            // Shift+Entrée = comportement normal (nouvelle ligne)
        });
        
        // Auto-resize et compteur
        chatInput.addEventListener('input', (e) => {
            autoResizeTextarea(e.target);
            updateCharCounter(e.target);
        });
    }
}

// Fonction pour envoyer le message
function sendChatMessage() {
    const message = chatInput.value.trim();
    
    // Vérifier la longueur
    if (message.length > MAX_MESSAGE_LENGTH) {
        alert(`Le message est trop long. Maximum ${MAX_MESSAGE_LENGTH} caractères.`);
        return;
    }
    
    if (message && chatConnected) {
        chatWebSocket.send(JSON.stringify({
            event: 'chatMessage',
            data: { message }
        }));
        chatInput.value = '';
        autoResizeTextarea(chatInput);
        updateCharCounter(chatInput);
    }
}

// Fonction pour mettre à jour le compteur
function updateCharCounter(textarea) {
    const charCounter = document.getElementById('char-counter');
    if (charCounter) {
        const length = textarea.value.length;
        charCounter.textContent = `${length}/${MAX_MESSAGE_LENGTH}`;
        
        charCounter.classList.remove('warning', 'error');
        if (length > MAX_MESSAGE_LENGTH) {
            charCounter.classList.add('error');
        } else if (length > MAX_MESSAGE_LENGTH * 0.8) {
            charCounter.classList.add('warning');
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Fonction pour ajouter un message de chat
function addChatMessage(username, message) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    const currentUsername = localStorage.getItem('username');
    const isOwnMessage = username === currentUsername;
    
    messageElement.className = `chat-message ${isOwnMessage ? 'self' : 'other'}`;
    
    // Échapper le HTML pour éviter les injections
    const safeUsername = escapeHtml(username);
    const safeMessage = escapeHtml(message);
    
    messageElement.innerHTML = `<span class="chat-sender">${safeUsername}</span>: <span class="chat-text">${safeMessage}</span>`;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Fonction pour ajouter un message système
function addSystemMessage(message) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message system';
    messageElement.textContent = message;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
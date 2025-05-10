// Configuration
const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

let chatWebSocket = null;
let chatConnected = false;

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
    
    document.getElementById('stats-btn').addEventListener('click', () => {
        window.location.href = '/stats.html';
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.reload();
    });

    // Gestionnaire pour le bouton toggle chat
    document.getElementById('chat-toggle-btn').addEventListener('click', () => {
        const chatPanel = document.getElementById('chat-panel');
        const chatBtn = document.getElementById('chat-toggle-btn');
        const centerPanel = document.querySelector('.center-panel');
        
        if (chatPanel.classList.contains('hidden')) {
            chatPanel.classList.remove('hidden');
            chatBtn.textContent = 'Fermer Chat';
            centerPanel.style.maxWidth = '700px';
        } else {
            chatPanel.classList.add('hidden');
            chatBtn.textContent = 'Chat Général';
            centerPanel.style.maxWidth = '100%';
        }
    });
    
    // Initialiser le leaderboard
    loadLeaderboard('classic', false);

        
    const chatToggleBtn = document.getElementById('chat-toggle-btn');
    if (chatToggleBtn) {
        chatToggleBtn.addEventListener('click', (e) => {
            e.preventDefault(); // Empêcher le comportement par défaut
            
            const chatPanel = document.getElementById('chat-panel');
            const centerPanel = document.querySelector('.center-panel');
            
            if (chatPanel.classList.contains('hidden')) {
                chatPanel.classList.remove('hidden');
                chatToggleBtn.textContent = 'Fermer Chat';
                if (centerPanel) centerPanel.style.maxWidth = '700px';
                
                // Initialiser le chat si ce n'est pas déjà fait
                if (!chatWebSocket) {
                    initializeChat();
                }
            } else {
                chatPanel.classList.add('hidden');
                chatToggleBtn.textContent = 'Chat Général';
                if (centerPanel) centerPanel.style.maxWidth = '100%';
            }
        });
    }
    
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
    
    // Afficher le panel de chat pour les utilisateurs connectés
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel) {
        chatPanel.style.display = 'block';
    }
    
    // Connexion WebSocket pour le chat
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.hostname === 'localhost' ? 'localhost:3000' : 'lostcitiesbackend.onrender.com';
    const wsUrl = `${wsProtocol}//${wsHost}/ws?token=${encodeURIComponent(token)}`;
    
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
    
    // Gérer l'envoi de messages
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const message = chatInput.value.trim();
            if (message && chatConnected) {
                chatWebSocket.send(JSON.stringify({
                    event: 'chatMessage',
                    data: { message }
                }));
                chatInput.value = '';
            }
        });
    }
}

// Fonction pour ajouter un message de chat
function addChatMessage(username, message) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    const currentUsername = localStorage.getItem('username');
    const isOwnMessage = username === currentUsername;
    
    messageElement.className = `chat-message ${isOwnMessage ? 'self' : 'other'}`;
    messageElement.innerHTML = `
        <div class="chat-sender">${username}</div>
        <div class="chat-text">${message}</div>
    `;
    
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
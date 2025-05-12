const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

let chatWebSocket = null;
let chatConnected = false;
let chatInput = null;
const MAX_MESSAGE_LENGTH = 500;
const MAX_MESSAGE_LINES = 15;

document.addEventListener('DOMContentLoaded', async () => {
    const loginSection = document.getElementById('login-section');
    const userSection = document.getElementById('user-section');
    const usernameSpan = document.getElementById('username');
    const userAvatar = document.getElementById('user-avatar');
    
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                usernameSpan.textContent = payload.username || payload.email;
                
                // Stocker l'ID de l'utilisateur pour l'utiliser plus tard
                const userId = payload.id;
                localStorage.setItem('user_id', userId);
                
                // Charger l'avatar de l'utilisateur
                loadUserAvatar(userId);
                
                // Ajouter le gestionnaire de clic sur l'avatar
                userAvatar.addEventListener('click', () => {
                    window.location.href = `/profile/profile.html?id=${userId}`;
                });
                
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
        
        // Vérifier le statut de ban AVANT d'initialiser le chat
        const banInfo = await checkBanStatus();
        
        if (banInfo) {
            const playBtn = document.getElementById('play-btn');
            if (playBtn) {
                playBtn.classList.add('banned');
                playBtn.disabled = true;
                playBtn.style.backgroundColor = '#d32f2f';
                playBtn.style.cursor = 'not-allowed';
                playBtn.style.opacity = '0.8';
                
                // Créer le tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'ban-tooltip';
                
                let tooltipContent = '<p><strong>Vous êtes banni</strong></p>';
                if (banInfo.until) {
                    const untilDate = new Date(banInfo.until);
                    const timeLeft = untilDate.getTime() - new Date().getTime();
                    if (timeLeft > 0) {
                        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                        
                        let timeString = '';
                        if (days > 0) timeString += `${days}j `;
                        if (hours > 0) timeString += `${hours}h `;
                        if (minutes > 0 && days === 0) timeString += `${minutes}min`;
                        
                        tooltipContent += `<p>Temps restant: ${timeString}</p>`;
                        tooltipContent += `<p>Jusqu'à: ${untilDate.toLocaleString()}</p>`;
                    }
                } else {
                    tooltipContent += '<p>Durée: Permanent</p>';
                }
                
                if (banInfo.reason) {
                    tooltipContent += `<p>Raison: ${banInfo.reason}</p>`;
                }
                
                tooltip.innerHTML = tooltipContent;
                
                playBtn.addEventListener('mouseenter', (e) => {
                    document.body.appendChild(tooltip);
                    const rect = playBtn.getBoundingClientRect();
                    tooltip.style.display = 'block';
                    tooltip.style.position = 'absolute';
                    tooltip.style.left = rect.left + 'px';
                    tooltip.style.top = (rect.bottom + 5) + 'px';
                    tooltip.style.zIndex = '1000';
                });
                
                playBtn.addEventListener('mouseleave', () => {
                    if (tooltip.parentNode) {
                        tooltip.parentNode.removeChild(tooltip);
                    }
                });
                
                // Bloquer le clic sur le bouton
                playBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                });
            }
        } else {
            // Si l'utilisateur n'est pas banni, ajouter le gestionnaire normal
            document.getElementById('play-btn').addEventListener('click', () => {
                window.location.href = '/matchmaking/matchmaking.html';
            });
        }
    
        // Initialiser le chat automatiquement pour les utilisateurs connectés
        initializeChat();
        
        // Afficher la section utilisateur
        loginSection.classList.add('hidden');
        userSection.classList.remove('hidden');
    }
    
    // Gestionnaires d'événements pour les boutons (hors du if(token))
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

if (window.innerWidth <= 768) {
    createMobileTabs();
}

function createMobileTabs() {
    // Créer le container de tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'mobile-tabs';
    
    // Créer les tabs
    const tabs = [
        { name: 'Menu', target: 'left-panel' },
        { name: 'Classement', target: 'center-panel' },
        { name: 'Chat', target: 'right-panel' }
    ];
    
    tabs.forEach((tab, index) => {
        const tabButton = document.createElement('button');
        tabButton.className = 'mobile-tab';
        tabButton.textContent = tab.name;
        if (index === 0) tabButton.classList.add('active');
        
        tabButton.addEventListener('click', () => {
            // Retirer active de tous les tabs
            document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.main-container > div').forEach(p => p.classList.remove('active'));
            
            // Activer le tab et panel cliqué
            tabButton.classList.add('active');
            document.querySelector(`.${tab.target}`).classList.add('active');
        });
        
        tabsContainer.appendChild(tabButton);
    });
    
    document.body.appendChild(tabsContainer);
    
    // Activer le premier panel par défaut
    document.querySelector('.left-panel').classList.add('active');
}

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

async function loadUserAvatar(userId) {
    try {
        const response = await fetch(`${API_URL}/api/profile/${userId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            }
        });
        if (response.ok) {
            const profile = await response.json();
            if (profile.avatar_url) {
                const userAvatar = document.getElementById('user-avatar');
                if (userAvatar) {
                    userAvatar.src = profile.avatar_url;
                }
            }
        } else {
            console.warn(`Failed to load avatar for user ${userId}: ${response.status}`);
        }
    } catch (error) {
        console.error('Error loading user avatar:', error);
        // Use default avatar on error
        const userAvatar = document.getElementById('user-avatar');
        if (userAvatar) {
            userAvatar.src = '/assets/default-avatar.png';
        }
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
    chatInput = document.getElementById('chat-input');
    
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
                addChatMessage(data.data.username, data.data.message, data.data.messageId);
            } else if (data.event === 'messageDeleted' && data.data) {
                removeMessageFromChat(data.data.messageId);
            } else if (data.event === 'systemMessage' && data.data) {
                addSystemMessage(data.data.message);
            } else if (data.event === 'error' && data.data) {
                if (data.data.type === 'mute_error') {
                    showMuteError(data.data.message);
                } else {
                    addSystemMessage(`Erreur: ${data.data.message}`);
                }
            } else if (data.event === 'messageDeleted' && data.data) {
                removeMessageFromChat(data.data.messageId);
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

    checkMuteStatus();

    // Gérer l'envoi de messages
    const chatForm = document.getElementById('chat-form');

    if (chatForm && chatInput) {
        // Gestionnaire pour le bouton d'envoi
        const sendButton = document.querySelector('.chat-send');
        if (sendButton) {
            sendButton.addEventListener('click', (e) => {
                e.preventDefault();
                sendChatMessage();
            });
        }
        
        // Gestionnaire pour le formulaire
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            sendChatMessage();
        });
        
        // Gestionnaire pour Entrée/Shift+Entrée
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
        
        // Auto-resize et compteur
        chatInput.addEventListener('input', (e) => {
            autoResizeTextarea(e.target);
            updateCharCounter(e.target);
        });
    }
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
}

function removeMessageFromChat(messageId) {
    console.log(`Removing message with ID: ${messageId}`);
    
    // Try to find the message by its data-message-id attribute
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    
    if (messageElement) {
      console.log(`Found element to remove: `, messageElement);
      // Animation de suppression
      messageElement.style.transition = 'opacity 0.3s, transform 0.3s';
      messageElement.style.opacity = '0';
      messageElement.style.transform = 'scale(0.8)';
      
      setTimeout(() => {
        messageElement.remove();
        addSystemMessage('Un message a été supprimé par un administrateur');
      }, 300);
    } else {
      console.log(`Could not find message element with ID ${messageId}`);
    }
  }

function checkMuteStatus() {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('focus', () => {
            // Envoyer un message au serveur pour vérifier le statut de mute
            if (chatWebSocket && chatWebSocket.readyState === WebSocket.OPEN) {
                chatWebSocket.send(JSON.stringify({
                    event: 'checkMuteStatus'
                }));
            }
        });
    }
}

function showMuteError(message) {
    // Créer une notification d'erreur plus visible
    const notification = document.createElement('div');
    notification.className = 'mute-notification';
    notification.innerHTML = `
        <div class="mute-icon">🔇</div>
        <div class="mute-message">${message}</div>
        <button class="mute-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    // Ajouter au conteneur de chat
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        chatContainer.appendChild(notification);
        
        // Supprimer automatiquement après 10 secondes
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 10000);
    }
}

// Fonction pour envoyer le message
function sendChatMessage() {
    if (!chatInput) return;  // Vérifier si chatInput existe
    
    const message = chatInput.value.trim();
    
    if (message.length > MAX_MESSAGE_LENGTH) {
        alert(`Le message est trop long. Maximum ${MAX_MESSAGE_LENGTH} caractères.`);
        return;
    }

    const lineCount = (message.match(/\n/g) || []).length + 1;

    if (lineCount > MAX_MESSAGE_LINES) {
        alert(`Le message contient trop de lignes. Maximum ${MAX_MESSAGE_LINES} lignes.`);
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
        const lineCount = (textarea.value.match(/\n/g) || []).length + 1;
        
        charCounter.textContent = `${length}/${MAX_MESSAGE_LENGTH} • ${lineCount}/${MAX_MESSAGE_LINES} lignes`;
        
        charCounter.classList.remove('warning', 'error');
        if (length > MAX_MESSAGE_LENGTH || lineCount > MAX_MESSAGE_LINES) {
            charCounter.classList.add('error');
        } else if (length > MAX_MESSAGE_LENGTH * 0.8 || lineCount >= MAX_MESSAGE_LINES - 1) {
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
function addChatMessage(username, message, messageId = null) {
    const messagesContainer = document.getElementById('chat-messages');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    // ALWAYS set a data-message-id attribute, even if it's temporary
    messageElement.dataset.messageId = messageId || `temp-${Date.now()}`
    
    // Ajouter l'ID du message comme attribut de données
    if (messageId) {
        messageElement.dataset.messageId = messageId;
    }
    const currentUsername = localStorage.getItem('username');
    const token = localStorage.getItem('authToken');
    let isOwnMessage = false;
    
    // Déterminer si c'est notre propre message
    if (token) {
        try {
            const tokenParts = token.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            isOwnMessage = username === payload.username || username === payload.email;
        } catch (error) {
            console.error("Error parsing token:", error);
        }
    }
    
    messageElement.className = `chat-message ${isOwnMessage ? 'self' : 'other'}`;
    
    // Créer un élément pour le pseudo
    const senderElement = document.createElement('span');
    senderElement.className = 'chat-sender';
    senderElement.textContent = username;
    
    // Ajouter le gestionnaire de clic uniquement si ce n'est pas notre propre message
    if (!isOwnMessage) {
        senderElement.classList.add('clickable-username');
        senderElement.addEventListener('click', (e) => {
            e.stopPropagation();
            showUserMenu(e, username);
        });
    }
    
    const textElement = document.createElement('span');
    textElement.className = 'chat-text';
    textElement.textContent = message;
    
    messageElement.appendChild(senderElement);
    messageElement.appendChild(document.createTextNode(': '));
    messageElement.appendChild(textElement);
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

let currentUserMenu = null;

function showUserMenu(event, username) {
    // Fermer le menu existant s'il y en a un
    if (currentUserMenu) {
        currentUserMenu.remove();
    }
    
    // Vérifier si l'utilisateur est admin
    let isAdmin = false;
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const tokenParts = token.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            isAdmin = payload.role === 'admin';
        } catch (error) {
            console.error("Error parsing token:", error);
        }
    }
    
    // Créer le menu
    const menu = document.createElement('div');
    menu.className = 'user-menu-popup';
    
    if (isAdmin) {
        menu.innerHTML = `
            <div class="user-menu-item" onclick="viewProfile('${username}')">
                <span class="menu-icon">👤</span> Voir le profil
            </div>
            <div class="user-menu-item" onclick="muteUserDirectly('${username}')">
                <span class="menu-icon">🔇</span> Mute
            </div>
        `;
    } else {
        menu.innerHTML = `
            <div class="user-menu-item" onclick="viewProfile('${username}')">
                <span class="menu-icon">👤</span> Voir le profil
            </div>
            <div class="user-menu-item" onclick="reportUser('${username}')">
                <span class="menu-icon">⚠️</span> Signaler
            </div>
        `;
    }
    
    // Positionner le menu
    document.body.appendChild(menu);
    const rect = event.target.getBoundingClientRect();
    menu.style.left = rect.left + 'px';
    menu.style.top = (rect.bottom + 5) + 'px';
    
    currentUserMenu = menu;
    
    // Fermer le menu si on clique ailleurs
    setTimeout(() => {
        document.addEventListener('click', closeUserMenu);
    }, 0);
}

// Ajouter une nouvelle fonction pour mute directement
async function muteUserDirectly(username) {
    closeUserMenu();
    
    // D'abord la raison
    const reason = prompt(username ? `Raison du mute pour ${username}:` : "Raison du mute:");
    if (reason === null) return;
    
    // Ensuite la durée
    const duration = prompt("Durée du mute en secondes (laisser vide pour permanent):");
    if (duration === null) return;
    
    try {
        // Récupérer l'ID de l'utilisateur
        const response = await fetch(`${API_URL}/api/users`);
        const users = await response.json();
        const user = users.find(u => u.username === username);
        
        if (!user) {
            alert('Utilisateur introuvable');
            return;
        }
        
        const muteResponse = await fetch(`${API_URL}/api/admin/users/${user.id}/mute`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                duration: duration ? parseInt(duration) : null,
                reason: reason
            })
        });
        
        if (muteResponse.ok) {
            alert(`${username} a été muté avec succès!`);
        } else {
            alert('Erreur lors du mute');
        }
        
    } catch (error) {
        console.error('Error muting user:', error);
        alert('Erreur lors du mute');
    }
}

function closeUserMenu() {
    if (currentUserMenu) {
        currentUserMenu.remove();
        currentUserMenu = null;
        document.removeEventListener('click', closeUserMenu);
    }
}

async function viewProfile(username) {
    closeUserMenu();
    
    // Navigation normale depuis le chat
    try {
        const response = await fetch(`${API_URL}/api/users`);
        const users = await response.json();
        const user = users.find(u => u.username === username);
        
        if (user) {
            window.location.href = `/profile/profile.html?id=${user.id}`;
        }
    } catch (error) {
        console.error('Error fetching user:', error);
    }
}

function reportUser(username) {
    closeUserMenu();
    showReportDialog(username);
}

function showReportDialog(username) {
    const dialog = document.createElement('div');
    dialog.className = 'report-dialog-overlay';
    dialog.innerHTML = `
        <div class="report-dialog">
            <h3>Signaler ${username}</h3>
            <form id="report-form">
                <label>
                    <input type="radio" name="report_type" value="chat_abuse" required>
                    Abus dans le chat
                </label>
                <label>
                    <input type="radio" name="report_type" value="harassment" required>
                    Harcèlement
                </label>
                <label>
                    <input type="radio" name="report_type" value="spam" required>
                    Spam
                </label>
                <label>
                    <input type="radio" name="report_type" value="other" required>
                    Autre
                </label>
                <textarea name="description" placeholder="Description du problème" required></textarea>
                <div class="dialog-buttons">
                    <button type="submit">Envoyer</button>
                    <button type="button" onclick="closeReportDialog()">Annuler</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(dialog);
    
    dialog.querySelector('#report-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitReport(username, new FormData(e.target));
    });
}

function closeReportDialog() {
    document.querySelector('.report-dialog-overlay')?.remove();
}

async function submitReport(username, formData) {
    try {
        // Récupérer l'ID de l'utilisateur
        const response = await fetch(`${API_URL}/api/users`);
        const users = await response.json();
        const user = users.find(u => u.username === username);
        
        if (!user) {
            alert('Utilisateur introuvable');
            return;
        }
        
        const reportResponse = await fetch(`${API_URL}/api/report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                reported_user_id: user.id,
                report_type: formData.get('report_type'),
                description: formData.get('description')
            })
        });
        
        if (reportResponse.ok) {
            alert('Signalement envoyé avec succès');
            closeReportDialog();
        } else {
            alert('Erreur lors de l\'envoi du signalement');
        }
    } catch (error) {
        console.error('Error submitting report:', error);
        alert('Erreur lors de l\'envoi du signalement');
    }
}

async function checkBanStatus() {
    const token = localStorage.getItem('authToken');
    if (!token) return false;
    
    try {
        const response = await fetch(`${API_URL}/ban-status`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
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
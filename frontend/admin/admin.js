const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

// Variables globales pour la pagination
let currentUsersPage = 1;
let currentMessagesPage = 1;

// Fonction pour charger les utilisateurs avec pagination
async function loadUsers(page = 1) {
    try {
        const response = await fetch(`${API_URL}/api/admin/users?page=${page}&limit=50`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
            },
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.users) {
            throw new Error("Invalid response format: missing users data");
        }

        const usersTableBody = document.querySelector("#usersTable tbody");
        usersTableBody.innerHTML = "";

        // Stocker les utilisateurs pour la recherche
        window.allUsers = data.users;

        data.users.forEach(user => {
            // Vérifier si le ban a expiré côté client aussi
            const isBanned = user.is_banned && 
              (!user.banned_until || new Date(user.banned_until) > new Date());
            
            const row = document.createElement("tr");
            row.innerHTML = `
              <td>${user.id}</td>
              <td>${user.username}</td>
              <td>${user.email}</td>
              <td>${user.role}</td>
              <td>
                <button onclick="viewProfile(${user.id})">Voir le profil</button>
                <button onclick="muteUser(${user.id})">Mute</button>
                ${isBanned ? 
                  `<button onclick="unbanUser(${user.id})">Unban</button>` : 
                  `<button onclick="banUser(${user.id})">Ban</button>`
                }
              </td>
            `;
            usersTableBody.appendChild(row);
          });
        
        updatePaginationControls('users', data.pagination);
        
    } catch (error) {
        console.error("Error loading users:", error);
        alert(`Failed to load users: ${error.message}`);
    }
}

async function unbanUser(userId) {
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}/unban`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                "Content-Type": "application/json"
            }
        });
        
        if (response.ok) {
            alert("Utilisateur débanni avec succès!");
            loadUsers();
        }
    } catch (error) {
        console.error("Error unbanning user:", error);
    }
}

function viewProfile(userId) {
    window.open(`/profile/profile.html?id=${userId}`, '_blank');
}

function searchUsers(query) {
    if (!window.allUsers) return;
    
    const searchTerm = query.toLowerCase();
    const filteredUsers = window.allUsers.filter(user => 
        user.username.toLowerCase().includes(searchTerm) ||
        user.email.toLowerCase().includes(searchTerm)
    );
    
    const usersTableBody = document.querySelector("#usersTable tbody");
    usersTableBody.innerHTML = "";

    filteredUsers.forEach(user => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${user.id}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>
                <button onclick="viewProfile(${user.id})">Voir le profil</button>
                <button onclick="muteUser(${user.id})">Mute</button>
                <button onclick="banUser(${user.id})">Ban</button>
                <button onclick="deleteUser(${user.id})">Delete</button>
            </td>
        `;
        usersTableBody.appendChild(row);
    });
}

async function deleteMessage(messageId) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) {
        return;
    }
    
    // Trouver la ligne du message
    let messageRow = null;
    const rows = document.querySelectorAll('#chatMessagesTable tbody tr');
    rows.forEach(row => {
        const idCell = row.querySelector('td:first-child');
        if (idCell && idCell.textContent.trim() === messageId.toString()) {
            messageRow = row;
        }
    });
    
    if (messageRow) {
        // Ajouter une classe pour l'animation
        messageRow.style.transition = 'opacity 0.5s, transform 0.5s';
        messageRow.style.opacity = '0.5';
        messageRow.style.transform = 'scale(0.95)';
    }
    
    try {
        const response = await fetch(`${API_URL}/api/admin/chat-messages/${messageId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`
            }
        });
        
        if (response.ok) {
            if (messageRow) {
                // Animation de disparition
                messageRow.style.opacity = '0';
                messageRow.style.transform = 'scale(0.8)';
                
                // Supprimer après l'animation
                setTimeout(() => {
                    messageRow.remove();
                }, 500);
            }
            
            // Notification discrète (sans alert)
            const notification = document.createElement('div');
            notification.className = 'delete-notification';
            notification.textContent = 'Message supprimé';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #4caf50;
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                animation: fadeInOut 2s ease-in-out;
                z-index: 1000;
            `;
            document.body.appendChild(notification);
            setTimeout(() => notification.remove(), 2000);
            
        } else {
            alert("Erreur lors de la suppression du message");
            // Restaurer l'apparence si erreur
            if (messageRow) {
                messageRow.style.opacity = '1';
                messageRow.style.transform = 'scale(1)';
            }
        }
    } catch (error) {
        console.error("Error deleting message:", error);
        alert("Erreur lors de la suppression du message");
        // Restaurer l'apparence si erreur
        if (messageRow) {
            messageRow.style.opacity = '1';
            messageRow.style.transform = 'scale(1)';
        }
    }
}

// Fonction pour charger les statistiques du dashboard
async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_URL}/api/admin/dashboard`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`
            }
        });
        
        const stats = await response.json();
        updateDashboardUI(stats);
    } catch (error) {
        console.error("Error loading dashboard stats:", error);
    }
}


async function muteUser(userId, username = null) {
    // D'abord demander la raison
    const reason = prompt(username ? `Raison du mute pour ${username}:` : "Raison du mute:");
    
    // Si l'utilisateur annule, on arrête tout
    if (reason === null) return;
    
    // Ensuite demander la durée
    const duration = prompt("Durée en secondes (laisser vide pour permanent):");
    
    // Si l'utilisateur annule à ce stade, on arrête aussi
    if (duration === null) return;
    
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}/mute`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                duration: duration ? parseInt(duration) : null, 
                reason 
            })
        });
        
        if (response.ok) {
            alert(username ? `${username} a été muté avec succès!` : "Utilisateur muté avec succès!");
            // Recharger la liste appropriée
            if (username) {
                loadChatMessages();
            } else {
                loadUsers();
            }
        }
    } catch (error) {
        console.error("Error muting user:", error);
        alert("Erreur lors du mute");
    }
}

async function muteUserFromChat(userId, username) {
    muteUser(userId, username);
}

// Fonction pour charger les messages de chat avec pagination
async function loadChatMessages(page = 1) {
    try {
        const response = await fetch(`${API_URL}/api/admin/chat-messages?page=${page}&limit=50`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`
            }
        });
        
        // Check if response is ok
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Defensive check
        if (!data.messages) {
            throw new Error("Invalid response format: missing messages data");
        }
        
        const chatTableBody = document.querySelector("#chatMessagesTable tbody");
        chatTableBody.innerHTML = "";
        
        data.messages.forEach(msg => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${msg.id}</td>
                <td><strong>${msg.sender_username}</strong></td>
                <td><div class="message-content">${msg.message}</div></td>
                <td><span class="timestamp">${new Date(msg.timestamp).toLocaleString()}</span></td>
                <td><span class="status-badge ${msg.report_count > 0 ? 'status-pending' : ''}">${msg.report_count || 0}</span></td>
                <td>
                    <button onclick="muteUserFromChat(${msg.sender_id}, '${msg.sender_username}')" title="Mute">🔇 Mute</button>
                    <button onclick="banUserFromChat(${msg.sender_id}, '${msg.sender_username}')" title="Ban">🚫 Ban</button>
                    <button onclick="deleteMessage(${msg.id})" title="Supprimer">🗑️ Supprimer</button>
                </td>
            `;
            chatTableBody.appendChild(row);
        });
        
        // Ajouter les contrôles de pagination
        updatePaginationControls('messages', data.pagination);
        
    } catch (error) {
        console.error("Error loading chat messages:", error);
        alert(`Failed to load messages: ${error.message}`);
    }
}

async function checkAdminAccess() {
    const token = localStorage.getItem("authToken");
    
    if (!token) {
        window.location.href = '/login/login.html';
        return false;
    }
    
    try {
        // Parse JWT token to check role
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
            throw new Error("Invalid token format");
        }
        
        const payload = JSON.parse(atob(tokenParts[1]));
        
        if (payload.role !== 'admin') {
            alert("Access denied: Admin privileges required");
            window.location.href = '/';
            return false;
        }
        
        return true;
    } catch (error) {
        console.error("Error checking admin access:", error);
        window.location.href = '/login/login.html';
        return false;
    }
}


// Fonction pour mettre à jour les contrôles de pagination
function updatePaginationControls(type, pagination) {
    const containerId = type === 'users' ? 'users-pagination' : 'messages-pagination';
    let container = document.getElementById(containerId);
    
    if (!container) {
        // Créer le conteneur s'il n'existe pas
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'pagination-controls';
        
        const targetSection = type === 'users' ? 
            document.getElementById('users-section') : 
            document.getElementById('chat-messages-section');
        
        targetSection.appendChild(container);
    }
    
    container.innerHTML = `
        <button ${pagination.page <= 1 ? 'disabled' : ''} 
                onclick="changePage('${type}', ${pagination.page - 1})">
            Précédent
        </button>
        <span>Page ${pagination.page} sur ${pagination.totalPages}</span>
        <button ${pagination.page >= pagination.totalPages ? 'disabled' : ''} 
                onclick="changePage('${type}', ${pagination.page + 1})">
            Suivant
        </button>
    `;
}

// Fonction pour changer de page
function changePage(type, page) {
    if (type === 'users') {
        currentUsersPage = page;
        loadUsers(page);
    } else if (type === 'messages') {
        currentMessagesPage = page;
        loadChatMessages(page);
    }
}


// Améliorer l'affichage des statistiques
function updateDashboardUI(stats) {
    document.getElementById('total-users').textContent = stats.total_users || 0;
    document.getElementById('new-users').textContent = stats.new_users_24h || 0;
    document.getElementById('active-games').textContent = stats.active_games || 0;
    document.getElementById('banned-users').textContent = stats.banned_users || 0;
    
    // Animer les chiffres
    animateValue('total-users', 0, stats.total_users || 0, 1000);
}

// Animation des valeurs
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    const range = end - start;
    const startTime = new Date().getTime();
    
    const timer = setInterval(() => {
        const now = new Date().getTime();
        const timePassed = now - startTime;
        const progress = Math.min(timePassed / duration, 1);
        const current = Math.floor(start + range * progress);
        obj.textContent = current;
        
        if (progress === 1) clearInterval(timer);
    }, 50);
}




// Fonction pour bannir un utilisateur
async function banUser(userId) {
    const duration = prompt("Durée du ban en secondes (laisser vide pour permanent):");
    const reason = prompt("Raison du ban:");
    
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}/ban`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ duration: duration ? parseInt(duration) : null, reason })
        });
        
        if (response.ok) {
            alert("Utilisateur banni avec succès!");
            loadUsers();
        }
    } catch (error) {
        console.error("Error banning user:", error);
    }
}

// Fonction pour supprimer un utilisateur
async function deleteUser(userId) {
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`, // Utilise le JWT stocké
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        alert("User deleted successfully!");
        loadUsers(); // Recharge la liste des utilisateurs
    } catch (error) {
        console.error("Error deleting user:", error);
    }
}

async function debugAuth() {
    const token = localStorage.getItem("authToken");
    console.log("Token exists:", !!token);
    
    if (token) {
        try {
            const tokenParts = token.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            console.log("Token payload:", payload);
            console.log("User role:", payload.role);
            console.log("Token expiration:", new Date(payload.exp * 1000));
        } catch (error) {
            console.error("Error parsing token:", error);
        }
    }
}

// Fonction pour charger les rapports
async function loadReports() {
    try {
        const response = await fetch(`${API_URL}/api/admin/reports?status=pending`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reports = await response.json();
        
        const reportsTableBody = document.querySelector("#reportsTable tbody");
        reportsTableBody.innerHTML = "";
        
        reports.forEach(report => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${report.id}</td>
                <td>${report.reporter_username || 'Inconnu'}<br>
                    <small style="color: #aaa;">${report.reporter_email || ''}</small>
                </td>
                <td>${report.reported_username || 'Inconnu'}<br>
                    <small style="color: #aaa;">${report.reported_email || ''}</small>
                </td>
                <td>${report.report_type}</td>
                <td>${report.description}</td>
                <td><span class="status-badge status-${report.status}">${report.status}</span></td>
                <td>
                    <button onclick="resolveReport(${report.id}, 'resolved')">Résoudre</button>
                    <button onclick="resolveReport(${report.id}, 'dismissed')">Rejeter</button>
                </td>
            `;
            reportsTableBody.appendChild(row);
        });
        
    } catch (error) {
        console.error("Error loading reports:", error);
    }
}

// Fonction pour résoudre un rapport
async function resolveReport(reportId, resolution) {
    const notes = prompt("Notes de résolution:");
    
    try {
        const response = await fetch(`${API_URL}/api/admin/reports/${reportId}/resolve`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ resolution, notes })
        });
        
        if (response.ok) {
            alert("Rapport traité avec succès!");
            loadReports();
        }
    } catch (error) {
        console.error("Error resolving report:", error);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    debugAuth();
    const hasAccess = await checkAdminAccess();
    
    if (hasAccess) {
        loadUsers();
        loadDashboardStats();
        loadChatMessages();
        loadReports();
        
        const searchInput = document.getElementById('user-search');
        const clearButton = document.getElementById('clear-search');
        
        searchInput.addEventListener('input', (e) => {
            searchUsers(e.target.value);
        });
        
        clearButton.addEventListener('click', () => {
            searchInput.value = '';
            loadUsers();
        });
    }
});
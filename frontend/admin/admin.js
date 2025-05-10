const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

// Fonction pour charger les utilisateurs
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/admin/users`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
            },
        });

        const users = await response.json();
        const usersTableBody = document.querySelector("#usersTable tbody");
        usersTableBody.innerHTML = "";

        users.forEach(user => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>
                    <button onclick="muteUser(${user.id})">Mute</button>
                    <button onclick="banUser(${user.id})">Ban</button>
                    <button onclick="deleteUser(${user.id})">Delete</button>
                </td>
            `;
            usersTableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading users:", error);
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

// Fonction pour mute un utilisateur
async function muteUser(userId) {
    const duration = prompt("Durée du mute en secondes (laisser vide pour permanent):");
    const reason = prompt("Raison du mute:");
    
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}/mute`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ duration: duration ? parseInt(duration) : null, reason })
        });
        
        if (response.ok) {
            alert("Utilisateur muté avec succès!");
            loadUsers();
        }
    } catch (error) {
        console.error("Error muting user:", error);
    }
}

// Fonction pour charger les messages de chat
async function loadChatMessages() {
    try {
        const response = await fetch(`${API_URL}/api/admin/chat-messages`, {
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("authToken")}`
            }
        });
        
        if (!response.ok) throw new Error("Erreur de chargement");
        
        const messages = await response.json();
        const chatTableBody = document.querySelector("#chatMessagesTable tbody");
        chatTableBody.innerHTML = "";
        
        messages.forEach(msg => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${msg.id}</td>
                <td>${msg.sender_username}</td>
                <td>${msg.message}</td>
                <td>${new Date(msg.timestamp).toLocaleString()}</td>
                <td>
                    <button onclick="muteUserFromChat(${msg.sender_id}, '${msg.sender_username}')">Mute</button>
                    <button onclick="banUserFromChat(${msg.sender_id}, '${msg.sender_username}')">Ban</button>
                    <button onclick="deleteMessage(${msg.id})">Supprimer</button>
                </td>
            `;
            chatTableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading chat messages:", error);
    }
}

// Fonctions pour mute/ban depuis les messages
async function muteUserFromChat(userId, username) {
    const reason = prompt(`Raison du mute pour ${username}:`);
    const duration = prompt("Durée en secondes (laisser vide pour permanent):");
    
    // Réutiliser la fonction muteUser existante
    if (reason !== null) {
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
                alert(`${username} a été muté avec succès!`);
                loadChatMessages(); // Recharger la liste
            }
        } catch (error) {
            console.error("Error muting user:", error);
        }
    }
}

// Charger tout au démarrage
document.addEventListener("DOMContentLoaded", () => {
    loadUsers();
    loadDashboardStats();
    loadChatMessages(); // Nouveau
});

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

// Charger les utilisateurs au chargement de la page
document.addEventListener("DOMContentLoaded", loadUsers);
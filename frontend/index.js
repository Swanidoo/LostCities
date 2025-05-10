// Configuration
const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const userSection = document.getElementById('user-section');
    const usernameSpan = document.getElementById('username');
    
    // Vérifier si l'utilisateur est connecté
    const token = localStorage.getItem('authToken');
    if (token) {
        // Extraire le nom d'utilisateur du token JWT
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                usernameSpan.textContent = payload.username || payload.email;
            }
        } catch (error) {
            console.error("Erreur lors de la lecture du token:", error);
        }
        
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
    
    document.getElementById('play-btn').addEventListener('click', () => {
        window.location.href = '/matchmaking/matchmaking.html';
    });
    
    document.getElementById('stats-btn').addEventListener('click', () => {
        window.location.href = '/stats.html';
    });
    
    document.getElementById('chat-btn').addEventListener('click', () => {
        window.location.href = '/chat/chat.html';
    });
    
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.reload();
    });
    
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
document.addEventListener('DOMContentLoaded', () => {
    // Chargement initial
    loadLeaderboard('classic', false);
    
    // Gestionnaires d'onglets
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            // Mettre à jour l'onglet actif
            document.querySelector('.tab-button.active').classList.remove('active');
            button.classList.add('active');
            
            // Charger les données
            const mode = button.dataset.mode;
            const withExtension = document.querySelector('.subtab-button.active').dataset.extension === 'true';
            loadLeaderboard(mode, withExtension);
        });
    });
    
    document.querySelectorAll('.subtab-button').forEach(button => {
        button.addEventListener('click', () => {
            // Mettre à jour le sous-onglet actif
            document.querySelector('.subtab-button.active').classList.remove('active');
            button.classList.add('active');
            
            // Charger les données
            const mode = document.querySelector('.tab-button.active').dataset.mode;
            const withExtension = button.dataset.extension === 'true';
            loadLeaderboard(mode, withExtension);
        });
    });
    
    // Bouton retour
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = '/';
    });
});

async function loadLeaderboard(mode, withExtension) {
    // Utilisez directement le port 3000 du backend
    const API_URL = window.location.hostname === "localhost"
        ? "http://localhost:3000"  // Backend direct, pas le frontend !
        : "https://lostcitiesbackend.onrender.com";
    
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
        row.innerHTML = '<td colspan="4" style="text-align: center;">Aucune donnée disponible</td>';
        tableBody.appendChild(row);
        return;
    }
    
    entries.forEach((entry, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${entry.player}</td>
            <td>${entry.score}</td>
            <td>${new Date(entry.date).toLocaleDateString('fr-FR')}</td>
        `;
        tableBody.appendChild(row);
    });
}

function displayError() {
    const tableBody = document.getElementById('leaderboard-data');
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #ff5252;">Erreur lors du chargement des données</td></tr>';
}
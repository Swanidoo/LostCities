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
});

function loadLeaderboard(mode, withExtension) {
    const API_URL = window.location.hostname === "localhost"
        ? "http://localhost:3000"
        : "https://lostcitiesbackend.onrender.com";
    
    // Construire l'URL avec les filtres
    const url = `${API_URL}/api/leaderboard?game_mode=${mode}&with_extension=${withExtension}&limit=10`;
    
    fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
    })
    .then(response => response.json())
    .then(data => {
        const tableBody = document.getElementById('leaderboard-data');
        tableBody.innerHTML = '';
        
        if (data.data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="4">Aucune donnée disponible</td>';
            tableBody.appendChild(row);
            return;
        }
        
        // Afficher les données
        data.data.forEach((entry, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${entry.player}</td>
                <td>${entry.score}</td>
                <td>${new Date(entry.date).toLocaleDateString()}</td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Erreur lors du chargement du leaderboard:', error);
    });
}
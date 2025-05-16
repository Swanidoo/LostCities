import { apiClient, handleResponse } from '../js/api-client.js';

document.addEventListener('DOMContentLoaded', () => {
    // Chargement initial
    loadLeaderboard('classic', false);
    
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Distinguez clairement les types de boutons
            const isGameMode = button.dataset.mode !== undefined;
            const isExtension = button.dataset.extension !== undefined;
            
            if (isGameMode) {
                // Mettre à jour uniquement les boutons de mode
                document.querySelectorAll('.tab-button[data-mode]').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
            } else if (isExtension) {
                // Mettre à jour uniquement les boutons d'extension
                document.querySelectorAll('.tab-button[data-extension]').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
            }
            
            // Récupérer les valeurs actuelles correctement
            const activeMode = document.querySelector('.tab-button[data-mode].active');
            const activeExtension = document.querySelector('.tab-button[data-extension].active');
            
            const mode = activeMode ? activeMode.dataset.mode : 'classic';
            const withExtension = activeExtension ? activeExtension.dataset.extension === 'true' : false;
            
            console.log(`Selected: mode=${mode}, withExtension=${withExtension}`);
            
            loadLeaderboard(mode, withExtension);
        });
    });
    
    // Bouton retour
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = '/';
    });
});

async function loadLeaderboard(mode, withExtension) {
    try {
        console.log(`Loading leaderboard: mode=${mode}, withExtension=${withExtension}`);
        
        const url = `/api/leaderboard?game_mode=${mode}&with_extension=${withExtension}&limit=10`;
        console.log(`Fetching: ${url}`);
        
        const response = await apiClient.publicRequest(url);
        const data = await handleResponse(response);
        
        console.log(`Received ${data.data.length} entries`);
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
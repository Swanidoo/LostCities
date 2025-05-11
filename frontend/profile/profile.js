const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

let currentUserId = null;
let isOwnProfile = false;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('id');
    
    if (!userId) {
        window.location.href = '/';
        return;
    }
    
    currentUserId = userId;
    
    // Vérifier si c'est notre propre profil
    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const tokenParts = token.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            isOwnProfile = payload.id === parseInt(userId);
        } catch (error) {
            console.error('Error parsing token:', error);
        }
    }
    
    // Afficher le bouton d'édition si c'est notre profil
    if (isOwnProfile) {
        document.getElementById('edit-profile-btn').style.display = 'block';
    }
    
    // Charger le profil
    await loadProfile();
    
    // Configurer les gestionnaires d'événements
    setupEventListeners();
});

async function loadProfile() {
    try {
        const response = await fetch(`${API_URL}/api/profile/${currentUserId}`);
        
        if (!response.ok) {
            throw new Error('Profile not found');
        }
        
        const profile = await response.json();
        
        // Mettre à jour l'interface
        document.getElementById('user-username').textContent = profile.username;
        document.getElementById('user-bio').textContent = profile.bio || 'Aucune biographie pour le moment.';
        document.getElementById('member-date').textContent = new Date(profile.created_at).toLocaleDateString('fr-FR');
        document.getElementById('games-played').textContent = profile.games_played;
        document.getElementById('games-won').textContent = profile.games_won;
        
        // Calculer le taux de victoire
        const winRate = profile.games_played > 0 
            ? Math.round((profile.games_won / profile.games_played) * 100) 
            : 0;
        document.getElementById('win-rate').textContent = `${winRate}%`;
        
        // Avatar
        if (profile.avatar_url) {
            document.getElementById('user-avatar').src = profile.avatar_url;
        }
        
    } catch (error) {
        console.error('Error loading profile:', error);
        alert('Erreur lors du chargement du profil');
    }
}

function setupEventListeners() {
    // Bouton d'édition
    document.getElementById('edit-profile-btn').addEventListener('click', openEditModal);
    
    // Formulaire d'édition
    document.getElementById('edit-form').addEventListener('submit', handleEditSubmit);
}

function openEditModal() {
    const modal = document.getElementById('edit-modal');
    modal.classList.add('visible');
    
    // Préremplir les champs
    const currentAvatar = document.getElementById('user-avatar').src;
    const currentBio = document.getElementById('user-bio').textContent;
    
    if (!currentAvatar.includes('default-avatar.png')) {
        document.getElementById('avatar-url').value = currentAvatar;
    }
    
    if (currentBio !== 'Aucune biographie pour le moment.') {
        document.getElementById('bio-text').value = currentBio;
    }
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('visible');
}

async function handleEditSubmit(e) {
    e.preventDefault();
    
    const avatarUrl = document.getElementById('avatar-url').value;
    const bio = document.getElementById('bio-text').value;
    
    try {
        const response = await fetch(`${API_URL}/api/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('authToken')}`
            },
            body: JSON.stringify({
                avatar_url: avatarUrl,
                bio: bio
            })
        });
        
        if (response.ok) {
            closeEditModal();
            await loadProfile(); // Recharger le profil
        } else {
            alert('Erreur lors de la mise à jour du profil');
        }
    } catch (error) {
        console.error('Error updating profile:', error);
        alert('Erreur lors de la mise à jour du profil');
    }
}

// Rendre la fonction globale pour le onclick
window.closeEditModal = closeEditModal;
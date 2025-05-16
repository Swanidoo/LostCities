import { authService } from '../game/js/auth-service.js';

const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

console.log("Using API_URL:", API_URL);

// Fonction pour afficher les messages d'erreur
function showError(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="error-message">${message}</div>`;
    
    // Retirer automatiquement l'erreur après 5 secondes
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 5000);
}

// Fonction pour afficher les messages de succès
function showSuccess(message) {
    const errorContainer = document.getElementById('error-container');
    errorContainer.innerHTML = `<div class="success-message">${message}</div>`;
    
    // Retirer automatiquement le message après 3 secondes
    setTimeout(() => {
        errorContainer.innerHTML = '';
    }, 3000);
}

// Fonction pour valider l'email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

document.getElementById('loginForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const email = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    
    // Validation côté client
    if (!email || !password) {
        showError('Veuillez remplir tous les champs');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('Format d\'email invalide');
        return;
    }

    // Désactiver le bouton pendant la requête
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = 'Connexion...';
    submitButton.disabled = true;

    try {
        // Utiliser le service d'auth
        const result = await authService.login(email, password);
        
        if (result.success) {
            showSuccess("Connexion réussie ! Redirection...");
            
            // Redirection après un court délai
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            // Gestion des erreurs
            const { error } = result;
            
            if (error.status === 404) {
                showError('Utilisateur inconnu. Vérifiez votre adresse email.');
            } else if (error.status === 401) {
                showError('Mot de passe incorrect. Vérifiez votre saisie.');
            } else if (error.data && error.data.error) {
                showError(error.data.error);
            } else {
                showError('Erreur de connexion. Veuillez réessayer.');
            }
        }
    } catch (error) {
        console.error('Unexpected error:', error);
        showError('Erreur inattendue. Veuillez réessayer.');
    } finally {
        // Réactiver le bouton
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    }
});
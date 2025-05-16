import { authService } from '../game/js/auth-service.js';

const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

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

// Fonction pour valider le mot de passe
function isValidPassword(password) {
    return password.length >= 6;
}

// Fonction pour valider le nom d'utilisateur
function isValidUsername(username) {
    return username.length >= 3 && username.length <= 20 && /^[a-zA-Z0-9_]+$/.test(username);
}

document.getElementById('registerForm').addEventListener('submit', async function(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    
    // Validation côté client
    if (!username || !email || !password || !confirmPassword) {
        showError('Veuillez remplir tous les champs');
        return;
    }
    
    if (!isValidUsername(username)) {
        showError('Le nom d\'utilisateur doit contenir entre 3 et 20 caractères et seulement des lettres, chiffres et _');
        return;
    }
    
    if (!isValidEmail(email)) {
        showError('Format d\'email invalide');
        return;
    }
    
    if (!isValidPassword(password)) {
        showError('Le mot de passe doit contenir au moins 6 caractères');
        return;
    }
    
    if (password !== confirmPassword) {
        showError('Les mots de passe ne correspondent pas');
        return;
    }

    // Désactiver le bouton pendant la requête
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = 'Inscription...';
    submitButton.disabled = true;

    try {
        // Utiliser le service d'auth
        const result = await authService.register(username, email, password);
        
        if (result.success) {
            showSuccess("Inscription réussie ! Redirection...");
            
            // Redirection après un court délai
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
        } else {
            // Gestion des erreurs
            const { error } = result;
            
            if (error.status === 400 && error.data && error.data.error.includes('already exists')) {
                showError('Cette adresse email est déjà utilisée');
            } else if (error.data && error.data.error) {
                showError(error.data.error);
            } else {
                showError('Erreur lors de l\'inscription. Veuillez réessayer.');
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
const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

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

// Fonction pour valider le nom d'utilisateur
function isValidUsername(username) {
    // Au moins 3 caractères, lettres, chiffres et underscore autorisés
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    return usernameRegex.test(username);
}

// Fonction pour valider le mot de passe
function isValidPassword(password) {
    // Au moins 6 caractères
    return password.length >= 6;
}

document.getElementById('registerForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const username = document.getElementById('username').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    // Validation côté client
    if (!username || !email || !password) {
        showError('Veuillez remplir tous les champs');
        return;
    }
    
    if (!isValidUsername(username)) {
        showError('Le nom d\'utilisateur doit contenir entre 3 et 20 caractères (lettres, chiffres et _ autorisés)');
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

    // Show loading state
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.textContent = 'Inscription...';
    submitButton.disabled = true;

    fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, email, password }),
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(data => {
                throw { status: response.status, data };
            });
        }
        return response.json();
    })
    .then(data => {
        // Show success message
        showSuccess("Inscription réussie ! Redirection vers la connexion...");
        
        // Clear form
        this.reset();
        
        // Redirect to login after delay
        setTimeout(() => {
            window.location.href = '/login/login.html';
        }, 2000);
    })
    .catch(error => {
        console.error('Error:', error);
        
        // Messages d'erreur spécifiques
        if (error.status === 400 && error.data && error.data.error) {
            if (error.data.error.includes('already exists') || error.data.error.includes('User already exists')) {
                showError('Cette adresse email est déjà utilisée');
            } else if (error.data.error.includes('email')) {
                showError('Format d\'email invalide');
            } else {
                showError(error.data.error);
            }
        } else {
            showError('Erreur lors de l\'inscription. Veuillez réessayer.');
        }
    })
    .finally(() => {
        // Reset button state
        submitButton.textContent = originalButtonText;
        submitButton.disabled = false;
    });
});
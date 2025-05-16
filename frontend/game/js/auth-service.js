/**
 * Service d'authentification centralisé avec gestion access/refresh tokens
 */

// Configuration
const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

const TOKEN_STORAGE_KEYS = {
    ACCESS_TOKEN: 'authToken',  // Garde le même nom pour compatibilité
    REFRESH_TOKEN: 'refreshToken',
    USER_ID: 'user_id',
    USERNAME: 'username'
};

class AuthService {
    constructor() {
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.unauthorizedCallbacks = new Set();
    }

    // Stockage sécurisé des tokens
    setTokens(accessToken, refreshToken) {
        localStorage.setItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        localStorage.setItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
        
        // Décoder l'access token pour extraire les infos utilisateur
        try {
            const tokenParts = accessToken.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                localStorage.setItem(TOKEN_STORAGE_KEYS.USER_ID, payload.id);
                localStorage.setItem(TOKEN_STORAGE_KEYS.USERNAME, payload.username || payload.email);
            }
        } catch (error) {
            console.error('Error decoding access token:', error);
        }
    }

    // Récupération des tokens
    getAccessToken() {
        return localStorage.getItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
    }

    getRefreshToken() {
        return localStorage.getItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN);
    }

    getUserId() {
        return localStorage.getItem(TOKEN_STORAGE_KEYS.USER_ID);
    }

    getUsername() {
        return localStorage.getItem(TOKEN_STORAGE_KEYS.USERNAME);
    }

    // Vérification si l'utilisateur est connecté
    isAuthenticated() {
        return !!(this.getAccessToken() && this.getRefreshToken());
    }

    // Déconnexion locale (suppression des tokens)
    clearTokens() {
        localStorage.removeItem(TOKEN_STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(TOKEN_STORAGE_KEYS.REFRESH_TOKEN);
        localStorage.removeItem(TOKEN_STORAGE_KEYS.USER_ID);
        localStorage.removeItem(TOKEN_STORAGE_KEYS.USERNAME);
    }

    // Connexion
    async login(email, password) {
        try {
            const response = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw { status: response.status, data: errorData };
            }

            const data = await response.json();
            
            // Stocker les tokens
            this.setTokens(data.accessToken, data.refreshToken);
            
            return { success: true, data };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error };
        }
    }

    // Inscription
    async register(username, email, password) {
        try {
            const response = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw { status: response.status, data: errorData };
            }

            const data = await response.json();
            
            // Stocker les tokens
            this.setTokens(data.accessToken, data.refreshToken);
            
            return { success: true, data };
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, error };
        }
    }

    // Renouvellement des tokens
    async refreshTokens() {
        // Si un renouvellement est déjà en cours, attendre le résultat
        if (this.isRefreshing) {
            return this.refreshPromise;
        }

        const refreshToken = this.getRefreshToken();
        if (!refreshToken) {
            this.handleAuthError('No refresh token');
            return null;
        }

        this.isRefreshing = true;
        this.refreshPromise = this._performTokenRefresh(refreshToken);

        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    }

    async _performTokenRefresh(refreshToken) {
        try {
            const response = await fetch(`${API_URL}/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ refreshToken }),
            });

            if (!response.ok) {
                throw new Error(`Refresh failed: ${response.status}`);
            }

            const data = await response.json();
            
            // Mettre à jour les tokens
            this.setTokens(data.accessToken, data.refreshToken);
            
            return data.accessToken;
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.handleAuthError('Token refresh failed');
            return null;
        }
    }

    // Déconnexion côté serveur
    async logout() {
        const refreshToken = this.getRefreshToken();
        
        if (refreshToken) {
            try {
                await fetch(`${API_URL}/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.getAccessToken()}`
                    },
                    body: JSON.stringify({ refreshToken }),
                });
            } catch (error) {
                console.error('Server logout error:', error);
                // Continue avec la déconnexion locale même si la requête échoue
            }
        }

        // Déconnexion locale
        this.clearTokens();
        this.handleAuthError('User logged out');
    }

    // Déconnexion de tous les appareils
    async logoutAll() {
        try {
            await fetch(`${API_URL}/logout-all`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.getAccessToken()}`
                },
            });
        } catch (error) {
            console.error('Server logout-all error:', error);
        }

        // Déconnexion locale
        this.clearTokens();
        this.handleAuthError('Logged out from all devices');
    }

    // Gestion des erreurs d'authentification
    handleAuthError(reason) {
        console.log('Auth error:', reason);
        this.clearTokens();
        
        // Notifier tous les callbacks enregistrés
        this.unauthorizedCallbacks.forEach(callback => {
            try {
                callback(reason);
            } catch (error) {
                console.error('Error in unauthorized callback:', error);
            }
        });
    }

    // Enregistrer un callback pour les erreurs d'auth
    onUnauthorized(callback) {
        this.unauthorizedCallbacks.add(callback);
        
        // Retourner une fonction pour unsubscribe
        return () => {
            this.unauthorizedCallbacks.delete(callback);
        };
    }

    // Vérifier si un token est sur le point d'expirer
    isTokenExpiringSoon(buffer = 60) { // buffer en secondes
        const token = this.getAccessToken();
        if (!token) return true;

        try {
            const tokenParts = token.split('.');
            const payload = JSON.parse(atob(tokenParts[1]));
            const exp = payload.exp;
            const now = Math.floor(Date.now() / 1000);
            
            return (exp - now) <= buffer;
        } catch (error) {
            console.error('Error checking token expiration:', error);
            return true;
        }
    }

    // Renouveler proactivement si nécessaire
    async ensureValidToken() {
        if (!this.isAuthenticated()) {
            return null;
        }

        if (this.isTokenExpiringSoon()) {
            return await this.refreshTokens();
        }

        return this.getAccessToken();
    }
}

// Instance singleton
export const authService = new AuthService();

// Fonction helper pour obtenir les headers d'auth
export function getAuthHeaders() {
    const token = authService.getAccessToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Configuration d'un callback global pour la déconnexion automatique
authService.onUnauthorized((reason) => {
    console.log('User unauthorized:', reason);
    
    // Redirection vers la page de login si on n'y est pas déjà
    if (!window.location.pathname.includes('/login/') && !window.location.pathname.includes('/register/')) {
        // Afficher un message si nécessaire
        if (reason !== 'User logged out') {
            alert('Votre session a expiré. Veuillez vous reconnecter.');
        }
        window.location.href = '/login/login.html';
    }
});
/**
 * Initialisation globale de l'application
 */

import { authService } from './auth-service.js';
import { tokenManager } from './token-manager.js';

// Configuration globale
window.APP_CONFIG = {
    API_URL: window.location.hostname === "localhost"
        ? "http://localhost:3000"
        : "https://lostcitiesbackend.onrender.com",
    WS_URL: (() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname === 'localhost' ? 'localhost:3000' : 'lostcitiesbackend.onrender.com';
        return `${protocol}//${host}/ws`;
    })()
};

// Services globaux
window.authService = authService;
window.tokenManager = tokenManager;

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App initialized');
    console.log('📡 API URL:', window.APP_CONFIG.API_URL);
    console.log('🔌 WebSocket URL:', window.APP_CONFIG.WS_URL);
    
    // Vérifier et nettoyer les tokens expirés
    if (authService.isAuthenticated()) {
        if (!authService.isTokenExpiringSoon(0)) {
            console.log('✅ User authenticated with valid token');
            tokenManager.startProactiveRefresh();
        } else {
            console.log('⚠️ Token expired, attempting refresh...');
            authService.refreshTokens().then(newToken => {
                if (newToken) {
                    console.log('✅ Token refreshed successfully');
                    tokenManager.startProactiveRefresh();
                } else {
                    console.log('❌ Token refresh failed, clearing auth');
                    authService.clearTokens();
                }
            });
        }
    }
});

// Gestion des erreurs globales
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Si c'est une erreur d'authentification, la gérer automatiquement
    if (event.reason && event.reason.status === 401) {
        console.log('Global 401 error, attempting token refresh...');
        event.preventDefault(); // Empêcher l'affichage de l'erreur
    }
});

export { authService, tokenManager };
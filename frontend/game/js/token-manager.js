/**
 * Token Manager - Gestion proactive des tokens
 */

import { authService } from './auth-service.js';

class TokenManager {
    constructor() {
        this.refreshInterval = null;
        this.refreshBuffer = 5 * 60; // 5 minutes avant expiration
    }

    // Démarrer le renouvellement automatique proactif
    startProactiveRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }

        // Vérifier toutes les minutes si le token a besoin d'être renouvelé
        this.refreshInterval = setInterval(async () => {
            if (authService.isAuthenticated() && authService.isTokenExpiringSoon(this.refreshBuffer)) {
                console.log('Proactively refreshing token...');
                try {
                    await authService.refreshTokens();
                    console.log('Token refreshed proactively');
                } catch (error) {
                    console.error('Proactive token refresh failed:', error);
                }
            }
        }, 60 * 1000); // Vérifier chaque minute
    }

    // Arrêter le renouvellement automatique
    stopProactiveRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    // Renouveler immédiatement si nécessaire
    async ensureValidToken() {
        return await authService.ensureValidToken();
    }
}

export const tokenManager = new TokenManager();

// Auto-start quand le module est importé
if (authService.isAuthenticated()) {
    tokenManager.startProactiveRefresh();
}

// Écouter les événements d'auth pour démarrer/arrêter le refresh proactif
authService.onUnauthorized(() => {
    tokenManager.stopProactiveRefresh();
});
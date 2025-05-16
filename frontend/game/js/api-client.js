/**
 * Client API avec gestion automatique des tokens
 */

import { authService, getAuthHeaders } from './auth-service.js';

const API_URL = window.location.hostname === "localhost"
    ? "http://localhost:3000"
    : "https://lostcitiesbackend.onrender.com";

/**
 * Wrapper autour de fetch avec gestion automatique des tokens
 */
async function apiCall(url, options = {}) {
    // Préparer les options par défaut
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
        },
    };

    // Merger les options
    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    };

    // Construire l'URL complète
    const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;

    try {
        // Première tentative
        let response = await fetch(fullUrl, finalOptions);

        // Si 401 (Unauthorized), tenter un renouvellement
        if (response.status === 401 && authService.isAuthenticated()) {
            console.log('Token expired, attempting refresh...');
            
            const newToken = await authService.refreshTokens();
            
            if (newToken) {
                // Réessayer avec le nouveau token
                finalOptions.headers['Authorization'] = `Bearer ${newToken}`;
                response = await fetch(fullUrl, finalOptions);
            } else {
                // Le renouvellement a échoué, l'utilisateur sera déconnecté
                throw new Error('Token refresh failed');
            }
        }

        return response;
    } catch (error) {
        console.error('API call error:', error);
        throw error;
    }
}

/**
 * Méthodes helper pour les différents types de requêtes
 */
export const apiClient = {
    async get(url, options = {}) {
        return apiCall(url, { ...options, method: 'GET' });
    },

    async post(url, data, options = {}) {
        return apiCall(url, {
            ...options,
            method: 'POST',
            body: data ? JSON.stringify(data) : undefined,
        });
    },

    async put(url, data, options = {}) {
        return apiCall(url, {
            ...options,
            method: 'PUT',
            body: data ? JSON.stringify(data) : undefined,
        });
    },

    async delete(url, options = {}) {
        return apiCall(url, { ...options, method: 'DELETE' });
    },

    async patch(url, data, options = {}) {
        return apiCall(url, {
            ...options,
            method: 'PATCH',
            body: data ? JSON.stringify(data) : undefined,
        });
    },

    // Méthode pour les uploads de fichiers (sans Content-Type JSON)
    async upload(url, formData, options = {}) {
        const uploadOptions = {
            ...options,
            method: 'POST',
            body: formData,
            headers: {
                ...getAuthHeaders(),
                // Ne pas définir Content-Type pour FormData
            },
        };
        return apiCall(url, uploadOptions);
    },

    // Méthode pour les requêtes sans auth (publiques)
    async publicRequest(url, options = {}) {
        const publicOptions = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        };
        
        const fullUrl = url.startsWith('http') ? url : `${API_URL}${url}`;
        return fetch(fullUrl, publicOptions);
    }
};

// Helper pour les réponses JSON
export async function handleResponse(response) {
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = { error: response.statusText };
        }
        throw { status: response.status, data: errorData };
    }
    
    // Vérifier si la réponse contient du JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }
    
    return response.text();
}

export { apiCall };
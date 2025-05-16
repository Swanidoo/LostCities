/**
 * WebSocket Manager avec gestion automatique des tokens
 */

import { authService } from './auth-service.js';

class WebSocketManager {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.isConnecting = false;
        this.messageHandlers = new Map();
        this.connectionStateHandlers = new Set();
    }

    // Connexion avec token automatique
    async connect() {
        if (this.isConnecting || (this.socket && this.socket.readyState === WebSocket.OPEN)) {
            return;
        }

        this.isConnecting = true;

        try {
            // S'assurer que le token est valide avant de connecter
            const token = await authService.ensureValidToken();
            
            if (!token) {
                throw new Error('No valid token available');
            }

            // Fermer la connexion existante si elle existe
            if (this.socket) {
                this.socket.close();
            }

            const wsUrl = `${this.baseUrl}?token=${encodeURIComponent(token)}`;
            console.log('Connecting to WebSocket...');

            this.socket = new WebSocket(wsUrl);
            this.setupEventListeners();

        } catch (error) {
            console.error('Failed to connect to WebSocket:', error);
            this.isConnecting = false;
        }
    }

    setupEventListeners() {
        this.socket.addEventListener('open', () => {
            console.log('WebSocket connected');
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.notifyConnectionState('open');
        });

        this.socket.addEventListener('message', (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        });

        this.socket.addEventListener('close', (event) => {
            console.log('WebSocket closed:', event.code, event.reason);
            this.isConnecting = false;
            this.notifyConnectionState('close', event);

            // Reconnecter automatiquement si ce n'est pas une fermeture normale
            if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
                this.scheduleReconnect();
            }
        });

        this.socket.addEventListener('error', (error) => {
            console.error('WebSocket error:', error);
            this.isConnecting = false;
            this.notifyConnectionState('error', error);
        });
    }

    scheduleReconnect() {
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1})`);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            this.connect();
        }, delay);
    }

    // Envoyer un message
    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(typeof data === 'string' ? data : JSON.stringify(data));
            return true;
        } else {
            console.warn('WebSocket not connected, cannot send message');
            return false;
        }
    }

    // Enregistrer un handler pour un type de message
    onMessage(eventType, handler) {
        if (!this.messageHandlers.has(eventType)) {
            this.messageHandlers.set(eventType, new Set());
        }
        this.messageHandlers.get(eventType).add(handler);

        // Retourner une fonction pour unsubscribe
        return () => {
            const handlers = this.messageHandlers.get(eventType);
            if (handlers) {
                handlers.delete(handler);
            }
        };
    }

    // Enregistrer un handler pour les changements d'état de connexion
    onConnectionState(handler) {
        this.connectionStateHandlers.add(handler);

        // Retourner une fonction pour unsubscribe
        return () => {
            this.connectionStateHandlers.delete(handler);
        };
    }

    handleMessage(data) {
        if (data && data.event) {
            const handlers = this.messageHandlers.get(data.event);
            if (handlers) {
                handlers.forEach(handler => {
                    try {
                        handler(data);
                    } catch (error) {
                        console.error('Error in message handler:', error);
                    }
                });
            }
        }
    }

    notifyConnectionState(state, data) {
        this.connectionStateHandlers.forEach(handler => {
            try {
                handler(state, data);
            } catch (error) {
                console.error('Error in connection state handler:', error);
            }
        });
    }

    // Fermer la connexion
    close() {
        if (this.socket) {
            this.socket.close(1000, 'Manual close');
        }
    }

    // Vérifier l'état de la connexion
    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }
}

export { WebSocketManager };
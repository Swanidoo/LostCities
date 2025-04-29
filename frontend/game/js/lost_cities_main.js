/**
 * Lost Cities Main
 * Main entry point for the game - initializes and orchestrates the game components
 */

import { LostCitiesGame } from './lost_cities_game_logic.js';
import { LostCitiesApiClient } from './lost_cities_api_client.js';

// Wait for the DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    // Check for authentication
    const token = localStorage.getItem('authToken');
    if (!token) {
        console.error('No authentication token found');
        window.location.href = '/login.html';
        return;
    }
    
    // Show loading overlay
    showLoadingOverlay(true);
    
    try {
        // Initialize the game
        const game = new LostCitiesGame();
        const initialized = await game.init();
        
        if (!initialized) {
            console.error('Failed to initialize game');
            showErrorScreen('Failed to initialize game. Please try again later.');
            return;
        }
        
        // Game initialized successfully
        console.log('Game initialized successfully');
        
        // Hide loading overlay
        showLoadingOverlay(false);
    } catch (error) {
        console.error('Error initializing game:', error);
        showErrorScreen('An error occurred while loading the game. Please try again later.');
    }
});

/**
 * Show or hide loading overlay
 * @param {boolean} show - Whether to show the overlay
 */
function showLoadingOverlay(show) {
    let overlay = document.querySelector('.loading-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
    }
    
    overlay.classList.toggle('active', show);
}

/**
 * Show error screen
 * @param {string} message - Error message
 */
function showErrorScreen(message) {
    // Hide loading overlay
    showLoadingOverlay(false);
    
    // Create error container
    const gameContainer = document.querySelector('.game-container');
    if (gameContainer) {
        gameContainer.innerHTML = '';
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-screen';
        
        const errorIcon = document.createElement('div');
        errorIcon.className = 'error-icon';
        errorIcon.innerHTML = '⚠️';
        
        const errorMessage = document.createElement('div');
        errorMessage.className = 'error-message';
        errorMessage.textContent = message;
        
        const errorActions = document.createElement('div');
        errorActions.className = 'error-actions';
        
        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Try Again';
        refreshButton.addEventListener('click', () => {
            window.location.reload();
        });
        
        const homeButton = document.createElement('button');
        homeButton.textContent = 'Go to Home';
        homeButton.addEventListener('click', () => {
            window.location.href = '/';
        });
        
        errorActions.appendChild(refreshButton);
        errorActions.appendChild(homeButton);
        
        errorDiv.appendChild(errorIcon);
        errorDiv.appendChild(errorMessage);
        errorDiv.appendChild(errorActions);
        
        gameContainer.appendChild(errorDiv);
        
        // Add some inline styles
        const style = document.createElement('style');
        style.textContent = `
            .error-screen {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px;
                text-align: center;
            }
            
            .error-icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            
            .error-message {
                font-size: 18px;
                margin-bottom: 30px;
                color: #555;
            }
            
            .error-actions {
                display: flex;
                gap: 20px;
            }
            
            .error-actions button {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                background-color: #5b3d2b;
                color: white;
                cursor: pointer;
                font-size: 16px;
                transition: background-color 0.2s;
            }
            
            .error-actions button:hover {
                background-color: #7a5038;
            }
        `;
        
        document.head.appendChild(style);
    }
}

// Add event listener for page unload to cleanup WebSocket connection
window.addEventListener('beforeunload', () => {
    // The WebSocket will be automatically closed, but could add additional cleanup here
});
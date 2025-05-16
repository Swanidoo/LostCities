const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000"
  : "https://lostcitiesbackend.onrender.com";

// Vérifier si l'utilisateur est connecté
export async function checkAuthStatus() {
  try {
    const response = await fetch(`${API_URL}/check-auth`, {
      credentials: 'include'
    });
    
    if (response.ok) {
      return await response.json();
    }
    return { authenticated: false };
  } catch (error) {
    console.error('Error checking auth status:', error);
    return { authenticated: false };
  }
}

// Déconnexion
export async function logout() {
  try {
    await fetch(`${API_URL}/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    window.location.href = '/';
  } catch (error) {
    console.error('Error during logout:', error);
    window.location.href = '/';
  }
}

// Wrapper pour les requêtes authentifiées
export async function makeAuthenticatedRequest(url, options = {}) {
  const defaultOptions = {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };
  
  return fetch(url, { ...defaultOptions, ...options });
}
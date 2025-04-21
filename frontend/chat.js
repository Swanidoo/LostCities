// Crée une connexion WebSocket vers le serveur
const ws = new WebSocket('wss://lostcitiesbackend.onrender.com');

ws.addEventListener('open', () => {
    console.log("✅ WebSocket ouvert !");
    // Envoi d'un message pour confirmer la connexion
    ws.send(JSON.stringify({ text: "Connexion réussie !" }));
});

// Réception des messages
ws.addEventListener('message', (event) => {
    console.log('📩 Message reçu du serveur:', event.data);

    try {
        const receivedData = JSON.parse(event.data);
        if (receivedData.text) {
            displayMessage(receivedData.text, "other");
        }
    } catch (error) {
        console.error("❌ Erreur de parsing JSON :", error);
    }
});

// Gestion de l'erreur WebSocket
ws.addEventListener('error', (error) => {
    console.error("❌ WebSocket error:", error);
});

// Fermeture de la connexion WebSocket
ws.addEventListener('close', (event) => {
    if (event.wasClean) {
        console.log(`✅ WebSocket fermé proprement, code: ${event.code}, raison: ${event.reason}`);
    } else {
        console.error("❌ WebSocket fermé de manière anormale", event);
    }
});

// Gestion de l'envoi d'un message via le formulaire
document.getElementById('chatForm').addEventListener('submit', function(event) {
    event.preventDefault();

    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();

    if (message) {
        // Envoi du message au serveur via WebSocket
        ws.send(JSON.stringify({ text: message })); 
        messageInput.value = ''; // Vide l'input après envoi
    }
});

// Fonction pour afficher les messages dans le chat
function displayMessage(message, sender) {
    const messageContainer = document.getElementById('messages');
    
    if (!messageContainer) {
        console.error("❌ L'élément #messages n'existe pas dans le DOM !");
        return;
    }

    // Créer un nouvel élément div pour chaque message
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.classList.add('message', sender); // Ajout de classes CSS pour différencier les messages

    messageContainer.appendChild(messageElement);
    messageContainer.scrollTop = messageContainer.scrollHeight; // Scroll automatique vers le bas
}

// Fonction pour envoyer un message
function sendMessage() {
    const input = document.getElementById("messageInput");
    if (input.value.trim() !== "") {
        const message = { text: input.value };
        ws.send(JSON.stringify(message)); // Utiliser ws pour envoyer le message via WebSocket

        displayMessage(input.value, "self"); // Affichage immédiat du message chez l'expéditeur
        input.value = ""; // Vide l'input après envoi
    }
}

// Événement d'initialisation des éléments nécessaires au chat
document.addEventListener('DOMContentLoaded', () => {
    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('messageInput');

    // Assurer que le formulaire et l'input sont présents
    if (!chatForm || !messageInput) {
        console.error("❌ L'élément #chatForm ou #messageInput n'existe pas dans le DOM !");
    }
});

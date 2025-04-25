const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:3000" // Local backend URL
  : "https://lostcitiesbackend.onrender.com"; // Render backend URL

// Fonction pour charger les utilisateurs
async function loadUsers() {
    try {
        const response = await fetch(`${API_URL}/api/admin/users`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`, // Utilise le JWT stocké
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const users = await response.json();
        const usersTableBody = document.querySelector("#usersTable tbody");
        usersTableBody.innerHTML = ""; // Vide le tableau avant de le remplir

        users.forEach(user => {
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${user.id}</td>
                <td>${user.username}</td>
                <td>${user.email}</td>
                <td>${user.role}</td>
                <td>
                    <button onclick="deleteUser(${user.id})">Delete</button>
                </td>
            `;
            usersTableBody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading users:", error);
    }
}

// Fonction pour supprimer un utilisateur
async function deleteUser(userId) {
    try {
        const response = await fetch(`${API_URL}/api/admin/users/${userId}`, {
            method: "DELETE",
            headers: {
                "Authorization": `Bearer ${localStorage.getItem("token")}`, // Utilise le JWT stocké
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        alert("User deleted successfully!");
        loadUsers(); // Recharge la liste des utilisateurs
    } catch (error) {
        console.error("Error deleting user:", error);
    }
}

// Charger les utilisateurs au chargement de la page
document.addEventListener("DOMContentLoaded", loadUsers);
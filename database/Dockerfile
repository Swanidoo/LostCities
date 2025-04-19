# Utiliser une image de base officielle
FROM postgres:15

# Définir les variables d'environnement pour la base de données
ENV POSTGRES_USER=admin
ENV POSTGRES_PASSWORD=adminpassword
ENV POSTGRES_DB=lostcities

# Copier les fichiers SQL d'initialisation (si nécessaire)
COPY init.sql /docker-entrypoint-initdb.d/

# Exposer le port par défaut de PostgreSQL
EXPOSE 5432

# Commande par défaut pour démarrer PostgreSQL
CMD ["postgres"]
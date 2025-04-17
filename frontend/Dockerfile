# Step 1: Use an official nginx image from Docker Hub
FROM nginx:alpine

# Step 2: Copy the frontend static files into the nginx server directory
COPY ./frontend /usr/share/nginx/html

# Step 3: Expose the port nginx will run on (default is 80)
EXPOSE 80

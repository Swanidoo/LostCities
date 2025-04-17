# Step 1: Use a base Deno image
FROM denoland/deno:1.29.0

# Step 2: Set working directory
WORKDIR /app

# Step 3: Copy the backend code into the container
COPY ./backend /app

# Step 4: Allow the necessary permissions for Deno to run
RUN deno cache /app/back_server.ts

# Step 5: Expose the port where your server will run
EXPOSE 3000

# Step 6: Run the Deno server
CMD ["deno", "run", "--allow-net", "--allow-read", "/app/back_server.ts", "3000"]

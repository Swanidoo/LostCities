# Step 1: Use a Deno base image
FROM denoland/deno:1.29.0

# Step 2: Set the working directory
WORKDIR /app

# Step 3: Copy all files into the container
COPY . /app

# Step 4: Expose the port the Deno server will run on
EXPOSE 8080

# Step 5: Run the Deno server
CMD ["deno", "run", "--allow-net","--allow-env", "--allow-read", "--allow-write", "/app/front_server.ts", "8080"]
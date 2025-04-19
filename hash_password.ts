// filepath: /home/tom/LostCities/hash_password.ts
import { hash } from "https://deno.land/x/bcrypt@v0.2.4/mod.ts";

const password = "goat"; // Replace with the password you want to hash

// Hash the password (bcrypt will generate the salt internally)
const hashedPassword = await hash(password);

console.log("Hashed Password:", hashedPassword);
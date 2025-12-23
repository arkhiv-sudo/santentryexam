require('dotenv').config({ path: '.env.local' });

console.log("Checking Environment Variables...");
console.log("FIREBASE_CLIENT_EMAIL:", process.env.FIREBASE_CLIENT_EMAIL ? "EXISTS" : "MISSING");
console.log("FIREBASE_PRIVATE_KEY:", process.env.FIREBASE_PRIVATE_KEY ? "EXISTS" : "MISSING");

if (process.env.FIREBASE_PRIVATE_KEY) {
    const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    console.log("Private Key Length:", key.length);
    console.log("Starts with:", key.substring(0, 30));
}

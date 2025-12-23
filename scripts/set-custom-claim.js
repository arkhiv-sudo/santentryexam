const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json"); // You need to download this file

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const uid = process.argv[2];
const role = process.argv[3];

if (!uid || !role) {
    console.log("Usage: node scripts/set-custom-claim.js <uid> <role>");
    process.exit(1);
}

admin.auth().setCustomUserClaims(uid, { role })
    .then(() => {
        console.log(`Success! Role ${role} set for user ${uid}`);
        process.exit(0);
    })
    .catch((error) => {
        console.error("Error setting custom claims:", error);
        process.exit(1);
    });

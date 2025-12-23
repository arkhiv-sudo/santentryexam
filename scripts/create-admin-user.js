const admin = require("firebase-admin");
const serviceAccount = require("./service-account-key.json");

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const auth = admin.auth();

const email = "arkhiv@sant.school";
const password = "password123"; // Default temporary password
const displayName = "Admin User";

async function createAdmin() {
    try {
        let user;
        try {
            user = await auth.getUserByEmail(email);
            console.log(`User ${email} already exists. UID: ${user.uid}`);
        } catch (error) {
            if (error.code === 'auth/user-not-found') {
                console.log(`Creating new user: ${email}`);
                user = await auth.createUser({
                    email,
                    password,
                    displayName,
                });
                console.log(`User created. UID: ${user.uid}`);
            } else {
                throw error;
            }
        }

        // Set Custom Claims
        await auth.setCustomUserClaims(user.uid, { role: 'admin' });
        console.log(`Custom claims set for ${user.email} -> role: admin`);

        // Create/Update Firestore User Document
        await db.collection("users").doc(user.uid).set({
            uid: user.uid,
            email: user.email,
            name: user.displayName || displayName,
            role: 'admin',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log(`Firestore profile updated for ${user.email}`);

    } catch (error) {
        console.error("Error creating admin user:", error);
        process.exit(1);
    }
}

createAdmin();

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

/**
 * Automatically create a Firestore user profile document when a new user
 * signs up via Firebase Authentication.
 */
export const onUserCreate = functions.auth.user().onCreate(async (user) => {
    const { uid, email, displayName, providerData } = user;
    const userRef = db.collection("users").doc(uid);

    try {
        const docSnap = await userRef.get();
        let role = "student";

        // Check if user signed up via Google
        const isGoogle = providerData.some(p => p.providerId === "google.com");
        if (isGoogle) {
            role = "parent";
        }

        if (!docSnap.exists) {
            const fullName = displayName || email?.split("@")[0] || "User";
            const names = fullName.split(' ');
            const firstName = names.length > 1 ? names.pop() : names[0];
            const lastName = names.length > 0 ? names.join(' ') : "";

            await userRef.set({
                uid,
                email,
                firstName: firstName || "",
                lastName: lastName || "",
                role: role,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`User profile created for ${uid} with role ${role}`);
        } else {
            // doc exists (likely from client-side signup), get the role from there
            role = docSnap.data()?.role || role;
            console.log(`User profile already exists for ${uid}, skipping creation.`);
        }

        // Set Custom Claims for the role
        await admin.auth().setCustomUserClaims(uid, { role });
        console.log(`Custom claims set for ${uid}: { role: "${role}" }`);

    } catch (error) {
        error_handling:
        console.error("Error in onUserCreate:", error);
    }
});


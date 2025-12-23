import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// You should put your service account key in .env.local
// For this setup, we'll try to use environment variables mapped to the service account
const pKey = process.env.FIREBASE_PRIVATE_KEY;
if (!pKey) {
    console.warn("FIREBASE_PRIVATE_KEY is not set in environment.");
}

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: pKey?.replace(/\\n/g, "\n"),
};

// Lazy initialization or check
const app = !getApps().length
    ? (pKey ? initializeApp({
        credential: cert(serviceAccount),
    }) : getApps()[0]) // Hack to avoid crash if key missing during build, but API will fail
    : getApps()[0];

export const adminAuth = getAuth(app);

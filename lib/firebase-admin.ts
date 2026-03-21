import "server-only";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const pKey = process.env.FIREBASE_PRIVATE_KEY;
if (!pKey) {
    console.warn("FIREBASE_PRIVATE_KEY is not set in environment.");
}

const serviceAccount = {
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: pKey?.replace(/\\n/g, "\n"),
};

const app = !getApps().length
    ? pKey
        ? initializeApp({ credential: cert(serviceAccount) })
        : initializeApp()
    : getApps()[0];

export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

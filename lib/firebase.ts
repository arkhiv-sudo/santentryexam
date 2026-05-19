import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

import { getFunctions } from "firebase/functions";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// TODO (FIX 17): Enable Firebase App Check for production
// 1. Go to Firebase Console → App Check
// 2. Register reCAPTCHA Enterprise site key
// 3. Add: import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
//    if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY) {
//      initializeAppCheck(app, {
//        provider: new ReCaptchaEnterpriseProvider(process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY!),
//        isTokenAutoRefreshEnabled: true,
//      });
//    }
// 4. Enforce in Firebase Console

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);

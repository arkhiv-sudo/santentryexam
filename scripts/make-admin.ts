import * as admin from 'firebase-admin';
import * as fs from 'fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
let privateKey = '';
let clientEmail = '';
let projectId = '';

for (const line of envFile.split('\n')) {
    if (line.startsWith('FIREBASE_PRIVATE_KEY=')) {
        privateKey = line.substring('FIREBASE_PRIVATE_KEY='.length).replace(/^"/, '').replace(/"$/, '').replace(/\\n/g, '\n');
    }
    if (line.startsWith('FIREBASE_CLIENT_EMAIL=')) {
        clientEmail = line.substring('FIREBASE_CLIENT_EMAIL='.length);
    }
    if (line.startsWith('NEXT_PUBLIC_FIREBASE_PROJECT_ID=')) {
        projectId = line.substring('NEXT_PUBLIC_FIREBASE_PROJECT_ID='.length);
    }
}

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: projectId,
            clientEmail: clientEmail,
            privateKey: privateKey,
        })
    });
}

const db = admin.firestore();
const auth = admin.auth();

async function makeAdmin() {
    const email = 'arkhiv@sant.school';
    let user;

    try {
        user = await auth.getUserByEmail(email);
        console.log("Хэрэглэгч олдлоо:", user.uid);
    } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
            console.log("Хэрэглэгч бүртгэлгүй байна. Шинээр үүсгэж байна...");
            user = await auth.createUser({
                email,
                password: 'password123',
                displayName: 'Admin Sant'
            });
            console.log("Шинэ хэрэглэгч үүсгэлээ:", user.uid);
        } else {
            console.error("Алдаа гарлаа:", e);
            process.exit(1);
        }
    }

    // Set custom claims
    await auth.setCustomUserClaims(user.uid, { role: 'admin' });
    console.log("Custom claims 'admin' тохирууллаа.");

    // Update Firestore
    await db.collection('users').doc(user.uid).set({
        email: user.email,
        role: 'admin',
        firstName: 'Admin',
        lastName: 'Sant',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    console.log("Firestore-д admin дата үүсгэж дууслаа!");
    console.log("Та 'arkhiv@sant.school' болон 'password123' (шинээр үүссэн бол) -р нэвтрэх боломжтой.");
    
    process.exit(0);
}

makeAdmin();

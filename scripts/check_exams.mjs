import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
const env = fs.readFileSync('.env.local', 'utf8');
const cfg = {};
for (const l of env.split('\n')) { const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) cfg[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
initializeApp({ credential: cert({ projectId: cfg.NEXT_PUBLIC_FIREBASE_PROJECT_ID, clientEmail: cfg.FIREBASE_CLIENT_EMAIL, privateKey: cfg.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')})});
const db = getFirestore();
const exams = await db.collection('exams').get();
console.log(`Нийт шалгалт: ${exams.size}`);
exams.forEach(d => console.log(`  ${d.id}: status=${d.data().status}, questionIds=${(d.data().questionIds||[]).length}`));
process.exit(0);

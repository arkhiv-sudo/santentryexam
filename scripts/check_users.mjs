import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const env = fs.readFileSync('.env.local', 'utf8');
const config = {};
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) config[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

initializeApp({
  credential: cert({
    projectId: config.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    clientEmail: config.FIREBASE_CLIENT_EMAIL,
    privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

console.log('=== ADMIN/TEACHER USERS ===');
const users = await db.collection('users')
  .where('role', 'in', ['admin', 'teacher'])
  .get();

if (users.empty) {
  console.log('  (Admin/teacher хэрэглэгч байхгүй)');
} else {
  users.forEach(d => {
    const u = d.data();
    console.log(`  ${d.id}  →  ${u.role.padEnd(7)}  ${u.lastName || ''} ${u.firstName || ''}  <${u.email || ''}>`);
  });
}

process.exit(0);

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

console.log('🔍 Бүх асуултыг ачаалж байна...');
const snap = await db.collection('questions').get();
console.log(`📊 Нийт: ${snap.size} асуулт\n`);

// Хэдэн нь reviewStatus-тэй байна?
let alreadyReviewed = 0;
let alreadyUnreviewed = 0;
let missing = 0;
snap.forEach(d => {
  const s = d.data().reviewStatus;
  if (s === 'reviewed') alreadyReviewed++;
  else if (s === 'unreviewed') alreadyUnreviewed++;
  else missing++;
});
console.log(`✓ Хянагдсан гэж тэмдэглэгдсэн: ${alreadyReviewed}`);
console.log(`⏳ Хянаагүй гэж тэмдэглэгдсэн: ${alreadyUnreviewed}`);
console.log(`⚠ Талбар байхгүй (default): ${missing}\n`);

console.log('🔄 Бүх асуултыг "unreviewed" болгож тэмдэглэж байна...');

let updated = 0;
const CHUNK = 400;
for (let i = 0; i < snap.docs.length; i += CHUNK) {
  const batch = db.batch();
  const chunk = snap.docs.slice(i, i + CHUNK);
  chunk.forEach(d => {
    batch.update(d.ref, {
      reviewStatus: 'unreviewed',
    });
  });
  await batch.commit();
  updated += chunk.length;
  console.log(`   ${updated}/${snap.size}`);
}

console.log(`\n✅ ${updated} асуулт "unreviewed" болсон.`);
console.log('📌 Багш засах эсвэл "Хянагдсан болгох" товчоор хянаж эхэлж болно.');

process.exit(0);

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

console.log('=== LESSONS (Хичээл) ===');
const lessons = await db.collection('lessons').get();
lessons.forEach(d => console.log(`  ${d.id}: ${d.data().name}`));
console.log(`Total: ${lessons.size}\n`);

console.log('=== SUBJECTS (Сэдэв) ===');
const subjects = await db.collection('subjects').get();
const byKey = {};
subjects.forEach(d => {
  const s = d.data();
  const key = `Grade=${s.gradeId || '?'} | Lesson=${s.lessonId || '?'}`;
  if (!byKey[key]) byKey[key] = [];
  byKey[key].push(`${s.name} (${d.id.slice(0,6)})`);
});
for (const [k, v] of Object.entries(byKey)) {
  console.log(`  ${k}`);
  v.forEach(x => console.log(`     - ${x}`));
}
console.log(`Total: ${subjects.size}\n`);

const qTotal = await db.collection('questions').count().get();
console.log(`Total questions: ${qTotal.data().count}`);
const eTotal = await db.collection('exams').count().get();
console.log(`Total exams: ${eTotal.data().count}`);

const users = await db.collection('users').get();
const byRole = {};
users.forEach(d => {
  const r = d.data().role || '?';
  byRole[r] = (byRole[r] || 0) + 1;
});
console.log('Users by role:', byRole);

process.exit(0);

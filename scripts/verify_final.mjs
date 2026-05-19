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
const MATH_LESSON_ID = '8H8MS4Y2laOONrY8JwIT';
const subjectMap = JSON.parse(fs.readFileSync('scripts/subjects_grade6_math.json', 'utf8'));

console.log('═══ 6-р анги, Математикийн өгөгдөл ═══\n');
const total = await db.collection('questions')
  .where('grade', '==', '6')
  .where('lessonId', '==', MATH_LESSON_ID)
  .count().get();
console.log(`📊 Нийт асуулт: ${total.data().count}\n`);

// Сэдэв тус бүрээр
console.log('Сэдэв тус бүрээр:');
const subjectEntries = Object.entries(subjectMap);
for (const [name, sid] of subjectEntries) {
  const c = await db.collection('questions').where('subject', '==', sid).count().get();
  console.log(`  ${c.data().count.toString().padStart(3)} — ${name}`);
}

// Хэлбэр тус бүрээр
console.log('\nХэлбэр тус бүрээр:');
for (const type of ['multiple_choice', 'input', 'fill_in_blank']) {
  const c = await db.collection('questions')
    .where('grade', '==', '6')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('type', '==', type)
    .count().get();
  if (c.data().count > 0) console.log(`  ${c.data().count.toString().padStart(3)} — ${type}`);
}

// Эх сурвалж тус бүрээр
console.log('\nЭх сурвалж тус бүрээр:');
const allQuestions = await db.collection('questions')
  .where('grade', '==', '6')
  .where('lessonId', '==', MATH_LESSON_ID)
  .select('sourceFile', 'mediaUrl')
  .get();
const bySource = {};
let withImages = 0;
allQuestions.forEach(d => {
  const s = d.data().sourceFile || '(хуучин)';
  bySource[s] = (bySource[s] || 0) + 1;
  if (d.data().mediaUrl) withImages++;
});
for (const [k, v] of Object.entries(bySource)) {
  console.log(`  ${v.toString().padStart(3)} — ${k}`);
}
console.log(`\n📷 Зурагтай асуулт: ${withImages}`);

process.exit(0);

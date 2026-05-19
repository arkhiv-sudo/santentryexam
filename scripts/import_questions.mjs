import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { QUESTIONS } from './questions_data.mjs';

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

// Subject ID map
const subjectMap = JSON.parse(fs.readFileSync('scripts/subjects_grade6_math.json', 'utf8'));
console.log('📋 Subject ID map:', Object.keys(subjectMap).length, 'сэдэв\n');

// Find admin uid (createdBy)
const adminUsers = await db.collection('users').where('role', '==', 'admin').limit(1).get();
const adminUid = adminUsers.empty ? 'system' : adminUsers.docs[0].id;
console.log(`👤 createdBy = ${adminUid}\n`);

// Импортын өмнө шалгах: subject map бүрэн эсэх
for (const q of QUESTIONS) {
  if (!subjectMap[q.subject]) {
    console.error(`❌ Subject not found: "${q.subject}" (${q.variant}-${q.number})`);
    process.exit(1);
  }
}

console.log('🚀 Асуултуудыг оруулж байна...\n');

let imported = 0, skipped = 0;
const batchSize = 100;
let batch = db.batch();
let inBatch = 0;

for (const q of QUESTIONS) {
  // Idempotent шалгалт — variant+number+subject ижил document байвал алгасна
  const dupCheck = await db.collection('questions')
    .where('grade', '==', '6')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('variant', '==', q.variant)
    .where('variantNumber', '==', q.number)
    .limit(1)
    .get();
  
  if (!dupCheck.empty) {
    skipped++;
    console.log(`⏭  ${q.variant}-${q.number} аль хэдийн байна`);
    continue;
  }

  const docRef = db.collection('questions').doc();
  const data = {
    type: 'multiple_choice',
    content: q.content,
    options: q.options,
    correctAnswer: q.correct,
    points: 3,
    subject: subjectMap[q.subject],
    lessonId: MATH_LESSON_ID,
    grade: '6',
    createdBy: adminUid,
    status: 'active',
    variant: q.variant,           // нэмэлт metadata
    variantNumber: q.number,
    createdAt: FieldValue.serverTimestamp(),
  };
  if (q.solution) data.solution = q.solution;

  batch.set(docRef, data);
  inBatch++;
  imported++;

  if (inBatch >= batchSize) {
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  }
}

if (inBatch > 0) await batch.commit();

console.log(`\n✅ Дууссан: ${imported} оруулсан, ${skipped} давхардлаар алгасан\n`);

// Шалгах
const finalCount = await db.collection('questions')
  .where('grade', '==', '6')
  .where('lessonId', '==', MATH_LESSON_ID)
  .count()
  .get();
console.log(`📊 Нийт асуулт (6-р анги, Математик): ${finalCount.data().count}`);

// Сэдэв бүрээр
console.log('\nСэдэв тус бүрд:');
for (const [name, sid] of Object.entries(subjectMap)) {
  const c = await db.collection('questions')
    .where('subject', '==', sid)
    .count()
    .get();
  console.log(`  ${c.data().count.toString().padStart(2)} — ${name}`);
}

process.exit(0);

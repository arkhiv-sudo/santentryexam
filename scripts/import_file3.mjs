import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { FILE3_QUESTIONS } from './file3_questions.mjs';

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

const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
const adminUid = admins.empty ? 'system' : admins.docs[0].id;

// Validate
for (let i = 0; i < FILE3_QUESTIONS.length; i++) {
  const q = FILE3_QUESTIONS[i];
  if (!subjectMap[q.subject]) {
    console.error(`❌ Subject not found: "${q.subject}" (Q${i+1})`);
    process.exit(1);
  }
}

let imported = 0, skipped = 0;
let batch = db.batch();
let inBatch = 0;

for (let i = 0; i < FILE3_QUESTIONS.length; i++) {
  const q = FILE3_QUESTIONS[i];
  const sourceTag = `file3-q${i+1}`;
  
  const dup = await db.collection('questions')
    .where('grade', '==', '6')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('sourceTag', '==', sourceTag)
    .limit(1).get();
  
  if (!dup.empty) { skipped++; continue; }
  
  const ref = db.collection('questions').doc();
  batch.set(ref, {
    type: 'input',
    content: q.content,
    correctAnswer: q.answer,
    points: 3,
    subject: subjectMap[q.subject],
    lessonId: MATH_LESSON_ID,
    grade: '6',
    createdBy: adminUid,
    status: 'active',
    sourceTag,
    sourceFile: '5_Анги_30_бодлого',
    createdAt: FieldValue.serverTimestamp(),
  });
  inBatch++; imported++;
  
  if (inBatch >= 100) {
    await batch.commit();
    batch = db.batch();
    inBatch = 0;
  }
}
if (inBatch > 0) await batch.commit();

console.log(`✅ File 3: ${imported} оруулсан, ${skipped} давхардлаар алгассан`);
process.exit(0);

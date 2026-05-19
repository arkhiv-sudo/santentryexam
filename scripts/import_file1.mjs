import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';
import { FILE1_QUESTIONS } from './file1_questions.mjs';

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
const imageUrls = JSON.parse(fs.readFileSync('scripts/image_urls.json', 'utf8'));

const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
const adminUid = admins.empty ? 'system' : admins.docs[0].id;

// Validate all subjects exist
for (let i = 0; i < FILE1_QUESTIONS.length; i++) {
  if (!subjectMap[FILE1_QUESTIONS[i].subject]) {
    console.error(`❌ Subject not found: "${FILE1_QUESTIONS[i].subject}" (Q${i+1})`);
    process.exit(1);
  }
}

let imported = 0, skipped = 0, missingImages = 0;
let batch = db.batch();
let inBatch = 0;

for (let i = 0; i < FILE1_QUESTIONS.length; i++) {
  const q = FILE1_QUESTIONS[i];
  const sourceTag = `file1-q${i+1}`;
  
  const dup = await db.collection('questions')
    .where('grade', '==', '6')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('sourceTag', '==', sourceTag)
    .limit(1).get();
  
  if (!dup.empty) { skipped++; continue; }
  
  const data = {
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
    sourceFile: '5 Бодлогын сан-1',
    createdAt: FieldValue.serverTimestamp(),
  };
  
  // Зургийн URL нэмнэ (нэг эсвэл хэд хэдэн)
  const allImageKeys = [];
  if (q.imageKey) allImageKeys.push(q.imageKey);
  if (q.imageKeys) allImageKeys.push(...q.imageKeys);
  
  const validUrls = allImageKeys.map(k => imageUrls[k]).filter(Boolean);
  if (validUrls.length > 0) {
    data.mediaUrl = validUrls[0];
    data.mediaType = 'image';
    if (validUrls.length > 1) {
      data.extraImageUrls = validUrls.slice(1);
    }
  } else if (allImageKeys.length > 0) {
    missingImages++;
  }
  
  if (q.note) data.correctionNote = q.note;
  
  const ref = db.collection('questions').doc();
  batch.set(ref, data);
  inBatch++; imported++;
  
  if (inBatch >= 100) { await batch.commit(); batch = db.batch(); inBatch = 0; }
}
if (inBatch > 0) await batch.commit();

console.log(`✅ File 1: ${imported} оруулсан, ${skipped} давхардсан`);
console.log(`   📷 Зурагтай: ${FILE1_QUESTIONS.filter(q => q.imageKey || q.imageKeys).length}`);
if (missingImages > 0) console.log(`   ⚠️  ${missingImages} зургийн URL олдсонгүй`);
process.exit(0);

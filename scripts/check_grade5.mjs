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

// Lessons
console.log('=== LESSONS ===');
const lessons = await db.collection('lessons').get();
lessons.forEach(d => console.log(`  ${d.id}  →  ${d.data().name}`));

// Grades
console.log('\n=== GRADES ===');
const grades = await db.collection('grades').get();
grades.forEach(d => console.log(`  ${d.id}  →  ${JSON.stringify(d.data())}`));

// Existing subjects for grade 5 + Math
console.log('\n=== SUBJECTS (5-р анги, Математик) ===');
const MATH_LESSON_ID = '8H8MS4Y2laOONrY8JwIT';
const subjects = await db.collection('subjects')
  .where('lessonId', '==', MATH_LESSON_ID)
  .where('gradeId', '==', '5')
  .get();
if (subjects.empty) {
  console.log('  (Сэдэв байхгүй)');
} else {
  subjects.forEach(d => console.log(`  ${d.id}  →  ${d.data().name}`));
}

process.exit(0);

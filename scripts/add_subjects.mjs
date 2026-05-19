import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

const newSubjects = [
  { name: 'Масштаб', order: 10 },
  { name: 'Комбинаторик, логик', order: 11 },
];

for (const s of newSubjects) {
  const dup = await db.collection('subjects')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('gradeId', '==', '6')
    .where('name', '==', s.name)
    .limit(1).get();
  if (!dup.empty) {
    console.log(`⏭  Аль хэдийн байна: ${s.name}`);
    continue;
  }
  const ref = db.collection('subjects').doc();
  await ref.set({
    name: s.name,
    gradeId: '6',
    lessonId: MATH_LESSON_ID,
    order: s.order,
    createdAt: FieldValue.serverTimestamp(),
  });
  console.log(`✨ ${s.name}  →  ${ref.id}`);
}

// ID map шинэчлэх
const all = await db.collection('subjects')
  .where('lessonId', '==', MATH_LESSON_ID)
  .where('gradeId', '==', '6')
  .get();
const idMap = {};
all.forEach(d => { idMap[d.data().name] = d.id; });
fs.writeFileSync('scripts/subjects_grade6_math.json', JSON.stringify(idMap, null, 2));
console.log(`\n📋 Нийт ${all.size} сэдэв (subjects_grade6_math.json шинэчлэгдсэн)`);

process.exit(0);

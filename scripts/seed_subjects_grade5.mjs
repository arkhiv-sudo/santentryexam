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
const GRADE = '5';

// 5-р ангийн Математикийн 4 сэдэв (LaTeX файлаас)
const newSubjects = [
  'Тэгшитгэл',
  'Геометр',
  'Хөдөлгөөний бодлого',
  'Өгүүлбэртэй бодлого',
];

console.log(`📚 ${GRADE}-р ангийн Математикт сэдэв үүсгэж байна...`);

const createBatch = db.batch();
const created = [];
let skipped = 0;

for (let i = 0; i < newSubjects.length; i++) {
  const name = newSubjects[i];
  // idempotent — өмнө байгаа эсэхийг шалгана
  const existQuery = await db.collection('subjects')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('gradeId', '==', GRADE)
    .where('name', '==', name)
    .limit(1)
    .get();

  if (!existQuery.empty) {
    console.log(`   ⏭  Аль хэдийн байна: ${name}`);
    created.push({ id: existQuery.docs[0].id, name });
    skipped++;
    continue;
  }

  const newRef = db.collection('subjects').doc();
  createBatch.set(newRef, {
    name,
    gradeId: GRADE,
    lessonId: MATH_LESSON_ID,
    order: i + 1,
    createdAt: FieldValue.serverTimestamp(),
  });
  created.push({ id: newRef.id, name });
  console.log(`   ✨ ${name}  →  ${newRef.id.slice(0, 8)}...`);
}

if (created.length - skipped > 0) {
  await createBatch.commit();
}

console.log(`\n✅ ${created.length - skipped} шинэ сэдэв үүсгэгдлээ. (${skipped} аль хэдийн байсан)\n`);

// Үр дүнг харуулах
console.log('=== ҮР ДҮН ===');
const final = await db.collection('subjects')
  .where('lessonId', '==', MATH_LESSON_ID)
  .where('gradeId', '==', GRADE)
  .get();
console.log(`${GRADE}-р анги, Математик — нийт ${final.size} сэдэв:`);
final.docs.sort((a, b) => (a.data().order || 99) - (b.data().order || 99))
  .forEach((d, i) => console.log(`  ${i + 1}. ${d.data().name}  (${d.id})`));

// JSON хадгалах — дараагийн алхамд (асуулт оруулахад) ID-ыг ашиглах
const idMap = {};
final.forEach(d => { idMap[d.data().name] = d.id; });
fs.writeFileSync('scripts/subjects_grade5_math.json', JSON.stringify(idMap, null, 2));
console.log('\n💾 ID map хадгалагдсан: scripts/subjects_grade5_math.json');

process.exit(0);

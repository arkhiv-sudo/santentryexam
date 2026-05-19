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

// ── 1. Жишээ сэдвүүдийг устгах ──────────────────────────────────────
console.log('🗑  Жишээ сэдвүүдийг устгаж байна...');
const existing = await db.collection('subjects')
  .where('lessonId', '==', MATH_LESSON_ID)
  .get();

let deletedCount = 0;
const batch = db.batch();
existing.forEach(doc => {
  const name = doc.data().name || '';
  // "Жишээ сэдэв" нэртэйг л устгана (аюулгүй гэдэгт итгэхийн тулд)
  if (name.includes('Жишээ сэдэв')) {
    batch.delete(doc.ref);
    deletedCount++;
    console.log(`   - Устгах: ${name} (Grade ${doc.data().gradeId})`);
  }
});
if (deletedCount > 0) {
  await batch.commit();
  console.log(`✅ ${deletedCount} жишээ сэдэв устгагдлаа.\n`);
} else {
  console.log('   (Устгах сэдэв олдсонгүй)\n');
}

// ── 2. 6-р ангийн математикийн 9 сэдэв оруулах ──────────────────────
console.log('📚 6-р ангийн Математикт сэдэв үүсгэж байна...');
const newSubjects = [
  'Тоон олонлог, зэрэг, язгуур',
  'Энгийн ба аравтын бутархай, тоймлох',
  'Процент, харьцаа, пропорц',
  'Алгебрийн илэрхийлэл, тэгшитгэл',
  'Дараалал, функц',
  'Өнцөг, дүрс, биет',
  'Байршил, хөдөлгөөн',
  'Хэмжигдэхүүн',
  'Магадлал, статистик',
];

const createBatch = db.batch();
const created = [];
for (let i = 0; i < newSubjects.length; i++) {
  const name = newSubjects[i];
  // idempotent — өмнө байгаа эсэхийг шалгана
  const existQuery = await db.collection('subjects')
    .where('lessonId', '==', MATH_LESSON_ID)
    .where('gradeId', '==', '6')
    .where('name', '==', name)
    .limit(1)
    .get();
  
  if (!existQuery.empty) {
    console.log(`   ⏭  Аль хэдийн байна: ${name}`);
    created.push({ id: existQuery.docs[0].id, name });
    continue;
  }
  
  const newRef = db.collection('subjects').doc();
  createBatch.set(newRef, {
    name,
    gradeId: '6',
    lessonId: MATH_LESSON_ID,
    order: i + 1,
    createdAt: FieldValue.serverTimestamp(),
  });
  created.push({ id: newRef.id, name });
  console.log(`   ✨ ${name}  →  ${newRef.id.slice(0, 8)}...`);
}
await createBatch.commit();

console.log(`\n✅ ${created.length} сэдэв үүсгэгдлээ.\n`);

// ── 3. Ийнхүү гарсан үр дүнг харуулах ───────────────────────────────
console.log('=== ҮР ДҮН ===');
const final = await db.collection('subjects')
  .where('lessonId', '==', MATH_LESSON_ID)
  .where('gradeId', '==', '6')
  .get();
console.log(`6-р анги, Математик — нийт ${final.size} сэдэв:`);
final.docs.sort((a, b) => (a.data().order || 99) - (b.data().order || 99))
  .forEach((d, i) => console.log(`  ${i + 1}. ${d.data().name}`));

// JSON хадгалах — дараагийн алхамд (асуулт оруулахад) ID-ыг ашиглах
const idMap = {};
final.forEach(d => { idMap[d.data().name] = d.id; });
fs.writeFileSync('scripts/subjects_grade6_math.json', JSON.stringify(idMap, null, 2));
console.log('\n💾 ID map хадгалагдсан: scripts/subjects_grade6_math.json');

process.exit(0);

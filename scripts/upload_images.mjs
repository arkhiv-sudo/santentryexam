import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import fs from 'fs';
import path from 'path';

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
  storageBucket: config.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const bucket = getStorage().bucket();

// Хоёр source хавтасны зургуудыг шалгана
const dirs = [
  '/tmp/zip_inspect/2e23c7be-a357-43c0-8e50-2fff5a10b3fa/images',
  '/tmp/zip_inspect/6da1c9ac-9576-41f6-a2c1-ca279ab83b4b/images',
];

const urlMap = {};
let uploaded = 0;
let skipped = 0;

for (const dir of dirs) {
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
  console.log(`📁 ${dir.split('/').slice(-2).join('/')}: ${files.length} зураг`);
  
  for (const f of files) {
    const localPath = path.join(dir, f);
    const destPath = `questions/grade6_math/${f}`;
    
    // Аль хэдийн байгаа эсэхийг шалгана
    const [exists] = await bucket.file(destPath).exists();
    
    if (!exists) {
      await bucket.upload(localPath, {
        destination: destPath,
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
      uploaded++;
    } else {
      skipped++;
    }
    
    // public URL
    await bucket.file(destPath).makePublic().catch(() => {});
    const url = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
    
    // Зургийн нэр (өргөтгөлгүй) → URL
    const key = f.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    urlMap[key] = url;
  }
}

fs.writeFileSync('scripts/image_urls.json', JSON.stringify(urlMap, null, 2));
console.log(`\n✅ Дууссан: ${uploaded} шинээр upload, ${skipped} аль хэдийн байсан`);
console.log(`📋 ${Object.keys(urlMap).length} URL хадгалагдсан: scripts/image_urls.json`);

process.exit(0);

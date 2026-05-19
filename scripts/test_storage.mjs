import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
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
  storageBucket: config.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
});

const bucket = getStorage().bucket();
console.log('Bucket:', bucket.name);
const [files] = await bucket.getFiles({ maxResults: 5 });
console.log(`✅ Storage idэвхтэй. ${files.length} файл харуулсан`);
process.exit(0);

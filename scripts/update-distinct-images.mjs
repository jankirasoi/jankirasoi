import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import https from 'node:https';
import { PrismaClient } from '../apps/api/node_modules/@prisma/client/default.js';

// 1. Read .env
const envPath = path.resolve(process.cwd(), '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
}

const CLOUDINARY_CLOUD_NAME = env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = env.CLOUDINARY_API_SECRET;
const DATABASE_URL = env.DATABASE_URL;

if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
  console.error('Missing CLOUDINARY credentials in .env');
  process.exit(1);
}

process.env.DATABASE_URL = DATABASE_URL;

async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'JankiRasoiApp/1.0 (culinary@jankirasoi.in)' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, destPath).then(resolve).catch(reject);
          return;
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
        }
        res.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }
    );
    req.on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

async function uploadToCloudinary(filePath, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = 'jankirasoi/menu';
  const toSign = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${CLOUDINARY_API_SECRET}`;
  const signature = crypto.createHash('sha1').update(toSign).digest('hex');

  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
  const formData = new FormData();
  formData.append('file', blob, path.basename(filePath));
  formData.append('api_key', CLOUDINARY_API_KEY);
  formData.append('timestamp', timestamp.toString());
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('signature', signature);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Cloudinary upload error (${res.status}): ${errorText}`);
  }

  const json = await res.json();
  console.log(`Uploaded ${publicId} -> ${json.secure_url}`);
  return json.secure_url;
}

const brainDir = '/home/unshakensoul/.gemini/antigravity-cli/brain/bca6528b-3fcc-4f8d-88e6-c01acc985a5d';

async function main() {
  console.log('--- Step 1: Downloading distinct dish images ---');
  const tempDownloads = [
    {
      key: 'plain_paratha',
      url: 'https://upload.wikimedia.org/wikipedia/commons/1/1e/Triangle_paratha_%28cropped%29.JPG',
      dest: '/tmp/dish_plain_paratha.jpg',
    },
    {
      key: 'aloo_paratha',
      url: 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Aloo_Paratha.jpg',
      dest: '/tmp/dish_aloo_paratha.jpg',
    },
    {
      key: 'paneer_paratha',
      url: 'https://upload.wikimedia.org/wikipedia/commons/3/34/Paneer_Parantha_%28cropped%29.jpg',
      dest: '/tmp/dish_paneer_paratha.jpg',
    },
    {
      key: 'indori_poha',
      url: 'https://upload.wikimedia.org/wikipedia/commons/7/7c/Kanda_poha.jpg',
      dest: '/tmp/dish_indori_poha.jpg',
    },
    {
      key: 'jeera_rice',
      url: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Jeera_Rice.jpg',
      dest: '/tmp/dish_jeera_rice.jpg',
    },
    {
      key: 'chana_masala',
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/8e/Chana_masala.jpg',
      dest: '/tmp/dish_chana_masala.jpg',
    },
  ];

  for (const item of tempDownloads) {
    try {
      console.log(`Downloading ${item.key}...`);
      await downloadFile(item.url, item.dest);
      console.log(`Saved ${item.key} to ${item.dest}`);
    } catch (e) {
      console.error(`Failed downloading ${item.key}:`, e.message);
    }
  }

  console.log('\n--- Step 2: Uploading newly distinct images to Cloudinary ---');
  const newUploaded = {};

  // Upload the newly generated Sev Paratha
  const sevParathaPath = `${brainDir}/sev_paratha_1793530603676.jpg`;
  if (fs.existsSync(sevParathaPath)) {
    newUploaded['sev_paratha'] = await uploadToCloudinary(sevParathaPath, 'dish_sev_paratha_distinct');
  }

  // Upload downloaded images
  for (const item of tempDownloads) {
    if (fs.existsSync(item.dest)) {
      try {
        newUploaded[item.key] = await uploadToCloudinary(item.dest, `dish_${item.key}_distinct`);
      } catch (err) {
        console.error(`Upload error for ${item.key}:`, err.message);
      }
    }
  }

  console.log('\n--- Step 3: Updating Supabase database with distinct images ---');
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  const slugImageMap = {
    'plain-paratha': newUploaded['plain_paratha'],
    'sev-paratha': newUploaded['sev_paratha'],
    'aloo-paratha': newUploaded['aloo_paratha'],
    'paneer-paratha': newUploaded['paneer_paratha'],
    'indori-poha-special-nashta': newUploaded['indori_poha'],
    'jeera-rice': newUploaded['jeera_rice'],
    'chana-masala': newUploaded['chana_masala'],
  };

  for (const [slug, imgUrl] of Object.entries(slugImageMap)) {
    if (!imgUrl) continue;
    const updated = await prisma.product.updateMany({
      where: { slug },
      data: { imageUrl: imgUrl },
    });
    console.log(`Updated ${slug} -> ${imgUrl} (${updated.count} row updated)`);
  }

  console.log('\n✅ All distinct images updated successfully in database!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

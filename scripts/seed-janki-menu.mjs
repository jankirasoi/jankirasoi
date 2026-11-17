import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
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

if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  process.exit(1);
}

process.env.DATABASE_URL = DATABASE_URL;

// Direct Cloudinary Uploader
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

const imageMap = {
  special_thali: `${brainDir}/special_thali_1793529256637.jpg`,
  dal_bati_thali: `${brainDir}/dal_bati_thali_1793529334228.jpg`,
  sadi_thali: `${brainDir}/sadi_thali_1793529346751.jpg`,
  shahi_paneer: `${brainDir}/shahi_paneer_1793529353979.jpg`,
  kadhai_paneer: `${brainDir}/kadhai_paneer_1793529374643.jpg`,
  sev_tamatar: `${brainDir}/sev_tamatar_1793529380682.jpg`,
  dal_tadka: `${brainDir}/dal_tadka_1793529399797.jpg`,
  aloo_gobhi: `${brainDir}/aloo_gobhi_1793529398606.jpg`,
  matar_pulao: `${brainDir}/matar_pulao_1793529433111.jpg`,
  golden_finger_chips: `${brainDir}/golden_finger_chips_1793529433117.jpg`,
  tawa_paratha: `${brainDir}/golden_tawa_paratha_1793529436462.jpg`,
  gud_ki_chai: `${brainDir}/gud_ki_chai_kulhad_1793529436190.jpg`,
};

async function main() {
  console.log('--- Step 1: Uploading Images to Cloudinary ---');
  const uploadedUrls = {};

  for (const [key, filePath] of Object.entries(imageMap)) {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      continue;
    }
    try {
      const url = await uploadToCloudinary(filePath, `dish_${key}`);
      uploadedUrls[key] = url;
    } catch (err) {
      console.error(`Failed uploading ${key}:`, err.message);
    }
  }

  console.log('--- Step 2: Initializing Prisma Client ---');
  const prisma = new PrismaClient({
    datasources: { db: { url: DATABASE_URL } },
  });

  console.log('--- Step 3: Cleaning Existing Menu in Database ---');
  await prisma.productServiceDateAvailability.deleteMany({});
  await prisma.productAddonGroup.deleteMany({});
  await prisma.productVariant.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.menuCategory.deleteMany({});
  console.log('Cleaned old menu data successfully.');

  console.log('--- Step 4: Creating Menu Categories ---');
  const categoriesData = [
    {
      id: 'cat_thalis',
      name: 'Homestyle Thalis (भर पेट भोजन)',
      slug: 'homestyle-thalis',
      description: 'Complete wholesome North Indian and Malwa homestyle thalis cooked fresh with pure ingredients.',
      displayOrder: 1,
    },
    {
      id: 'cat_sabzi_paneer',
      name: 'Paneer & Main Sabzi (पनीर व सब्जी)',
      slug: 'paneer-main-sabzi',
      description: 'Rich shahi paneer delicacies and homestyle desi sabzis cooked in aromatic spices.',
      displayOrder: 2,
    },
    {
      id: 'cat_dals',
      name: 'Homestyle Dals (दाल तड़का व फ्राई)',
      slug: 'homestyle-dals',
      description: 'Slow-cooked comforting lentils tempered with pure ghee, toasted cumin, and garlic.',
      displayOrder: 3,
    },
    {
      id: 'cat_rice_pulao',
      name: 'Rice & Pulao (चावल व पुलाव)',
      slug: 'rice-pulao',
      description: 'Fluffy steamed basmati rice and aromatic homestyle vegetable pulao.',
      displayOrder: 4,
    },
    {
      id: 'cat_parathas',
      name: 'Tawa Parathas (गरमा-गरम पराठे)',
      slug: 'tawa-parathas',
      description: 'Crispy homestyle stuffed and plain tawa parathas roasted with pure desi butter/ghee.',
      displayOrder: 5,
    },
    {
      id: 'cat_snacks_beverages',
      name: 'Snacks & Chai (नाश्ता व चाय)',
      slug: 'snacks-beverages',
      description: 'Hot all-day crispy snacks and authentic kulhad wali gud ki chai.',
      displayOrder: 6,
    },
  ];

  const categories = {};
  for (const cat of categoriesData) {
    const created = await prisma.menuCategory.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        displayOrder: cat.displayOrder,
        isActive: true,
      },
    });
    categories[cat.slug] = created;
    console.log(`Created Category: ${created.name} (${created.id})`);
  }

  console.log('--- Step 5: Seeding All 31 Menu Dishes ---');
  const products = [
    // 1. Thalis
    {
      categorySlug: 'homestyle-thalis',
      name: 'Special Thali (भर पेट)',
      slug: 'special-thali-bhar-pet',
      description: 'Complete unlimited homestyle feast: Paneer Sabzi, Dal Fry, Jeera Rice, 4 Butter Roti, Raita, Salad & Sweet.',
      price: 15000,
      image: uploadedUrls.special_thali,
      displayOrder: 1,
    },
    {
      categorySlug: 'homestyle-thalis',
      name: 'Dal Bati Thali (दाल-बाटी थाली)',
      slug: 'dal-bati-thali',
      description: 'Traditional Malwa special: 4 Crispy Bafla/Bati dipped in pure desi ghee, Panchmel Dal, Churma/Laddoo & spicy Garlic Chutney.',
      price: 15000,
      image: uploadedUrls.dal_bati_thali,
      displayOrder: 2,
    },
    {
      categorySlug: 'homestyle-thalis',
      name: 'Sadi Thali (सादी थाली)',
      slug: 'sadi-thali',
      description: 'Wholesome daily homestyle meal: Seasonal Sabzi, Yellow Dal, Steamed Rice, 4 Fresh Phulkas & Salad.',
      price: 8000,
      image: uploadedUrls.sadi_thali,
      displayOrder: 3,
    },

    // 2. Paneer & Main Course Sabzi
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Shahi Paneer',
      slug: 'shahi-paneer',
      description: 'Tender paneer cubes simmered in a silky, rich cashew-tomato and cream gravy with mild aromatic spices.',
      price: 14000,
      image: uploadedUrls.shahi_paneer,
      displayOrder: 10,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Kadhai Paneer',
      slug: 'kadhai-paneer',
      description: 'Paneer tossed with crunchy bell peppers, onions, and freshly roasted whole spices in a robust tomato masala.',
      price: 14000,
      image: uploadedUrls.kadhai_paneer,
      displayOrder: 11,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Matar Paneer',
      slug: 'matar-paneer',
      description: 'Classic North Indian homestyle curry with fresh green peas and soft paneer in spiced onion-tomato gravy.',
      price: 12000,
      image: uploadedUrls.kadhai_paneer,
      displayOrder: 12,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Paneer Masala',
      slug: 'paneer-masala',
      description: 'Fresh cottage cheese cooked in a spicy, flavorful dhaba-style bhuna onion gravy.',
      price: 12000,
      image: uploadedUrls.shahi_paneer,
      displayOrder: 13,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Sev Tamatar',
      slug: 'sev-tamatar',
      description: 'Authentic tangy and spicy tomato gravy topped with crispy Ratlami sev and fresh coriander.',
      price: 8000,
      image: uploadedUrls.sev_tamatar,
      displayOrder: 14,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Sev Masala',
      slug: 'sev-masala',
      description: 'Sev cooked in a richly spiced homestyle onion and ginger-garlic curry.',
      price: 8000,
      image: uploadedUrls.sev_tamatar,
      displayOrder: 15,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Sev Bhaji',
      slug: 'sev-bhaji',
      description: 'Traditional Dhaba style thick and spicy sev curry with green chillies and roasted spices.',
      price: 8000,
      image: uploadedUrls.sev_tamatar,
      displayOrder: 16,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Mix Sabzi',
      slug: 'mix-sabzi',
      description: 'Melange of fresh farm vegetables sautéed dry with cumin, turmeric, and Indian garam masala.',
      price: 8000,
      image: uploadedUrls.aloo_gobhi,
      displayOrder: 17,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Aloo Gobhi',
      slug: 'aloo-gobhi',
      description: 'Tender florets of cauliflower and potatoes roasted with ginger, green chillies, and fragrant spices.',
      price: 8000,
      image: uploadedUrls.aloo_gobhi,
      displayOrder: 18,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Aloo Matar',
      slug: 'aloo-matar',
      description: 'Homestyle comfort curry featuring golden potatoes and sweet green peas in light tomato gravy.',
      price: 8000,
      image: uploadedUrls.aloo_gobhi,
      displayOrder: 19,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Aloo Tamatar',
      slug: 'aloo-tamatar',
      description: 'Soothing spiced potato curry cooked in fresh country tomato gravy with roasted cumin.',
      price: 8000,
      image: uploadedUrls.aloo_gobhi,
      displayOrder: 20,
    },
    {
      categorySlug: 'paneer-main-sabzi',
      name: 'Chana Masala',
      slug: 'chana-masala',
      description: 'Wholesome chickpeas simmered in a tangy pomegranate, amchur, and spiced onion gravy.',
      price: 8000,
      image: uploadedUrls.aloo_gobhi,
      displayOrder: 21,
    },

    // 3. Homestyle Dals
    {
      categorySlug: 'homestyle-dals',
      name: 'Dal Tadka',
      slug: 'dal-tadka',
      description: 'Yellow arhar dal tempered with sizzling desi ghee, crunchy garlic, cumin seeds, and dry red chillies.',
      price: 8000,
      image: uploadedUrls.dal_tadka,
      displayOrder: 30,
    },
    {
      categorySlug: 'homestyle-dals',
      name: 'Dal Fry',
      slug: 'dal-fry',
      description: 'Homestyle lentils pan-fried with finely chopped onions, juicy tomatoes, ginger, and green chillies.',
      price: 8000,
      image: uploadedUrls.dal_tadka,
      displayOrder: 31,
    },
    {
      categorySlug: 'homestyle-dals',
      name: 'Jeera Dal',
      slug: 'jeera-dal',
      description: 'Light and soothing comfort dal tempered with golden toasted roasted cumin and a hint of hing.',
      price: 8000,
      image: uploadedUrls.dal_tadka,
      displayOrder: 32,
    },
    {
      categorySlug: 'homestyle-dals',
      name: 'Urad Chana Dal',
      slug: 'urad-chana-dal',
      description: 'Hearty protein-packed combination of black split urad and chana dal slow-cooked to perfection.',
      price: 8000,
      image: uploadedUrls.dal_tadka,
      displayOrder: 33,
    },
    {
      categorySlug: 'homestyle-dals',
      name: 'Mix Dal',
      slug: 'mix-dal',
      description: 'Traditional Panchmel blend of 5 healthy lentils seasoned with village-style rustic spices.',
      price: 8000,
      image: uploadedUrls.dal_tadka,
      displayOrder: 34,
    },

    // 4. Rice & Pulao
    {
      categorySlug: 'rice-pulao',
      name: 'Matar Pulao',
      slug: 'matar-pulao',
      description: 'Aromatic long-grain basmati rice cooked with sweet garden peas and fragrant whole spices.',
      price: 8000,
      image: uploadedUrls.matar_pulao,
      displayOrder: 40,
    },
    {
      categorySlug: 'rice-pulao',
      name: 'Jeera Rice',
      slug: 'jeera-rice',
      description: 'Basmati rice gently tossed in pure ghee and crackling cumin seeds with fresh coriander.',
      price: 6000,
      image: uploadedUrls.matar_pulao,
      displayOrder: 41,
    },
    {
      categorySlug: 'rice-pulao',
      name: 'Plain Rice',
      slug: 'plain-rice',
      description: 'Steamed fluffy grains of premium basmati rice, light on the stomach.',
      price: 6000,
      image: uploadedUrls.matar_pulao,
      displayOrder: 42,
    },

    // 5. Fresh Parathas
    {
      categorySlug: 'tawa-parathas',
      name: 'Paneer Paratha',
      slug: 'paneer-paratha',
      description: 'Crispy golden tawa paratha stuffed generously with spiced crumbled paneer and fresh herbs.',
      price: 2500,
      image: uploadedUrls.tawa_paratha,
      displayOrder: 50,
    },
    {
      categorySlug: 'tawa-parathas',
      name: 'Sev Paratha',
      slug: 'sev-paratha',
      description: 'Indori special crispy paratha stuffed with spicy seasoned crunchy sev and onions.',
      price: 2500,
      image: uploadedUrls.tawa_paratha,
      displayOrder: 51,
    },
    {
      categorySlug: 'tawa-parathas',
      name: 'Aloo Paratha',
      slug: 'aloo-paratha',
      description: 'Piping hot tawa paratha stuffed with savory mashed potatoes, coriander, and green chillies.',
      price: 2500,
      image: uploadedUrls.tawa_paratha,
      displayOrder: 52,
    },
    {
      categorySlug: 'tawa-parathas',
      name: 'Gobhi Paratha',
      slug: 'gobhi-paratha',
      description: 'Fresh grated cauliflower seasoned with carom seeds (ajwain) and roasted to golden perfection.',
      price: 2500,
      image: uploadedUrls.tawa_paratha,
      displayOrder: 53,
    },
    {
      categorySlug: 'tawa-parathas',
      name: 'Plain Paratha',
      slug: 'plain-paratha',
      description: 'Layered triangular tawa paratha roasted with pure ghee, crispy on outside and soft inside.',
      price: 1500,
      image: uploadedUrls.tawa_paratha,
      displayOrder: 54,
    },

    // 6. Snacks & Beverages
    {
      categorySlug: 'snacks-beverages',
      name: 'Finger Chips',
      slug: 'finger-chips',
      description: 'Crispy golden potato finger chips served hot with savory seasoning and tangy tomato dip.',
      price: 8000,
      image: uploadedUrls.golden_finger_chips,
      displayOrder: 60,
    },
    {
      categorySlug: 'snacks-beverages',
      name: 'Special Nashta - Indori Poha',
      slug: 'indori-poha-special-nashta',
      description: 'Authentic steamed Indori poha topped with Jeeravan masala, Ratlami sev, chopped onions, and lemon.',
      price: 4000,
      image: uploadedUrls.golden_finger_chips,
      displayOrder: 61,
    },
    {
      categorySlug: 'snacks-beverages',
      name: 'Gud Ki Chai',
      slug: 'gud-ki-chai',
      description: 'Signature aromatic village-style tea brewed with pure organic jaggery, cardamom, and fresh ginger in a kulhad.',
      price: 2000,
      image: uploadedUrls.gud_ki_chai,
      displayOrder: 62,
    },
  ];

  for (const item of products) {
    const cat = categories[item.categorySlug];
    if (!cat) {
      console.warn(`Category not found for slug: ${item.categorySlug}`);
      continue;
    }

    const createdProduct = await prisma.product.create({
      data: {
        categoryId: cat.id,
        name: item.name,
        slug: item.slug,
        description: item.description,
        dietaryType: 'VEG',
        imageUrl: item.image,
        basePricePaise: item.price,
        taxRatePercent: 5,
        isActive: true,
        displayOrder: item.displayOrder,
        variants: {
          create: [
            {
              name: 'Standard Portion',
              priceModifierPaise: 0,
              isDefault: true,
              isActive: true,
              displayOrder: 0,
            },
          ],
        },
      },
    });

    console.log(`Created Dish: ${createdProduct.name} - ₹${createdProduct.basePricePaise / 100} -> ${item.image ? 'Image OK' : 'No Image'}`);
  }

  const totalCount = await prisma.product.count();
  console.log(`\n✅ Finished successfully! Total active products in database: ${totalCount}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

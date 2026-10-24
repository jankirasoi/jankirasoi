import * as fs from 'fs';
import * as path from 'path';

function loadLocalEnv() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          process.env[key] = val;
        }
      }
    }
  }
}
loadLocalEnv();

import { PrismaClient, UserRole, DietaryType, MealType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Janki Rasoi Database Seed...');

  // 1. Seed Super Admin
  const adminPasswordHash = await bcrypt.hash('AdminPassword123!', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jankirasoi.in' },
    update: { passwordHash: adminPasswordHash },
    create: {
      email: 'admin@jankirasoi.in',
      phone: '9876543210',
      passwordHash: adminPasswordHash,
      name: 'Janki Rasoi Admin',
      role: UserRole.ADMIN,
      isActive: true,
    },
  });
  console.log(`👤 Super Admin verified: ${admin.email}`);

  // 2. Seed Delivery Rider
  const riderPasswordHash = await bcrypt.hash('RiderPassword123!', 10);
  const riderUser = await prisma.user.upsert({
    where: { phone: '9811223344' },
    update: { passwordHash: riderPasswordHash },
    create: {
      phone: '9811223344',
      passwordHash: riderPasswordHash,
      name: 'Amit Sharma (Rider)',
      role: UserRole.RIDER,
      isActive: true,
      riderProfile: {
        create: {
          vehicleNumber: 'DL-01-AB-1234',
          isAvailable: true,
        },
      },
    },
  });
  console.log(`🛵 Sample Rider verified: ${riderUser.name} (${riderUser.phone})`);

  // 3. Seed Delivery Zones (Delhi NCR & Sagore)
  const zones = [
    {
      name: 'Sagore / Pithampur - Main Kitchen Zone (<5km)',
      pincode: '454774',
      minOrderPaise: 0,
      deliveryFeePaise: 0,
      freeDeliveryThresholdPaise: 0,
    },
    {
      name: 'Pithampur Outer / Industrial Area (5-15km)',
      pincode: '454775',
      minOrderPaise: 0,
      deliveryFeePaise: 3500,
      freeDeliveryThresholdPaise: 0,
    },
    {
      name: 'South Delhi - Malviya Nagar & Saket',
      pincode: '110017',
      minOrderPaise: 9900,
      deliveryFeePaise: 3000,
      freeDeliveryThresholdPaise: 29900,
    },
    {
      name: 'South Delhi - Hauz Khas & Green Park',
      pincode: '110016',
      minOrderPaise: 9900,
      deliveryFeePaise: 3500,
      freeDeliveryThresholdPaise: 29900,
    },
    {
      name: 'South Delhi - Kalkaji & Nehru Place',
      pincode: '110019',
      minOrderPaise: 9900,
      deliveryFeePaise: 4000,
      freeDeliveryThresholdPaise: 29900,
    },
    {
      name: 'Central Delhi - South Extension',
      pincode: '110049',
      minOrderPaise: 9900,
      deliveryFeePaise: 3500,
      freeDeliveryThresholdPaise: 29900,
    },
  ];

  for (const z of zones) {
    await prisma.deliveryZone.upsert({
      where: { pincode: z.pincode },
      update: z,
      create: z,
    });
  }
  console.log(`📍 Seeded ${zones.length} delivery zones.`);

  // 4. Seed Delivery Slots
  const slots = [
    {
      mealType: MealType.LUNCH,
      label: 'Lunch (12:30 PM - 01:30 PM)',
      startTime: '12:30',
      endTime: '13:30',
      cutoffTime: '11:00',
      defaultCapacity: 35,
    },
    {
      mealType: MealType.DINNER,
      label: 'Dinner (07:30 PM - 08:30 PM)',
      startTime: '19:30',
      endTime: '20:30',
      cutoffTime: '18:00',
      defaultCapacity: 35,
    },
  ];

  for (const s of slots) {
    const existing = await prisma.deliverySlot.findFirst({
      where: { mealType: s.mealType, label: s.label },
    });
    if (!existing) {
      await prisma.deliverySlot.create({ data: s });
    }
  }
  console.log(`⏰ Seeded Lunch and Dinner delivery slots.`);

  // 5. Seed Menu Categories & Products
  const categoryThalis = await prisma.menuCategory.upsert({
    where: { slug: 'daily-tiffin-thalis' },
    update: {},
    create: {
      name: 'Daily Tiffin Thalis',
      slug: 'daily-tiffin-thalis',
      description: 'Wholesome, freshly prepared homestyle vegetarian meals',
      displayOrder: 1,
    },
  });

  const categoryCombos = await prisma.menuCategory.upsert({
    where: { slug: 'special-combos' },
    update: {},
    create: {
      name: 'Special Combos',
      slug: 'special-combos',
      description: 'Hearty meal bowls and weekend special boxes',
      displayOrder: 2,
    },
  });

  // Seed Product: Executive North Indian Thali
  const thali = await prisma.product.upsert({
    where: { slug: 'executive-north-indian-thali' },
    update: {},
    create: {
      categoryId: categoryThalis.id,
      name: 'Executive North Indian Thali',
      slug: 'executive-north-indian-thali',
      description: '4 Phulkas, Paneer Butter Masala, Dal Tadka, Jeera Rice, Salad & Gulab Jamun',
      dietaryType: DietaryType.VEG,
      imageUrl: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
      basePricePaise: 15900, // ₹159.00
      taxRatePercent: 5,
      variants: {
        create: [
          { name: 'Standard Portion', priceModifierPaise: 0, isDefault: true, displayOrder: 1 },
          { name: 'Deluxe Portion (+Extra Paneer & Sweet)', priceModifierPaise: 4000, isDefault: false, displayOrder: 2 },
        ],
      },
    },
  });

  // Seed Addon Group for Thali
  const addonGroup = await prisma.addonGroup.create({
    data: {
      name: 'Add Extras & Sides',
      minSelections: 0,
      maxSelections: 4,
      options: {
        create: [
          { name: 'Extra Phulka (2 pcs)', pricePaise: 2000 },
          { name: 'Sweet Lassi (250ml)', pricePaise: 3500 },
          { name: 'Boondi Raita (150ml)', pricePaise: 2500 },
          { name: 'Roasted Papad (2 pcs)', pricePaise: 1500 },
        ],
      },
      products: {
        create: {
          productId: thali.id,
        },
      },
    },
  });

  // Seed Product: Homestyle Dal Khichdi Bowl
  await prisma.product.upsert({
    where: { slug: 'homestyle-dal-khichdi-bowl' },
    update: {},
    create: {
      categoryId: categoryCombos.id,
      name: 'Homestyle Moong Dal Khichdi Bowl',
      slug: 'homestyle-dal-khichdi-bowl',
      description: 'Comforting desi ghee khichdi served with curd, pickle, and roasted papad',
      dietaryType: DietaryType.VEG,
      imageUrl: 'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80',
      basePricePaise: 12900, // ₹129.00
      taxRatePercent: 5,
      variants: {
        create: [
          { name: 'Regular Bowl (400g)', priceModifierPaise: 0, isDefault: true },
          { name: 'Large Bowl (600g)', priceModifierPaise: 3000, isDefault: false },
        ],
      },
    },
  });

  // Seed Product: Janaki Special Full Thali
  await prisma.product.upsert({
    where: { slug: 'janaki-special-full-thali' },
    update: {},
    create: {
      categoryId: categoryThalis.id,
      name: 'Janaki Special Full Thali',
      slug: 'janaki-special-full-thali',
      description: '4 Soft Rotis, 1 Paneer Sabzi, 1 Seasonal Sabzi, Dal Tadka, Jeera Rice, Curd & Sweet.',
      dietaryType: DietaryType.VEG,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDS9UZxeQL2XEwyu0K3PCfLt6xcAGFdQTQk0Ms6V2E_dNfemHxFYbIONpeD6RzRRoWWDyO18R_xwGBdtSE7xBHjmyObtY6kkODeMHHLUBjBohji3E4P1D7CsA6o0vz6TtyD5iFo0-ftcqqVkGA5aPZ6gqonSl0tiLeWavjPSF7RoRAjy-R35op1kvBkcA6DHoxU8eSbBL0OcSYbkU4Gi0pIkUstEckNKwAK8RsxyMFSxFnUKcwd2Fok',
      basePricePaise: 18000, // ₹180.00
      taxRatePercent: 5,
      variants: {
        create: [
          { name: 'Full Thali (Standard)', priceModifierPaise: 0, isDefault: true },
          { name: 'Royal Portion (+Extra Sweet)', priceModifierPaise: 3500, isDefault: false },
        ],
      },
    },
  });

  // Seed Product: Regular Home Thali
  await prisma.product.upsert({
    where: { slug: 'regular-home-thali' },
    update: {},
    create: {
      categoryId: categoryThalis.id,
      name: 'Regular Home Thali',
      slug: 'regular-home-thali',
      description: '4 Rotis, Seasonal Veg Sabzi, Dal Fry, Steamed Rice, Pickle & Salad.',
      dietaryType: DietaryType.VEG,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBTHONkUFMlDOhbV8ZAksbZ3MFW81rMV0imOKG7b6sJsRN2StBpZW54kblxWOMQylv1X4vOJzgSkTy4gM3Z1ypQAk3U9TjdYZiZpd2e4RLirD0HL58J8DokQiAG_gm6CX5lrfbRwel5UXuvUoP3AD4f9T_s8Buuq22rghfLWtl-gHYATlEEnfvUW1xXaDUHTd2ri-3nRNvGFfssW_Zka0tU0w_egIYYxQTa--nhGHmHOM0tD0QbDU9C',
      basePricePaise: 13000, // ₹130.00
      taxRatePercent: 5,
      variants: {
        create: [
          { name: 'Standard Thali', priceModifierPaise: 0, isDefault: true },
        ],
      },
    },
  });

  // Seed Product: Roti & Sabzi Duo
  await prisma.product.upsert({
    where: { slug: 'roti-sabzi-duo' },
    update: {},
    create: {
      categoryId: categoryCombos.id,
      name: 'Roti & Sabzi Duo',
      slug: 'roti-sabzi-duo',
      description: '4 Phulkas with spiced, fresh cottage cheese Paneer Bhurji.',
      dietaryType: DietaryType.VEG,
      imageUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7FyfUzzLfU1zFeV9Kj0MuGwv3uOnBcOQnd59q3rdLwp86vcmEMSGNPqMzXfDxESKSt57aby9gMNqThGtOkZzquiH8qAUb7Q4LWqTabE2_IWIAegP4TTTbmASnzNA2PcgQXre_ZQX-PJSiJaIgicviQpj0iPuITd_o1l0YYcymiDaTeFNel4PUpcf2khbY4suRtZ6_PBLoP87PJ02DZFeDKOYWiT7pAPJI2hs4AakxWt8Ry9pUsjMS',
      basePricePaise: 9500, // ₹95.00
      taxRatePercent: 5,
      variants: {
        create: [
          { name: '4 Phulkas + Bhurji', priceModifierPaise: 0, isDefault: true },
          { name: '6 Phulkas + Bhurji', priceModifierPaise: 3000, isDefault: false },
        ],
      },
    },
  });

  console.log('✅ Janki Rasoi Database Seed Completed Successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

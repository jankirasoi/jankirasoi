import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, ToggleSoldOutDto, UpdateProductDto } from './dto/catalog.dto';
import { OrdersEventsService } from '../events/orders-events.service';
import { RedisService } from '../../common/redis/redis.service';

interface CachedCatalog {
  data: any;
  cachedAt: number;
}

/**
 * Ensures Cloudinary image URLs use automatic perceptual compression (q_auto),
 * responsive format conversion (f_auto: WebP/AVIF), and max-width dimension limiting (w_1200,c_limit).
 */
export function optimizeCloudinaryUrl(url?: string): string | undefined {
  if (!url) return url;
  if (url.includes('cloudinary.com') && url.includes('/upload/') && !url.includes('/f_auto')) {
    return url.replace('/upload/', '/upload/f_auto,q_auto,w_600,c_limit/');
  }
  if (url.includes('images.unsplash.com')) {
    try {
      const u = new URL(url);
      u.searchParams.set('auto', 'format');
      u.searchParams.set('fit', 'crop');
      if (!u.searchParams.has('w') || parseInt(u.searchParams.get('w') || '0', 10) > 600) {
        u.searchParams.set('w', '600');
      }
      u.searchParams.set('q', '75');
      return u.toString();
    } catch (e) {
      return url;
    }
  }
  return url;
}

export const SUPABASE_STORAGE_DISHES_BASE = 'https://yxvwgcjavxeqsttzcbty.supabase.co/storage/v1/object/public/menu/dishes';

export const DEFAULT_DISH_IMAGES: Record<string, string> = {
  'aloo-gobhi': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-gobhi.jpg`,
  'aloo-matar': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-matar.jpg`,
  'aloo-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-paratha.jpg`,
  'aloo-tamatar': `${SUPABASE_STORAGE_DISHES_BASE}/aloo-tamatar.jpg`,
  'chana-masala': `${SUPABASE_STORAGE_DISHES_BASE}/chana-masala.jpg`,
  'dal-bati-thali': `${SUPABASE_STORAGE_DISHES_BASE}/dal-bati-thali.jpg`,
  'dal-fry': `${SUPABASE_STORAGE_DISHES_BASE}/dal-fry.jpg`,
  'dal-tadka': `${SUPABASE_STORAGE_DISHES_BASE}/dal-tadka.jpg`,
  'finger-chips': `${SUPABASE_STORAGE_DISHES_BASE}/finger-chips.jpg`,
  'gobhi-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/gobhi-paratha.jpg`,
  'gud-ki-chai': `${SUPABASE_STORAGE_DISHES_BASE}/gud-ki-chai.jpg`,
  'indori-poha-special-nashta': `${SUPABASE_STORAGE_DISHES_BASE}/indori-poha-special-nashta.jpg`,
  'jeera-dal': `${SUPABASE_STORAGE_DISHES_BASE}/jeera-dal.jpg`,
  'jeera-rice': `${SUPABASE_STORAGE_DISHES_BASE}/jeera-rice.jpg`,
  'kadhai-paneer': `${SUPABASE_STORAGE_DISHES_BASE}/kadhai-paneer.jpg`,
  'matar-paneer': `${SUPABASE_STORAGE_DISHES_BASE}/matar-paneer.jpg`,
  'matar-pulao': `${SUPABASE_STORAGE_DISHES_BASE}/matar-pulao.jpg`,
  'mix-dal': `${SUPABASE_STORAGE_DISHES_BASE}/mix-dal.jpg`,
  'mix-sabzi': `${SUPABASE_STORAGE_DISHES_BASE}/mix-sabzi.jpg`,
  'paneer-masala': `${SUPABASE_STORAGE_DISHES_BASE}/paneer-masala.jpg`,
  'paneer-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/paneer-paratha.jpg`,
  'plain-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/plain-paratha.jpg`,
  'plain-rice': `${SUPABASE_STORAGE_DISHES_BASE}/plain-rice.jpg`,
  'sadi-thali': `${SUPABASE_STORAGE_DISHES_BASE}/sadi-thali.jpg`,
  'sev-bhaji': `${SUPABASE_STORAGE_DISHES_BASE}/sev-bhaji.jpg`,
  'sev-masala': `${SUPABASE_STORAGE_DISHES_BASE}/sev-masala.jpg`,
  'sev-paratha': `${SUPABASE_STORAGE_DISHES_BASE}/sev-paratha.jpg`,
  'sev-tamatar': `${SUPABASE_STORAGE_DISHES_BASE}/sev-tamatar.jpg`,
  'shahi-paneer': `${SUPABASE_STORAGE_DISHES_BASE}/shahi-paneer.jpg`,
  'special-thali-bhar-pet': `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`,
  'urad-chana-dal': `${SUPABASE_STORAGE_DISHES_BASE}/urad-chana-dal.jpg`,
  'executive-north-indian-thali': `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`,
  'homestyle-dal-khichdi-bowl': `${SUPABASE_STORAGE_DISHES_BASE}/mix-dal.jpg`,
  'janaki-special-full-thali': `${SUPABASE_STORAGE_DISHES_BASE}/special-thali-bhar-pet.jpg`,
  'regular-home-thali': `${SUPABASE_STORAGE_DISHES_BASE}/sadi-thali.jpg`,
  'roti-sabzi-duo': `${SUPABASE_STORAGE_DISHES_BASE}/mix-sabzi.jpg`,
};

/**
 * Normalizes dates to Indian Standard Time (IST / Asia/Kolkata) calendar day
 * to guarantee accurate day-boundaries across midnight and exact @db.Date matching in PostgreSQL.
 */
function getNormalizedServiceDate(serviceDateString?: string): { dateObj: Date; dateStr: string } {
  let dateStr = serviceDateString;
  if (!dateStr) {
    dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  } else {
    dateStr = dateStr.split('T')[0];
  }
  return {
    dateObj: new Date(`${dateStr}T00:00:00.000Z`),
    dateStr,
  };
}

@Injectable()
export class CatalogService {
  private readonly catalogCache = new Map<string, CachedCatalog>();
  private readonly CACHE_TTL_MS = 60_000; // 60s in-memory cache for high-concurrency surge protection

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    @Optional() private readonly eventsService?: OrdersEventsService,
  ) {}

  clearCache(serviceDateString?: string) {
    this.catalogCache.clear();
    try {
      const today = serviceDateString || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      this.redis.del(`janki:catalog:today:${today}`).catch(() => {});
      this.eventsService?.emitOrderEvent('CATALOG_UPDATED' as any, {});
    } catch {
      // safe fallback if events bus not active
    }
  }

  async getPublicCatalog(serviceDateString?: string) {
    const { dateObj: serviceDate, dateStr } = getNormalizedServiceDate(serviceDateString);
    const redisKey = `janki:catalog:today:${dateStr}`;

    return this.redis.getOrSet(
      redisKey,
      async () => {
        const categories = await this.prisma.menuCategory.findMany({
          where: { isActive: true },
          orderBy: { displayOrder: 'asc' },
          include: {
            products: {
              where: { isActive: true },
              orderBy: { displayOrder: 'asc' },
              include: {
                variants: {
                  where: { isActive: true },
                  orderBy: { displayOrder: 'asc' },
                },
                addonGroups: {
                  include: {
                    addonGroup: {
                      include: {
                        options: {
                          where: { isActive: true },
                        },
                      },
                    },
                  },
                },
                availabilities: {
                  where: { serviceDate },
                },
              },
            },
          },
        });

        return {
          serviceDate: dateStr,
          categories: categories.map((cat) => ({
            id: cat.id,
            name: cat.name,
            slug: cat.slug,
            displayOrder: cat.displayOrder,
            items: cat.products.map((p) => {
              const avail = p.availabilities[0];
              const isSoldOut = avail ? avail.isSoldOut : false;
              return {
                id: p.id,
                name: p.name,
                slug: p.slug,
                description: p.description,
                dietaryType: p.dietaryType,
                imageUrl: optimizeCloudinaryUrl(p.imageUrl?.trim() || DEFAULT_DISH_IMAGES[p.slug] || '/images/dishes/special-thali-bhar-pet.jpg'),
                basePricePaise: p.basePricePaise,
                taxRatePercent: p.taxRatePercent,
                isSoldOut,
                variants: p.variants.map((v) => ({
                  id: v.id,
                  name: v.name,
                  priceModifierPaise: v.priceModifierPaise,
                  isDefault: v.isDefault,
                })),
                addonGroups: p.addonGroups.map((ag) => ({
                  id: ag.addonGroup.id,
                  name: ag.addonGroup.name,
                  minSelections: ag.addonGroup.minSelections,
                  maxSelections: ag.addonGroup.maxSelections,
                  options: ag.addonGroup.options.map((o) => ({
                    id: o.id,
                    name: o.name,
                    pricePaise: o.pricePaise,
                  })),
                })),
              };
            }),
          })),
        };
      },
      3600, // 1 hour in Upstash Redis
      60    // 60 seconds in L1 memory
    );
  }

  async createProduct(dto: CreateProductDto) {
    this.clearCache();

    // Verify category exists to prevent unhandled foreign key database constraint violations
    const category = await this.prisma.menuCategory.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new BadRequestException(`Category with ID "${dto.categoryId}" does not exist.`);
    }

    const trimmedName = dto.name.trim();
    if (!trimmedName) {
      throw new BadRequestException('Dish name cannot be empty.');
    }

    const optimizedImageUrl = optimizeCloudinaryUrl(dto.imageUrl);
    const slug = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36);

    const product = await this.prisma.product.create({
      data: {
        categoryId: dto.categoryId,
        name: trimmedName,
        slug,
        description: dto.description?.trim(),
        dietaryType: dto.dietaryType as any,
        imageUrl: optimizedImageUrl,
        basePricePaise: dto.basePricePaise,
        taxRatePercent: dto.taxRatePercent ?? 5,
        variants: {
          create: {
            name: 'Standard Portion',
            priceModifierPaise: 0,
            isDefault: true,
          },
        },
      },
      include: {
        variants: true,
      },
    });

    this.clearCache();
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    this.clearCache();
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Product with ID "${id}" not found.`);
    }

    if (dto.categoryId !== undefined) {
      const category = await this.prisma.menuCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new BadRequestException(`Category with ID "${dto.categoryId}" does not exist.`);
      }
    }

    const optimizedImageUrl = dto.imageUrl !== undefined ? optimizeCloudinaryUrl(dto.imageUrl) : undefined;

    const updated = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description.trim() }),
        ...(dto.dietaryType !== undefined && { dietaryType: dto.dietaryType as any }),
        ...(optimizedImageUrl !== undefined && { imageUrl: optimizedImageUrl }),
        ...(dto.basePricePaise !== undefined && { basePricePaise: dto.basePricePaise }),
        ...(dto.taxRatePercent !== undefined && { taxRatePercent: dto.taxRatePercent }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        variants: true,
      },
    });

    this.clearCache();
    return updated;
  }

  async deleteProduct(id: string) {
    this.clearCache();
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`Product with ID "${id}" not found.`);
    }

    // Soft delete to protect existing orders and historical receipts
    const deleted = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });

    this.clearCache();
    return deleted;
  }

  async toggleSoldOut(productId: string, dto: ToggleSoldOutDto) {
    this.clearCache();
    const { dateObj: serviceDate } = getNormalizedServiceDate(dto.serviceDate);

    const record = await this.prisma.productServiceDateAvailability.upsert({
      where: {
        productId_serviceDate: {
          productId,
          serviceDate,
        },
      },
      update: {
        isSoldOut: dto.isSoldOut,
      },
      create: {
        productId,
        serviceDate,
        isSoldOut: dto.isSoldOut,
      },
    });

    this.clearCache();
    return record;
  }
}

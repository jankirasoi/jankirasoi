import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class DeliverySlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  clearCache(dateString?: string) {
    if (dateString) {
      this.redis.del(`janki:slots:${dateString}`).catch(() => {});
    }
  }

  async getSlotsForDate(dateString: string) {
    const serviceDate = new Date(dateString);
    if (isNaN(serviceDate.getTime())) {
      throw new BadRequestException('Invalid date format. Expected YYYY-MM-DD.');
    }

    const redisKey = `janki:slots:${dateString}`;

    return this.redis.getOrSet(
      redisKey,
      async () => {
        const slots = await this.prisma.deliverySlot.findMany({
          where: { isActive: true },
          include: {
            capacities: {
              where: { serviceDate },
            },
          },
        });

        return {
          date: dateString,
          slots: slots.map((slot) => {
            const capacityRecord = slot.capacities[0];
            const maxCapacity = capacityRecord ? capacityRecord.maxCapacity : slot.defaultCapacity;
            const bookedCount = capacityRecord ? capacityRecord.bookedCount : 0;
            const remainingCapacity = Math.max(0, maxCapacity - bookedCount);

            return {
              id: slot.id,
              mealType: slot.mealType,
              label: slot.label,
              startTime: slot.startTime,
              endTime: slot.endTime,
              cutoffTime: slot.cutoffTime,
              isAvailable: remainingCapacity > 0,
              remainingCapacity,
            };
          }),
        };
      },
      300, // 5 minutes in Upstash Redis
      30   // 30 seconds in L1 memory
    );
  }
}

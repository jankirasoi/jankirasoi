import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { DeliveryZonesModule } from './modules/delivery-zones/delivery-zones.module';
import { DeliverySlotsModule } from './modules/delivery-slots/delivery-slots.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RidersModule } from './modules/riders/riders.module';
import { EventsModule } from './modules/events/events.module';
import { RedisModule } from './common/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // Max 100 requests per minute per IP
      },
    ]),
    RedisModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    AuditModule,
    OutboxModule,
    UploadsModule,
    CatalogModule,
    DeliveryZonesModule,
    DeliverySlotsModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    RidersModule,
    EventsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

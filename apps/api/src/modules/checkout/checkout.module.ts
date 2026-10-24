import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { DeliveryZonesModule } from '../delivery-zones/delivery-zones.module';

@Module({
  imports: [DeliveryZonesModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

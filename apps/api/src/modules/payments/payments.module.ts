import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PhonePeService } from './phonepe.service';
import { PaymentsController, WebhooksController, AdminPaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController, WebhooksController, AdminPaymentsController],
  providers: [PaymentsService, PhonePeService],
  exports: [PaymentsService, PhonePeService],
})
export class PaymentsModule {}

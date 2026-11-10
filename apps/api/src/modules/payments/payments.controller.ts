import { Controller, Post, Get, Body, Req, Res, Headers, Param, Query, UseGuards, BadRequestException, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiHeader, ApiParam } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PhonePeService } from './phonepe.service';
import { VerifyPaymentDto, RefundOrderDto } from './dto/payments.dto';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Request, Response } from 'express';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly phonePeService: PhonePeService,
  ) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify Razorpay payment signature from client checkout handoff' })
  async verifyPayment(@Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(dto);
  }

  @Get('phonepe/return')
  @ApiOperation({ summary: 'Handle customer browser return from PhonePe checkout' })
  async handlePhonePeReturn(
    @Req() req: Request,
    @Res() res: Response,
    @Query('token') trackingToken: string,
    @Query('orderNumber') orderNumber: string,
    @Query('txnId') txnId: string,
  ) {
    try {
      const targetTxn = txnId || orderNumber;
      if (targetTxn) {
        await this.paymentsService.reconcilePhonePeOrder(targetTxn);
      }
    } catch {}

    const targetUrl = `/track?token=${encodeURIComponent(trackingToken || orderNumber || '')}`;
    return res.redirect(targetUrl);
  }

  @Get('phonepe/status/:txnId')
  @ApiOperation({ summary: 'Query live PhonePe transaction status by merchant transaction ID' })
  @ApiParam({ name: 'txnId', description: 'PhonePe merchant transaction ID' })
  async getPhonePeStatus(@Param('txnId') txnId: string) {
    return this.paymentsService.reconcilePhonePeOrder(txnId);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly phonePeService: PhonePeService,
  ) {}

  @Post('phonepe')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle raw-body signed webhook events from PhonePe' })
  @ApiHeader({ name: 'x-verify', required: true })
  async handlePhonePeWebhook(
    @Body() body: { response?: string },
    @Headers('x-verify') xVerify: string,
  ) {
    if (!body?.response || !xVerify) {
      throw new BadRequestException('Missing response payload or x-verify signature header');
    }

    const isValid = this.phonePeService.verifyWebhookChecksum(body.response, xVerify);
    if (!isValid) {
      throw new BadRequestException('PhonePe cryptographic signature verification failed');
    }

    const decoded = JSON.parse(Buffer.from(body.response, 'base64').toString('utf8'));
    return this.paymentsService.handlePhonePeWebhookPayload(decoded);
  }

  @Post('razorpay')
  @ApiOperation({ summary: 'Handle raw-body signed webhook events from Razorpay' })
  @ApiHeader({ name: 'X-Razorpay-Signature', required: true })
  async handleRazorpayWebhook(
    @Req() req: Request,
    @Headers('x-razorpay-signature') signature: string,
    @Body() payload: any,
  ) {
    const rawBody = (req as any).rawBody ? (req as any).rawBody.toString('utf8') : JSON.stringify(payload);
    return this.paymentsService.handleRazorpayWebhook(rawBody, signature, payload);
  }
}

@ApiTags('Admin Payments')
@Controller('admin/orders')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post(':id/refund')
  @ApiOperation({ summary: 'Issue full or partial refund via Razorpay with audit reason' })
  async refundOrder(
    @Param('id') orderId: string,
    @Body() dto: RefundOrderDto,
  ) {
    return this.paymentsService.processRefund(orderId, dto);
  }
}

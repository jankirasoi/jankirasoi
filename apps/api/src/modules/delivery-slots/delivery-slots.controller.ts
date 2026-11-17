import { Controller, Get, Query, BadRequestException, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DeliverySlotsService } from './delivery-slots.service';

@ApiTags('Delivery Slots')
@Controller('delivery-slots')
export class DeliverySlotsController {
  constructor(private readonly slotsService: DeliverySlotsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=60')
  @ApiOperation({ summary: 'Get available delivery slots and remaining capacity for date' })
  @ApiQuery({ name: 'date', required: false, example: '2026-10-22' })
  async getSlots(@Query('date') date?: string) {
    const targetDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? date
      : new Date().toISOString().split('T')[0];
    return this.slotsService.getSlotsForDate(targetDate);
  }
}

import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { DeliveryZonesService } from './delivery-zones.service';

@ApiTags('Delivery Zones')
@Controller('delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly zonesService: DeliveryZonesService) {}

  @Get('check')
  @ApiOperation({ summary: 'Check pincode and distance serviceability from Sagore Kitchen' })
  @ApiQuery({ name: 'pincode', required: true, example: '454774' })
  @ApiQuery({ name: 'lat', required: false, example: '22.6288' })
  @ApiQuery({ name: 'lng', required: false, example: '75.5684' })
  async checkPincode(
    @Query('pincode') pincode: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    if (!pincode || !/^[1-9][0-9]{5}$/.test(pincode)) {
      throw new BadRequestException('Please provide a valid 6-digit Indian PIN code.');
    }
    const parsedLat = lat ? parseFloat(lat) : undefined;
    const parsedLng = lng ? parseFloat(lng) : undefined;
    return this.zonesService.checkPincode(pincode, parsedLat, parsedLng);
  }

  @Get()
  @ApiOperation({ summary: 'List all active delivery zones' })
  async listZones() {
    return this.zonesService.getAllActiveZones();
  }
}

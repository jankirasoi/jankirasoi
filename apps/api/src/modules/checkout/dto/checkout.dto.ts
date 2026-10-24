import { IsString, IsNotEmpty, IsArray, ValidateNested, IsInt, Min, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CartItemAddonDto {
  @ApiProperty({ example: 'ao_01j9f' })
  @IsString()
  @IsNotEmpty()
  addonOptionId: string;
}

export class CartItemDto {
  @ApiProperty({ example: 'prod_01j9b' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ example: 'var_01j9c' })
  @IsString()
  @IsOptional()
  variantId?: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ type: [String], example: ['ao_01j9f'] })
  @IsArray()
  @IsOptional()
  selectedAddonOptionIds?: string[];
}

export class CalculateQuoteDto {
  @ApiProperty({ example: '2026-10-22' })
  @IsString()
  @IsNotEmpty()
  serviceDate: string;

  @ApiProperty({ example: 'slot_lunch_1' })
  @IsString()
  @IsNotEmpty()
  deliverySlotId: string;

  @ApiProperty({ example: '454774' })
  @IsString()
  @IsNotEmpty()
  pincode: string;

  @ApiProperty({ type: [CartItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[];
}

export class DeliveryAddressDto {
  @ApiProperty({ example: 'House 42, Main Bazar' })
  @IsString()
  @IsNotEmpty()
  flat: string;

  @ApiProperty({ example: 'Sagore Main Road' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiPropertyOptional({ example: 'Near Sagore Police Station' })
  @IsString()
  @IsOptional()
  landmark?: string;

  @ApiProperty({ example: '454774' })
  @IsString()
  @IsNotEmpty()
  pincode: string;

  @ApiPropertyOptional({ example: 22.6288 })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: 77.21832 })
  @IsOptional()
  longitude?: number;
}

export class PlaceOrderDto {
  @ApiProperty({ example: 'qtok_sample123' })
  @IsString()
  @IsNotEmpty()
  quoteToken: string;

  @ApiProperty({ enum: ['RAZORPAY', 'COD'], example: 'RAZORPAY' })
  @IsEnum(['RAZORPAY', 'COD'])
  paymentMethod: 'RAZORPAY' | 'COD';

  @ApiProperty({ example: 'Rohan Sharma' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @ApiPropertyOptional({ example: 'rohan@example.com' })
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ type: DeliveryAddressDto })
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress: DeliveryAddressDto;

  @ApiPropertyOptional({ example: 'Please do not ring bell.' })
  @IsString()
  @IsOptional()
  deliveryNotes?: string;
}

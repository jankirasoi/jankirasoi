import { IsString, IsNotEmpty, Length, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '583921', description: '6-digit verbal OTP from customer' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  code: string;
}

export class DeliveryExceptionDto {
  @ApiProperty({ example: 'CUSTOMER_UNREACHABLE' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({ example: 'Called 3 times, door locked' })
  @IsString()
  @IsNotEmpty()
  notes: string;
}

export class UpdateDutyStatusDto {
  @ApiProperty({ example: true })
  @IsNotEmpty()
  isAvailable: boolean;
}

export class UpdateLocationDto {
  @ApiProperty({ example: 22.6288, description: 'GPS Latitude' })
  @IsNumber()
  @IsNotEmpty()
  latitude: number;

  @ApiProperty({ example: 75.5684, description: 'GPS Longitude' })
  @IsNumber()
  @IsNotEmpty()
  longitude: number;

  @ApiPropertyOptional({ example: 45, description: 'Heading in degrees' })
  @IsOptional()
  @IsNumber()
  heading?: number;

  @ApiPropertyOptional({ example: 25, description: 'Speed in km/h' })
  @IsOptional()
  @IsNumber()
  speed?: number;
}

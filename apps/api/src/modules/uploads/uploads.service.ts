import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

@Injectable()
export class UploadsService {
  constructor(private readonly configService: ConfigService) {}

  getUploadSignature(folder = 'jankirasoi/menu') {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Cloudinary credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) must be set in .env');
    }

    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signature sorting order: parameters in alphabetical order
    // e.g. folder=jankirasoi/menu&timestamp=1234567890<api_secret>
    const stringToSign = `folder=${folder}&timestamp=${timestamp}${apiSecret}`;
    const signature = createHash('sha1').update(stringToSign).digest('hex');

    return {
      cloudName,
      apiKey,
      timestamp,
      folder,
      signature,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    };
  }

  async uploadFoodImageToSupabase(fileBuffer: Buffer, mimeType: string, filename: string): Promise<{ url: string }> {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new BadRequestException('Supabase credentials (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are not configured.');
    }

    const cleanName = (filename || 'dish.jpg').replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `dishes/${Date.now()}-${cleanName}`;

    const res = await fetch(`${supabaseUrl}/storage/v1/object/menu/${storagePath}`, {
      method: 'POST',
      headers: {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': mimeType || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: fileBuffer as any,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`Failed to upload to Supabase Storage: ${err}`);
    }

    const url = `${supabaseUrl}/storage/v1/object/public/menu/${storagePath}`;
    return { url };
  }
}

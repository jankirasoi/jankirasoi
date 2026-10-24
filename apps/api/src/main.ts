import * as fs from 'fs';
import * as path from 'path';

// Authoritative local environment loader to override inherited shell variables
function loadLocalEnv() {
  const envCandidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../../.env'),
  ];
  for (const envPath of envCandidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          let val = trimmed.substring(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.substring(1, val.length - 1);
          }
          // Preserve environment variables already injected by the platform/runtime (especially PORT and secrets)
          if (process.env[key] === undefined || (process.env.NODE_ENV !== 'production' && key !== 'PORT')) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}
loadLocalEnv();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
let compression: any = null;
try {
  compression = require('compression');
} catch {}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  // Enable HTTP response compression (gzip/deflate) if installed
  if (compression) {
    app.use(compression());
  }

  // Global Prefix
  app.setGlobalPrefix('api/v1');

  // CORS configuration supporting localhost, mobile LAN IP, and production Vercel / custom domains
  const allowedOrigins = [
    'https://jankirasoi.in',
    'https://www.jankirasoi.in',
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
  ].filter(Boolean) as string[];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Check explicit allowed origins
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any Vercel deployment preview / production domain (*.vercel.app)
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }

      // Allow localhost and local LAN IPs for dev & testing
      if (
        /^http:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        )
      ) {
        return callback(null, true);
      }

      // Default fallback for preview branches
      return callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Razorpay-Signature',
      'X-Simulated-Role',
      'Accept',
      'Cache-Control',
      'X-Requested-With',
    ],
    maxAge: 86400, // 24 hours preflight cache to eliminate redundant OPTIONS roundtrips
  });

  // Global Exception Filter (RFC 7807)
  app.useGlobalFilters(new AllExceptionsFilter());

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Janki Rasoi Platform API')
    .setDescription(
      'Authoritative REST API for Janki Rasoi Tiffin Ordering, Kitchen KDS, and Delivery Operations.',
    )
    .setVersion('1.0.0')
    .addTag('Catalog', 'Public menu catalog and portion variants')
    .addTag('Delivery Zones', 'Pincode validation and delivery fee computation')
    .addTag('Delivery Slots', 'Delivery windows and capacity management')
    .addTag('Checkout', 'Authoritative quotations and atomic order placement')
    .addTag('Payments', 'Razorpay Standard Checkout verification and refunds')
    .addTag('Orders Tracking', 'Public order tracking by secret token')
    .addTag('Admin Orders', 'Kitchen KDS lifecycle management and rider dispatch')
    .addTag('Rider Operations', 'Mobile handover and 6-digit cryptographic OTP verification')
    .addTag('Health', 'Kubernetes / Render liveness and readiness probes')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT) || 3000;
  // Listen on 0.0.0.0 so Render container reverse-proxy correctly forwards traffic
  await app.listen(port, '0.0.0.0');

  // Tune HTTP keep-alive timeouts to avoid connection drops behind Render / Cloudflare reverse proxies
  const httpServer = app.getHttpServer();
  if (httpServer && typeof httpServer.keepAliveTimeout === 'number') {
    httpServer.keepAliveTimeout = 65000;
    httpServer.headersTimeout = 66000;
  }

  logger.log(`🚀 Janki Rasoi API is running on http://0.0.0.0:${port}/api/v1`);
  logger.log(`📖 OpenAPI Swagger Documentation available at http://0.0.0.0:${port}/api/docs`);
}

bootstrap();

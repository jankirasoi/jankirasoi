import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as net from 'net';

let tunnelServer: net.Server | null = null;
let tunnelInitPromise: Promise<void> | null = null;

function setupTunnel(logger: Logger): Promise<void> {
  if (tunnelInitPromise) return tunnelInitPromise;
  tunnelInitPromise = new Promise((resolve) => {
    try {
      const server = net.createServer((clientSocket) => {
        clientSocket.setKeepAlive(true, 10000);
        clientSocket.setNoDelay(true);
        const remoteHost = process.env.SUPABASE_POOLER_HOST || 'aws-0-ap-northeast-2.pooler.supabase.com';
        const remoteSocket = net.createConnection({ host: remoteHost, port: 6543 }, () => {
          remoteSocket.setKeepAlive(true, 10000);
          remoteSocket.setNoDelay(true);
        });
        clientSocket.pipe(remoteSocket);
        remoteSocket.pipe(clientSocket);
        clientSocket.on('error', (err) => {
          logger.warn(`Tunnel clientSocket error: ${err.message}`);
          remoteSocket.destroy();
        });
        remoteSocket.on('error', (err) => {
          logger.error(`Tunnel remoteSocket error: ${err.message}`);
          clientSocket.destroy();
        });
        clientSocket.on('close', () => remoteSocket.destroy());
        remoteSocket.on('close', () => clientSocket.destroy());
      });
      server.on('error', (err: any) => {
        if (err.code !== 'EADDRINUSE') {
          logger.error(`Tunnel error: ${err.message}`);
        }
        resolve();
      });
      server.listen(6543, '127.0.0.1', () => {
        logger.log('⚡ Local IPv4 proxy active on 127.0.0.1:6543 -> Supabase Pooler (Seoul ap-northeast-2)');
        resolve();
      });
      tunnelServer = server;
    } catch (err: any) {
      logger.warn(`Could not start tunnel: ${err.message}`);
      resolve();
    }
  });
  return tunnelInitPromise;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(configService: ConfigService) {
    let databaseUrl = configService.get<string>('DATABASE_URL');
    if (databaseUrl && (databaseUrl.includes('supabase.co') || databaseUrl.includes('yxvwgcjavxeqsttzcbty') || databaseUrl.includes('pooler.supabase.com'))) {
      try {
        const parsed = new URL(databaseUrl);
        const user = parsed.username || 'postgres';
        const match = parsed.hostname.match(/([a-z0-9]{20})/);
        const projectRef = configService.get<string>('SUPABASE_PROJECT_REF') || (match ? match[1] : 'yxvwgcjavxeqsttzcbty');
        const poolerUser = user.includes('.') ? user : `${user}.${projectRef}`;
        const pass = parsed.password ? `:${encodeURIComponent(parsed.password)}` : '';
        const poolSize = configService.get<string>('DATABASE_POOL_SIZE') || '15';
        const poolTimeout = configService.get<string>('DATABASE_POOL_TIMEOUT') || '20';
        const host = parsed.hostname.includes('pooler.supabase.com') ? parsed.hostname : 'aws-0-ap-northeast-2.pooler.supabase.com';
        const port = '6543'; // Supabase connection pooler (Transaction mode / PgBouncer) is always on port 6543
        databaseUrl = `postgresql://${poolerUser}${pass}@${host}:${port}/postgres?pgbouncer=true&sslmode=require&connection_limit=${poolSize}&pool_timeout=${poolTimeout}`;
      } catch {
        // keep databaseUrl as-is if parsing fails
      }
    }

    super(
      databaseUrl
        ? {
            datasources: {
              db: {
                url: databaseUrl,
              },
            },
          }
        : undefined,
    );
  }

  async onModuleInit() {
    if (tunnelInitPromise) {
      await tunnelInitPromise;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Prisma connected to PostgreSQL successfully.');
        return;
      } catch (error) {
        this.logger.warn(`Database connection attempt ${attempt}/3: ${(error as Error).message}`);
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1000));
        } else {
          this.logger.warn(`Initial database connection deferred: ${(error as Error).message}`);
        }
      }
    }
  }

  async onModuleDestroy() {
    if (tunnelServer) {
      tunnelServer.close();
      tunnelServer = null;
    }
    await this.$disconnect();
    this.logger.log('Prisma disconnected from PostgreSQL.');
  }

  // @ts-ignore
  override $transaction(arg: any, options?: any): Promise<any> {
    if (typeof arg === 'function') {
      return (super.$transaction as any)(arg, {
        maxWait: 15000,
        timeout: 30000,
        ...options,
      });
    }
    return (super.$transaction as any)(arg, options);
  }
}

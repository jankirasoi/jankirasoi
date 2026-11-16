import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

interface L1CacheEntry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class RedisService implements OnModuleInit {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isEnabled = false;

  // L1 In-Memory High-Speed Cache (0ms latency, shields Upstash 500k monthly limit)
  private readonly l1Cache = new Map<string, L1CacheEntry<any>>();

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const url = this.config.get<string>('UPSTASH_REDIS_REST_URL');
    const token = this.config.get<string>('UPSTASH_REDIS_REST_TOKEN');

    if (url && token) {
      try {
        this.client = new Redis({
          url,
          token,
          retry: {
            retries: 2,
            backoff: (retryCount) => Math.exp(retryCount) * 50,
          },
        });
        this.isEnabled = true;
        this.logger.log(`✓ Upstash Redis initialized successfully (Mumbai ap-south-1)`);
      } catch (err: any) {
        this.logger.error(`Failed to initialize Upstash Redis: ${err?.message}`);
        this.client = null;
        this.isEnabled = false;
      }
    } else {
      this.logger.warn(`Upstash Redis credentials missing. Operating in in-memory fallback mode.`);
    }

    // Periodic cleanup of expired L1 entries every 60 seconds
    setInterval(() => this.cleanupL1(), 60_000);
  }

  private cleanupL1() {
    const now = Date.now();
    for (const [key, entry] of this.l1Cache.entries()) {
      if (entry.expiresAt <= now) {
        this.l1Cache.delete(key);
      }
    }
  }

  /**
   * Retrieves an item from L1 (memory) or L2 (Upstash Redis).
   */
  async get<T>(key: string): Promise<T | null> {
    const now = Date.now();

    // 1. Check L1 Memory (0ms, 0 Upstash commands)
    const l1 = this.l1Cache.get(key);
    if (l1 && l1.expiresAt > now) {
      return l1.value as T;
    }

    // 2. Check L2 Upstash Redis
    if (!this.isEnabled || !this.client) return null;

    try {
      const data = await this.client.get<T>(key);
      if (data !== null && data !== undefined) {
        // Populate L1 for 30 seconds to absorb burst queries
        this.l1Cache.set(key, { value: data, expiresAt: now + 30_000 });
        return data;
      }
    } catch (err: any) {
      this.logger.warn(`Redis GET failed for [${key}]: ${err?.message}`);
    }

    return null;
  }

  /**
   * Sets an item in both L1 (memory) and L2 (Upstash Redis).
   * @param key Redis key
   * @param value Value to serialize
   * @param ttlSeconds Expiration in seconds
   * @param l1TtlSeconds In-memory cache duration in seconds (defaults to min(ttlSeconds, 60))
   */
  async set<T>(key: string, value: T, ttlSeconds: number = 3600, l1TtlSeconds?: number): Promise<void> {
    const now = Date.now();
    const effectiveL1Ttl = Math.min(ttlSeconds, l1TtlSeconds ?? 60);

    // Save in L1
    this.l1Cache.set(key, { value, expiresAt: now + effectiveL1Ttl * 1000 });

    if (!this.isEnabled || !this.client) return;

    try {
      if (ttlSeconds > 0) {
        await this.client.set(key, value, { ex: ttlSeconds });
      } else {
        await this.client.set(key, value);
      }
    } catch (err: any) {
      this.logger.warn(`Redis SET failed for [${key}]: ${err?.message}`);
    }
  }

  /**
   * Multi-Tier Cache-Aside:
   * 1. Checks L1 memory (0ms)
   * 2. Checks L2 Upstash Redis (~10ms)
   * 3. On miss, runs fetchFn(), caches in L2 & L1, and returns result.
   */
  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds: number = 3600,
    l1TtlSeconds: number = 60
  ): Promise<T> {
    // 1. Try L1 & L2
    const cached = await this.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    // 2. Cache Miss: Execute query
    const fresh = await fetchFn();

    // 3. Populate L1 & L2
    if (fresh !== null && fresh !== undefined) {
      await this.set(key, fresh, ttlSeconds, l1TtlSeconds);
    }

    return fresh;
  }

  /**
   * Deletes a key from both L1 and L2.
   */
  async del(key: string): Promise<void> {
    this.l1Cache.delete(key);

    if (!this.isEnabled || !this.client) return;

    try {
      await this.client.del(key);
    } catch (err: any) {
      this.logger.warn(`Redis DEL failed for [${key}]: ${err?.message}`);
    }
  }

  /**
   * Acquires a distributed lock using SET NX EX.
   * Useful for preventing double-tap orders and double payments.
   */
  async acquireLock(lockKey: string, ttlSeconds: number = 15): Promise<boolean> {
    if (!this.isEnabled || !this.client) {
      // In-memory fallback lock
      const now = Date.now();
      const existing = this.l1Cache.get(`lock:${lockKey}`);
      if (existing && existing.expiresAt > now) {
        return false;
      }
      this.l1Cache.set(`lock:${lockKey}`, { value: true, expiresAt: now + ttlSeconds * 1000 });
      return true;
    }

    try {
      const result = await this.client.set(`janki:lock:${lockKey}`, '1', {
        nx: true,
        ex: ttlSeconds,
      });
      return result === 'OK';
    } catch (err: any) {
      this.logger.warn(`Redis acquireLock failed for [${lockKey}]: ${err?.message}`);
      return true; // fail-open so orders are not blocked on network failure
    }
  }

  /**
   * Releases an acquired lock.
   */
  async releaseLock(lockKey: string): Promise<void> {
    await this.del(`janki:lock:${lockKey}`);
    this.l1Cache.delete(`lock:${lockKey}`);
  }
}

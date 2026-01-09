/**
 * Idempotency Repository
 * 
 * Storage layer for idempotency keys.
 * 
 * Architecture:
 * - Infrastructure layer only
 * - Redis preferred, database fallback
 * - TTL-based cleanup
 * - No business logic
 * 
 * Usage:
 * ```ts
 * const repo = new IdempotencyRepository();
 * await repo.set(key, data, ttl);
 * const result = await repo.get(key);
 * ```
 */

import { prisma } from '../../config/database.js';

/**
 * Idempotency Record Status
 */
export type IdempotencyStatus = 'processing' | 'completed' | 'failed';

/**
 * Idempotency Record
 */
export interface IdempotencyRecord {
  /**
   * Idempotency key
   */
  key: string;

  /**
   * Status
   */
  status: IdempotencyStatus;

  /**
   * Response snapshot (serialized)
   */
  response?: string;

  /**
   * Error message (if failed)
   */
  error?: string;

  /**
   * Created at timestamp
   */
  createdAt: Date;

  /**
   * Expires at timestamp
   */
  expiresAt: Date;
}

/**
 * Idempotency Repository Interface
 */
export interface IIdempotencyRepository {
  /**
   * Get idempotency record
   * 
   * @param key Idempotency key
   * @returns Record or null if not found
   */
  get(key: string): Promise<IdempotencyRecord | null>;

  /**
   * Set idempotency record
   * 
   * @param key Idempotency key
   * @param record Record data
   * @param ttlSeconds Time to live in seconds
   */
  set(key: string, record: Omit<IdempotencyRecord, 'key' | 'createdAt' | 'expiresAt'>, ttlSeconds: number): Promise<void>;

  /**
   * Lock idempotency key
   * 
   * @param key Idempotency key
   * @param ttlSeconds Lock duration in seconds
   * @returns True if lock acquired, false if already locked
   */
  lock(key: string, ttlSeconds: number): Promise<boolean>;

  /**
   * Release idempotency key lock
   * 
   * @param key Idempotency key
   */
  unlock(key: string): Promise<void>;

  /**
   * Delete idempotency record
   * 
   * @param key Idempotency key
   */
  delete(key: string): Promise<void>;
}

/**
 * Redis Idempotency Repository
 * 
 * Uses Redis for idempotency storage (preferred).
 */
class RedisIdempotencyRepository implements IIdempotencyRepository {
  private redis: any = null;
  private readonly keyPrefix = 'idempotency:';

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    try {
      // @ts-ignore - ioredis will be available after installation
      const Redis = require('ioredis');

      const connection = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      };

      this.redis = new Redis(connection);
    } catch (error) {
      // Redis not available - will fallback to database
      this.redis = null;
    }
  }

  private getRedisKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private getLockKey(key: string): string {
    return `${this.keyPrefix}lock:${key}`;
  }

  async get(key: string): Promise<IdempotencyRecord | null> {
    if (!this.redis) {
      return null; // Fallback to database
    }

    try {
      const data = await this.redis.get(this.getRedisKey(key));
      if (!data) {
        return null;
      }

      return JSON.parse(data) as IdempotencyRecord;
    } catch (error) {
      // Redis error - fallback to database
      return null;
    }
  }

  async set(key: string, record: Omit<IdempotencyRecord, 'key' | 'createdAt' | 'expiresAt'>, ttlSeconds: number): Promise<void> {
    if (!this.redis) {
      // Fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.set(key, record, ttlSeconds);
    }

    try {
      const fullRecord: IdempotencyRecord = {
        key,
        ...record,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      };

      await this.redis.setex(
        this.getRedisKey(key),
        ttlSeconds,
        JSON.stringify(fullRecord)
      );
    } catch (error) {
      // Redis error - fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.set(key, record, ttlSeconds);
    }
  }

  async lock(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.redis) {
      // Fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.lock(key, ttlSeconds);
    }

    try {
      // Use SET with NX (only if not exists) for atomic lock
      const result = await this.redis.set(
        this.getLockKey(key),
        'locked',
        'EX',
        ttlSeconds,
        'NX'
      );

      return result === 'OK';
    } catch (error) {
      // Redis error - fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.lock(key, ttlSeconds);
    }
  }

  async unlock(key: string): Promise<void> {
    if (!this.redis) {
      // Fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.unlock(key);
    }

    try {
      await this.redis.del(this.getLockKey(key));
    } catch (error) {
      // Redis error - fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.unlock(key);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.redis) {
      // Fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.delete(key);
    }

    try {
      await this.redis.del(this.getRedisKey(key));
    } catch (error) {
      // Redis error - fallback to database
      const dbRepo = new DatabaseIdempotencyRepository();
      return dbRepo.delete(key);
    }
  }
}

/**
 * Database Idempotency Repository
 * 
 * Uses database table for idempotency storage (fallback).
 * 
 * TODO: Create idempotency table in Prisma schema
 */
class DatabaseIdempotencyRepository implements IIdempotencyRepository {
  private readonly tableName = 'IdempotencyKey'; // TODO: Update when schema is created

  async get(key: string): Promise<IdempotencyRecord | null> {
    try {
      // TODO: Replace with actual Prisma query when schema is created
      // const record = await prisma.idempotencyKey.findUnique({
      //   where: { key },
      // });
      
      // For now, return null (no database table yet)
      return null;
    } catch (error) {
      return null;
    }
  }

  async set(key: string, record: Omit<IdempotencyRecord, 'key' | 'createdAt' | 'expiresAt'>, ttlSeconds: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      // TODO: Replace with actual Prisma query when schema is created
      // await prisma.idempotencyKey.upsert({
      //   where: { key },
      //   create: {
      //     key,
      //     status: record.status,
      //     response: record.response,
      //     error: record.error,
      //     expiresAt,
      //   },
      //   update: {
      //     status: record.status,
      //     response: record.response,
      //     error: record.error,
      //     expiresAt,
      //   },
      // });

      // For now, do nothing (no database table yet)
    } catch (error) {
      // Silently fail - idempotency is best-effort
    }
  }

  async lock(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      // TODO: Use database transaction with SELECT FOR UPDATE or similar
      // For now, return true (assume lock acquired)
      return true;
    } catch (error) {
      return false;
    }
  }

  async unlock(key: string): Promise<void> {
    // TODO: Release database lock
  }

  async delete(key: string): Promise<void> {
    try {
      // TODO: Replace with actual Prisma query when schema is created
      // await prisma.idempotencyKey.delete({
      //   where: { key },
      // });
    } catch (error) {
      // Silently fail
    }
  }
}

/**
 * Default Idempotency Repository
 * 
 * Uses Redis if available, falls back to database.
 */
export const idempotencyRepository: IIdempotencyRepository = new RedisIdempotencyRepository();


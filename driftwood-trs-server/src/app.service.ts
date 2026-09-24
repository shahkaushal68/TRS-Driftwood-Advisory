import { Injectable, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { version } from '../package.json';
import { pool } from './db';
import { redis } from './libs/redis';
import { logger } from './libs/logger';

@Injectable()
export class AppService implements OnApplicationBootstrap, OnApplicationShutdown {
  getHello(): string {
    return 'Hello World!';
  }

  getHealth() {
    return {
      status: 'ok',
      version,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  async onApplicationBootstrap() {
    await pool.query('SELECT 1');
    logger.info('Database connected');

    await redis.connect();
    // 'Redis connected' is logged by the redis 'connect' event handler
  }

  async onApplicationShutdown() {
    try {
      await pool.end();
      logger.info('Database disconnected');
    } catch (err) {
      logger.warn({ err }, 'Database disconnect error');
    }

    try {
      await redis.quit();
      logger.info('Redis disconnected');
    } catch (err) {
      logger.warn({ err }, 'redis quit error');
    }

    // Flush pino-pretty's worker thread before NestJS re-sends the kill signal
    await new Promise<void>((resolve) => {
      logger.flush(() => {
        resolve();
      });
    });
  }
}

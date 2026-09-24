import Redis from 'ioredis';
import { config } from './config';
import { logger } from './logger';

export const redis = new Redis({
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  username: config.REDIS_USERNAME,
  password: config.REDIS_PASSWORD,
  lazyConnect: true,
  maxRetriesPerRequest: 3,
});

redis.on('connect', () => {
  logger.info('Redis connected');
});
redis.on('error', (err: Error) => {
  logger.error({ err }, 'Redis error');
});

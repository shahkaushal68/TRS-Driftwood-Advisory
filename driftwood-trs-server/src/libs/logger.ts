import pino from 'pino';
import { config } from './config';
import { getReqId } from './request-context';

const isDev = config.NODE_ENV !== 'production';

export const logger = pino({
  level: isDev ? 'debug' : 'info',
  base: { service: 'driftwood-trs-server', pid: process.pid },
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const reqId = getReqId();
    return reqId ? { reqId } : {};
  },
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  }),
});

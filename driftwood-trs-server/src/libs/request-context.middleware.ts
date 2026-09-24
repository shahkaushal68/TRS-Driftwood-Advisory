import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { generateReqId, runWithReqId } from './request-context';
import { logger } from './logger';

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const reqId = (req.headers['x-request-id'] as string | undefined) ?? generateReqId();

    res.setHeader('x-request-id', reqId);

    runWithReqId(reqId, () => {
      const start = Date.now();

      logger.info({ method: req.method, url: req.originalUrl }, 'request started');

      res.on('finish', () => {
        logger.info(
          {
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            durationMs: Date.now() - start,
          },
          'request completed',
        );
      });

      next();
    });
  }
}

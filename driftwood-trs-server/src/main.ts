import './libs/config';
import { config } from './libs/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { NestLogger } from './libs/nest-logger';
import { logger } from './libs/logger';
import helmet from 'helmet';
import * as express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { auth } from './auth/auth';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new NestLogger(),
    bodyParser: false, // better-auth reads the raw request body itself
  });

  app.use(helmet());

  app.enableCors({
    origin: config.CORS_ORIGIN,
    credentials: true,
  });

  // Intercept /api/auth/* before the body parser runs
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith('/api/auth')) {
      void toNodeHandler(auth)(req, res);
      return;
    }
    next();
  });

  // Re-enable body parsing for all NestJS routes
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.setGlobalPrefix(config.API_PREFIX);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableShutdownHooks();

  await app.listen(config.PORT);
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'server started');
}

void bootstrap();

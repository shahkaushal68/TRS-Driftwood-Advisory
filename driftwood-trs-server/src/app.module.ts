import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { UsersModule } from './users/users.module';
import { AdminModule } from './admin/admin.module';
import { AiPromptsModule } from './ai-prompts/ai-prompts.module';
import { AiProviderConfigurationsModule } from './ai-provider-configurations/ai-provider-configurations.module';
import { AiReviewModule } from './ai-review/ai-review.module';
import { DocumentsModule } from './documents/documents.module';
import { ExecutiveReportModule } from './executive-report/executive-report.module';
import { TrsDashboardModule } from './trs-dashboard/trs-dashboard.module';
import { UploadModule } from './upload/upload.module';
import { RequestContextMiddleware } from './libs/request-context.middleware';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    AuthModule,
    UsersModule,
    AdminModule,
    AiPromptsModule,
    AiProviderConfigurationsModule,
    AiReviewModule,
    UploadModule,
    DocumentsModule,
    ExecutiveReportModule,
    TrsDashboardModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*path');
  }
}

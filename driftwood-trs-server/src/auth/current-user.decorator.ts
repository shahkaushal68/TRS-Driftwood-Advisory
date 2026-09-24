import { createParamDecorator, type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { auth } from './auth';

export type SessionUser = typeof auth.$Infer.Session.user;

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): SessionUser => {
    const request = ctx.switchToHttp().getRequest<{ user?: SessionUser }>();
    if (!request.user) throw new UnauthorizedException();
    return request.user;
  },
);

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { IncomingMessage } from 'http';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth';
import { IS_PUBLIC_KEY } from './public.decorator';
import type { SessionUser } from './current-user.decorator';

interface AuthenticatedRequest extends IncomingMessage {
  user?: SessionUser;
  session?: unknown;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) throw new UnauthorizedException();
    if (session.user.deletedAt) throw new UnauthorizedException('Account has been deleted');

    request.user = session.user;
    request.session = session.session;
    return true;
  }
}

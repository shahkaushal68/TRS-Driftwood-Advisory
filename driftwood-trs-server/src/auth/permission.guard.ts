import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY, type RequiredPermission } from './permission.decorator';
import { isAppRole, adminRole, analystRole, userRole } from './roles';
import type { SessionUser } from './current-user.decorator';

const roleMap = {
  user: userRole,
  analyst: analystRole,
  admin: adminRole,
} as const;

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<RequiredPermission | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!permission) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: SessionUser }>();
    const role = user?.role;
    const roleObj = isAppRole(role) ? roleMap[role] : undefined;

    if (!roleObj) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const { success } = roleObj.authorize({ [permission.resource]: [permission.action] });
    if (!success) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

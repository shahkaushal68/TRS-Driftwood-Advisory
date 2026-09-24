import { SetMetadata } from '@nestjs/common';
import type { statement } from './roles';

export type PermissionResource = keyof typeof statement;
export type DocumentAction = (typeof statement)['document'][number];

export interface RequiredPermission {
  resource: PermissionResource;
  action: string;
}

export const PERMISSION_KEY = 'permission';
export const RequirePermission = (resource: PermissionResource, action: string) =>
  SetMetadata(PERMISSION_KEY, { resource, action } satisfies RequiredPermission);

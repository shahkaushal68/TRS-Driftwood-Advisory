import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import { fromNodeHeaders } from 'better-auth/node';
import { and, asc, count, desc, eq, isNull, ne, or } from 'drizzle-orm';
import { auth } from '../auth/auth';
import type { SessionUser } from '../auth/current-user.decorator';
import { db } from '../db';
import { user } from '../db/schema';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import { type SafeUser, safeUserSelect } from './safe-user';
import {
  type PaginatedResponse,
  type PaginationQueryDto,
  paginatedResponse,
} from '../libs/pagination';

const USER_SORT_COLUMNS = {
  createdAt: user.createdAt,
  name: user.name,
  email: user.email,
} as const;

@Injectable()
export class UsersService {
  async getProfile(userId: string): Promise<SafeUser> {
    const rows = await db.select(safeUserSelect).from(user).where(eq(user.id, userId)).limit(1);
    const found = rows[0];
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return found;
  }

  async updateProfile(
    currentUser: SessionUser,
    dto: UpdateProfileDto,
    headers: IncomingHttpHeaders,
  ): Promise<SafeUser> {
    const hasProfileUpdate = dto.name !== undefined || dto.email !== undefined;

    if (hasProfileUpdate) {
      const updatePayload: Partial<Pick<typeof user.$inferSelect, 'name' | 'email' | 'updatedAt'>> =
        { updatedAt: new Date() };

      if (dto.name !== undefined) {
        updatePayload.name = dto.name;
      }
      if (dto.email !== undefined) {
        updatePayload.email = dto.email;
      }

      await db.update(user).set(updatePayload).where(eq(user.id, currentUser.id));
    }

    if (dto.currentPassword && dto.newPassword) {
      try {
        await auth.api.changePassword({
          body: {
            currentPassword: dto.currentPassword,
            newPassword: dto.newPassword,
            revokeOtherSessions: false,
          },
          headers: fromNodeHeaders(headers),
        });
      } catch {
        throw new BadRequestException('Current password is incorrect');
      }
    }

    return this.getProfile(currentUser.id);
  }

  async listUsers(
    currentUser: SessionUser,
    query: PaginationQueryDto,
  ): Promise<PaginatedResponse<SafeUser>> {
    const whereClause =
      currentUser.role === 'admin'
        ? isNull(user.deletedAt)
        : and(isNull(user.deletedAt), or(isNull(user.role), ne(user.role, 'admin')));

    const sortCol =
      (
        USER_SORT_COLUMNS as Record<
          string,
          (typeof USER_SORT_COLUMNS)[keyof typeof USER_SORT_COLUMNS]
        >
      )[query.sortBy] ?? user.createdAt;
    const orderBy = query.sortDirection === 'asc' ? asc(sortCol) : desc(sortCol);
    const offset = (query.pageNumber - 1) * query.perPage;

    const [[countResult], data] = await Promise.all([
      db.select({ total: count() }).from(user).where(whereClause),
      db
        .select(safeUserSelect)
        .from(user)
        .where(whereClause)
        .orderBy(orderBy)
        .limit(query.perPage)
        .offset(offset),
    ]);

    return paginatedResponse(data, countResult?.total ?? 0, query);
  }

  async getUserById(id: string, currentUser: SessionUser): Promise<SafeUser> {
    if (currentUser.role === 'user' && id !== currentUser.id) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const rows = await db
      .select(safeUserSelect)
      .from(user)
      .where(and(eq(user.id, id), isNull(user.deletedAt)))
      .limit(1);
    const found = rows[0];

    if (!found) {
      throw new NotFoundException('User not found');
    }

    if (currentUser.role === 'analyst' && found.role === 'admin') {
      throw new ForbiddenException('Insufficient permissions');
    }

    return found;
  }
}

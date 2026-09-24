import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { IncomingHttpHeaders } from 'http';
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../auth/auth';
import type { SessionUser } from '../../auth/current-user.decorator';
import { db } from '../../db';
import { user, session } from '../../db/schema';
import { config } from '../../libs/config';
import { markNewUserSetup } from '../../libs/request-context';
import {
  type PaginatedResponse,
  type PaginationQueryDto,
  paginatedResponse,
} from '../../libs/pagination';
import type { CreateUserDto } from './dto/create-user.dto';
import type { UpdateUserDto } from './dto/update-user.dto';
import type { BanUserDto } from './dto/ban-user.dto';
import { type SafeUser, safeUserSelect } from '../../users/safe-user';

const ADMIN_USER_SORT_COLUMNS = {
  createdAt: user.createdAt,
  name: user.name,
  email: user.email,
} as const;

@Injectable()
export class AdminUsersService {
  async createUser(dto: CreateUserDto, headers: IncomingHttpHeaders): Promise<SafeUser> {
    const tempPassword = crypto.randomUUID() + crypto.randomUUID();

    await auth.api.createUser({
      body: {
        name: dto.name,
        email: dto.email,
        password: tempPassword,
        role: dto.role,
      },
      headers: fromNodeHeaders(headers),
    });

    markNewUserSetup(dto.role);
    await auth.api.requestPasswordReset({
      body: {
        email: dto.email,
        redirectTo: `${config.CORS_ORIGIN}/reset-password`,
      },
      headers: new Headers(),
    });

    const created = await db
      .select(safeUserSelect)
      .from(user)
      .where(eq(user.email, dto.email))
      .limit(1);

    if (!created[0]) {
      throw new NotFoundException('User not found after creation');
    }

    return created[0];
  }

  async listUsers(query: PaginationQueryDto): Promise<PaginatedResponse<SafeUser>> {
    const whereClause = isNull(user.deletedAt);
    const sortCol =
      (
        ADMIN_USER_SORT_COLUMNS as Record<
          string,
          (typeof ADMIN_USER_SORT_COLUMNS)[keyof typeof ADMIN_USER_SORT_COLUMNS]
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

  async getUser(id: string): Promise<SafeUser> {
    const rows = await db
      .select(safeUserSelect)
      .from(user)
      .where(and(eq(user.id, id), isNull(user.deletedAt)))
      .limit(1);

    const found = rows[0];
    if (!found) {
      throw new NotFoundException(`User ${id} not found`);
    }

    return found;
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    headers: IncomingHttpHeaders,
  ): Promise<SafeUser> {
    await this.getUser(id);

    const fieldsToUpdate: Partial<Pick<typeof user.$inferInsert, 'name' | 'email' | 'updatedAt'>> =
      {};
    if (dto.name !== undefined) fieldsToUpdate.name = dto.name;
    if (dto.email !== undefined) fieldsToUpdate.email = dto.email;

    if (Object.keys(fieldsToUpdate).length > 0) {
      fieldsToUpdate.updatedAt = new Date();
      await db.update(user).set(fieldsToUpdate).where(eq(user.id, id));
    }

    if (dto.role !== undefined) {
      await auth.api.setRole({
        body: { userId: id, role: dto.role },
        headers: fromNodeHeaders(headers),
      });
    }

    return this.getUser(id);
  }

  async deleteUser(id: string, currentUser: SessionUser): Promise<void> {
    if (currentUser.id === id) {
      throw new BadRequestException('You cannot delete your own account');
    }

    await this.getUser(id);

    await db.update(user).set({ deletedAt: new Date() }).where(eq(user.id, id));
    await db.delete(session).where(eq(session.userId, id));
  }

  async banUser(
    id: string,
    dto: BanUserDto,
    currentUser: SessionUser,
    headers: IncomingHttpHeaders,
  ): Promise<SafeUser> {
    if (currentUser.id === id) {
      throw new BadRequestException('You cannot ban yourself');
    }

    await this.getUser(id);

    await auth.api.banUser({
      body: {
        userId: id,
        banReason: dto.reason,
        banExpiresIn: dto.expiresIn,
      },
      headers: fromNodeHeaders(headers),
    });

    return this.getUser(id);
  }

  async unbanUser(id: string, headers: IncomingHttpHeaders): Promise<SafeUser> {
    await this.getUser(id);

    await auth.api.unbanUser({
      body: { userId: id },
      headers: fromNodeHeaders(headers),
    });

    return this.getUser(id);
  }
}

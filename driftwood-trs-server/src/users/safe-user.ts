import { user } from '../db/schema';

export const safeUserSelect = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  banned: user.banned,
  banReason: user.banReason,
  banExpires: user.banExpires,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
} as const;

export type SafeUser = Pick<typeof user.$inferSelect, keyof typeof safeUserSelect>;

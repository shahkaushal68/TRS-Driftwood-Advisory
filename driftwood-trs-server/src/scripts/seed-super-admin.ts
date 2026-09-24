import 'dotenv/config';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { user } from '../db/schema';
import { auth } from '../auth/auth';

const seedEnv = z
  .object({
    SUPER_ADMIN_EMAIL: z.email(),
    SUPER_ADMIN_PASSWORD: z.string().min(8, 'Password must be at least 8 characters'),
    SUPER_ADMIN_NAME: z.string().min(1).default('Super Admin'),
  })
  .parse(process.env);

async function seed(): Promise<void> {
  const [existing] = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(eq(user.email, seedEnv.SUPER_ADMIN_EMAIL))
    .limit(1);

  if (existing !== undefined) {
    if (existing.role === 'admin') {
      console.log(`Super admin already exists (${seedEnv.SUPER_ADMIN_EMAIL}), skipping.`);
      return;
    }

    await db.update(user).set({ role: 'admin' }).where(eq(user.id, existing.id));

    console.log(`Promoted existing user to super admin: ${seedEnv.SUPER_ADMIN_EMAIL}`);
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: seedEnv.SUPER_ADMIN_EMAIL,
      password: seedEnv.SUPER_ADMIN_PASSWORD,
      name: seedEnv.SUPER_ADMIN_NAME,
    },
  });

  if (!result.user.id) {
    throw new Error('better-auth signUpEmail returned no user — check your auth configuration.');
  }

  await db.update(user).set({ role: 'admin' }).where(eq(user.id, result.user.id));

  console.log(`Super admin created: ${seedEnv.SUPER_ADMIN_EMAIL}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });

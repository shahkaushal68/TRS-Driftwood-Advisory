import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { db } from '../db';
import * as schema from '../db/schema';
import { config } from '../libs/config';
import { redis } from '../libs/redis';
import { sendAccountSetupEmail, sendPasswordResetEmail } from '../libs/mailer';
import { getNewUserRole, isNewUserSetup } from '../libs/request-context';
import { adminRole, analystRole, userRole } from './roles';

export const auth = betterAuth({
  secret: config.BETTER_AUTH_SECRET,
  baseURL: config.BETTER_AUTH_URL,
  trustedOrigins: [config.CORS_ORIGIN],
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema,
  }),
  secondaryStorage: {
    get: (key) => redis.get(key),
    set: (key, value, ttl) =>
      ttl
        ? redis.set(key, value, 'EX', ttl).then(() => undefined)
        : redis.set(key, value).then(() => undefined),
    delete: (key) => redis.del(key).then(() => undefined),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // slide expiry daily on activity
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5-minute encrypted cookie cache — avoids Redis hit on most requests
    },
  },
  user: {
    additionalFields: {
      deletedAt: {
        type: 'date',
        required: false,
        fieldName: 'deletedAt',
        input: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,

    sendResetPassword: ({ user, url }) => {
      if (isNewUserSetup()) {
        sendAccountSetupEmail(user.email, user.name, getNewUserRole(), url);
      } else {
        sendPasswordResetEmail(user.email, url, user.name);
      }
      return Promise.resolve();
    },
  },
  plugins: [
    admin({
      defaultRole: 'user',
      roles: {
        user: userRole,
        admin: adminRole,
        analyst: analystRole,
      },
    }),
  ],
});

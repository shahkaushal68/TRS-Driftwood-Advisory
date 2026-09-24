import { createAccessControl } from 'better-auth/plugins/access';

// Extend this statement to add new resources or actions as the app grows.
// Each role below receives an explicit subset of these permissions.
export const statement = {
  user: ['create', 'read', 'list', 'readAll', 'update', 'delete', 'ban', 'impersonate', 'set-role'],
  document: [
    'upload',
    'classify',
    'review',
    'submitAiReview',
    'setSufficiency',
    'publish',
    'read',
    'reset',
  ],
} as const;

const ac = createAccessControl(statement);

export const userRole = ac.newRole({
  user: ['read'],
  document: ['upload', 'classify', 'read', 'submitAiReview'],
});

// Both Admin and Analyst get 'reset' — Document-Level Evidence Reset is available to
// either role; only the 'user' role (the document's own customer) is excluded.
export const analystRole = ac.newRole({
  user: ['read', 'list'],
  document: ['review', 'submitAiReview', 'setSufficiency', 'publish', 'read', 'reset'],
});

export const adminRole = ac.newRole({
  user: ['create', 'read', 'list', 'readAll', 'update', 'delete', 'ban', 'impersonate', 'set-role'],
  document: ['review', 'submitAiReview', 'setSufficiency', 'publish', 'read', 'reset'],
});

export { ac };

export type AppRole = 'user' | 'admin' | 'analyst';

export function isAppRole(role: string | null | undefined): role is AppRole {
  return role === 'user' || role === 'admin' || role === 'analyst';
}

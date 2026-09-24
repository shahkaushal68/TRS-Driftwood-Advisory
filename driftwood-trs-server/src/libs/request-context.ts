import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

interface RequestContext {
  reqId: string;
  newUserSetup?: boolean;
  newUserRole?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithReqId<T>(reqId: string, fn: () => T): T {
  return storage.run({ reqId }, fn);
}

export function getReqId(): string | undefined {
  return storage.getStore()?.reqId;
}

export function generateReqId(): string {
  return randomUUID();
}

export function markNewUserSetup(role: string): void {
  const store = storage.getStore();
  if (store) {
    store.newUserSetup = true;
    store.newUserRole = role;
  }
}

export function isNewUserSetup(): boolean {
  return storage.getStore()?.newUserSetup === true;
}

export function getNewUserRole(): string {
  return storage.getStore()?.newUserRole ?? 'user';
}

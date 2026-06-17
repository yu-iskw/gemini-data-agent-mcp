import { InMemorySessionStore } from './store.js';

import type { SessionStore } from './store.js';

export function createSessionStore(): SessionStore {
  return new InMemorySessionStore();
}

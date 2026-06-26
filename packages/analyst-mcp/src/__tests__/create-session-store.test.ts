import { describe, expect, it } from 'vitest';

import { createSessionStore } from '../session/create-session-store.js';
import { InMemorySessionStore } from '../session/store.js';

describe('createSessionStore', () => {
  it('returns an in-memory session store by default', () => {
    const store = createSessionStore();
    expect(store).toBeInstanceOf(InMemorySessionStore);
  });
});

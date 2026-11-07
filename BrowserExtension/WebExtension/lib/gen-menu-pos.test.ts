// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
        set: vi.fn(async (obj: Record<string, unknown>) => {
          Object.assign(store, obj);
        }),
      },
    },
  },
}));

const { loadGenMenuPos, saveGenMenuPos } = await import('./gen-menu-pos');

describe('gen-menu-pos', () => {
  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
  });

  it('returns null when nothing is stored for the origin', async () => {
    expect(await loadGenMenuPos('https://example.com')).toBeNull();
  });

  it('remembers a place per origin across save/load', async () => {
    await saveGenMenuPos('https://a.test', { left: 120, top: 80 });
    await saveGenMenuPos('https://b.test', { left: 10, top: 20 });
    expect(await loadGenMenuPos('https://a.test')).toEqual({ left: 120, top: 80 });
    expect(await loadGenMenuPos('https://b.test')).toEqual({ left: 10, top: 20 });
  });
});

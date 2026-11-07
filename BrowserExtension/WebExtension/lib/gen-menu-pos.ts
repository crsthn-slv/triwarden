import { browser } from 'wxt/browser';

/** Absolute viewport place for the Safari generate menu, remembered per page origin. */
export type GenMenuPos = { left: number; top: number };

const KEY = 'genMenuPos';

type Store = Record<string, GenMenuPos>;

async function readStore(): Promise<Store> {
  try {
    const got = await browser.storage.local.get(KEY);
    const raw = got[KEY];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Store;
  } catch {
    // storage may be unavailable in unit tests
  }
  return {};
}

/** Load the last dragged place for this origin, if any. */
export async function loadGenMenuPos(origin: string): Promise<GenMenuPos | null> {
  const store = await readStore();
  const pos = store[origin];
  if (!pos || typeof pos.left !== 'number' || typeof pos.top !== 'number') return null;
  return { left: pos.left, top: pos.top };
}

/** Remember where the person left the generate menu on this origin. */
export async function saveGenMenuPos(origin: string, pos: GenMenuPos): Promise<void> {
  try {
    const store = await readStore();
    store[origin] = { left: pos.left, top: pos.top };
    await browser.storage.local.set({ [KEY]: store });
  } catch {
    // ignore — remembering place is best-effort
  }
}

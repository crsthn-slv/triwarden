import { describe, expect, it } from 'vitest';
import { vaultFillInOverlay } from './runtime';

describe('vaultFillInOverlay', () => {
  it('is off on Safari (system AutoFill owns pick/fill)', () => {
    expect(vaultFillInOverlay('safari')).toBe(false);
  });

  it('stays on for Chromium and Firefox builds', () => {
    expect(vaultFillInOverlay('chrome')).toBe(true);
    expect(vaultFillInOverlay('firefox')).toBe(true);
    expect(vaultFillInOverlay('edge')).toBe(true);
  });
});

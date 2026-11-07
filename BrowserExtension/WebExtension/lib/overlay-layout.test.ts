import { describe, expect, it } from 'vitest';
import {
  generateMenuPlace,
  iconPosition,
  menuLeft,
  menuLeftNearIcon,
  menuVertical,
  menuVerticalGenerate,
  SYSTEM_AUTOFILL_ICON_CLEARANCE,
} from './overlay-layout';

const field = { left: 100, right: 300, top: 40, height: 42 } as DOMRect;

describe('overlay placement', () => {
  it('mirrors the icon inside right-to-left fields, clear of the native AutoFill key', () => {
    const inset = 30 + SYSTEM_AUTOFILL_ICON_CLEARANCE;
    expect(iconPosition(field, false, false)).toMatchObject({
      left: `${field.right - inset}px`,
      top: '50px',
    });
    expect(iconPosition(field, true, false)).toMatchObject({
      left: `${field.left + 8 + SYSTEM_AUTOFILL_ICON_CLEARANCE}px`,
      top: '50px',
    });
  });

  it('puts the icon beyond the visual end of a one-time-code row', () => {
    expect(iconPosition(field, false, true).left).toBe('306px');
    expect(iconPosition(field, true, true).left).toBe('72px');
  });

  it('aligns the menu to the field start in either direction', () => {
    const wideField = { left: 500, right: 800 };
    expect(menuLeft(wideField, 332, false, 1440)).toBe('500px');
    expect(menuLeft(wideField, 332, true, 1440)).toBe('468px');
  });

  it('keeps the menu inside the viewport', () => {
    expect(menuLeft({ left: -20, right: 100 }, 332, false, 800)).toBe('8px');
    expect(menuLeft({ left: 700, right: 900 }, 332, true, 800)).toBe('460px');
  });

  it('anchors the menu to the icon trailing edge', () => {
    // icon at 200, width 280 → LTR left = 200 + 22 - 280 = -58 → clamped to 8
    expect(menuLeftNearIcon(200, 280, false, 1200)).toBe('8px');
    expect(menuLeftNearIcon(400, 280, false, 1200)).toBe('142px'); // 400 + 22 - 280
    expect(menuLeftNearIcon(400, 280, true, 1200)).toBe('400px');
  });

  it('prefers the menu above the field when there is room (system AutoFill owns below)', () => {
    const mid = { top: 400, bottom: 442 };
    // top = 400 - 6 - 200 = 194
    expect(menuVertical(mid, 200, 900)).toEqual({ top: '194px', above: true });
  });

  it('falls back below when the space above is too tight', () => {
    const nearTop = { top: 40, bottom: 82 };
    expect(menuVertical(nearTop, 200, 900)).toEqual({ top: '88px', above: false });
  });

  it('picks the larger side when neither fits the full menu height', () => {
    const cramped = { top: 80, bottom: 120 };
    // aboveRoom = 68, belowRoom = 200 - 120 - 12 = 68 → above preferred when tied via >=
    expect(menuVertical(cramped, 200, 200)).toEqual({ top: '8px', above: true }); // clamped
    expect(menuVertical(cramped, 200, 400)).toEqual({ top: '126px', above: false });
  });
});

describe('generateMenuPlace', () => {
  const viewport = { width: 1200, height: 800 };
  const field = { left: 100, right: 400, top: 300, bottom: 340 };
  const confirm = { left: 100, right: 400, top: 360, bottom: 400 };

  it('sits above the new password when it fits, ending at the icon', () => {
    const p = generateMenuPlace(field, confirm, 280, 110, viewport, false);
    expect(p.vertical).toEqual({ top: `${300 - 6 - 110}px`, above: true });
    const iconLeft = 400 - 30 - SYSTEM_AUTOFILL_ICON_CLEARANCE;
    expect(p.left).toBe(menuLeftNearIcon(iconLeft, 280, false, 1200));
  });

  it('goes below the confirm field, never over it, when there is no room above', () => {
    const high = { ...field, top: 40, bottom: 80 };
    const below = { ...confirm, top: 100, bottom: 140 };
    const p = generateMenuPlace(high, below, 280, 110, viewport, false);
    expect(p.vertical).toEqual({ top: `${140 + 6}px`, above: false });
  });

  it('stays inside the viewport', () => {
    const p = generateMenuPlace({ left: 0, right: 120, top: 300, bottom: 340 }, null, 280, 110, viewport, false);
    expect(p.left).toBe('8px');
  });

  it('menuVerticalGenerate matches generateMenuPlace vertical', () => {
    expect(menuVerticalGenerate(field, confirm, 110, 800)).toEqual({ top: '184px', above: true });
  });
});

import { describe, expect, it } from 'vitest';
import { iconPosition, menuLeft, menuVertical, SYSTEM_AUTOFILL_ICON_CLEARANCE } from './overlay-layout';

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

  it('prefers the menu above the field when there is room (system AutoFill owns below)', () => {
    const mid = { top: 400, bottom: 442 };
    expect(menuVertical(mid, 200, 900)).toEqual({ bottom: '506px', above: true });
  });

  it('falls back below when the space above is too tight', () => {
    const nearTop = { top: 40, bottom: 82 };
    expect(menuVertical(nearTop, 200, 900)).toEqual({ top: '88px', above: false });
  });

  it('picks the larger side when neither fits the full menu height', () => {
    const cramped = { top: 80, bottom: 120 };
    // aboveRoom = 68, belowRoom = viewport - 120 - 12
    expect(menuVertical(cramped, 200, 200)).toEqual({ bottom: '126px', above: true });
    expect(menuVertical(cramped, 200, 400)).toEqual({ top: '126px', above: false });
  });
});

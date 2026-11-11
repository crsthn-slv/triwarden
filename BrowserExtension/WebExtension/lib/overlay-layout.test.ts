// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  applyMenuDrag,
  generateMenuPlace,
  iconPosition,
  menuLeft,
  menuVertical,
  menuVerticalGenerate,
  pinOverlayHost,
  pinToTopLayer,
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

  it('sits above the new password when it fits, starting with the field', () => {
    const p = generateMenuPlace(field, confirm, 280, 110, viewport, false);
    expect(p.vertical).toEqual({ top: `${300 - 6 - 110}px`, above: true });
    expect(p.left).toBe('100px');
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

describe('pinOverlayHost', () => {
  it('forces a viewport-sized host so absolute menus are not stuck at the origin', () => {
    const host = document.createElement('div');
    const box = document.createElement('div');
    // Simulate WXT's overlay defaults that Safari mishandles.
    host.style.position = 'relative';
    host.style.width = '0';
    host.style.height = '0';
    pinOverlayHost(host, box);
    expect(host.style.getPropertyValue('position')).toBe('fixed');
    expect(host.style.getPropertyPriority('position')).toBe('important');
    expect(host.style.getPropertyValue('pointer-events')).toBe('none');
    expect(host.style.getPropertyValue('top')).toBe('0px');
    expect(box.style.getPropertyValue('position')).toBe('absolute');
    expect(box.style.getPropertyValue('pointer-events')).toBe('none');
    expect(box.style.getPropertyPriority('top')).toBe('important');
  });
});

describe('applyMenuDrag', () => {
  const vp = { width: 1000, height: 800 };

  it('shifts from the anchored place by the drag delta', () => {
    expect(applyMenuDrag(100, 200, 40, -30, 300, 140, vp)).toEqual({ left: '140px', top: '170px' });
  });

  it('keeps the dragged menu inside the viewport', () => {
    expect(applyMenuDrag(100, 200, 900, 900, 300, 140, vp)).toEqual({ left: '692px', top: '652px' });
    expect(applyMenuDrag(100, 200, -500, -500, 300, 140, vp)).toEqual({ left: '8px', top: '8px' });
  });
});

describe('pinToTopLayer', () => {
  /** jsdom has no Popover API: a host that records show/hide stands in for it. */
  function fakeHost() {
    const host = document.createElement('div') as unknown as HTMLElement & { open: boolean };
    host.open = false;
    host.showPopover = vi.fn(() => void (host.open = true));
    host.hidePopover = vi.fn(() => void (host.open = false));
    host.matches = ((sel: string) => (sel === ':popover-open' ? host.open : false)) as typeof host.matches;
    return host;
  }
  const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

  it('does nothing where the Popover API is missing', () => {
    const host = document.createElement('div');
    expect(() => pinToTopLayer(host)()).not.toThrow();
    expect(host.hasAttribute('popover')).toBe(false);
  });

  it('shows the host as a manual popover and raises it again when the page opens a popover or dialog', async () => {
    const host = fakeHost();
    const unpin = pinToTopLayer(host);
    expect(host.getAttribute('popover')).toBe('manual');
    expect(host.showPopover).toHaveBeenCalledTimes(1);

    const page = document.createElement('div');
    document.body.append(page);
    const toggle = new Event('toggle');
    Object.assign(toggle, { newState: 'open' });
    page.dispatchEvent(toggle); // toggle does not bubble but the listener is a capture one on document
    await frame();
    expect(host.hidePopover).toHaveBeenCalledTimes(1);
    expect(host.showPopover).toHaveBeenCalledTimes(2);

    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.setAttribute('open', '');
    await new Promise((r) => setTimeout(r, 0));
    await frame();
    expect(host.showPopover).toHaveBeenCalledTimes(3);

    unpin();
    page.dispatchEvent(toggle);
    await frame();
    expect(host.showPopover).toHaveBeenCalledTimes(3);
  });

  it('ignores its own toggle', async () => {
    const host = fakeHost();
    document.body.append(host);
    const unpin = pinToTopLayer(host);
    const toggle = new Event('toggle');
    Object.assign(toggle, { newState: 'open' });
    host.dispatchEvent(toggle);
    await frame();
    expect(host.showPopover).toHaveBeenCalledTimes(1);
    unpin();
  });
});

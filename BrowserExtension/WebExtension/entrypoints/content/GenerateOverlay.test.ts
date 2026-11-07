// @vitest-environment jsdom
import { createComponent, render } from 'solid-js/web';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/send', () => ({
  send: vi.fn(async () => ({ ok: true, value: 'Gen3rated!Pw' })),
}));
const { default: GenerateOverlay } = await import('./GenerateOverlay');

HTMLElement.prototype.getBoundingClientRect = function () {
  return new DOMRect(0, 200, 300, 40);
};
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let dispose: (() => void) | undefined;
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
});

describe('GenerateOverlay', () => {
  const mount = async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    document.body.innerHTML = `<form><input type=email name=e>
      <input type=password name=p autocomplete=new-password><input type=password name=c autocomplete=new-password></form>`;
    const host = document.createElement('div');
    document.body.append(host);
    dispose = render(() => createComponent(GenerateOverlay, {}), host);
    await tick();
    return host;
  };

  it('shows a suggested password as soon as the menu opens, and one click fills both fields', async () => {
    const host = await mount();
    const keys = host.querySelectorAll<HTMLButtonElement>('.key');
    expect(keys).toHaveLength(1);
    keys[0]!.click();
    await tick(5);
    expect(host.querySelector('.gen-value')!.textContent).toBe('Gen3rated!Pw');
    expect(document.querySelector<HTMLInputElement>('[name=p]')!.value).toBe(''); // shown, not filled yet
    host.querySelector<HTMLElement>('.gen-row')!.click();
    expect(document.querySelector<HTMLInputElement>('[name=p]')!.value).toBe('Gen3rated!Pw');
    expect(document.querySelector<HTMLInputElement>('[name=c]')!.value).toBe('Gen3rated!Pw');
    expect(host.querySelector('.menu')).toBeNull();
  });

  it('Return in the field uses the suggestion instead of submitting', async () => {
    const host = await mount();
    host.querySelector<HTMLButtonElement>('.key')!.click();
    await tick(5);
    const field = document.querySelector<HTMLInputElement>('[name=p]')!;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    field.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    expect(field.value).toBe('Gen3rated!Pw');
  });

  it('switching to passphrase asks for one', async () => {
    const { send } = await import('../../lib/send');
    const host = await mount();
    host.querySelector<HTMLButtonElement>('.key')!.click();
    await tick(5);
    host.querySelectorAll<HTMLButtonElement>('.gen-kinds button')[1]!.click();
    await tick(5);
    expect(vi.mocked(send).mock.calls.at(-1)![0]).toEqual({ command: 'generate', field: 'passphrase' });
  });

  it('keeps X and Y after drag ends (absolute place, not a cleared delta)', async () => {
    const host = await mount();
    host.querySelector<HTMLButtonElement>('.key')!.click();
    await tick(5);
    const card = host.querySelector<HTMLElement>('.menu.gen')!;
    const handle = host.querySelector<HTMLElement>('.gen-drag')!;
    // Seed a known place so the test does not depend on jsdom layout.
    card.style.left = '40px';
    card.style.top = '80px';
    // Solid owns style on re-render; dispatch drag which writes left/top via menuPos + direct DOM.
    handle.dispatchEvent(
      new PointerEvent('pointerdown', {
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: 180,
        clientY: 30,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: 180,
        clientY: 30,
        pointerId: 1,
        bubbles: true,
        cancelable: true,
      }),
    );
    await tick(0);

    const left = Number.parseFloat(card.style.left);
    const top = Number.parseFloat(card.style.top);
    expect(left).toBeGreaterThan(40); // moved +X
    expect(top).toBeLessThan(80); // moved -Y
    // Release must keep the place (no snap-back to the pre-drag spot).
    expect(left).not.toBe(40);
    expect(top).not.toBe(80);
  });
});

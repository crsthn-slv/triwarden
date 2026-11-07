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
});

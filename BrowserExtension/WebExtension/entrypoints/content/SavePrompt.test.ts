// @vitest-environment jsdom
import { createComponent, render } from 'solid-js/web';
import { expect, it, vi } from 'vitest';

// The background says a login waits in this tab, typed on example.com (an iframe or the page before a redirect).
vi.mock('wxt/browser', () => ({
  browser: {
    runtime: {
      sendMessage: vi.fn(async () => 'https://accounts.example.com/signup'),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
    },
  },
}));
let waiting = [{ id: 'p1', name: '', detail: 'me@example.com' }];
let failNext = true;
vi.mock('../../lib/send', () => ({
  send: vi.fn(async (req: { query?: string }) => {
    if (!req.query) return { ok: true, rows: waiting };
    if (failNext) {
      failNext = false;
      return { ok: false, error: "Couldn't save it. It's still waiting in Triwarden." };
    }
    waiting = waiting.filter((r) => r.id !== req.query);
    return { ok: true, value: 'done' };
  }),
}));
const { default: SavePrompt } = await import('./SavePrompt');
const { send } = await import('../../lib/send');
const tick = () => new Promise((r) => setTimeout(r, 0));

it('shows the waiting login for the site it was typed on; a failed save keeps the choices, a retry saves', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const dispose = render(() => createComponent(SavePrompt, {}), host);
  await tick();
  expect(host.querySelector('.save-title')!.textContent).toBe('Save this login for accounts.example.com?');
  expect(host.querySelector('.save-detail')!.textContent).toBe('me@example.com');

  host.querySelector<HTMLButtonElement>('.save-go')!.click();
  await tick();
  expect(host.querySelector('.save-error')!.textContent).toBe("Couldn't save it. It's still waiting in Triwarden.");
  expect(host.querySelector('.save-go')).not.toBeNull(); // still there to try again

  host.querySelector<HTMLButtonElement>('.save-go')!.click();
  await tick();
  expect(send).toHaveBeenLastCalledWith({ command: 'pending', query: 'p1', field: 'save' });
  expect(host.querySelector('.save-title')!.textContent).toBe('Saved to Triwarden.');
  expect(host.querySelector('.save-actions')).toBeNull();
  dispose();
});

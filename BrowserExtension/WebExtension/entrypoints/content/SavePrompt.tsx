import { createSignal, onCleanup, onMount, Show } from 'solid-js';
import { browser } from 'wxt/browser';
import type { Row } from '../../lib/protocol';
import { replyErrorMessage } from '../../lib/bridge-status';
import { t } from '../../lib/i18n';
import { send } from '../../lib/send';
import { AppMark } from './AppMark';

/**
 * The page's own "Save login?" card, top right like 1Password and Bitwarden, so a sign-up or a new password is not
 * missed in the menu bar. It shows what the app is holding for this tab's login (the same entries as the bell), so it
 * comes back after the page navigates or reloads until answered. Top frame only. The app is asked only when the
 * background says a login waits in this tab (it pings after any save), never on every page load.
 */
export default function SavePrompt() {
  const [row, setRow] = createSignal<Row | null>(null);
  /** The site the login was typed on (an iframe's or the page before a redirect), from the background. */
  const [site, setSite] = createSignal('');
  /** Saved: the card says so and goes. */
  const [done, setDone] = createSignal<string | null>(null);
  /** Failed: said under the question, with Save / Not Now still there to try again or let it go. */
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  /** Closed with × or Escape on this page: stays in the app's bell, not shown again here until something new waits. */
  const hidden = new Set<string>();
  let asking = 0;

  async function check() {
    const mine = ++asking;
    const url = (await browser.runtime.sendMessage({ ask: 'saves' }).catch(() => null)) as string | null;
    const reply = url ? await send({ command: 'pending' }) : null;
    if (mine !== asking) return;
    const next = (reply?.ok ? (reply.rows ?? []) : []).filter((r) => !hidden.has(r.id)).at(-1) ?? null;
    if (next?.id !== row()?.id) {
      setDone(null);
      setError(null);
    }
    if (url) setSite(new URL(url).hostname);
    setRow(next);
  }

  async function answer(r: Row, save: boolean) {
    if (busy()) return;
    setBusy(true);
    const reply = await send({ command: 'pending', query: r.id, field: save ? 'save' : 'never' });
    setBusy(false);
    if (!reply.ok) return setError(replyErrorMessage(reply));
    hidden.add(r.id);
    if (save) {
      setDone(r.name ? t('save.updated') : t('save.saved'));
      setTimeout(() => void check(), 1600);
    } else void check();
  }

  const close = (r: Row) => {
    hidden.add(r.id);
    setRow(null);
  };

  onMount(() => {
    void check();
    const asked = (message: unknown) => {
      if ((message as { trigger?: string } | null)?.trigger === 'saves') void check();
      return false;
    };
    const keys = (e: KeyboardEvent) => {
      const r = row();
      if (e.key === 'Escape' && r) close(r);
    };
    browser.runtime.onMessage.addListener(asked);
    document.addEventListener('keydown', keys, true);
    onCleanup(() => {
      browser.runtime.onMessage.removeListener(asked);
      document.removeEventListener('keydown', keys, true);
    });
  });

  return (
    <Show when={row()}>
      {(r) => (
        <div class="save-prompt" role="region" aria-label={t('save.dialog')}>
          <div class="save-card" dir="auto">
            <AppMark size={28} />
            {/* Announced when it appears or changes, without taking focus from the page. */}
            <div class="save-text" role="status" aria-live="polite">
              <Show when={!done()} fallback={<span class="save-title">{done()}</span>}>
                <span class="save-title">
                  {r().name ? t('save.updateFor', r().name) : t('save.saveFor', site() || location.hostname)}
                </span>
                <span class="save-detail">{r().detail || t('save.noUsername')}</span>
                <Show when={error()}>
                  <span class="save-error">{error()}</span>
                </Show>
              </Show>
            </div>
            <button
              type="button"
              class="bridge-banner-dismiss"
              aria-label={t('save.close')}
              title={t('save.close')}
              on:click={() => close(r())}
            >
              ×
            </button>
          </div>
          <Show when={!done()}>
            <div class="save-actions">
              <button type="button" class="save-later" disabled={busy()} on:click={() => void answer(r(), false)}>
                {t('save.notNow')}
              </button>
              <button type="button" class="save-go" disabled={busy()} on:click={() => void answer(r(), true)}>
                {r().name ? t('save.update') : t('save.save')}
              </button>
            </div>
          </Show>
        </div>
      )}
    </Show>
  );
}

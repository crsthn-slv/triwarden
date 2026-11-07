import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { generatePasswordFields, isRTL, setValue, visible } from '../../lib/dom';
import { iconPosition, menuLeft, menuVertical } from '../../lib/overlay-layout';
import { send } from '../../lib/send';
import { AppMark } from './AppMark';

/**
 * Safari content UI: system AutoFill owns vault pick/fill on ordinary login fields.
 * Icons appear only on generate-relevant password fields (new-password, change-password,
 * registration). Save/Update still runs via `watchForSubmits` with no field icon.
 */

type Target = { field: HTMLInputElement };
type Kind = 'password' | 'passphrase';
type Menu = { target: Target; note?: string };

const MENU_WIDTH = 280;
const MENU_HEIGHT = 110;

export default function GenerateOverlay() {
  const [targets, setTargets] = createSignal<Target[]>([]);
  const [tick, setTick] = createSignal(0);
  const [menu, setMenu] = createSignal<Menu | null>(null);
  let root!: HTMLDivElement;
  let asking = 0;

  const close = () => {
    asking++;
    setMenu(null);
  };

  function scan() {
    setTargets(generatePasswordFields().map((field) => ({ field })));
    setTick((n) => n + 1);
  }

  const place = (t: Target) => {
    tick();
    if (!t.field.isConnected || !visible(t.field)) return { display: 'none' };
    return iconPosition(t.field.getBoundingClientRect(), isRTL(t.field), false);
  };

  const menuPlace = (m: Menu) => {
    tick();
    const f = m.target.field;
    if (!f.isConnected) return null;
    const r = f.getBoundingClientRect();
    const left = menuLeft(r, MENU_WIDTH, isRTL(f), innerWidth);
    const vertical = menuVertical(r, MENU_HEIGHT, innerHeight);
    return { left, width: `${MENU_WIDTH}px`, vertical };
  };

  const menuStyle = (m: Menu) => {
    const place = menuPlace(m);
    if (!place) return { display: 'none' };
    const { left, width, vertical } = place;
    return {
      left,
      width,
      ...(vertical.top ? { top: vertical.top } : {}),
      ...(vertical.bottom ? { bottom: vertical.bottom } : {}),
    };
  };

  function open(target: Target) {
    setMenu({ target });
  }

  async function generate(kind: Kind, target: Target) {
    const mine = ++asking;
    setMenu({ target, note: kind === 'passphrase' ? 'Generating passphrase…' : 'Generating password…' });
    const reply = await send({
      command: 'generate',
      field: kind === 'passphrase' ? 'passphrase' : undefined,
    });
    if (mine !== asking) return;
    if (!reply.ok || !reply.value) {
      setMenu({ target, note: reply.error || "Triwarden isn't available." });
      return;
    }
    setValue(target.field, reply.value);
    close();
  }

  onMount(() => {
    scan();
    let timer: number | undefined;
    const rescan = () => {
      clearTimeout(timer);
      timer = window.setTimeout(scan, 250);
    };
    const move = () => setTick((n) => n + 1);
    const observer = new MutationObserver(rescan);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['type', 'style', 'class'],
    });
    const outside = (e: MouseEvent) => {
      const host = (root.getRootNode() as ShadowRoot).host;
      if (menu() && !e.composedPath().includes(host)) close();
    };
    const keys = (e: KeyboardEvent) => {
      if (menu() && e.key === 'Escape') close();
    };
    addEventListener('scroll', move, { passive: true, capture: true });
    addEventListener('resize', move, { passive: true });
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', keys, true);
    onCleanup(() => {
      clearTimeout(timer);
      observer.disconnect();
      removeEventListener('scroll', move, true);
      removeEventListener('resize', move);
      document.removeEventListener('mousedown', outside, true);
      document.removeEventListener('keydown', keys, true);
    });
  });

  return (
    <div ref={root}>
      <For each={targets()}>
        {(t) => (
          <button
            class="key"
            type="button"
            title="Generate with Triwarden"
            aria-label="Generate with Triwarden"
            style={place(t)}
            on:mousedown={(e) => e.preventDefault()}
            on:click={() => open(t)}
          >
            <AppMark size={22} />
          </button>
        )}
      </For>
      <Show when={menu()}>
        {(m) => (
          <div
            class="menu"
            role="menu"
            style={menuStyle(m())}
            data-rtl={isRTL(m().target.field)}
            data-above={menuPlace(m())?.vertical.above ?? false}
          >
            <Show when={m().note} fallback={
              <div class="list">
                <div
                  class="row"
                  role="menuitem"
                  data-active="true"
                  on:mousedown={(e) => e.preventDefault()}
                  on:click={() => generate('password', m().target)}
                >
                  <span class="text">
                    <span class="name">Generate password</span>
                    <span class="detail">Uses your Generator settings</span>
                  </span>
                </div>
                <div
                  class="row"
                  role="menuitem"
                  on:mousedown={(e) => e.preventDefault()}
                  on:click={() => generate('passphrase', m().target)}
                >
                  <span class="text">
                    <span class="name">Generate passphrase</span>
                    <span class="detail">Diceware words from your settings</span>
                  </span>
                </div>
              </div>
            }>
              {(note) => <div class="note" dir="auto">{note()}</div>}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { generateTargets, isRTL, setValue, visible, type GenerateTarget } from '../../lib/dom';
import { generateMenuPlace, iconPosition } from '../../lib/overlay-layout';
import { send } from '../../lib/send';
import { AppMark } from './AppMark';

/**
 * Safari content UI: system AutoFill owns vault pick/fill on ordinary login fields.
 * Icons appear only on generate-relevant password fields (new-password, change-password,
 * registration), never on the confirm field: generating fills both. Save/Update still runs via `watchForSubmits` with
 * no field icon.
 */

type Target = GenerateTarget;
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
    setTargets(generateTargets());
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
    const c = m.target.confirm;
    const confirm = c?.isConnected && visible(c) ? c.getBoundingClientRect() : null;
    const { left, vertical } = generateMenuPlace(
      f.getBoundingClientRect(),
      confirm,
      MENU_WIDTH,
      MENU_HEIGHT,
      { width: innerWidth, height: innerHeight },
      isRTL(f),
    );
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
    // The confirm field gets the same value, so the person does not retype a password they never saw.
    if (target.confirm?.isConnected && !target.confirm.disabled) setValue(target.confirm, reply.value);
    target.field.focus();
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
      attributeFilter: ['type', 'style', 'class', 'autocomplete', 'hidden', 'disabled'],
    });
    const outside = (e: MouseEvent) => {
      const host = (root.getRootNode() as ShadowRoot).host;
      if (menu() && !e.composedPath().includes(host)) close();
    };
    const keys = (e: KeyboardEvent) => {
      if (menu() && e.key === 'Escape') close();
    };
    // A field that appears on focus (step-by-step sign-up) or a form revealed by a class change: look again.
    const focused = (e: FocusEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'password') rescan();
    };
    document.addEventListener('focusin', focused, true);
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
      document.removeEventListener('focusin', focused, true);
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

import { createSignal, For, onCleanup, onMount, Show } from 'solid-js';
import { generateTargets, isRTL, setValue, visible, type GenerateTarget } from '../../lib/dom';
import { loadGenMenuPos, saveGenMenuPos, type GenMenuPos } from '../../lib/gen-menu-pos';
import { applyMenuDrag, generateMenuPlace, iconPosition } from '../../lib/overlay-layout';
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
/** The menu shows a ready value the moment it opens, like a password manager's inline generator. */
type Menu = { target: Target; kind: Kind; value?: string; error?: string };

const MENU_WIDTH = 300;
const MENU_HEIGHT = 140;
let lastKind: Kind = 'password'; // this page remembers the person's last choice while it stays open

/** Digits and symbols in their own colours, so 0/O and l/1 read apart at a glance (as in Passwords and Bitwarden). */
function Pretty(props: { value: string }) {
  return (
    <For each={[...props.value]}>
      {(ch) => <span data-c={/\d/.test(ch) ? 'digit' : /[A-Za-z\s]/.test(ch) ? undefined : 'symbol'}>{ch}</span>}
    </For>
  );
}

export default function GenerateOverlay() {
  const [targets, setTargets] = createSignal<Target[]>([]);
  const [tick, setTick] = createSignal(0);
  const [menu, setMenu] = createSignal<Menu | null>(null);
  /** Last absolute place on this origin (survives close + reload via extension storage). */
  const [remembered, setRemembered] = createSignal<GenMenuPos | null>(null);
  /** Live drag delta on top of the base place (anchor or remembered); cleared when the menu closes. */
  const [drag, setDrag] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  let root!: HTMLDivElement;
  let asking = 0;
  let dragSession: { startX: number; startY: number; origX: number; origY: number } | null = null;

  const origin = () => location.origin;

  const close = () => {
    asking++;
    // Persist the on-screen place before clearing the live drag delta.
    const m = menu();
    if (m) {
      const style = menuStyle(m);
      if (style && 'left' in style && 'top' in style && style.left && style.top) {
        const pos = { left: Number.parseFloat(String(style.left)), top: Number.parseFloat(String(style.top)) };
        if (Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
          setRemembered(pos);
          void saveGenMenuPos(origin(), pos);
        }
      }
    }
    dragSession = null;
    setDragging(false);
    setDrag({ x: 0, y: 0 });
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
    const mem = remembered();
    const baseLeft = mem?.left ?? Number.parseFloat(left);
    const baseTop = mem?.top ?? Number.parseFloat(vertical.top);
    const d = drag();
    const placed = applyMenuDrag(
      baseLeft,
      baseTop,
      d.x,
      d.y,
      MENU_WIDTH,
      MENU_HEIGHT,
      { width: innerWidth, height: innerHeight },
    );
    // Always `top` + clear `bottom`: never CSS `bottom` (Safari/WXT mis-resolve it on overlay hosts).
    return { left: placed.left, width, top: placed.top, bottom: 'auto' };
  };

  function persistCurrentPlace(m: Menu) {
    const style = menuStyle(m);
    if (!style || !('left' in style) || !style.left || !style.top) return;
    const pos = { left: Number.parseFloat(String(style.left)), top: Number.parseFloat(String(style.top)) };
    if (!Number.isFinite(pos.left) || !Number.isFinite(pos.top)) return;
    setRemembered(pos);
    void saveGenMenuPos(origin(), pos);
  }

  /** Drag from the "Suggested password" header; place is remembered for this origin across close/reload. */
  function onDragHandle(e: MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const d = drag();
    dragSession = { startX: e.clientX, startY: e.clientY, origX: d.x, origY: d.y };
    setDragging(true);
    const move = (ev: MouseEvent) => {
      if (!dragSession) return;
      setDrag({
        x: dragSession.origX + (ev.clientX - dragSession.startX),
        y: dragSession.origY + (ev.clientY - dragSession.startY),
      });
    };
    const up = () => {
      const open = menu();
      if (open) persistCurrentPlace(open);
      // Fold the delta into remembered absolute place so the next open starts here.
      setDrag({ x: 0, y: 0 });
      dragSession = null;
      setDragging(false);
      document.removeEventListener('mousemove', move, true);
      document.removeEventListener('mouseup', up, true);
    };
    document.addEventListener('mousemove', move, true);
    document.addEventListener('mouseup', up, true);
  }

  /** Ask the app for a fresh value of `kind` and show it in the open menu. */
  async function generate(target: Target, kind: Kind) {
    const mine = ++asking;
    lastKind = kind;
    setMenu({ target, kind });
    const reply = await send({ command: 'generate', field: kind === 'passphrase' ? 'passphrase' : undefined });
    if (mine !== asking) return;
    if (!reply.ok || !reply.value) return setMenu({ target, kind, error: reply.error || "Triwarden isn't available." });
    setMenu({ target, kind, value: reply.value });
  }

  function toggle(target: Target) {
    if (menu()?.target.field === target.field) return close();
    setDrag({ x: 0, y: 0 }); // keep remembered absolute place for this origin
    void generate(target, lastKind);
  }

  /** Put the shown value in the new password and its confirm field. */
  function use(m: Menu) {
    if (!m.value) return;
    setValue(m.target.field, m.value);
    // The confirm field gets the same value, so the person does not retype a password they never saw.
    if (m.target.confirm?.isConnected && !m.target.confirm.disabled) setValue(m.target.confirm, m.value);
    m.target.field.focus();
    close();
  }

  onMount(() => {
    void loadGenMenuPos(origin()).then((pos) => {
      if (pos) setRemembered(pos);
    });
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
      const m = menu();
      if (!m) return;
      if (e.key === 'Escape') close();
      // Enter in the field while the menu shows a value: use it (and don't submit the form half-filled).
      else if (e.key === 'Enter' && m.value && e.target === m.target.field) {
        e.preventDefault();
        e.stopPropagation();
        use(m);
      }
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
            title="Suggest a strong password"
            aria-label="Suggest a strong password with Triwarden"
            style={place(t)}
            on:mousedown={(e) => e.preventDefault()}
            on:click={() => toggle(t)}
          >
            <AppMark size={22} />
          </button>
        )}
      </For>
      <Show when={menu()}>
        {(m) => (
          <div
            class="menu gen"
            role="dialog"
            aria-label="Suggested password"
            style={menuStyle(m())}
            data-rtl={isRTL(m().target.field)}
            data-above={menuPlace(m())?.vertical.above ?? false}
            data-dragging={dragging()}
            on:mousedown={(e) => e.preventDefault()}
          >
            <div
              class="group gen-drag"
              title="Drag to move"
              on:mousedown={(e) => onDragHandle(e)}
            >
              {m().kind === 'passphrase' ? 'Suggested passphrase' : 'Suggested password'}
            </div>
            <Show when={!m().error} fallback={<div class="note" dir="auto">{m().error}</div>}>
              <div
                class="row gen-row"
                role="button"
                data-active="true"
                aria-disabled={!m().value}
                title={m().target.confirm ? 'Fill password and confirmation' : 'Fill password'}
                on:click={() => use(m())}
              >
                <span class="text">
                  <span class="gen-value" data-loading={!m().value}>
                    <Show when={m().value} fallback="Generating…">
                      {(v) => <Pretty value={v()} />}
                    </Show>
                  </span>
                  <span class="detail">
                    {m().target.confirm ? 'Click or press Return to fill both fields' : 'Click or press Return to fill'}
                  </span>
                </span>
                <button
                  class="icon-btn"
                  type="button"
                  title="Another one"
                  aria-label="Generate another"
                  on:click={(e) => {
                    e.stopPropagation();
                    void generate(m().target, m().kind);
                  }}
                >
                  <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
                    <path
                      d="M13.5 8a5.5 5.5 0 1 1-1.61-3.89M13.5 2.5v3.2h-3.2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </Show>
            <div class="gen-kinds" role="radiogroup" aria-label="Kind">
              <For each={['password', 'passphrase'] as Kind[]}>
                {(kind) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={m().kind === kind}
                    data-on={m().kind === kind}
                    on:click={() => m().kind !== kind && void generate(m().target, kind)}
                  >
                    {kind === 'password' ? 'Password' : 'Passphrase'}
                  </button>
                )}
              </For>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}

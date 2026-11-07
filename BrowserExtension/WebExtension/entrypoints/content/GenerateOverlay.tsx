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
  /**
   * Live absolute viewport place while the menu is open. Source of truth for left+top — not a drag
   * delta that gets cleared on pointer-up (that snapped the card back and made X feel stuck).
   */
  const [menuPos, setMenuPos] = createSignal<GenMenuPos | null>(null);
  const [dragging, setDragging] = createSignal(false);
  let root!: HTMLDivElement;
  let menuEl: HTMLDivElement | undefined;
  let asking = 0;
  let dragSession: { pointerId: number; startX: number; startY: number; origLeft: number; origTop: number } | null =
    null;

  const origin = () => location.origin;

  /** Anchor under the field icon (or confirm), ignoring any remembered / dragged place. */
  function anchorPlace(m: Menu): GenMenuPos | null {
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
    return { left: Number.parseFloat(left), top: Number.parseFloat(vertical.top) };
  }

  const menuAbove = (m: Menu) => {
    tick();
    const f = m.target.field;
    if (!f.isConnected) return false;
    const c = m.target.confirm;
    const confirm = c?.isConnected && visible(c) ? c.getBoundingClientRect() : null;
    return generateMenuPlace(
      f.getBoundingClientRect(),
      confirm,
      MENU_WIDTH,
      MENU_HEIGHT,
      { width: innerWidth, height: innerHeight },
      isRTL(f),
    ).vertical.above;
  };

  function persistPos(pos: GenMenuPos) {
    setRemembered(pos);
    void saveGenMenuPos(origin(), pos);
  }

  const close = () => {
    asking++;
    const pos = menuPos();
    if (pos) persistPos(pos);
    dragSession = null;
    setDragging(false);
    setMenuPos(null);
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

  /** Fixed viewport place from menuPos (drag commits here); fall back to anchor only if unset. */
  const menuStyle = (m: Menu) => {
    let pos = menuPos() ?? anchorPlace(m);
    if (!pos || !Number.isFinite(pos.left) || !Number.isFinite(pos.top)) {
      // Last resort so a transient NaN/anchor miss does not hide an open menu (and break drag).
      pos = { left: 8, top: 8 };
    }
    // `fixed` + clear right/bottom: same viewport coords as getBoundingClientRect; avoids the
    // absolute-in-0×0-host Safari trap that parked only the X edge wrong under WXT.
    return {
      position: 'fixed',
      left: `${pos.left}px`,
      top: `${pos.top}px`,
      width: `${MENU_WIDTH}px`,
      right: 'auto',
      bottom: 'auto',
    };
  };

  /** Read the card's on-screen left/top, even if menuPos was never seeded (jsdom / Safari edge). */
  function visualPlace(open: Menu): GenMenuPos {
    const seeded = menuPos();
    if (seeded && Number.isFinite(seeded.left) && Number.isFinite(seeded.top)) return seeded;
    const anchored = anchorPlace(open);
    if (anchored && Number.isFinite(anchored.left) && Number.isFinite(anchored.top)) return anchored;
    if (menuEl) {
      const left = Number.parseFloat(menuEl.style.left);
      const top = Number.parseFloat(menuEl.style.top);
      if (Number.isFinite(left) && Number.isFinite(top)) return { left, top };
    }
    return { left: 8, top: 8 };
  }

  /** Drag from the "Suggested password" header; place is remembered for this origin across close/reload. */
  function onDragHandle(e: PointerEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const open = menu();
    if (!open) return;
    const current = visualPlace(open);
    // Ensure we are driving an absolute place before the first move (not a zeroed delta).
    setMenuPos(current);
    dragSession = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: current.left,
      origTop: current.top,
    };
    setDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // setPointerCapture can throw if the pointer is already gone
    }

    const move = (ev: PointerEvent) => {
      if (!dragSession || ev.pointerId !== dragSession.pointerId) return;
      const next = applyMenuDrag(
        dragSession.origLeft,
        dragSession.origTop,
        ev.clientX - dragSession.startX,
        ev.clientY - dragSession.startY,
        MENU_WIDTH,
        MENU_HEIGHT,
        { width: innerWidth, height: innerHeight },
      );
      const abs = { left: Number.parseFloat(next.left), top: Number.parseFloat(next.top) };
      setMenuPos(abs);
      // Write the node directly so a mid-drag Solid re-render cannot flash the pre-drag place.
      if (menuEl) {
        menuEl.style.left = next.left;
        menuEl.style.top = next.top;
      }
    };

    const up = (ev: PointerEvent) => {
      if (dragSession && ev.pointerId !== dragSession.pointerId) return;
      const pos = menuPos();
      if (pos) persistPos(pos);
      dragSession = null;
      setDragging(false);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
    };

    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
  }

  /** Ask the app for a fresh value of `kind` and show it in the open menu. */
  async function generate(target: Target, kind: Kind) {
    const mine = ++asking;
    lastKind = kind;
    // Keep menuPos when regenerating / switching kind so the card does not jump.
    if (!menuPos()) {
      const seed = remembered() ?? anchorPlace({ target, kind });
      if (seed) setMenuPos(seed);
    }
    setMenu({ target, kind });
    const reply = await send({ command: 'generate', field: kind === 'passphrase' ? 'passphrase' : undefined });
    if (mine !== asking) return;
    if (!reply.ok || !reply.value) return setMenu({ target, kind, error: reply.error || "Triwarden isn't available." });
    setMenu({ target, kind, value: reply.value });
  }

  function toggle(target: Target) {
    if (menu()?.target.field === target.field) return close();
    const seed = remembered() ?? null;
    setMenuPos(seed); // null → generate() fills from the field anchor
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
      if (dragging() || dragSession) return; // don't close while dragging
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
            ref={(el) => {
              menuEl = el;
            }}
            class="menu gen"
            role="dialog"
            aria-label="Suggested password"
            style={menuStyle(m())}
            data-rtl={isRTL(m().target.field)}
            data-above={menuAbove(m())}
            data-dragging={dragging()}
            on:mousedown={(e) => e.preventDefault()}
          >
            <div
              class="group gen-drag"
              title="Drag to move"
              on:pointerdown={(e) => onDragHandle(e)}
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

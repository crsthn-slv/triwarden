// Offer to save what you typed when a login form is submitted. Passwords are never stored by the extension.
//
// Only a real login or sign-up attempt counts: a form's submit, a click on its submit button (some pages handle that
// click themselves and never fire submit), a button that reads like logging in or registering when the form has no
// submit button of its own (single-page apps often use type="button" for "Register"), or, on pages with no form,
// Enter in the password field or such a button. Other clicks (show password, menus, anything outside the form) never
// offer to save.
//
// SPAs often navigate (or unmount the form) after a successful Register without a second submit we can hear. We stage
// the typed login on the attempt, then offer again when the password fields disappear or the history URL changes —
// the same moment Apple's "Save Password" sheet typically appears. Deduped with the immediate offer so you are not
// asked twice.
// The app doesn't interrupt: it posts a notification and keeps the login in its bell until you answer.
import { send } from './send';
import { textLike, usernameFor, visible } from './dom';

const LOGIN_LABEL =
  /\b(log ?in|log ?on|sign ?in|sign ?on|sign ?up|register|create (?:an? |your |new )?account|join|get started|continue|next|submit|save|update|change password)\b/i;

/** Buttons that act on a field, not the form: they never submit, whatever else they say. */
const FIELD_ACTION = /show|hide|reveal|toggle|generate|copy|forgot|cancel|back|close/i;

/** How long a staged login stays eligible for an SPA success offer after the attempt. */
const STAGE_MS = 60_000;

const labelOf = (b: Element): string =>
  `${b.textContent || ''} ${(b as HTMLInputElement).value || ''} ${b.getAttribute('aria-label') || ''}`;

/** A form whose own submit control is missing or hidden: the page submits it from script. */
const scriptSubmitted = (form: HTMLFormElement): boolean =>
  ![...form.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="image"]')].some(
    (b) => (b as HTMLButtonElement).type !== 'button' && (b as HTMLButtonElement).type !== 'reset' && visible(b),
  );

const readsLikeSubmit = (b: Element): boolean => {
  const label = labelOf(b);
  return LOGIN_LABEL.test(label) && !FIELD_ACTION.test(label);
};

let lastOffer = '';

/** Typed login waiting for SPA success (form unmount / history change) if the immediate offer was missed. */
let staged: { username: string; password: string; at: number } | null = null;

/** The password worth saving in `scope`: the new one on a change-password form, else the last one filled. */
function submittedPassword(scope: ParentNode): HTMLInputElement | undefined {
  const filled = [...scope.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter((p) => p.value);
  return filled.find((p) => /new-password/.test(p.autocomplete || '')) || filled[filled.length - 1];
}

function credsFrom(scope: ParentNode): { username: string; password: string } | null {
  const pw = submittedPassword(scope);
  if (!pw?.value) return null;
  return { username: (usernameFor(pw)?.value || '').trim(), password: pw.value };
}

/** Creds from a node that just left the document (SPA unmount): still readable on the detached tree. */
function credsFromRemoved(node: Node): { username: string; password: string } | null {
  if (!(node instanceof Element)) return null;
  const inputs = node.matches?.('input[type="password"]')
    ? [node as HTMLInputElement]
    : [...(node.querySelectorAll?.<HTMLInputElement>('input[type="password"]') ?? [])];
  const filled = inputs.filter((p) => p.value);
  if (!filled.length) return null;
  const pw = filled.find((p) => /new-password/.test(p.autocomplete || '')) ?? filled[filled.length - 1]!;
  // Username may sit on a sibling that was removed in the same batch; prefer the detached subtree, then the live doc.
  const localUser =
    [...(node.querySelectorAll?.('input') ?? [])]
      .filter((i) => i !== pw && textLike(i) && i.value)
      .pop() || usernameFor(pw);
  return { username: (localUser?.value || '').trim(), password: pw.value };
}

function stage(creds: { username: string; password: string } | null): void {
  if (!creds) return;
  staged = { ...creds, at: Date.now() };
}

function offerCreds(creds: { username: string; password: string } | null): void {
  if (!creds) return;
  const key = `${creds.username}\u0000${creds.password}`;
  if (key === lastOffer) {
    staged = null;
    return;
  }
  lastOffer = key;
  staged = null;
  void send({ command: 'save', username: creds.username, password: creds.password });
}

function offerSave(scope: ParentNode): void {
  const creds = credsFrom(scope);
  stage(creds);
  offerCreds(creds);
}

/** After SPA success: flush a recent staged login once (deduped against the immediate offer). */
function flushStaged(): void {
  if (!staged) return;
  if (Date.now() - staged.at > STAGE_MS) {
    staged = null;
    return;
  }
  offerCreds({ username: staged.username, password: staged.password });
}

function watchSpaSuccess(): void {
  // Form unmount after Register: Apple's save sheet appears around then; harvest values from the removed tree.
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        const fromNode = credsFromRemoved(node);
        if (fromNode) {
          stage(fromNode);
          flushStaged();
          return;
        }
      }
    }
    // Soft success: attempt happened, then password fields vanished (replaced without carrying values on the node).
    if (staged && !document.querySelector('input[type="password"]')) flushStaged();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const onNavigate = () => flushStaged();
  window.addEventListener('popstate', onNavigate);
  window.addEventListener('hashchange', onNavigate);
  // pushState / replaceState do not fire popstate; wrap them so client-side routers still flush.
  const wrap = <T extends typeof history.pushState>(fn: T): T =>
    function (this: History, ...args: Parameters<T>) {
      const ret = fn.apply(this, args);
      onNavigate();
      return ret;
    } as T;
  history.pushState = wrap(history.pushState.bind(history));
  history.replaceState = wrap(history.replaceState.bind(history));
}

export function watchForSubmits(): void {
  document.addEventListener('submit', (e) => offerSave(e.target as HTMLFormElement), true);

  document.addEventListener(
    'click',
    (e) => {
      const b = (e.target as Element | null)?.closest?.<HTMLButtonElement>(
        'button, input[type="submit"], input[type="button"], [role="button"]',
      );
      if (!b || b.disabled || b.getAttribute('aria-disabled') === 'true') return;
      const form = b.form ?? b.closest('form');
      if (form) {
        // Inside a form its submit button counts. Other controls (type="button", [role=button]) count only when the
        // form has no visible submit button and they read like one ("Register", "Create account"): show password and
        // the like never do, and a form with a real submit button is covered by that button and the submit event.
        if (b.type === 'submit' && b.form) offerSave(form);
        else if (scriptSubmitted(form) && readsLikeSubmit(b)) offerSave(form);
        return;
      }
      if (readsLikeSubmit(b)) offerSave(document);
    },
    true,
  );

  document.addEventListener(
    'keydown',
    (e) => {
      const t = e.target;
      if (e.key !== 'Enter' || !(t instanceof HTMLInputElement) || !(t.type === 'password' || textLike(t))) return;
      // With a submit button the browser fires submit; without one (script-submitted forms) Enter is the attempt.
      if (!t.form) offerSave(document);
      else if (scriptSubmitted(t.form)) offerSave(t.form);
    },
    true,
  );

  watchSpaSuccess();
}

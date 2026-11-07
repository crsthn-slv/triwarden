// Offer to save what you typed when a login form is submitted. Passwords are never stored by the extension.
//
// Only a real login or sign-up attempt counts: a form's submit, a click on its submit button (some pages handle that
// click themselves and never fire submit), a button that reads like logging in or registering when the form has no
// submit button of its own (single-page apps often use type="button" for "Register"), or, on pages with no form,
// Enter in the password field or such a button. Other clicks (show password, menus, anything outside the form) never
// offer to save.
// The app doesn't interrupt: it posts a notification and keeps the login in its bell until you answer.
import { send } from './send';
import { textLike, usernameFor, visible } from './dom';

const LOGIN_LABEL =
  /\b(log ?in|log ?on|sign ?in|sign ?on|sign ?up|register|create (?:an? |your |new )?account|join|get started|continue|next|submit|save|update|change password)\b/i;

/** Buttons that act on a field, not the form: they never submit, whatever else they say. */
const FIELD_ACTION = /show|hide|reveal|toggle|generate|copy|forgot|cancel|back|close/i;

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

/** The password worth saving in `scope`: the new one on a change-password form, else the last one filled. */
function submittedPassword(scope: ParentNode): HTMLInputElement | undefined {
  const filled = [...scope.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter((p) => p.value);
  return filled.find((p) => /new-password/.test(p.autocomplete || '')) || filled[filled.length - 1];
}

function offerSave(scope: ParentNode): void {
  const pw = submittedPassword(scope);
  if (!pw) return;
  const username = (usernameFor(pw)?.value || '').trim();
  const key = `${username}\u0000${pw.value}`;
  if (key === lastOffer) return;
  lastOffer = key;
  void send({ command: 'save', username, password: pw.value });
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
}

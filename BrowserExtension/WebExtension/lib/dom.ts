/** Page inspection shared by the overlay and the save offer. Pure DOM, no extension APIs. */

export const visible = (el: HTMLElement): boolean => {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return (
    r.width > 20 && r.height > 10 && s.visibility !== 'hidden' && s.display !== 'none' && !(el as HTMLInputElement).disabled
  );
};

export const textLike = (input: HTMLInputElement): boolean => {
  const type = (input.getAttribute('type') || 'text').toLowerCase();
  return ['text', 'email', 'tel', ''].includes(type) || /username|email/.test(input.autocomplete || '');
};

/** The username field that belongs to a password field: the nearest text-like input before it. */
export function usernameFor(pw: HTMLInputElement): HTMLInputElement | null {
  const scope: ParentNode = pw.form || document;
  const inputs = [...scope.querySelectorAll('input')].filter(visible);
  const at = inputs.indexOf(pw);
  for (const input of inputs.slice(0, Math.max(at, 0)).reverse()) if (textLike(input)) return input;
  return scope.querySelector('input[autocomplete~="username"], input[type="email"]');
}

/** Whether a field lays out right to left (Persian, Arabic, Hebrew pages): its text starts at the right edge. */
export const isRTL = (el: Element): boolean => getComputedStyle(el).direction === 'rtl';

/** Set a value the way a user would, so frameworks that track input events notice it. */
export function setValue(input: HTMLInputElement | null | undefined, value: string | undefined): void {
  if (!input || value == null) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  input.focus();
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export const passwordFields = (): HTMLInputElement[] =>
  [...document.querySelectorAll<HTMLInputElement>('input[type="password"]')];

const OTP_HINT = /one-?time|otp|totp|2fa|mfa|verification|security.?code|auth(?:enticator)?.?code/i;

/**
 * Where a one-time code goes. Each entry is one code: a single field, or the row of one-digit boxes some sites use
 * (all of them, in order). Only fields that say what they are count: `autocomplete="one-time-code"`, or a name,
 * id or label that reads like a verification code and is not a password.
 */
export function otpTargets(): HTMLInputElement[][] {
  const inputs = [...document.querySelectorAll<HTMLInputElement>('input')].filter(
    (i) => visible(i) || (i.maxLength === 1 && i.getBoundingClientRect().width > 8),
  );
  const claimed = new Set<HTMLInputElement>();
  const found: HTMLInputElement[][] = [];
  for (const input of inputs) {
    if (claimed.has(input) || input.type === 'password' || input.type === 'hidden') continue;
    const hint = [input.autocomplete, input.name, input.id, input.getAttribute('aria-label'), input.placeholder].join(' ');
    const says = /one-time-code/.test(input.autocomplete || '') || OTP_HINT.test(hint);
    if (!says) continue;
    // One-digit boxes next to each other in the same form are one code.
    const scope: ParentNode = input.form || document;
    const boxes = [...scope.querySelectorAll<HTMLInputElement>('input')].filter((i) => i.maxLength === 1 && !i.disabled);
    if (input.maxLength === 1 && boxes.length >= 4 && boxes.length <= 10 && boxes.includes(input)) {
      boxes.forEach((b) => claimed.add(b));
      found.push(boxes);
    } else {
      claimed.add(input);
      found.push([input]);
    }
  }
  return found;
}

/** Put a one-time code in a field, or spread it over one-digit boxes. */
export function fillOtp(boxes: HTMLInputElement[], code: string): void {
  if (boxes.length === 1) return setValue(boxes[0], code);
  boxes.forEach((box, i) => setValue(box, code[i]));
  boxes[Math.min(code.length, boxes.length) - 1]?.focus();
}


const GENERATE_HINT =
  /\b(sign\s*up|register|registration|create\s+account|new\s+account|change\s*password|reset\s*password|forgot\s*password|set\s*password|choose\s*password|confirm\s*password|re-?enter\s*password|new\s*password)\b/i;

/**
 * Password fields where Safari may show the Triwarden icon (generate password/passphrase).
 * Ordinary login fields (`current-password`, single password on a sign-in form) stay icon-free —
 * system AutoFill owns pick/fill there. Save/Update still runs via `watchForSubmits` without an icon.
 */
export function isGeneratePasswordField(pw: HTMLInputElement): boolean {
  if (pw.type !== 'password' || !visible(pw)) return false;
  const ac = (pw.autocomplete || '').toLowerCase();
  if (/new-password/.test(ac)) return true;
  if (/current-password/.test(ac)) return false;

  const scope: ParentNode = pw.form || document;
  const passwords = [...scope.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(visible);
  // Change-password / register-with-confirm: more than one password control in the form.
  if (passwords.length >= 2) return true;

  const bits = [
    pw.name,
    pw.id,
    pw.getAttribute('aria-label'),
    pw.placeholder,
    pw.form?.id,
    pw.form?.name,
    pw.form?.getAttribute('aria-label'),
    pw.form?.action,
  ];
  if (pw.form) {
    for (const label of pw.form.querySelectorAll('label, legend, h1, h2, h3, button, [type="submit"]')) {
      bits.push(label.textContent);
    }
  }
  return GENERATE_HINT.test(bits.filter(Boolean).join(' '));
}

/** Visible password fields that warrant a generate affordance (Safari). */
export function generatePasswordFields(): HTMLInputElement[] {
  return passwordFields().filter(isGeneratePasswordField);
}

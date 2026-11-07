// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { generatePasswordFields, isGeneratePasswordField } from './dom';

// jsdom has no layout; `visible()` needs a non-zero box.
HTMLElement.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 200, 40);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('isGeneratePasswordField (Safari icon gate)', () => {
  it('shows on autocomplete=new-password', () => {
    document.body.innerHTML = '<form><input type="password" autocomplete="new-password"></form>';
    expect(isGeneratePasswordField(document.querySelector<HTMLInputElement>('input')!)).toBe(true);
  });

  it('hides on autocomplete=current-password (ordinary login)', () => {
    document.body.innerHTML =
      '<form><input type="email"><input type="password" autocomplete="current-password"></form>';
    expect(isGeneratePasswordField(document.querySelector<HTMLInputElement>('input[type=password]')!)).toBe(false);
  });

  it('hides on a plain single-password sign-in form', () => {
    document.body.innerHTML = '<form><input name="user"><input type="password" name="pass"></form>';
    expect(isGeneratePasswordField(document.querySelector<HTMLInputElement>('input[type=password]')!)).toBe(false);
  });

  it('shows when the form has two password fields (change / confirm)', () => {
    document.body.innerHTML = '<form><input type="password" name="a"><input type="password" name="b"></form>';
    const fields = [...document.querySelectorAll<HTMLInputElement>('input[type=password]')];
    expect(fields.every(isGeneratePasswordField)).toBe(true);
  });

  it('shows when labels say change password / sign up', () => {
    document.body.innerHTML = '<form><h2>Create account</h2><input type="password" name="pass"></form>';
    expect(isGeneratePasswordField(document.querySelector<HTMLInputElement>('input[type=password]')!)).toBe(true);
  });

  it('generatePasswordFields returns only generate-relevant inputs', () => {
    document.body.innerHTML = `
      <form id="login"><input type="password" autocomplete="current-password"></form>
      <form id="reg"><input type="password" autocomplete="new-password"></form>`;
    const found = generatePasswordFields();
    expect(found).toHaveLength(1);
    expect(found[0]!.autocomplete).toBe('new-password');
  });
});

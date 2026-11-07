/**
 * Whether this build's content overlay offers vault match / fill.
 *
 * Safari: system AutoFill (ASCredentialProvider) owns credential pick and OTP. The extension
 * keeps Save + generate password/passphrase only.
 * Chrome / Firefox / Edge / Brave: the in-page overlay still offers vault suggestions and fill.
 */
export function vaultFillInOverlay(browser = import.meta.env.BROWSER): boolean {
  return browser !== 'safari';
}

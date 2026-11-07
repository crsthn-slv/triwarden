// Triwarden content script.
// Safari: generate password/passphrase + save (system AutoFill owns vault pick/fill).
// Chrome / Firefox / Edge: vault suggestions/fill overlay + save.
import { render } from 'solid-js/web';
import { vaultFillInOverlay } from '../../lib/runtime';
import { watchForSubmits } from '../../lib/save';
import GenerateOverlay from './GenerateOverlay';
import Overlay from './Overlay';
import './overlay.css';

export default defineContentScript({
  matches: ['https://*/*', 'http://*/*'],
  allFrames: true,
  runAt: 'document_idle',
  // The overlay lives in a closed shadow root, so page styles can't touch it and ours don't leak out.
  cssInjectionMode: 'ui',

  async main(ctx) {
    watchForSubmits();
    const ui = await createShadowRootUi(ctx, {
      name: 'triwarden-overlay',
      position: 'overlay',
      zIndex: 2147483647,
      anchor: 'body',
      mode: 'closed',
      onMount: (container) =>
        render(() => (vaultFillInOverlay() ? <Overlay /> : <GenerateOverlay />), container),
      onRemove: (dispose) => dispose?.(),
    });
    ui.mount();
  },
});

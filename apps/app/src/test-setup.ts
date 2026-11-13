import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { activate } from './i18n/index.ts';

activate('en');
// findBy*/waitFor wait up to 5 s: the guest ALTCHA solve and Astryx renders are slower on a busy machine.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
  localStorage.clear();
  location.hash = '';
});

// jsdom lacks these browser APIs that Astryx components touch.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
// jsdom has <dialog> but not its modal methods.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.show ??= function (this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.removeAttribute('open');
};

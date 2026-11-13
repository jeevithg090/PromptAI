import { useCallback } from 'react';
import { useAnnounce } from '@astryxdesign/core/hooks';

type AriaNotify = (message: string, options?: { priority?: 'normal' | 'high' }) => void;

/**
 * The one announce() adapter (blueprint §15): `ariaNotify` where the browser has
 * it, else Astryx's live region. Only status goes through here, never streaming text.
 */
export function useStatusAnnouncer() {
  const announce = useAnnounce({ hasReplace: true });
  return useCallback(
    (message: string, urgent = false) => {
      const notify = (document as Document & { ariaNotify?: AriaNotify }).ariaNotify;
      if (typeof notify === 'function') notify.call(document, message, { priority: urgent ? 'high' : 'normal' });
      else announce(message, urgent ? 'assertive' : 'polite');
    },
    [announce],
  );
}

import { t } from '@lingui/core/macro';

export type Place = 'capture' | 'draft' | 'library' | 'you';
export const PLACES: Place[] = ['capture', 'draft', 'library', 'you'];
export const placeLabels = (): Record<Place, string> => ({ capture: t`Capture`, draft: t`Draft sheet`, library: t`Library`, you: t`You` });

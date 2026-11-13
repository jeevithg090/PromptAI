import { createContext } from 'react';
import type { ForgeResponse } from '@promptai/contract';
import type { ApiClient } from '../api/client.ts';

/**
 * What the places need from the app around them. Optional for the Draft sheet,
 * so the sheet still renders on its own (its tests, the first desktop paint).
 */
export interface AppServices {
  api: ApiClient;
  kind: 'guest' | 'account';
  /** Incognito for this session: nothing is kept in the Library. */
  incognito: boolean;
  /** False when this build has no sign-in (no Supabase keys, not a dev build). */
  canSignIn: boolean;
  /** Opens sign-in; a brief passed in is saved once the account exists. */
  openSignIn(keep?: ForgeResponse): void;
  saveBrief(draft: ForgeResponse): Promise<void>;
}

export const AppServicesContext = createContext<AppServices | null>(null);

/** A Library title from the brief's first line. */
export function titleOf(draft: ForgeResponse): string {
  const first = draft.brief.split('\n').find((l) => l.trim()) ?? draft.toolName;
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

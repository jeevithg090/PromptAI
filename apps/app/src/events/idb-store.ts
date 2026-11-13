import { get, set } from 'idb-keyval';
import type { AppEvent } from '@promptai/contract';
import type { QueueStore } from './queue.ts';

/** The web queue survives reloads and offline spells in IndexedDB. */
export function idbQueueStore(key = 'promptai.events'): QueueStore {
  return {
    load: async () => ((await get<AppEvent[]>(key)) ?? []).filter((e) => typeof e?.id === 'string'),
    save: (events) => set(key, events),
  };
}

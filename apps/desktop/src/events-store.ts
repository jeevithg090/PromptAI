/** The desktop events queue persists in one JSON file under userData; writes go through a temp file and a rename. */
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { AppEvent } from '@promptai/contract';
import type { QueueStore } from '@promptai/app/events-queue';

export function fileQueueStore(file: string): QueueStore {
  return {
    async load() {
      try {
        const parsed = JSON.parse(await readFile(file, 'utf8')) as unknown;
        return Array.isArray(parsed) ? (parsed as AppEvent[]).filter((e) => typeof e?.id === 'string') : [];
      } catch {
        return []; // no file yet, or a torn one: start empty rather than refuse to run
      }
    },
    async save(events) {
      const tmp = `${file}.tmp`;
      await writeFile(tmp, JSON.stringify(events));
      await rename(tmp, file);
    },
  };
}

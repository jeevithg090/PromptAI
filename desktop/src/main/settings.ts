import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_SETTINGS, type DesktopSettings } from '../shared/ipc';

/**
 * Hand-rolled JSON settings store (F1.2) — no new dependency. Atomic writes via
 * write-temp-then-rename. The Supabase session token is stored SEPARATELY,
 * encrypted with Electron safeStorage (never plaintext on disk).
 */
function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}
function tokenPath(): string {
  return path.join(app.getPath('userData'), 'session.enc');
}

export function readSettings(): DesktopSettings {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf-8');
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<DesktopSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(partial: Partial<DesktopSettings>): DesktopSettings {
  const merged = { ...readSettings(), ...partial };
  const tmp = `${settingsPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf-8');
  fs.renameSync(tmp, settingsPath());
  return merged;
}

export function readSavedToken(): string | null {
  try {
    const buf = fs.readFileSync(tokenPath());
    if (!safeStorage.isEncryptionAvailable()) return null; // never trust plaintext
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export function writeSavedToken(token: string | null): void {
  if (token === null) {
    try { fs.unlinkSync(tokenPath()); } catch { /* already gone */ }
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    // Refuse to persist plaintext — the renderer keeps it in memory and re-logs in.
    return;
  }
  const enc = safeStorage.encryptString(token);
  const tmp = `${tokenPath()}.tmp`;
  fs.writeFileSync(tmp, enc);
  fs.renameSync(tmp, tokenPath());
}

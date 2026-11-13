/**
 * Guest mode (blueprint §12): a device-bound session after an ALTCHA proof of
 * work, solved here on the client. No memory, a small daily quota.
 */
import { solveChallenge } from 'altcha-lib';
import { deriveKey as pbkdf2 } from 'altcha-lib/algorithms/web/pbkdf2';
import { deriveKey as sha } from 'altcha-lib/algorithms/web/sha';
import type { AltchaChallenge, ApiClient } from '../api/client.ts';

export interface GuestSession {
  token: string;
  expiresAt: string;
}

const KEY = 'promptai.guest';
/** Renew a minute early so a request never leaves with a token about to lapse. */
const MARGIN_MS = 60_000;

/** Solves the server's challenge and returns the payload for POST /v1/guest. */
export async function solveAltcha(challenge: AltchaChallenge): Promise<string> {
  const { algorithm } = challenge.parameters;
  // The WebCrypto algorithms only; scrypt and Argon2id need WASM workers we don't ship.
  const deriveKey = algorithm.startsWith('PBKDF2/') ? pbkdf2 : algorithm.startsWith('SHA-') ? sha : null;
  if (!deriveKey) throw new Error(`the guest check uses ${algorithm}, which this app can't solve`);
  const solution = await solveChallenge({ challenge, deriveKey });
  if (!solution) throw new Error('the guest check took too long');
  const signed = { parameters: challenge.parameters, ...(challenge.signature ? { signature: challenge.signature } : {}) };
  return btoa(JSON.stringify({ challenge: signed, solution }));
}

export function loadGuest(now = Date.now()): GuestSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as GuestSession | null;
    if (s && typeof s.token === 'string' && Date.parse(s.expiresAt) - MARGIN_MS > now) return s;
  } catch {}
  return null;
}

export function clearGuest() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export async function startGuest(api: ApiClient): Promise<GuestSession> {
  const altcha = await solveAltcha(await api.guestChallenge());
  const { token, expiresAt } = await api.guest(altcha);
  const session = { token, expiresAt };
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
  return session;
}

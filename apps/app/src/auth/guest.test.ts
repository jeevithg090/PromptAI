import { describe, expect, it } from 'vitest';
import { createFakeApi } from '../api/fake.ts';
import { loadGuest, solveAltcha, startGuest } from './guest.ts';
import { createDevAuth, DEV_CODE } from './port.ts';

describe('guest mode', () => {
  it('solves the server ALTCHA challenge on the client and keeps the token until it nearly lapses', async () => {
    const api = createFakeApi();
    const session = await startGuest(api);
    expect(session.token).toBe(api.state.token);
    expect(loadGuest()).toEqual(session);
    expect(loadGuest(Date.parse(session.expiresAt))).toBeNull();
  });

  it('refuses an algorithm it cannot solve', async () => {
    await expect(solveAltcha({ parameters: { algorithm: 'ARGON2ID', nonce: 'a', salt: 'b', cost: 1, keyLength: 32, keyPrefix: '00' } })).rejects.toThrow(/can't solve/);
  });
});

describe('dev auth', () => {
  it('signs in with the fixed code or a provider, and out again', async () => {
    const auth = createDevAuth();
    const seen: (string | null)[] = [];
    auth.onChange((s) => seen.push(s?.email ?? null));
    await expect(auth.verifyCode('a@b.test', '000000')).rejects.toThrow();
    await auth.verifyCode('a@b.test', DEV_CODE);
    expect(auth.session()).toMatchObject({ email: 'a@b.test', accessToken: expect.stringMatching(/^dev-/) });
    await auth.signOut();
    await auth.signInWith('apple');
    expect(seen).toEqual(['a@b.test', null, 'dev@apple.test']);
  });
});

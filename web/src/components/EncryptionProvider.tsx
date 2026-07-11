'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';
import { setupEncryption, unlock, encrypt, isUnlocked, lock } from '@/lib/crypto';

interface EncryptionContextValue {
  isReady: boolean;
  needsSetup: boolean;
  needsUnlock: boolean;
  setup: (passphrase: string) => Promise<{ recoveryCode: string }>;
  unlockKeys: (passphraseOrRecovery: string) => Promise<void>;
  encryptContent: (obj: unknown) => Promise<string>;
  lockKeys: () => void;
}

const EncryptionContext = createContext<EncryptionContextValue>({
  isReady: false,
  needsSetup: true,
  needsUnlock: false,
  setup: async () => { throw new Error('not initialized'); },
  unlockKeys: async () => { throw new Error('not initialized'); },
  encryptContent: async () => { throw new Error('not initialized'); },
  lockKeys: () => {},
});

export function useEncryption() {
  return useContext(EncryptionContext);
}

export function EncryptionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'needs_setup' | 'needs_unlock' | 'ready'>('loading');

  useEffect(() => {
    if (isUnlocked()) {
      setStatus('ready');
      return;
    }
    api.getKeys().then((res) => {
      if (res.status === 'not_found') {
        setStatus('needs_setup');
      } else {
        setStatus('needs_unlock');
      }
    }).catch(() => {
      setStatus('needs_setup');
    });
  }, []);

  const encryptContent = useCallback(async (obj: unknown): Promise<string> => {
    return encrypt(obj);
  }, []);

  const setupKeys = useCallback(async (passphrase: string) => {
    const result = await setupEncryption(passphrase);
    await api.putKeys({
      wrapped_dek_pass: result.wrappedDekPass,
      wrapped_dek_recovery: result.wrappedDekRecovery,
      kdf_salt: result.kdfSalt,
      kdf_iterations: 600000,
    });
    setStatus('ready');
    return { recoveryCode: result.recoveryCode };
  }, []);

  const unlockKeys = useCallback(async (passphraseOrRecovery: string) => {
    const keysRes = await api.getKeys();
    if (keysRes.status === 'not_found' || !keysRes.wrapped_dek_pass || !keysRes.kdf_salt) {
      throw new Error('No encryption keys found on server. Set up encryption first.');
    }
    await unlock(passphraseOrRecovery, keysRes.wrapped_dek_pass, keysRes.kdf_salt);
    setStatus('ready');
  }, []);

  const lockKeys = useCallback(() => {
    lock();
    setStatus('needs_unlock');
  }, []);

  return (
    <EncryptionContext.Provider value={{
      isReady: status === 'ready',
      needsSetup: status === 'needs_setup',
      needsUnlock: status === 'needs_unlock',
      setup: setupKeys,
      unlockKeys,
      encryptContent,
      lockKeys,
    }}>
      {children}
    </EncryptionContext.Provider>
  );
}

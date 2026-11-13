import { useState } from 'react';
import { t } from '@lingui/core/macro';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Divider } from '@astryxdesign/core/Divider';
import { Layout, LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import type { AuthPort } from '../auth/port.ts';

/** Email one-time code, Google or Apple, through the AuthPort. Closes itself once a session exists. */
export function SignInDialog({ auth, onClose }: { auth: AuthPort; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog isOpen onOpenChange={(o) => !o && onClose()} purpose="form" width={420}>
      <Layout
        header={<DialogHeader title={t`Sign in or sign up`} subtitle={t`Keep your briefs and what PromptAI learns about you.`} onOpenChange={(o) => !o && onClose()} />}
        content={
          <LayoutContent>
            <VStack gap={4}>
              {error && <Banner status="error" title={error} />}
              {!sent ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await auth.sendCode(email.trim());
                      setSent(true);
                    });
                  }}>
                  <VStack gap={3}>
                    <TextInput type="email" label={t`Email`} value={email} onChange={setEmail} autoComplete="email" isRequired />
                    <Button label={t`Email me a code`} variant="primary" type="submit" isLoading={busy} isDisabled={!email.includes('@')} />
                  </VStack>
                </form>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(() => auth.verifyCode(email.trim(), code));
                  }}>
                  <VStack gap={3}>
                    <Text>{t`We sent a code to ${email}.`}</Text>
                    {auth.devCode && <Text type="supporting">{t`Development sign-in: the code is ${auth.devCode}.`}</Text>}
                    <TextInput label={t`Code`} value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" isRequired />
                    <Button label={t`Sign in`} variant="primary" type="submit" isLoading={busy} isDisabled={!code.trim()} />
                  </VStack>
                </form>
              )}
              <Divider label={t`or`} />
              <VStack gap={2}>
                {auth.methods.includes('google') && <Button label={t`Continue with Google`} isDisabled={busy} onClick={() => void run(() => auth.signInWith('google'))} />}
                {auth.methods.includes('apple') && <Button label={t`Continue with Apple`} isDisabled={busy} onClick={() => void run(() => auth.signInWith('apple'))} />}
              </VStack>
            </VStack>
          </LayoutContent>
        }
      />
    </Dialog>
  );
}

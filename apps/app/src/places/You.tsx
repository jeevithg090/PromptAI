import { useContext, useEffect, useState } from 'react';
import { t } from '@lingui/core/macro';
import type { ConsentEntry, ConsentPurpose, MemoryItem, Profile } from '@promptai/contract';
import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { RadioList, RadioListItem } from '@astryxdesign/core/RadioList';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { useStatusAnnouncer } from '../announce.ts';
import { AppServicesContext } from '../shell/services.ts';

/** The ledger is append-only; the latest entry per purpose wins. */
export function latestConsent(consents: ConsentEntry[], purpose: ConsentPurpose): boolean | null {
  let latest: ConsentEntry | null = null;
  for (const c of consents) if (c.purpose === purpose && (!latest || c.at >= latest.at)) latest = c;
  return latest ? latest.granted : null;
}

export const PRIVACY_CONSENT_VERSION = 'privacy-2026-11';

interface YouProps {
  profile: Profile | null;
  email: string | null;
  reloadProfile(): Promise<void>;
  incognito: boolean;
  setIncognito(on: boolean): void;
  onSignOut(): Promise<void>;
  onDeleted(): Promise<void>;
}

/** You: profile, the four privacy controls (blueprint §13), memory with Forget, Export and Delete account. */
export function You({ profile, email, reloadProfile, incognito, setIncognito, onSignOut, onDeleted }: YouProps) {
  const services = useContext(AppServicesContext)!;
  const { api, kind } = services;
  const announce = useStatusAnnouncer();
  const [consentFailed, setConsentFailed] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);

  const consents = profile?.consents ?? [];
  // "Personalize for me" is part of the service and on until paused; "Help improve defaults" is No until said Yes.
  const personalize = latestConsent(consents, 'personalize') ?? true;
  const improve = latestConsent(consents, 'improve_defaults') ?? false;

  const setConsent = async (purpose: ConsentPurpose, granted: boolean) => {
    setConsentFailed(false);
    try {
      await api.setConsent([{ purpose, granted, version: PRIVACY_CONSENT_VERSION }]);
      await reloadProfile();
    } catch {
      setConsentFailed(true);
    }
  };

  const exportData = async () => {
    setExportState('busy');
    try {
      const data = await api.exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptai-export-${data.exportedAt.slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setExportState('idle');
      announce(t`Export ready`);
    } catch {
      setExportState('failed');
    }
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await api.deleteAccount();
      setConfirmDelete(false);
      await onDeleted();
    } catch {
      setDeleteFailed(true);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const since = profile ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(profile.createdAt)) : null;

  return (
    <div className="pa-place">
      <VStack gap={5}>
        <Heading level={1}>{t`You`}</Heading>

        <section aria-labelledby="you-profile">
          <VStack gap={2}>
            <Heading level={2} id="you-profile">
              {t`Profile`}
            </Heading>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Badge variant={kind === 'account' ? 'info' : 'neutral'} label={kind === 'account' ? t`Account` : t`Guest`} />
              <Text>{kind === 'account' ? (email ?? profile?.handle ?? t`Signed in`) : t`You’re using PromptAI as a guest.`}</Text>
            </HStack>
            {since && <Text type="supporting">{t`Since ${since}`}</Text>}
            <HStack gap={2}>
              {kind === 'account' ? (
                <Button label={t`Sign out`} onClick={() => void onSignOut()} />
              ) : (
                services.canSignIn && <Button label={t`Sign in or sign up`} variant="primary" onClick={() => services.openSignIn()} />
              )}
            </HStack>
          </VStack>
        </section>

        <section aria-labelledby="you-privacy">
          <VStack gap={4}>
            <Heading level={2} id="you-privacy">
              {t`Privacy`}
            </Heading>
            {consentFailed && <Banner status="error" title={t`Couldn’t save that choice. Try again.`} />}
            <Switch
              label={t`Incognito for this session`}
              description={t`Nothing from this session is kept in your Library. Turns off when you close PromptAI.`}
              value={incognito}
              onChange={setIncognito}
              labelSpacing="spread"
            />
            <Switch
              label={t`Personalize for me`}
              description={t`PromptAI learns your defaults, words and skill from what you keep. Pause it any time.`}
              value={personalize}
              changeAction={(on) => setConsent('personalize', on)}
              labelSpacing="spread"
            />
            <Switch
              label={t`Help improve defaults for everyone`}
              description={t`Adds counts from your choices, never your words, to the defaults other people start with.`}
              value={improve}
              changeAction={(on) => setConsent('improve_defaults', on)}
              labelSpacing="spread"
            />
            <RadioList label={t`History location`} value="synced" onChange={() => {}}>
              <RadioListItem value="synced" label={t`Synced to your account`} description={t`Encrypted at rest on PromptAI’s servers.`} />
              <RadioListItem value="device" label={t`This device only`} description={t`Arrives in a later update.`} isDisabled />
            </RadioList>
          </VStack>
        </section>

        <Memory kind={kind} />

        <section aria-labelledby="you-data">
          <VStack gap={3}>
            <Heading level={2} id="you-data">
              {t`Your data`}
            </Heading>
            {exportState === 'failed' && <Banner status="error" title={t`Couldn’t export. Try again.`} />}
            {deleteFailed && <Banner status="error" title={t`Couldn’t delete. Nothing was removed. Try again.`} />}
            <HStack gap={2} wrap="wrap">
              <Button label={t`Export my data`} isLoading={exportState === 'busy'} onClick={() => void exportData()} />
              <Button label={kind === 'account' ? t`Delete account` : t`Delete guest data`} variant="destructive" onClick={() => setConfirmDelete(true)} />
            </HStack>
          </VStack>
        </section>
      </VStack>

      <AlertDialog
        isOpen={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={kind === 'account' ? t`Delete your account?` : t`Delete your guest data?`}
        description={t`This deletes your profile, memory, Library and consent history from PromptAI’s servers. It can’t be undone.`}
        actionLabel={kind === 'account' ? t`Delete account` : t`Delete guest data`}
        cancelLabel={t`Cancel`}
        isActionLoading={deleting}
        onAction={() => void deleteAccount()}
      />
    </div>
  );
}

function Memory({ kind }: { kind: 'guest' | 'account' }) {
  const { api } = useContext(AppServicesContext)!;
  const announce = useStatusAnnouncer();
  const [items, setItems] = useState<MemoryItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (kind !== 'account') return;
    let live = true;
    api.memory().then(
      (list) => live && setItems(list.filter((m) => m.status !== 'archived')),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, kind]);

  const forget = async (m: MemoryItem) => {
    try {
      await api.forgetMemory(m.id);
      setItems((list) => list?.filter((x) => x.id !== m.id) ?? null);
      announce(t`Forgotten`);
    } catch {
      setFailed(true);
    }
  };

  return (
    <section aria-labelledby="you-memory">
      <VStack gap={3}>
        <Heading level={2} id="you-memory">
          {t`Memory`}
        </Heading>
        {kind !== 'account' ? (
          <Text color="secondary">{t`Guests have no memory. Nothing you draft as a guest is remembered.`}</Text>
        ) : failed ? (
          <Banner status="error" title={t`Couldn’t load or change your memory.`} />
        ) : items && items.length === 0 ? (
          <EmptyState title={t`Nothing remembered yet`} description={t`What PromptAI remembers about you shows up here, and you can forget any of it.`} headingLevel={3} isCompact />
        ) : (
          items && (
            <Card padding={0}>
              <List hasDividers>
                {items.map((m) => (
                  <ListItem
                    key={m.id}
                    label={<span dir="auto">{m.text}</span>}
                    description={m.status === 'proposed' ? t`Suggested, not used yet` : undefined}
                    endContent={
                      <Button label={t`Forget “${m.text}”`} size="sm" variant="secondary" onClick={() => void forget(m)}>
                        {t`Forget`}
                      </Button>
                    }
                  />
                ))}
              </List>
            </Card>
          )
        )}
      </VStack>
    </section>
  );
}

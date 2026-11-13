import { useContext, useEffect, useState } from 'react';
import { plural, t } from '@lingui/core/macro';
import type { Artifact } from '@promptai/contract';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useToast } from '@astryxdesign/core/Toast';
import { useStatusAnnouncer } from '../announce.ts';
import { AppServicesContext } from '../shell/services.ts';

function matches(a: Artifact, query: string): boolean {
  const q = query.trim().toLocaleLowerCase();
  return !q || `${a.title}\n${a.body}\n${a.toolId}`.toLocaleLowerCase().includes(q);
}

const copyText = (text: string) => navigator.clipboard.writeText(text.replace(/\s+$/, ''));

/** Library: saved briefs, with search, open, copy and delete (undo, not a confirm dialog: blueprint §15). */
export function Library() {
  const services = useContext(AppServicesContext)!;
  const { api, kind } = services;
  const toast = useToast();
  const announce = useStatusAnnouncer();
  const [items, setItems] = useState<Artifact[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Artifact | null>(null);
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

  useEffect(() => {
    if (kind !== 'account') return;
    let live = true;
    setFailed(false);
    api.library().then(
      (list) => live && setItems(list),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [api, kind]);

  const copy = async (a: Artifact) => {
    await copyText(a.body);
    announce(t`Copied`);
  };

  const remove = async (a: Artifact) => {
    setItems((list) => list?.filter((x) => x.id !== a.id) ?? null);
    setOpen(null);
    try {
      await api.deleteBrief(a.id);
    } catch {
      setItems((list) => (list ? [a, ...list] : list));
      toast({ type: 'error', body: t`Couldn’t delete “${a.title}”.` });
      return;
    }
    let dismiss = () => {};
    const undo = async () => {
      dismiss();
      const restored = await api.saveBrief({ kind: a.kind, toolId: a.toolId, title: a.title, body: a.body });
      setItems((list) => (list ? [restored, ...list] : list));
      announce(t`Restored`);
    };
    // Undo toasts never hide on their own (blueprint §15).
    dismiss = toast({ body: t`Deleted “${a.title}”.`, isAutoHide: false, endContent: <Button label={t`Undo`} size="sm" variant="secondary" onClick={() => void undo()} /> });
  };

  const shown = items?.filter((a) => matches(a, query)) ?? [];

  return (
    <div className="pa-place">
      <VStack gap={4}>
        <Heading level={1}>{t`Library`}</Heading>
        {kind !== 'account' ? (
          <EmptyState
            title={t`Briefs you keep show up here`}
            description={t`Guest briefs aren’t kept. Sign up to keep them.`}
            headingLevel={2}
            actions={services.canSignIn ? <Button label={t`Sign up`} variant="primary" onClick={() => services.openSignIn()} /> : undefined}
          />
        ) : failed ? (
          <Banner status="error" title={t`Couldn’t load your Library.`} />
        ) : items === null ? (
          <Spinner size="md" aria-label={t`Loading your Library`} />
        ) : (
          <>
            <TextInput type="search" label={t`Search saved briefs`} value={query} onChange={setQuery} startIcon="search" hasClear enterKeyHint="search" />
            {shown.length === 0 ? (
              <EmptyState
                title={items.length === 0 ? t`No saved briefs yet` : t`Nothing matches “${query}”`}
                description={items.length === 0 ? t`Save a brief from its receipt after you insert or copy it.` : undefined}
                headingLevel={2}
              />
            ) : (
              <List hasDividers header={<Text type="supporting">{plural(shown.length, { one: '# saved brief', other: '# saved briefs' })}</Text>}>
                {shown.map((a) => (
                  <ListItem
                    key={a.id}
                    label={<span dir="auto">{a.title}</span>}
                    description={`${a.toolId} · ${date.format(new Date(a.updatedAt))}`}
                    endContent={
                      <HStack gap={1}>
                        <Button label={t`Open ${a.title}`} variant="ghost" size="sm" onClick={() => setOpen(a)}>
                          {t`Open`}
                        </Button>
                        <Button label={t`Copy ${a.title}`} variant="ghost" size="sm" isIconOnly icon={<Icon icon="copy" />} onClick={() => void copy(a)} />
                        <Button label={t`Delete ${a.title}`} variant="ghost" size="sm" isIconOnly icon={<Icon icon="close" />} onClick={() => void remove(a)} />
                      </HStack>
                    }
                  />
                ))}
              </List>
            )}
          </>
        )}
      </VStack>
      {open && (
        <Dialog isOpen onOpenChange={(o) => !o && setOpen(null)} width={560}>
          <Layout
            header={<DialogHeader title={<span dir="auto">{open.title}</span>} subtitle={open.toolId} onOpenChange={(o) => !o && setOpen(null)} />}
            content={
              <LayoutContent>
                <p className="pa-brief" dir="auto">
                  {open.body}
                </p>
              </LayoutContent>
            }
            footer={
              <LayoutFooter>
                <HStack gap={2} hAlign="end">
                  <Button label={t`Delete`} variant="ghost" onClick={() => void remove(open)} />
                  <Button label={t`Copy`} variant="primary" icon={<Icon icon="copy" />} onClick={() => void copy(open)} />
                </HStack>
              </LayoutFooter>
            }
          />
        </Dialog>
      )}
    </div>
  );
}

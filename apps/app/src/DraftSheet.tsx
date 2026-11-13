import { useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { plural, t } from '@lingui/core/macro';
import type { Assumption, ForgeResponse } from '@promptai/contract';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { Kbd } from '@astryxdesign/core/Kbd';
import { Spinner } from '@astryxdesign/core/Spinner';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { ToggleButton, ToggleButtonGroup } from '@astryxdesign/core/ToggleButton';
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden';
import { VStack } from '@astryxdesign/core/VStack';
import { useStatusAnnouncer } from './announce.ts';
import type { PanelState, PromptAIBridge, Rating } from './bridge.ts';
import { blockingIssues, chipOptions, markUnsourced, unresolvedPicks } from './chips.ts';
import { ReportDialog } from './ReportDialog.tsx';
import { AppServicesContext } from './shell/services.ts';

const HOLD_KEYS = '⌃⌥Space';

/** What a screen reader hears on each status change; never the streaming text. */
function announcement(s: PanelState): string | null {
  switch (s.phase) {
    case 'listening':
      return t`Listening`;
    case 'drafting':
      return t`Drafting`;
    case 'ready':
      return s.confirmApp ? t`Insert into ${s.confirmApp.name}?` : t`Ready`;
    case 'done':
      return s.outcome === 'pasted' ? t`Inserted` : t`Copied`;
    case 'error':
      return s.copied ? t`Copied` : s.message;
    default:
      return null;
  }
}

function title(s: PanelState, platform: PromptAIBridge['platform']): string {
  switch (s.phase) {
    case 'idle':
      return platform === 'web' ? t`Draft a brief` : t`PromptAI`;
    case 'listening':
      return t`Listening…`;
    case 'drafting':
      return t`Drafting…`;
    case 'ready':
      return t`Ready`;
    case 'inserting':
      return t`Inserting…`;
    case 'done': {
      const app = s.app?.name;
      if (s.outcome !== 'pasted') return t`Copied`;
      return app ? t`Inserted into ${app}` : t`Inserted`;
    }
    case 'error':
      return t`Something went wrong`;
  }
}

export function DraftSheet({ bridge, onClose }: { bridge: PromptAIBridge; onClose?: () => void }) {
  const [state, setState] = useState<PanelState>({ phase: 'idle' });
  const announce = useStatusAnnouncer();
  const desktop = bridge.platform === 'desktop';
  const canPaste = bridge.caps.insertAtCursor;

  useEffect(() => bridge.onState(setState), [bridge]);

  const said = announcement(state);
  useEffect(() => {
    if (said) announce(said, state.phase === 'error' && !state.copied);
    // Keyed on the status text alone, so partial transcripts never trigger it.
  }, [said]);

  const drafted = state.phase === 'ready' || state.phase === 'inserting' || state.phase === 'done' ? state : null;
  const blocked = drafted ? unresolvedPicks(drafted.draft, drafted.answers) : [];
  const blocking = drafted ? blockingIssues(drafted.draft) : [];
  const canInsert = canPaste && state.phase === 'ready' && blocked.length === 0 && blocking.length === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An open dialog (Report, the palette) owns Escape and ⌘↵.
      if (e.defaultPrevented || document.querySelector('dialog[open]')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        void bridge.dismiss();
        onClose?.();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && drafted) {
        e.preventDefault();
        if (canInsert) void bridge.insert();
        else if (!canPaste) void bridge.copy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bridge, canInsert, canPaste, drafted, onClose]);

  return (
    <div className="pa-panel">
      <HStack gap={2} vAlign="center" className="pa-head">
        <StatusIcon state={state} />
        <div className="pa-grow">
          <Heading level={1}>{title(state, bridge.platform)}</Heading>
        </div>
        {desktop && (
          <Button
            label={t`Close`}
            variant="ghost"
            size="sm"
            isIconOnly
            icon={<Icon icon="close" />}
            tooltip={t`Close (Esc)`}
            onClick={() => {
              void bridge.dismiss();
              onClose?.();
            }}
          />
        )}
      </HStack>

      <div className="pa-body">
        <Body state={state} bridge={bridge} blocked={blocked} />
      </div>

      {drafted && (
        <footer className="pa-foot">
          <VStack gap={2}>
            {blocked.length > 0 && canPaste && (
              <Text type="supporting">{blocked.length === 1 ? t`Answer the pick above to insert.` : t`Answer ${blocked.length} picks above to insert.`}</Text>
            )}
            {blocking.length > 0 && canPaste && <Text type="supporting">{t`Insert is off until the blocking issue above is fixed. Copy still works.`}</Text>}
            <HStack gap={2} vAlign="center" wrap="wrap">
              {canPaste && state.phase !== 'done' && (
                <Button label={t`Insert`} variant="primary" isDisabled={!canInsert} isLoading={state.phase === 'inserting'} onClick={() => void bridge.insert()} />
              )}
              <Button label={t`Copy`} variant={canPaste && state.phase !== 'done' ? 'secondary' : 'primary'} icon={<Icon icon="copy" />} onClick={() => void bridge.copy()} />
              <ReportAction draft={drafted.draft} />
              <div className="pa-grow" />
              <Text type="supporting" className="pa-keys">
                {canPaste ? (
                  <>
                    <Kbd keys="mod+enter" /> {t`Insert`} · <Kbd keys="esc" /> {t`Close`}
                  </>
                ) : (
                  <>
                    <Kbd keys="mod+enter" /> {t`Copy`}
                  </>
                )}
              </Text>
            </HStack>
            <Text type="supporting">{desktop ? t`Ran on: Dictation: on this Mac · Draft: server` : t`Ran on: Draft: server`}</Text>
          </VStack>
        </footer>
      )}
    </div>
  );
}

function StatusIcon({ state }: { state: PanelState }) {
  switch (state.phase) {
    case 'listening':
      return <Icon icon="microphone" color="accent" />;
    case 'drafting':
    case 'inserting':
      return <Spinner size="md" aria-label={t`Working`} />;
    case 'done':
      return <Icon icon="success" color="success" />;
    case 'error':
      return <Icon icon="warning" color="error" />;
    default:
      return null;
  }
}

function Body({ state, bridge, blocked }: { state: PanelState; bridge: PromptAIBridge; blocked: Assumption[] }) {
  switch (state.phase) {
    case 'idle':
      return bridge.submit ? <AskForm submit={bridge.submit} dictation={bridge.caps.dictation} /> : <Text color="secondary">{t`Hold ${HOLD_KEYS} and say what you need.`}</Text>;
    case 'listening':
      return (
        <VStack gap={2}>
          {/* Deliberately not a live region: only the status is announced. */}
          <Text as="p" type="large" color={state.partial ? 'primary' : 'secondary'} className="pa-partial" dir="auto">
            {state.partial || t`Speak now…`}
          </Text>
          <Text type="supporting">{t`Release ${HOLD_KEYS} to draft.`}</Text>
        </VStack>
      );
    case 'drafting':
      return <YouSaid text={state.transcript} />;
    case 'error':
      return (
        <VStack gap={3}>
          <Banner status="error" title={state.message} />
          {state.transcript && <YouSaid text={state.transcript} label={t`Your words (kept)`} />}
          <HStack gap={2} wrap="wrap">
            {state.canRetry && <Button label={t`Try again`} variant="primary" onClick={() => void bridge.retry()} />}
            {state.transcript && (
              <Button label={state.copied ? t`Copied` : t`Copy your words`} icon={<Icon icon={state.copied ? 'check' : 'copy'} />} onClick={() => void bridge.copy()} />
            )}
          </HStack>
        </VStack>
      );
    default:
      return <Draft state={state} bridge={bridge} blocked={blocked} />;
  }
}

function YouSaid({ text, label = t`You said` }: { text: string; label?: string }) {
  return (
    <VStack gap={1}>
      <Text type="label">{label}</Text>
      <Text as="p" color="secondary" className="pa-said" dir="auto">
        {text}
      </Text>
    </VStack>
  );
}

/** The web capture box. Web dictation waits for the speech vendor, so the mic is shown off, with the reason. */
export function AskForm({ submit, dictation }: { submit: (text: string) => Promise<void>; dictation: boolean }) {
  const [text, setText] = useState('');
  const go = () => void submit(text);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}>
      <VStack gap={3}>
        <div
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              go();
            }
          }}>
          <TextArea label={t`What do you want the AI to do?`} value={text} onChange={setText} rows={5} placeholder={t`Write a launch email for our beta…`} dir="auto" />
        </div>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button label={t`Draft`} variant="primary" type="submit" isDisabled={!text.trim()} />
          <Text type="supporting" className="pa-keys">
            <Kbd keys="mod+enter" /> {t`Draft`}
          </Text>
          {!dictation && (
            <>
              <div className="pa-grow" />
              <Button label={t`Dictate`} variant="ghost" isIconOnly icon={<Icon icon="microphone" />} isDisabled aria-describedby="pa-mic-why" />
              <Text type="supporting" id="pa-mic-why">
                {t`Dictation on the web is coming once our speech provider is chosen. Type for now, or use the Mac app.`}
              </Text>
            </>
          )}
        </HStack>
      </VStack>
    </form>
  );
}

type Drafted = Extract<PanelState, { phase: 'ready' | 'inserting' | 'done' }>;

/** One insertable field; with several, each gets its own Copy. */
function BriefText({ text, unsourced }: { text: string; unsourced: string[] }) {
  return (
    <p className="pa-brief" dir="auto">
      {markUnsourced(text, unsourced).map((part, i) =>
        part.unsourced ? (
          <span key={i} className="pa-unsourced">
            {part.text}
            <VisuallyHidden> {t`(not from what you said)`}</VisuallyHidden>
          </span>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </p>
  );
}

function Fields({ draft }: { draft: ForgeResponse }) {
  const fields = draft.fields ?? [];
  if (fields.length === 0) {
    return (
      <Card padding={4}>
        <BriefText text={draft.brief} unsourced={draft.unsourced} />
      </Card>
    );
  }
  return (
    <VStack gap={3}>
      {fields.map((f) => (
        <Card key={f.id} padding={4}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center">
              <div className="pa-grow">
                <Text type="label">{f.label}</Text>
              </div>
              {fields.length > 1 && <CopyField label={f.label} text={f.text} />}
            </HStack>
            <BriefText text={f.text} unsourced={draft.unsourced} />
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

function CopyField({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      label={copied ? t`Copied ${label}` : t`Copy ${label}`}
      size="sm"
      variant="ghost"
      icon={<Icon icon={copied ? 'check' : 'copy'} />}
      onClick={() => void navigator.clipboard.writeText(text.replace(/\s+$/, '')).then(() => setCopied(true))}
    />
  );
}

const BY_LABEL = () => ({ said: t`You said it`, assumed: t`Added for you`, missing: t`Still missing` });

/** "Why this is better": the user's words against the brief, annotated from the coverage map. No extra call. */
function WhyBetter({ draft, transcript }: { draft: ForgeResponse; transcript: string }) {
  const items = draft.coverage.items ?? [];
  if (items.length === 0) return null;
  const total = items.length;
  const said = items.filter((i) => i.by === 'said').length;
  const covered = items.filter((i) => i.by !== 'missing').length;
  const labels = BY_LABEL();
  return (
    <Collapsible trigger={<Text type="label">{t`Why this is better`}</Text>} defaultIsOpen={false}>
      <VStack gap={3}>
        <VStack gap={1}>
          <Text type="label">{t`Before: your words`}</Text>
          <Text as="p" color="secondary" className="pa-said" dir="auto">
            {transcript}
          </Text>
          <Text type="supporting">{t`Covered ${said} of the ${total} things ${draft.toolName} needs.`}</Text>
        </VStack>
        <VStack gap={1}>
          <Text type="label">{t`After: the brief`}</Text>
          <Text type="supporting">{t`Covers ${covered} of ${total}.`}</Text>
        </VStack>
        <ul className="pa-coverage">
          {items.map((item) => (
            <li key={item.id}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Badge variant={item.by === 'said' ? 'success' : item.by === 'assumed' ? 'info' : 'warning'} label={labels[item.by]} />
                <Text>{item.label}</Text>
              </HStack>
            </li>
          ))}
        </ul>
      </VStack>
    </Collapsible>
  );
}

function Issues({ draft }: { draft: ForgeResponse }) {
  const issues = draft.issues ?? [];
  if (issues.length === 0) return null;
  return (
    <VStack gap={2}>
      {issues.map((issue) => (
        <Banner
          key={issue.code}
          status={issue.severity === 'block' ? 'error' : issue.severity === 'warn' ? 'warning' : 'info'}
          title={issue.severity === 'block' ? t`Blocks insert: ${issue.message}` : issue.message}
        />
      ))}
    </VStack>
  );
}

function ReportAction({ draft }: { draft: ForgeResponse }) {
  const services = useContext(AppServicesContext);
  const [open, setOpen] = useState(false);
  if (!services) return null;
  const decisionId = draft.decisionId;
  return (
    <>
      <Button
        label={t`Report this output`}
        variant="ghost"
        icon={<Icon icon="warning" />}
        isDisabled={!decisionId}
        tooltip={decisionId ? undefined : t`This draft wasn't recorded by the server, so it can't be reported.`}
        onClick={() => setOpen(true)}
      />
      {open && decisionId && <ReportDialog decisionId={decisionId} onClose={() => setOpen(false)} />}
    </>
  );
}

function Draft({ state, bridge, blocked }: { state: Drafted; bridge: PromptAIBridge; blocked: Assumption[] }) {
  const { draft, answers } = state;
  const chipsRef = useRef<HTMLDivElement>(null);
  const firstBlocked = blocked[0]?.slotId;

  // A new draft with an open pick: put focus on it so number keys answer it straight away.
  useEffect(() => {
    if (!firstBlocked) return;
    chipsRef.current?.querySelector<HTMLElement>(`[data-slot="${CSS.escape(firstBlocked)}"] button`)?.focus();
  }, [draft, firstBlocked]);

  const count = draft.unsourced.length;
  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Text type="supporting">{t`Brief for`}</Text>
        <Heading level={2}>{draft.toolName}</Heading>
      </VStack>

      <Fields draft={draft} />

      {count > 0 && (
        <Banner
          status="warning"
          title={plural(count, { one: 'One detail you didn’t say', other: '# details you didn’t say' })}
          description={t`Check before sending: ${draft.unsourced.join(', ')}. They’re dotted-underlined in the brief.`}
        />
      )}

      <Issues draft={draft} />

      {draft.assumptions.length > 0 && (
        <div ref={chipsRef}>
          <VStack gap={3}>
            {draft.assumptions.map((chip) => (
              <Chip key={chip.slotId} chip={chip} answer={answers[chip.slotId]} disabled={state.phase !== 'ready'} onAnswer={(v) => void bridge.answerChip(chip.slotId, v)} />
            ))}
          </VStack>
        </div>
      )}

      <WhyBetter draft={draft} transcript={state.transcript} />

      {state.phase === 'ready' && state.confirmApp && <ConfirmApp state={state} bridge={bridge} />}

      {state.phase === 'done' && <Receipt state={state} bridge={bridge} />}
    </VStack>
  );
}

function ConfirmApp({ state, bridge }: { state: Extract<Drafted, { phase: 'ready' }>; bridge: PromptAIBridge }) {
  const name = state.confirmApp!.name;
  const started = state.target?.name;
  return (
    <Banner status="info" title={t`Insert into ${name}?`} description={started ? t`You started in ${started}.` : undefined} collapsible={false}>
      <HStack gap={2} wrap="wrap">
        <Button label={t`Insert into ${name}`} variant="primary" onClick={() => void bridge.insert()} />
        <Button label={t`Copy instead`} onClick={() => void bridge.copy()} />
      </HStack>
    </Banner>
  );
}

/** After hand-off the sheet becomes a receipt with "Did it work?" (blueprint §15). */
function Receipt({ state, bridge }: { state: Extract<Drafted, { phase: 'done' }>; bridge: PromptAIBridge }) {
  const app = state.app?.name;
  const pasted = state.outcome === 'pasted';
  return (
    <VStack gap={3}>
      <Banner
        status={pasted ? 'success' : 'info'}
        title={pasted ? (app ? t`Inserted into ${app}. Nothing was sent.` : t`Inserted. Nothing was sent.`) : t`Copied to the clipboard.`}
        description={pasted ? undefined : app ? t`Press ⌘V in ${app} to paste it.` : t`Press ⌘V where you want it.`}
      />
      <DidItWork rated={state.rated} onRate={(r) => void bridge.rate(r)} />
      <KeepIt draft={state.draft} />
    </VStack>
  );
}

function DidItWork({ rated, onRate }: { rated: Rating | undefined; onRate: (r: Rating) => void }) {
  if (rated) return <Text type="supporting">{t`Thanks for telling us.`}</Text>;
  return (
    <div role="group" aria-labelledby="pa-did-it-work">
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text type="label" id="pa-did-it-work">
          {t`Did it work?`}
        </Text>
        <Button label={t`It worked`} icon={<Icon icon="check" />} onClick={() => onRate('worked')} />
        <Button label={t`It didn’t`} icon={<Icon icon="close" />} onClick={() => onRate('didnt_work')} />
      </HStack>
    </div>
  );
}

/** Guests are offered an account once a brief is worth keeping; accounts can save it. Incognito keeps nothing. */
function KeepIt({ draft }: { draft: ForgeResponse }) {
  const services = useContext(AppServicesContext);
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  if (!services || services.incognito) return null;
  if (services.kind === 'guest') {
    if (!services.canSignIn) return null;
    return (
      <Card padding={4}>
        <VStack gap={2}>
          <Text type="label">{t`Sign up to keep this`}</Text>
          <Text type="supporting">{t`Guest briefs aren’t kept. With an account, this one goes to your Library.`}</Text>
          <HStack gap={2}>
            <Button label={t`Sign up`} variant="primary" onClick={() => services.openSignIn(draft)} />
          </HStack>
        </VStack>
      </Card>
    );
  }
  const save = async () => {
    setSaved('saving');
    try {
      await services.saveBrief(draft);
      setSaved('saved');
    } catch {
      setSaved('failed');
    }
  };
  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Button
        label={saved === 'saved' ? t`Saved to Library` : t`Save to Library`}
        icon={saved === 'saved' ? <Icon icon="check" /> : undefined}
        isLoading={saved === 'saving'}
        isDisabled={saved === 'saved'}
        onClick={() => void save()}
      />
      {saved === 'failed' && <Text type="supporting">{t`Couldn’t save. Try again.`}</Text>}
    </HStack>
  );
}

function Chip({ chip, answer, disabled, onAnswer }: { chip: Assumption; answer: string | undefined; disabled: boolean; onAnswer: (value: string) => void }) {
  const options = chipOptions(chip);
  const isOpenPick = chip.kind === 'pick' && answer === undefined;
  const value = answer ?? (chip.kind === 'pick' ? null : chip.value);

  // Number keys pick an option while focus is in this chip (WCAG 2.1.4: active only on focus).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey || disabled) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      e.preventDefault();
      onAnswer(options[n - 1]!);
    }
  };

  return (
    <div className="pa-chip" data-slot={chip.slotId} onKeyDown={onKeyDown}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text type="label" id={`chip-${chip.slotId}`}>
          {chip.label}
        </Text>
        {isOpenPick ? <Badge variant="warning" label={t`Pick one`} /> : <Badge variant="neutral" label={answer !== undefined ? t`Your pick` : t`Assumed`} />}
      </HStack>
      <div className="pa-chip-options">
        <ToggleButtonGroup
          label={isOpenPick ? t`${chip.label}, pick one` : chip.label}
          value={value}
          isDisabled={disabled}
          size="sm"
          onChange={(v) => {
            if (typeof v === 'string') onAnswer(v);
          }}>
          {options.map((o, i) => (
            <ToggleButton key={o} value={o} label={i === 0 ? t`${o} (suggested)` : o}>
              <Kbd keys={String(i + 1)} /> {o}
              {i === 0 && <span className="pa-suggested"> · {t`suggested`}</span>}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
    </div>
  );
}

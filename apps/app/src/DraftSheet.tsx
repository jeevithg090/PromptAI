import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Assumption } from '@promptai/contract';
import { Badge } from '@astryxdesign/core/Badge';
import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
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
import type { PanelState, PromptAIBridge } from './bridge.ts';
import { chipOptions, markUnsourced, unresolvedPicks } from './chips.ts';

const HOLD_KEYS = '⌃⌥Space';

/** What a screen reader hears on each status change; never the streaming text. */
function announcement(s: PanelState): string | null {
  switch (s.phase) {
    case 'listening':
      return 'Listening';
    case 'drafting':
      return 'Drafting';
    case 'ready':
      return s.confirmApp ? `Insert into ${s.confirmApp.name}?` : 'Ready';
    case 'done':
      return s.outcome === 'pasted' ? 'Inserted' : 'Copied';
    case 'error':
      return s.copied ? 'Copied' : s.message;
    default:
      return null;
  }
}

function title(s: PanelState, platform: PromptAIBridge['platform']): string {
  switch (s.phase) {
    case 'idle':
      return platform === 'web' ? 'Draft a brief' : 'PromptAI';
    case 'listening':
      return 'Listening…';
    case 'drafting':
      return 'Drafting…';
    case 'ready':
      return 'Ready';
    case 'inserting':
      return 'Inserting…';
    case 'done':
      return s.outcome === 'pasted' ? `Inserted${s.app ? ` into ${s.app.name}` : ''}` : 'Copied';
    case 'error':
      return 'Something went wrong';
  }
}

export function DraftSheet({ bridge }: { bridge: PromptAIBridge }) {
  const [state, setState] = useState<PanelState>({ phase: 'idle' });
  const announce = useStatusAnnouncer();
  const desktop = bridge.platform === 'desktop';

  useEffect(() => bridge.onState(setState), [bridge]);

  const said = announcement(state);
  useEffect(() => {
    if (said) announce(said, state.phase === 'error' && !state.copied);
    // Keyed on the status text alone, so partial transcripts never trigger it.
  }, [said]);

  const drafted = state.phase === 'ready' || state.phase === 'inserting' || state.phase === 'done' ? state : null;
  const blocked = drafted ? unresolvedPicks(drafted.draft, drafted.answers) : [];
  const canInsert = desktop && state.phase === 'ready' && blocked.length === 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void bridge.dismiss();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && drafted) {
        e.preventDefault();
        if (canInsert) void bridge.insert();
        else if (!desktop) void bridge.copy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bridge, canInsert, desktop, drafted]);

  return (
    <div className="pa-panel">
      <HStack gap={2} vAlign="center" className="pa-head">
        <StatusIcon state={state} />
        <div className="pa-grow">
          <Heading level={1}>{title(state, bridge.platform)}</Heading>
        </div>
        {desktop && (
          <Button label="Close" variant="ghost" size="sm" isIconOnly icon={<Icon icon="close" />} tooltip="Close (Esc)" onClick={() => void bridge.dismiss()} />
        )}
      </HStack>

      <main className="pa-body">
        <Body state={state} bridge={bridge} blocked={blocked} />
      </main>

      {drafted && (
        <footer className="pa-foot">
          <VStack gap={2}>
            {blocked.length > 0 && desktop && (
              <Text type="supporting">
                Answer {blocked.length === 1 ? 'the pick' : `${blocked.length} picks`} above to insert.
              </Text>
            )}
            <HStack gap={2} vAlign="center" wrap="wrap">
              {desktop && state.phase !== 'done' && (
                <Button label="Insert" variant="primary" isDisabled={!canInsert} isLoading={state.phase === 'inserting'} onClick={() => void bridge.insert()} />
              )}
              <Button label="Copy" variant={desktop && state.phase !== 'done' ? 'secondary' : 'primary'} icon={<Icon icon="copy" />} onClick={() => void bridge.copy()} />
              <div className="pa-grow" />
              <Text type="supporting" className="pa-keys">
                {desktop ? (
                  <>
                    <Kbd keys="mod+enter" /> Insert · <Kbd keys="esc" /> Close
                  </>
                ) : (
                  <>
                    <Kbd keys="mod+enter" /> Copy
                  </>
                )}
              </Text>
            </HStack>
            <Text type="supporting">Ran on: {desktop ? 'Dictation: on this Mac · Draft: server' : 'Draft: server'}</Text>
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
      return <Spinner size="md" aria-label="Working" />;
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
      return bridge.platform === 'web' && bridge.submit ? (
        <AskForm submit={bridge.submit} />
      ) : (
        <Text color="secondary">Hold {HOLD_KEYS} and say what you need.</Text>
      );
    case 'listening':
      return (
        <VStack gap={2}>
          {/* Deliberately not a live region: only the status is announced. */}
          <Text as="p" type="large" color={state.partial ? 'primary' : 'secondary'} className="pa-partial">
            {state.partial || 'Speak now…'}
          </Text>
          <Text type="supporting">Release {HOLD_KEYS} to draft.</Text>
        </VStack>
      );
    case 'drafting':
      return <YouSaid text={state.transcript} />;
    case 'error':
      return (
        <VStack gap={3}>
          <Banner status="error" title={state.message} />
          {state.transcript && <YouSaid text={state.transcript} label="Your words (kept)" />}
          <HStack gap={2} wrap="wrap">
            {state.canRetry && <Button label="Try again" variant="primary" onClick={() => void bridge.retry()} />}
            {state.transcript && <Button label={state.copied ? 'Copied' : 'Copy your words'} icon={<Icon icon={state.copied ? 'check' : 'copy'} />} onClick={() => void bridge.copy()} />}
          </HStack>
        </VStack>
      );
    default:
      return <Draft state={state} bridge={bridge} blocked={blocked} />;
  }
}

function YouSaid({ text, label = 'You said' }: { text: string; label?: string }) {
  return (
    <VStack gap={1}>
      <Text type="label">{label}</Text>
      <Text as="p" color="secondary" className="pa-said">
        {text}
      </Text>
    </VStack>
  );
}

function AskForm({ submit }: { submit: (text: string) => Promise<void> }) {
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
          <TextArea label="What do you want the AI to do?" value={text} onChange={setText} rows={5} placeholder="Write a launch email for our beta…" />
        </div>
        <HStack gap={2} vAlign="center">
          <Button label="Draft" variant="primary" type="submit" isDisabled={!text.trim()} />
          <Text type="supporting">
            <Kbd keys="mod+enter" /> Draft
          </Text>
        </HStack>
      </VStack>
    </form>
  );
}

type Drafted = Extract<PanelState, { phase: 'ready' | 'inserting' | 'done' }>;

function Draft({ state, bridge, blocked }: { state: Drafted; bridge: PromptAIBridge; blocked: Assumption[] }) {
  const { draft, answers } = state;
  const chipsRef = useRef<HTMLDivElement>(null);
  const firstBlocked = blocked[0]?.slotId;

  // A new draft with an open pick: put focus on it so number keys answer it straight away.
  useEffect(() => {
    if (!firstBlocked) return;
    chipsRef.current?.querySelector<HTMLElement>(`[data-slot="${CSS.escape(firstBlocked)}"] button`)?.focus();
  }, [draft, firstBlocked]);

  return (
    <VStack gap={4}>
      <VStack gap={1}>
        <Text type="supporting">Brief for</Text>
        <Heading level={2}>{draft.toolName}</Heading>
      </VStack>

      <Card padding={4}>
        <p className="pa-brief">
          {markUnsourced(draft.brief, draft.unsourced).map((part, i) =>
            part.unsourced ? (
              <span key={i} className="pa-unsourced">
                {part.text}
                <VisuallyHidden> (not from what you said)</VisuallyHidden>
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>
      </Card>

      {draft.unsourced.length > 0 && (
        <Banner
          status="warning"
          title={draft.unsourced.length === 1 ? 'One detail you didn’t say' : `${draft.unsourced.length} details you didn’t say`}
          description={`Check before sending: ${draft.unsourced.join(', ')}. They’re dotted-underlined in the brief.`}
        />
      )}

      {draft.assumptions.length > 0 && (
        <div ref={chipsRef}>
          <VStack gap={3}>
            {draft.assumptions.map((chip) => (
              <Chip key={chip.slotId} chip={chip} answer={answers[chip.slotId]} disabled={state.phase !== 'ready'} onAnswer={(v) => void bridge.answerChip(chip.slotId, v)} />
            ))}
          </VStack>
        </div>
      )}

      {state.phase === 'ready' && state.confirmApp && (
        <Banner
          status="info"
          title={`Insert into ${state.confirmApp.name}?`}
          description={state.target ? `You started in ${state.target.name}.` : undefined}
          collapsible={false}>
          <HStack gap={2} wrap="wrap">
            <Button label={`Insert into ${state.confirmApp.name}`} variant="primary" onClick={() => void bridge.insert()} />
            <Button label="Copy instead" onClick={() => void bridge.copy()} />
          </HStack>
        </Banner>
      )}

      {state.phase === 'done' && (
        <Banner
          status={state.outcome === 'pasted' ? 'success' : 'info'}
          title={state.outcome === 'pasted' ? `Inserted${state.app ? ` into ${state.app.name}` : ''}. Nothing was sent.` : 'Copied to the clipboard.'}
          description={state.outcome === 'copied' ? (state.app ? `Press ⌘V in ${state.app.name} to paste it.` : 'Press ⌘V where you want it.') : undefined}
        />
      )}
    </VStack>
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
        {isOpenPick ? <Badge variant="warning" label="Pick one" /> : <Badge variant="neutral" label={answer !== undefined ? 'Your pick' : 'Assumed'} />}
      </HStack>
      <div className="pa-chip-options">
        <ToggleButtonGroup
          label={`${chip.label}${isOpenPick ? ', pick one' : ''}`}
          value={value}
          isDisabled={disabled}
          size="sm"
          onChange={(v) => {
            if (typeof v === 'string') onAnswer(v);
          }}>
          {options.map((o, i) => (
            <ToggleButton key={o} value={o} label={i === 0 ? `${o} (suggested)` : o}>
              <Kbd keys={String(i + 1)} /> {o}
              {i === 0 && <span className="pa-suggested"> · suggested</span>}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </div>
    </div>
  );
}

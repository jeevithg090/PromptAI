import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForgeResponse } from '@promptai/contract';
import type { PanelState, PromptAIBridge } from './bridge.ts';
import { chipOptions, markUnsourced, unresolvedPicks } from './chips.ts';
import { DraftSheet } from './DraftSheet.tsx';
import { createWebBridge } from './web-bridge.ts';
import { createHttpApi } from './api/client.ts';
import { createFakeApi } from './api/fake.ts';
import { AppServicesContext, type AppServices } from './shell/services.ts';

const NOTES = { bundleId: 'com.apple.Notes', name: 'Notes', pid: 41 };
const DRAFT: ForgeResponse = {
  toolId: 'claude',
  toolName: 'Claude',
  brief: 'Write a launch email for the beta on 3 March.',
  assumptions: [
    { slotId: 'tone', label: 'Tone', value: 'Friendly', source: 'default', kind: 'assumption', options: ['Formal', 'Playful'] },
    { slotId: 'length', label: 'Length', value: 'Short', source: 'inferred', kind: 'pick', options: ['Medium', 'Long'] },
  ],
  unsourced: ['3 March'],
  coverage: { covered: 3, total: 5 },
  usage: { llmCalls: 1, ms: 900 },
};
const base = { target: NOTES, transcript: 'write a launch email', draft: DRAFT };
const ready = (answers: Record<string, string> = {}, extra: Partial<PanelState> = {}): PanelState => ({ phase: 'ready', ...base, answers, ...extra }) as PanelState;

function fakeBridge(platform: 'desktop' | 'web' = 'desktop', opts: { insertAtCursor?: boolean; services?: AppServices } = {}) {
  let listener: (s: PanelState) => void = () => {};
  const bridge = {
    platform,
    caps: { insertAtCursor: opts.insertAtCursor ?? platform === 'desktop', dictation: platform === 'desktop' },
    onState: (l: (s: PanelState) => void) => {
      listener = l;
      return () => {};
    },
    insert: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    answerChip: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    dismiss: vi.fn(async () => {}),
    rate: vi.fn(async () => {}),
  } satisfies PromptAIBridge;
  render(
    opts.services ? (
      <AppServicesContext.Provider value={opts.services}>
        <DraftSheet bridge={bridge} />
      </AppServicesContext.Provider>
    ) : (
      <DraftSheet bridge={bridge} />
    ),
  );
  const push = (s: PanelState) => act(() => listener(s));
  return { bridge, push };
}

const insertButton = () => screen.getByRole('button', { name: 'Insert' });
const cmdEnter = () => fireEvent.keyDown(window, { key: 'Enter', metaKey: true });

afterEach(() => {
  delete (document as { ariaNotify?: unknown }).ariaNotify;
});

describe('chip rules', () => {
  it('counts only unanswered picks as blocking', () => {
    expect(unresolvedPicks(DRAFT, {}).map((a) => a.slotId)).toEqual(['length']);
    expect(unresolvedPicks(DRAFT, { tone: 'Formal' }).map((a) => a.slotId)).toEqual(['length']);
    expect(unresolvedPicks(DRAFT, { length: 'Short' })).toEqual([]);
  });

  it('puts the suggestion first, once', () => {
    expect(chipOptions({ ...DRAFT.assumptions[1]!, options: ['Short', 'Long'] })).toEqual(['Short', 'Long']);
    expect(chipOptions(DRAFT.assumptions[1]!)).toEqual(['Short', 'Medium', 'Long']);
  });

  it('marks unsourced specifics in the brief', () => {
    expect(markUnsourced('Ship on 3 March to 40 people.', ['40', '3 March'])).toEqual([
      { text: 'Ship on ', unsourced: false },
      { text: '3 March', unsourced: true },
      { text: ' to ', unsourced: false },
      { text: '40', unsourced: true },
      { text: ' people.', unsourced: false },
    ]);
  });
});

describe('Draft sheet', () => {
  it('blocks Insert until the pick is resolved, and one tap accepts the suggestion', async () => {
    const { bridge, push } = fakeBridge();
    push(ready());
    expect(screen.getByRole('heading', { name: 'Claude' })).toBeTruthy();
    expect(insertButton().getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Answer the pick above to insert.')).toBeTruthy();
    expect(screen.getByText('Pick one')).toBeTruthy(); // text, not colour, marks the open pick
    cmdEnter();
    fireEvent.click(insertButton());
    expect(bridge.insert).not.toHaveBeenCalled();

    const length = screen.getByRole('group', { name: 'Length, pick one' });
    fireEvent.click(within(length).getByRole('button', { name: /Short/ }));
    expect(bridge.answerChip).toHaveBeenCalledWith('length', 'Short');

    push(ready({ length: 'Short' }));
    expect(insertButton().getAttribute('aria-disabled')).not.toBe('true');
    cmdEnter();
    expect(bridge.insert).toHaveBeenCalledTimes(1);
  });

  it('answers the focused chip with number keys', async () => {
    const { bridge, push } = fakeBridge();
    push(ready());
    const length = screen.getByRole('group', { name: 'Length, pick one' });
    await waitFor(() => expect(length.contains(document.activeElement)).toBe(true)); // focus lands on the open pick
    fireEvent.keyDown(document.activeElement!, { key: '2' });
    expect(bridge.answerChip).toHaveBeenLastCalledWith('length', 'Medium');
    fireEvent.keyDown(document.activeElement!, { key: '1', metaKey: true });
    fireEvent.keyDown(document.activeElement!, { key: '9' });
    expect(bridge.answerChip).toHaveBeenCalledTimes(1);

    const tone = screen.getByRole('group', { name: 'Tone' });
    fireEvent.keyDown(within(tone).getAllByRole('button')[0]!, { key: '3' });
    expect(bridge.answerChip).toHaveBeenLastCalledWith('tone', 'Playful');
  });

  it('dismisses on Escape and copies from the Copy button', () => {
    const { bridge, push } = fakeBridge();
    push(ready());
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(bridge.copy).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bridge.dismiss).toHaveBeenCalled();
  });

  it('shows the brief read-only with unsourced specifics flagged, and the Ran on label', () => {
    const { push } = fakeBridge();
    push(ready());
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('3 March').className).toBe('pa-unsourced');
    expect(screen.getByText('(not from what you said)', { exact: false })).toBeTruthy();
    expect(screen.getByText('One detail you didn’t say')).toBeTruthy();
    expect(screen.getByText('Ran on: Dictation: on this Mac · Draft: server')).toBeTruthy();
  });

  it('asks before inserting into a different app', () => {
    const { bridge, push } = fakeBridge();
    push(ready({ length: 'Short' }, { confirmApp: { bundleId: 'com.tinyspeck.slackmacgap', name: 'Slack' } } as Partial<PanelState>));
    expect(screen.getByText('Insert into Slack?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Insert into Slack' }));
    expect(bridge.insert).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Copy instead' }));
    expect(bridge.copy).toHaveBeenCalled();
  });

  it('keeps the transcript on failure and offers a retry', () => {
    const { bridge, push } = fakeBridge();
    push({ phase: 'error', target: NOTES, message: "Couldn't draft: the server answered 503", transcript: 'plan my week', answers: {}, canRetry: true });
    expect(screen.getByText("Couldn't draft: the server answered 503")).toBeTruthy();
    expect(screen.getByText('plan my week')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(bridge.retry).toHaveBeenCalled();
  });

  it('shows "Press ⌘V" when the helper could only copy', () => {
    const { push } = fakeBridge();
    push({ phase: 'done', ...base, answers: { length: 'Short' }, outcome: 'copied', app: NOTES });
    expect(screen.getByText('Press ⌘V in Notes to paste it.')).toBeTruthy();
  });

  it('announces status only, never the streaming text', () => {
    const said: string[] = [];
    (document as { ariaNotify?: unknown }).ariaNotify = (m: string) => said.push(m);
    const { push } = fakeBridge();
    push({ phase: 'listening', target: NOTES, partial: '' });
    push({ phase: 'listening', target: NOTES, partial: 'write a' });
    push({ phase: 'listening', target: NOTES, partial: 'write a launch email' });
    expect(screen.getByText('write a launch email')).toBeTruthy();
    push({ phase: 'drafting', target: NOTES, transcript: 'write a launch email', answers: {} });
    push(ready({ length: 'Short' }));
    push({ phase: 'inserting', ...base, answers: { length: 'Short' } });
    push({ phase: 'done', ...base, answers: { length: 'Short' }, outcome: 'pasted', app: NOTES });
    expect(said).toEqual(['Listening', 'Drafting', 'Ready', 'Inserted']);
  });

  it("falls back to Astryx's live region without ariaNotify", async () => {
    const { push } = fakeBridge();
    // A status no earlier test sent through Astryx, whose shared region outlives each test.
    push({ phase: 'listening', target: NOTES, partial: 'secret words' });
    await waitFor(() => expect([...document.querySelectorAll('[aria-live]')].map((n) => n.textContent).join(' | ')).toContain('Listening'));
    expect([...document.querySelectorAll('[aria-live]')].some((n) => n.textContent?.includes('secret words'))).toBe(false);
  });
});

describe('browser fallback', () => {
  it('drafts typed text with /v1/forge and copies the brief', async () => {
    const fetch = vi.fn(async () => Response.json(DRAFT));
    const writeClipboard = vi.fn(async () => {});
    const bridge = createWebBridge({ api: createHttpApi({ baseUrl: 'http://localhost:8787', fetch: fetch as typeof globalThis.fetch }), writeClipboard });
    render(<DraftSheet bridge={bridge} />);

    expect(screen.queryByRole('button', { name: 'Insert' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: /What do you want the AI to do/ }), { target: { value: 'write a launch email' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true });

    await screen.findByRole('heading', { name: 'Claude' });
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe('http://localhost:8787/v1/forge');
    expect(JSON.parse(String(init.body))).toEqual({ text: 'write a launch email' });
    expect(screen.getByText('Ran on: Draft: server')).toBeTruthy();

    cmdEnter();
    await waitFor(() => expect(writeClipboard).toHaveBeenCalledWith(DRAFT.brief));
    await screen.findByText('Copied to the clipboard.');
  });

  it('marks drafts incognito while the session is incognito', async () => {
    const fetch = vi.fn(async () => Response.json(DRAFT));
    const bridge = createWebBridge({ api: createHttpApi({ baseUrl: 'http://localhost:8787', fetch: fetch as typeof globalThis.fetch }) });
    await bridge.setSession?.({ token: null, ready: true, incognito: true });
    await bridge.submit?.('write a launch email');
    const [, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ text: 'write a launch email', incognito: true });
  });
});

describe('receipt, channels and checks', () => {
  const services = (over: Partial<AppServices> = {}): AppServices => ({
    api: createFakeApi(),
    kind: 'guest',
    incognito: false,
    canSignIn: true,
    openSignIn: vi.fn(),
    saveBrief: vi.fn(async () => {}),
    ...over,
  });
  const done = (extra: Partial<PanelState> = {}) => ({ phase: 'done', ...base, answers: { length: 'Short' }, outcome: 'pasted', app: NOTES, ...extra }) as PanelState;

  it('asks "Did it work?" once, with equal answers', () => {
    const { bridge, push } = fakeBridge();
    push(done());
    expect(screen.getByText('Did it work?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'It didn’t' }));
    expect(bridge.rate).toHaveBeenCalledWith('didnt_work');
    push(done({ rated: 'didnt_work' } as Partial<PanelState>));
    expect(screen.queryByText('Did it work?')).toBeNull();
    expect(screen.getByText('Thanks for telling us.')).toBeTruthy();
  });

  it('offers sign-up to a guest, Save to an account, and nothing in incognito', async () => {
    const guest = services();
    fakeBridge('desktop', { services: guest }).push(done());
    fireEvent.click(screen.getByRole('button', { name: 'Sign up' }));
    expect(guest.openSignIn).toHaveBeenCalledWith(DRAFT);
    cleanup();

    const account = services({ kind: 'account' });
    fakeBridge('desktop', { services: account }).push(done());
    fireEvent.click(screen.getByRole('button', { name: 'Save to Library' }));
    await screen.findByRole('button', { name: 'Saved to Library' });
    expect(account.saveBrief).toHaveBeenCalledWith(DRAFT);
    cleanup();

    fakeBridge('desktop', { services: services({ kind: 'account', incognito: true }) }).push(done());
    expect(screen.queryByRole('button', { name: 'Save to Library' })).toBeNull();
    expect(screen.queryByText('Sign up to keep this')).toBeNull();
  });

  it('mas-lite: no Insert; ⌘↵ copies and the receipt says to press ⌘V', () => {
    const { bridge, push } = fakeBridge('desktop', { insertAtCursor: false });
    push(ready({ length: 'Short' }));
    expect(screen.queryByRole('button', { name: 'Insert' })).toBeNull();
    cmdEnter();
    expect(bridge.copy).toHaveBeenCalled();
    expect(bridge.insert).not.toHaveBeenCalled();
  });

  it('keeps Insert off while an issue blocks it, and shows every issue as text', () => {
    const { bridge, push } = fakeBridge();
    const draft = { ...DRAFT, issues: [{ code: 'too_long', message: 'Over the 4,000-character limit', severity: 'block' as const }] };
    push({ phase: 'ready', ...base, draft, answers: { length: 'Short' } });
    expect(screen.getByText('Blocks insert: Over the 4,000-character limit')).toBeTruthy();
    expect(insertButton().getAttribute('aria-disabled')).toBe('true');
    cmdEnter();
    expect(bridge.insert).not.toHaveBeenCalled();
  });

  it('cannot report a draft the server did not record', () => {
    fakeBridge('desktop', { services: services() }).push(ready({ length: 'Short' }));
    expect(screen.getByRole('button', { name: 'Report this output' }).getAttribute('aria-disabled')).toBe('true');
  });
});


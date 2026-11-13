import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForgeResponse } from '@promptai/contract';
import type { PanelState, PromptAIBridge } from './bridge.ts';
import { chipOptions, markUnsourced, unresolvedPicks } from './chips.ts';
import { DraftSheet } from './DraftSheet.tsx';
import { createWebBridge } from './web-bridge.ts';

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

function fakeBridge(platform: 'desktop' | 'web' = 'desktop') {
  let listener: (s: PanelState) => void = () => {};
  const bridge = {
    platform,
    onState: (l: (s: PanelState) => void) => {
      listener = l;
      return () => {};
    },
    insert: vi.fn(async () => {}),
    copy: vi.fn(async () => {}),
    answerChip: vi.fn(async () => {}),
    retry: vi.fn(async () => {}),
    dismiss: vi.fn(async () => {}),
  } satisfies PromptAIBridge;
  render(<DraftSheet bridge={bridge} />);
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
    const bridge = createWebBridge({ serverUrl: 'http://localhost:8787', fetch: fetch as typeof globalThis.fetch, writeClipboard });
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
});

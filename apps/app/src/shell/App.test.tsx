import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createFakeApi } from '../api/fake.ts';
import { createDevAuth, DEV_CODE } from '../auth/port.ts';
import { PROVIDER_CONSENT_VERSION } from '../firstrun/FirstRun.tsx';
import { createWebBridge } from '../web-bridge.ts';
import { App } from './App.tsx';

function renderApp(api = createFakeApi()) {
  const track = vi.fn();
  const writeClipboard = vi.fn(async () => {});
  const bridge = createWebBridge({ api, track, writeClipboard });
  const auth = createDevAuth();
  const tokens: { current: string | null } = { current: null };
  render(<App bridge={bridge} api={api} auth={auth} tokens={tokens} />);
  return { api, track, bridge, auth, tokens, writeClipboard };
}

/** A returning guest: first run done on this device and on the server. */
function returning() {
  const api = createFakeApi();
  api.state.ageConfirmed = true;
  api.state.consents.push({ purpose: 'llm_processing', granted: true, version: PROVIDER_CONSENT_VERSION, at: '2026-11-13T10:00:00.000Z' });
  localStorage.setItem('promptai.firstRun', 'done');
  localStorage.setItem('promptai.guest', JSON.stringify({ token: 'guest-1', expiresAt: '2999-01-01T00:00:00.000Z' }));
  return api;
}

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value } });

describe('first run', () => {
  it('asks the date of birth neutrally, then provider consent, then lands in Capture as a guest', async () => {
    const { api, tokens } = renderApp();
    expect(screen.getByRole('heading', { name: 'When were you born?' })).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull(); // no pre-checked (or any) box
    expect(screen.queryByText(/18/)).toBeNull(); // the threshold isn't shown before the answer
    for (const name of ['Day', 'Month', 'Year']) expect((screen.getByRole('textbox', { name }) as HTMLInputElement).value).toBe('');

    type('Day', '31');
    type('Month', '2');
    type('Year', '1990');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText(/Enter a real date/)).toBeTruthy();
    type('Day', '14');
    type('Month', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Provider consent: equal Yes and No, neither chosen.
    await screen.findByRole('heading', { name: 'Draft with AI providers?' });
    const yes = screen.getByRole('button', { name: 'Yes' });
    const no = screen.getByRole('button', { name: 'No' });
    expect(yes.className).toBe(no.className);
    expect(yes.getAttribute('aria-pressed')).toBeNull();
    expect(api.state.consents).toEqual([]);
    expect(api.state.token).toMatch(/^guest-/); // the ALTCHA was solved here
    expect(tokens.current).toBe(api.state.token);
    expect(api.state.ageConfirmed).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    await screen.findByRole('heading', { name: 'Draft a brief' });
    expect(api.state.consents.map(({ purpose, granted, version }) => ({ purpose, granted, version }))).toEqual([
      { purpose: 'llm_processing', granted: false, version: PROVIDER_CONSENT_VERSION }, // skipping is No
    ]);
    expect(localStorage.getItem('promptai.firstRun')).toBe('done');
    // Web dictation waits for the speech vendor: the mic is off, and says why.
    expect(screen.getByRole('button', { name: 'Dictate' }).getAttribute('aria-disabled') ?? screen.getByRole('button', { name: 'Dictate' }).hasAttribute('disabled')).toBeTruthy();
    expect(screen.getByText(/Dictation on the web is coming/)).toBeTruthy();
  });

  it('stops, and remembers, when the answer is under the age', async () => {
    renderApp(createFakeApi({ now: () => new Date('2026-11-13T00:00:00Z') }));
    type('Day', '1');
    type('Month', '1');
    type('Year', '2015');
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('heading', { name: 'PromptAI isn’t available to you' });
    expect(localStorage.getItem('promptai.firstRun')).toBe('refused');
  });

  it('sends a returning user back to the date screen when the server has no answer for them', async () => {
    const api = returning();
    api.state.ageConfirmed = false;
    renderApp(api);
    await screen.findByRole('heading', { name: 'When were you born?' });
  });
});

describe('the four places', () => {
  it('drafts from Capture, rates the receipt, reports the output and offers sign-up to keep it', async () => {
    const { api, track } = renderApp(returning());
    type(/What do you want the AI to do/, 'write a launch email');
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));

    await screen.findByRole('heading', { name: 'Claude' });
    expect(location.hash).toBe('#/draft');
    const decisionId = track.mock.calls[0]![1].decisionId as string;
    expect(track.mock.calls[0]).toEqual(['brief.shown', expect.objectContaining({ decisionId, toolId: 'claude', surface: 'web' })]);
    // Fields and issues render; "Why this is better" annotates the coverage map.
    expect(screen.getByText('Subject')).toBeTruthy();
    expect(screen.getByText('Say who the email is for to make it sharper.')).toBeTruthy();
    fireEvent.click(screen.getByText('Why this is better'));
    expect(await screen.findByText('Covered 1 of the 4 things Claude needs.')).toBeTruthy();
    expect(screen.getByText('Covers 3 of 4.')).toBeTruthy();
    expect(screen.getByText('Still missing')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await screen.findByText('Copied to the clipboard.');
    fireEvent.click(screen.getByRole('button', { name: 'It worked' }));
    await screen.findByText('Thanks for telling us.');
    expect(track.mock.calls.map((c) => c[0])).toEqual(['brief.shown', 'brief.copied', 'outcome.rated']);
    expect(track.mock.calls[2]![1]).toMatchObject({ decisionId, rating: 'worked', outcome: 'copied' });
    expect(screen.getByText('Sign up to keep this')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Report this output' }));
    const dialog = await screen.findByRole('dialog');
    const send = within(dialog).getByRole('button', { name: 'Send report' });
    expect(send.getAttribute('aria-disabled') === 'true' || send.hasAttribute('disabled')).toBe(true); // nothing preselected
    fireEvent.click(within(dialog).getByRole('radio', { name: 'It’s wrong or harmful' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send report' }));
    await within(dialog).findByText('Thanks. Your report reached us.');
    expect(api.state.reports).toEqual([{ decisionId, reason: 'wrong_or_harmful' }]);
  });

  it('signs up to keep the brief, then lists, searches, copies and deletes it in Library', async () => {
    const { api } = renderApp(returning());
    type(/What do you want the AI to do/, 'write a launch email');
    fireEvent.click(screen.getByRole('button', { name: 'Draft' }));
    await screen.findByRole('heading', { name: 'Claude' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign up' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByRole('textbox', { name: /^Email/ }), { target: { value: 'ana@example.com' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Email me a code' }));
    fireEvent.change(await within(dialog).findByRole('textbox', { name: /^Code/ }), { target: { value: DEV_CODE } });
    api.signIn('ana'); // what the server does for a Supabase token
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(api.state.library).toHaveLength(1));
    expect(api.state.library[0]).toMatchObject({ kind: 'brief', toolId: 'claude', title: 'Write a launch email for the beta on 3 March.' });

    act(() => {
      location.hash = '#/library';
    });
    await screen.findByRole('heading', { name: 'Library' });
    await screen.findByText('Write a launch email for the beta on 3 March.');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search saved briefs' }), { target: { value: 'zebra' } });
    expect(await screen.findByText('Nothing matches “zebra”')).toBeTruthy();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search saved briefs' }), { target: { value: 'launch' } });
    fireEvent.click(await screen.findByRole('button', { name: /^Delete Write a launch email/ }));
    await waitFor(() => expect(api.state.library).toHaveLength(0));
  });

  it('You: privacy controls write the ledger, history stays synced until 2d, and delete goes back to first run', async () => {
    const api = returning();
    const { auth } = renderApp(api);
    await act(async () => {
      api.signIn('ana');
      await auth.verifyCode('ana@example.com', DEV_CODE);
    });
    api.state.memory.push({
      id: '0190f5a2-7c1e-7d3a-9b2f-4f1e2d3c4b5a',
      kind: 'preference',
      scope: 'global',
      scopeRef: null,
      sensitivity: 'normal',
      status: 'active',
      text: 'Prefers British spelling',
      source: 'user',
      createdAt: '2026-11-13T10:00:00.000Z',
      updatedAt: '2026-11-13T10:00:00.000Z',
    });
    act(() => {
      location.hash = '#/you';
    });
    await screen.findByRole('heading', { name: 'You' });
    expect(screen.getByText('ana@example.com')).toBeTruthy();

    const improve = screen.getByRole('switch', { name: /Help improve defaults/ }) as HTMLInputElement;
    expect(improve.checked).toBe(false); // No until said Yes
    expect((screen.getByRole('switch', { name: /Personalize for me/ }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(improve);
    await waitFor(() => expect(api.state.consents.at(-1)).toMatchObject({ purpose: 'improve_defaults', granted: true }));
    const device = screen.getByRole('radio', { name: /This device only/ });
    expect(device.getAttribute('aria-disabled') === 'true' || device.hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('switch', { name: /Incognito/ }));
    expect(await screen.findByText('Incognito')).toBeTruthy();

    fireEvent.click(await screen.findByRole('button', { name: 'Forget “Prefers British spelling”' }));
    await waitFor(() => expect(api.state.memory).toEqual([]));

    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete account' }));
    await screen.findByRole('heading', { name: 'When were you born?' });
    expect(api.state.deleted).toBe(true);
    expect(localStorage.getItem('promptai.firstRun')).toBeNull();
  });

  it('opens the ⌘K palette and runs a command by keyboard', async () => {
    renderApp(returning());
    await screen.findByRole('heading', { name: 'Draft a brief' });
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    const palette = await screen.findByRole('dialog', { name: 'Commands' });
    fireEvent.click(await within(palette).findByText('Library'));
    await screen.findByRole('heading', { name: 'Library' });
    expect(location.hash).toBe('#/library');
  });
});

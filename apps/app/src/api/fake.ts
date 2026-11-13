/**
 * An in-memory ApiClient for tests (and test/fake-server.ts, which serves it
 * over HTTP). It keeps the server's rules that the app depends on: guests get
 * a real ALTCHA challenge and must solve it, the age gate stores only the
 * answer, the consent ledger is append-only, and guests have no memory or library.
 */
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/sha';
import {
  artifactCreateSchema,
  eventSchema,
  forgeRequestSchema,
  reportRequestSchema,
  type AppEvent,
  type Artifact,
  type ConsentEntry,
  type ForgeRequest,
  type MemoryItem,
  type Profile,
} from '@promptai/contract';
import { ApiError, type ApiClient, type ConsentChoice, type ForgeResult, type ReportRequest } from './client.ts';

const HMAC = 'fake-altcha-secret';

/** A draft with a pick, an assumption, an unsourced specific, two fields, an issue and a coverage map. */
export function sampleDraft(req: ForgeRequest): ForgeResult {
  const answers = req.answers ?? {};
  const length = answers.length ?? 'Short';
  const brief = `Write a launch email for the beta on 3 March.\n\nTone: ${answers.tone ?? 'Friendly'}. Length: ${length}.`;
  return {
    toolId: 'claude',
    toolName: 'Claude',
    brief,
    fields: [
      { id: 'subject', label: 'Subject', text: 'Our beta opens 3 March' },
      { id: 'body', label: 'Body', text: brief },
    ],
    assumptions: [
      { slotId: 'tone', label: 'Tone', value: 'Friendly', source: 'default', kind: 'assumption', options: ['Formal', 'Playful'] },
      { slotId: 'length', label: 'Length', value: 'Short', source: 'inferred', kind: 'pick', options: ['Medium', 'Long'] },
    ],
    unsourced: ['3 March'],
    issues: [{ code: 'no_audience', message: 'Say who the email is for to make it sharper.', severity: 'info' }],
    coverage: {
      covered: 3,
      total: 4,
      items: [
        { id: 'task', label: 'What to write', by: 'said' },
        { id: 'tone', label: 'Tone', by: 'assumed' },
        { id: 'length', label: 'Length', by: 'assumed' },
        { id: 'audience', label: 'Audience', by: 'missing' },
      ],
    },
    cardVersion: '1',
    decisionId: crypto.randomUUID(),
    usage: { llmCalls: 0, ms: 12 },
  };
}

export interface FakeState {
  kind: Profile['kind'];
  profileId: string;
  token: string | null;
  ageConfirmed: boolean;
  dobs: number;
  consents: ConsentEntry[];
  memory: MemoryItem[];
  library: Artifact[];
  reports: ReportRequest[];
  forges: ForgeRequest[];
  events: AppEvent[];
  deleted: boolean;
}

export interface FakeApiOptions {
  draft?: (req: ForgeRequest) => ForgeResult;
  now?: () => Date;
  /** Fail the next calls to /v1/events with this status (503 = transient). */
  eventsStatus?: () => number;
}

const iso = (d: Date) => d.toISOString();

export function createFakeApi(opts: FakeApiOptions = {}): ApiClient & { state: FakeState; signIn(handle: string): void } {
  const now = opts.now ?? (() => new Date());
  const draft = opts.draft ?? sampleDraft;
  const state: FakeState = {
    kind: 'guest',
    profileId: crypto.randomUUID(),
    token: null,
    ageConfirmed: false,
    dobs: 0,
    consents: [],
    memory: [],
    library: [],
    reports: [],
    forges: [],
    events: [],
    deleted: false,
  };
  let handle: string | null = null;
  const createdAt = iso(now());

  const me = async (): Promise<Profile> => ({ id: state.profileId, kind: state.kind, ageConfirmed: state.ageConfirmed, handle, consents: [...state.consents], createdAt });
  const account = () => {
    if (state.kind !== 'account') throw new ApiError(403, 'the server answered 403', 'account_required');
  };

  return {
    state,
    /** Test hook: the Supabase session the AuthPort would have produced. */
    signIn(h) {
      state.kind = 'account';
      handle = h;
    },
    async guestChallenge() {
      // Cheap enough to solve in a test: SHA-256, one round, a one-digit prefix.
      return createChallenge({ algorithm: 'SHA-256', cost: 1, keyPrefix: '0', deriveKey, hmacSignatureSecret: HMAC });
    },
    async guest(altcha) {
      let verified = false;
      try {
        const payload = JSON.parse(atob(altcha)) as { challenge: never; solution: never };
        verified = (await verifySolution({ ...payload, deriveKey, hmacSignatureSecret: HMAC })).verified;
      } catch {}
      if (!verified) throw new ApiError(400, 'the server answered 400', 'invalid_altcha');
      state.token = `guest-${crypto.randomUUID()}`;
      return { token: state.token, expiresAt: iso(new Date(now().getTime() + 86_400_000)), quota: { forgesPerDay: 20, dictationMinutesPerDay: 10 } };
    },
    me,
    async confirmAge(dob) {
      state.dobs++;
      const born = new Date(`${dob}T00:00:00Z`);
      const today = now();
      let age = today.getUTCFullYear() - born.getUTCFullYear();
      if (today.getUTCMonth() < born.getUTCMonth() || (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate())) age--;
      state.ageConfirmed = age >= 18;
      return state.ageConfirmed;
    },
    async setConsent(entries: ConsentChoice[]) {
      for (const e of entries) state.consents.push({ ...e, at: iso(now()) });
    },
    async memory() {
      return state.kind === 'account' ? [...state.memory] : [];
    },
    async forgetMemory(id) {
      state.memory = state.memory.filter((m) => m.id !== id);
    },
    async library() {
      return state.kind === 'account' ? [...state.library] : [];
    },
    async saveBrief(item) {
      account();
      const at = iso(now());
      const saved: Artifact = { ...artifactCreateSchema.parse(item), id: crypto.randomUUID(), version: 1, visibility: 'private', createdAt: at, updatedAt: at };
      state.library.unshift(saved);
      return saved;
    },
    async deleteBrief(id) {
      state.library = state.library.filter((a) => a.id !== id);
    },
    async exportData() {
      return { profile: await me(), memory: [...state.memory], library: [...state.library], exportedAt: iso(now()) };
    },
    async deleteAccount() {
      state.deleted = true;
      state.memory = [];
      state.library = [];
      state.consents = [];
    },
    async report(req) {
      state.reports.push(reportRequestSchema.parse(req));
    },
    async forge(req) {
      const parsed = forgeRequestSchema.parse(req);
      state.forges.push(req);
      return draft(parsed);
    },
    async sendEvents(events) {
      const status = opts.eventsStatus?.() ?? 200;
      if (status !== 200) return { ok: false, retry: status >= 500, status };
      const accepted: string[] = [];
      const rejected: { id: string | null; reason: string }[] = [];
      for (const e of events) {
        if (eventSchema.safeParse(e).success) {
          if (!state.events.some((s) => s.id === e.id)) state.events.push(e);
          accepted.push(e.id);
        } else rejected.push({ id: e.id ?? null, reason: 'invalid' });
      }
      return { ok: true, accepted, rejected };
    },
  };
}

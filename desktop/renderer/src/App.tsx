import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type ApiError } from './lib/api';
import { supabase } from './lib/supabase';
import type { ClarifyingQuestion, DesignedResponse, DraftResponse, EnhanceResponse, Platform } from './lib/api-types';

type Mode = 'draft' | 'enhance';
type Phase = 'input' | 'clarifying' | 'loading' | 'result' | 'error';

export function App() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  // Try a saved token first; if the backend has DEV_AUTH_BYPASS the token isn't
  // validated, but in production the first API call will 401 and drop us to auth.
  useEffect(() => {
    (async () => {
      const saved = await window.pf?.getSavedToken();
      if (saved) {
        api.setToken(saved);
        setAuthed(true);
      }
      setChecking(false);
    })();
  }, []);

  if (checking) return <div className="center muted">Loading…</div>;
  if (!authed) return <SignIn onAuthed={() => setAuthed(true)} />;
  return <Workspace onSignOut={() => { void window.pf?.setSavedToken(null); api.setToken(null); setAuthed(false); }} />;
}

function SignIn({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError('');
    if (!supabase) {
      // No Supabase configured (dev) — proceed with a dev token; backend bypass accepts it.
      api.setToken('dev');
      await window.pf?.setSavedToken('dev');
      onAuthed();
      return;
    }
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !data.session) {
      setError(err?.message ?? 'Sign-in failed');
      setBusy(false);
      return;
    }
    api.setToken(data.session.access_token);
    await window.pf?.setSavedToken(data.session.access_token);
    onAuthed();
  };

  return (
    <div className="center">
      <div className="card auth">
        <h1>PromptForge</h1>
        <p className="muted">Sign in to draft and enhance prompts.</p>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy} onClick={() => void submit()}>Sign in</button>
      </div>
    </div>
  );
}

function Workspace({ onSignOut }: { onSignOut: () => void }) {
  const [mode, setMode] = useState<Mode>('draft');
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [platformId, setPlatformId] = useState('');
  const [idea, setIdea] = useState('');
  const [phase, setPhase] = useState<Phase>('input');
  const [sessionId, setSessionId] = useState('');
  const [questions, setQuestions] = useState<ClarifyingQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [designed, setDesigned] = useState<DesignedResponse | null>(null);
  const [enhanceInfo, setEnhanceInfo] = useState<EnhanceResponse['improvement'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.platforms().then((r) => setPlatforms(r.platforms)).catch(() => {});
  }, []);

  // Deep actions from tray / widget (F1.4 / F1.5).
  useEffect(() => {
    window.pf?.onDeepAction((action) => {
      if (action.kind === 'new-draft') { setMode('draft'); reset(); }
      else if (action.kind === 'enhance-clipboard') { setMode('enhance'); setIdea(action.text); }
      else if (action.kind === 'dictate') { void dictate(); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = () => {
    setPhase('input'); setSessionId(''); setQuestions([]); setAnswers({}); setDesigned(null); setEnhanceInfo(null); setError('');
  };

  const handleDraftResult = useCallback((data: DraftResponse) => {
    if (data.status === 'clarifying') {
      setSessionId((data as { session_id: string }).session_id);
      setQuestions((data as { questions: ClarifyingQuestion[] }).questions);
      setPhase('clarifying');
    } else if (data.status === 'ok') {
      setDesigned((data as { response: DesignedResponse }).response);
      setPhase('result');
    } else {
      setError((data as { message?: string; reason?: string }).reason ?? (data as { message?: string }).message ?? 'Something went wrong.');
      setPhase('error');
    }
  }, []);

  const runDraft = async (justGenerate: boolean) => {
    if (!platformId || !idea.trim()) return;
    setPhase('loading'); setError('');
    try {
      const data = await api.draft({ platform_id: platformId, idea: idea.trim(), just_generate: justGenerate });
      handleDraftResult(data);
    } catch (e) { setError((e as ApiError).message); setPhase('error'); }
  };

  const submitAnswers = async (justGenerate: boolean) => {
    setPhase('loading'); setError('');
    try {
      const data = await api.clarify(sessionId, { platform_id: platformId, idea: idea.trim(), clarifications: justGenerate ? {} : answers, just_generate: justGenerate });
      handleDraftResult(data);
    } catch (e) { setError((e as ApiError).message); setPhase('error'); }
  };

  const runEnhance = async () => {
    if (idea.trim().length < 10) return;
    setPhase('loading'); setError('');
    try {
      const res = await api.enhance({ text: idea.trim(), platform_id: platformId || undefined });
      setDesigned(res.enhanced);
      setEnhanceInfo(res.improvement);
      setPhase('result');
    } catch (e) { setError((e as ApiError).message); setPhase('error'); }
  };

  // Desktop dictation — always the backend path (F1.3).
  const recorderRef = useRef<MediaRecorder | null>(null);
  const dictate = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      const chunks: Blob[] = [];
      recorderRef.current = rec;
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try { const { text } = await api.transcribe(new Blob(chunks, { type: 'audio/webm' })); if (text) setIdea((p) => (p ? `${p} ${text}` : text)); } catch { /* ignore */ }
      };
      rec.start();
      setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 15_000);
    } catch { /* mic blocked */ }
  }, []);

  return (
    <div className="app">
      <header className="topbar">
        <strong>⚡ PromptForge</strong>
        <div className="tabs">
          <button className={mode === 'draft' ? 'active' : ''} onClick={() => { setMode('draft'); reset(); }}>Draft</button>
          <button className={mode === 'enhance' ? 'active' : ''} onClick={() => { setMode('enhance'); reset(); }}>Enhance</button>
        </div>
        <button className="link" onClick={onSignOut}>Sign out</button>
      </header>

      <main className="workspace">
        {(phase === 'input' || phase === 'error') && (
          <div className="card">
            <label>Platform{mode === 'enhance' ? ' (optional)' : ''}</label>
            <select value={platformId} onChange={(e) => setPlatformId(e.target.value)}>
              <option value="">{mode === 'enhance' ? 'Auto-detect' : 'Select…'}</option>
              {platforms.map((p) => <option key={p.platform_id} value={p.platform_id}>{p.display_name}</option>)}
            </select>
            <div className="label-row">
              <label>{mode === 'draft' ? 'Your idea' : 'Your prompt'}</label>
              <button className="mic" onClick={() => void dictate()} title="Dictate">🎤</button>
            </div>
            <textarea rows={mode === 'enhance' ? 8 : 4} value={idea} onChange={(e) => setIdea(e.target.value)}
              placeholder={mode === 'draft' ? 'Describe what you want…' : 'Paste a finished prompt to improve…'} />
            {error && <p className="error">{error}</p>}
            {mode === 'draft' ? (
              <div className="btn-row">
                <button className="primary" disabled={!platformId || !idea.trim()} onClick={() => void runDraft(false)}>Help me refine it</button>
                <button disabled={!platformId || !idea.trim()} onClick={() => void runDraft(true)}>Just generate</button>
              </div>
            ) : (
              <button className="primary" disabled={idea.trim().length < 10} onClick={() => void runEnhance()}>Enhance it</button>
            )}
          </div>
        )}

        {phase === 'loading' && <div className="center muted">Working…</div>}

        {phase === 'clarifying' && (
          <div className="card">
            {questions.map((q) => (
              <div key={q.id} className="question">
                <label>{q.text}</label>
                {q.type === 'mcq' && q.options ? (
                  <div className="chips">
                    {q.options.map((opt) => (
                      <button key={opt} className={answers[q.id] === opt ? 'chip active' : 'chip'}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}>{opt}</button>
                    ))}
                  </div>
                ) : (
                  <input value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
                )}
              </div>
            ))}
            <div className="btn-row">
              <button className="primary" onClick={() => void submitAnswers(false)}>Continue</button>
              <button onClick={() => void submitAnswers(true)}>Just generate now</button>
            </div>
          </div>
        )}

        {phase === 'result' && designed && (
          <Result designed={designed} enhanceInfo={enhanceInfo} onReset={reset} />
        )}
      </main>
    </div>
  );
}

function Result({ designed, enhanceInfo, onReset }: { designed: DesignedResponse; enhanceInfo: EnhanceResponse['improvement'] | null; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(designed.assembled); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  return (
    <div className="card">
      {enhanceInfo && (
        <div className="banner">
          {enhanceInfo.note === 'improved' ? `Strength improved ${enhanceInfo.before} → ${enhanceInfo.after}` : 'Already strong — kept as-is'}
        </div>
      )}
      {designed.strength && <div className="score">Strength: <strong>{designed.strength.score}</strong> / 100 · {designed.strength.band}</div>}
      <pre className="assembled">{designed.assembled}</pre>
      <div className="btn-row">
        <button className="primary" onClick={() => void copy()}>{copied ? 'Copied ✓' : 'Copy'}</button>
        <button onClick={onReset}>New</button>
      </div>
      <div className="nodes">
        {[...designed.nodes].sort((a, b) => a.position - b.position).map((n) => (
          <div key={n.type} className="node">
            <span className="node-type">{n.label}</span>
            <span className="node-val">{n.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { customPlatformPayload } from '@/lib/customPlatforms';
import { extractAttachment, AttachmentError, type ExtractedAttachment } from '@/lib/attachments';
import type { ChatRefineMessage, DesignedResponse } from '@/lib/api-types';

interface ChatDraftProps {
  platformId: string;
  /** Called when the user opens a produced draft in the node editor. */
  onOpenDraft: (response: DesignedResponse) => void;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Attached to an assistant turn that produced a draft. */
  draft?: DesignedResponse;
}

/**
 * Chat-first drafting surface (V1.4): a genuine conversation that produces a
 * scored prompt, with file attachments for context. Draft results render as
 * inline cards with an "Open in editor" that hands off to the full NodeEditor.
 */
export default function ChatDraft({ platformId, onOpenDraft }: ChatDraftProps) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ExtractedAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !platformId) return;

    const history: ChatRefineMessage[] = [
      ...turns.map((t) => ({ role: t.role, content: t.content })),
      { role: 'user', content: text },
    ];
    setTurns((prev) => [...prev, { role: 'user', content: text }]);
    setInput('');
    setSending(true);
    setError('');
    const sentAttachments = attachments;
    setAttachments([]);

    try {
      const res = await api.chatDraft({
        platform_id: platformId,
        messages: history,
        attachments: sentAttachments.length ? sentAttachments : undefined,
        ...customPlatformPayload(platformId),
      });
      if (res.type === 'question') {
        setTurns((prev) => [...prev, { role: 'assistant', content: res.message }]);
      } else {
        setTurns((prev) => [...prev, { role: 'assistant', content: res.message, draft: res.response }]);
      }
    } catch {
      setError(strings.chatDraft.error);
    } finally {
      setSending(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setAttaching(true);
    setError('');
    try {
      const extracted = await extractAttachment(file);
      setAttachments((prev) => [...prev, extracted].slice(0, 4));
    } catch (err) {
      setError(err instanceof AttachmentError ? err.message : strings.chatDraft.error);
    } finally {
      setAttaching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  if (!platformId) {
    return <p className="mt-6 text-sm text-gray-500">{strings.chatDraft.selectPlatformFirst}</p>;
  }

  return (
    <div className="mt-6 rounded-lg border border-gray-200">
      <div ref={scrollRef} className="max-h-[28rem] space-y-3 overflow-y-auto px-4 py-4">
        {turns.length === 0 && <p className="text-sm text-gray-500">{strings.chatDraft.intro}</p>}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] ${t.role === 'user' ? '' : 'w-full'}`}>
              <div
                className={`rounded-lg px-3 py-2 text-sm ${
                  t.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                {t.content}
              </div>
              {t.draft && (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                      {strings.chatDraft.draftReady}
                    </span>
                    {t.draft.strength && (
                      <span className="text-sm font-bold text-emerald-700">{t.draft.strength.score}</span>
                    )}
                  </div>
                  <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-emerald-100 bg-white px-2 py-1.5 font-mono text-xs text-gray-700">
                    {t.draft.assembled}
                  </pre>
                  <button
                    type="button"
                    onClick={() => onOpenDraft(t.draft!)}
                    className="mt-2 rounded-md bg-gray-900 px-3 py-1.5 text-xs text-white hover:bg-gray-700"
                  >
                    {strings.chatDraft.openInEditor}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">{strings.chatDraft.thinking}</div>
          </div>
        )}
      </div>

      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-gray-200 px-3 py-2">
          {attachments.map((a, i) => (
            <span key={i} className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
              📎 {a.name} ({Math.ceil(a.text.length / 1000)}k)
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                aria-label="Remove"
                className="text-gray-400 hover:text-gray-700"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="border-t border-gray-200 px-4 py-2">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <div className="flex items-end gap-2 border-t border-gray-200 px-3 py-2">
        <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} accept=".txt,.md,.markdown,.json,.csv,.tsv,.ts,.tsx,.js,.jsx,.py,.html,.css,.yml,.yaml,.xml,.sql,.sh,.go,.rs,.java,.rb,.php,.c,.cpp,.h,.pdf,text/*,application/pdf,application/json" />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={attaching || sending}
          title={strings.chatDraft.attachHint}
          aria-label={strings.chatDraft.attach}
          className="rounded-md border border-gray-300 px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {attaching ? '…' : '📎'}
        </button>
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={strings.chatDraft.placeholder}
          disabled={sending}
          className="block w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {strings.chatDraft.send}
        </button>
      </div>
    </div>
  );
}

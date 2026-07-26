'use client';

import { useState, useRef, useEffect } from 'react';
import { api } from '@/lib/api';
import { strings } from '@/lib/strings';
import { customPlatformPayload } from '@/lib/customPlatforms';
import type { ChatRefineMessage, DesignedNode } from '@/lib/api-types';

interface ChatRefineProps {
  platformId: string;
  taskType: string;
  nodes: DesignedNode[];
  onApply: (nodes: DesignedNode[], assembled: string) => void;
}

interface DisplayMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Conversational alternative to node-by-node editing (F2.x): a small chat
 * panel where the user describes what they want changed, in their own
 * words, and the assistant either asks one short follow-up question or
 * replaces the assembled prompt/nodes with an updated version. Purely a UI
 * for understanding intent — the actual editing surface stays the existing
 * NodeEditor, which `onApply` writes back into.
 */
export default function ChatRefine({ platformId, taskType, nodes, onApply }: ChatRefineProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const history: ChatRefineMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setSending(true);
    setError('');

    try {
      const res = await api.chatRefine({
        platform_id: platformId,
        task_type: taskType,
        nodes: nodes.map((n) => ({ type: n.type, value: n.value, locked: n.locked })),
        messages: history,
        ...customPlatformPayload(platformId),
      });
      if (res.type === 'question') {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.message }]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: res.message }]);
        onApply(res.nodes, res.assembled);
      }
    } catch {
      setError(strings.chatRefineError);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        {open ? strings.chatRefineToggleClose : strings.chatRefineToggleOpen}
      </button>

      {open && (
        <div className="mt-3 rounded-lg border border-gray-200">
          <div ref={scrollRef} className="max-h-72 space-y-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500">{strings.chatRefineIntro}</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === 'user' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-500">
                  {strings.chatRefineThinking}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="border-t border-gray-200 px-4 py-2">
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}

          <div className="flex items-end gap-2 border-t border-gray-200 px-3 py-2">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={strings.chatRefinePlaceholder}
              disabled={sending}
              className="block w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !input.trim()}
              className="rounded-md bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {strings.chatRefineSend}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

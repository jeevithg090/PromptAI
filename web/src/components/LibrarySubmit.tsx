'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';

const MODALITIES = ['image', 'video', 'chat', 'code', 'text'];

/** Community contribution form — submits a prompt template to the public library
 *  queue. Submissions are safety- and quality-screened server-side; strong ones
 *  auto-approve, others go to a review queue. Requires sign-in. */
export default function LibrarySubmit() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [modality, setModality] = useState('image');
  const [tags, setTags] = useState('');
  const [template, setTemplate] = useState('');
  const [credit, setCredit] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ status: string; reason?: string } | null>(null);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!title.trim() || !description.trim() || !template.trim() || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await api.submitToLibrary({
        title: title.trim(),
        description: description.trim(),
        modality,
        platform_tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
        template: [{ type: 'template', value: template.trim() }],
        credit,
      });
      setResult({ status: res.moderation_status, reason: res.reason });
      if (res.moderation_status !== 'rejected') {
        setTitle(''); setDescription(''); setTags(''); setTemplate('');
      }
    } catch {
      setError('Could not submit. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gray-300 px-3.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
      >
        + Contribute a prompt
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-800">Contribute a prompt</h2>
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500 hover:underline">Close</button>
      </div>

      {!user ? (
        <p className="mt-3 text-sm text-gray-600">
          Please <Link href="/auth/signin?next=/library" className="font-medium text-emerald-700 hover:underline">sign in</Link> to submit a prompt to the community library.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <select value={modality} onChange={(e) => setModality(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500">
              {MODALITIES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Platform tags (comma-separated, e.g. midjourney)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500" />
          </div>
          <textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={4} placeholder="The prompt template itself…"
            className="w-full rounded-lg border border-gray-300 p-3 font-mono text-sm text-gray-900 focus:border-emerald-500 focus:ring-emerald-500" />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
            Credit me as the contributor
          </label>

          {error && <p className="text-sm text-red-700">{error}</p>}
          {result && (
            <p className={`rounded-md p-2 text-sm ${
              result.status === 'approved' ? 'bg-emerald-50 text-emerald-700'
                : result.status === 'rejected' ? 'bg-red-50 text-red-700'
                : 'bg-amber-50 text-amber-700'}`}>
              {result.status === 'approved' && 'Approved and published — thanks for contributing!'}
              {result.status === 'pending' && `Submitted for review${result.reason ? ` (${result.reason})` : ''}.`}
              {result.status === 'rejected' && `Not accepted${result.reason ? `: ${result.reason}` : ''}.`}
            </p>
          )}

          <button
            onClick={submit}
            disabled={busy || !title.trim() || !description.trim() || !template.trim()}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? 'Submitting…' : 'Submit to library'}
          </button>
        </div>
      )}
    </div>
  );
}

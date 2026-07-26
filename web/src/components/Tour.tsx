'use client';

import { useCallback, useEffect, useState } from 'react';
import { strings } from '@/lib/strings';

/**
 * Hand-rolled first-run spotlight tour (F2.6). Anchors to `/build` elements via
 * `data-tour` attributes; keyboard-operable; announced via aria-live; shown
 * once (localStorage) and relaunchable from /account. Steps whose target isn't
 * on screen yet render a centered card instead of a spotlight (graceful).
 */
const FLAG = 'pf_tour_done';
const LAUNCH_EVENT = 'pf:launch-tour';

interface Step { selector: string; title: string; body: string; }

const STEPS: Step[] = [
  { selector: '[data-tour="platform-picker"]', title: strings.tour.s1Title, body: strings.tour.s1Body },
  { selector: '[data-tour="idea-box"]', title: strings.tour.s2Title, body: strings.tour.s2Body },
  { selector: '[data-tour="node-editor"]', title: strings.tour.s3Title, body: strings.tour.s3Body },
  { selector: '[data-tour="strength-panel"]', title: strings.tour.s4Title, body: strings.tour.s4Body },
];

/** Programmatically (re)launch the tour, e.g. from /account. */
export function launchTour(): void {
  window.dispatchEvent(new Event(LAUNCH_EVENT));
}

export default function Tour() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const start = useCallback(() => { setStep(0); setActive(true); }, []);

  useEffect(() => {
    // Auto-start once on first /build visit.
    if (typeof window === 'undefined') return;
    const onBuild = window.location.pathname.startsWith('/build');
    if (onBuild && !localStorage.getItem(FLAG)) start();
    const relaunch = () => start();
    window.addEventListener(LAUNCH_EVENT, relaunch);
    return () => window.removeEventListener(LAUNCH_EVENT, relaunch);
  }, [start]);

  // Track the current step's target rect (or null if absent).
  useEffect(() => {
    if (!active) return;
    const el = document.querySelector(STEPS[step]?.selector ?? '');
    setRect(el ? el.getBoundingClientRect() : null);
  }, [active, step]);

  const finish = useCallback(() => {
    setActive(false);
    try { localStorage.setItem(FLAG, '1'); } catch { /* private mode */ }
  }, []);

  const onKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') finish();
    if (e.key === 'ArrowRight' || e.key === 'Enter') { step < STEPS.length - 1 ? setStep((s) => s + 1) : finish(); }
    if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
  }, [step, finish]);

  if (!active) return null;
  const s = STEPS[step];
  if (!s) return null;

  // Card position: near the target, else centered.
  const cardStyle: React.CSSProperties = rect
    ? { top: Math.min(rect.bottom + 12, window.innerHeight - 200), left: Math.max(12, Math.min(rect.left, window.innerWidth - 340)) }
    : { top: '40%', left: '50%', transform: 'translate(-50%,-50%)' };

  return (
    <div className="fixed inset-0 z-[9998]" role="dialog" aria-modal="true" aria-label={strings.tour.title} onKeyDown={onKey} tabIndex={-1}>
      {/* Dim + spotlight cutout via box-shadow. */}
      <div
        className="pointer-events-none absolute rounded-lg"
        style={
          rect
            ? { top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)' }
            : { inset: 0, boxShadow: 'inset 0 0 0 9999px rgba(0,0,0,0.55)' }
        }
      />
      <div className="absolute w-[320px] rounded-xl bg-white p-4 shadow-2xl" style={cardStyle}>
        <p className="sr-only" aria-live="polite">{`${step + 1} / ${STEPS.length}: ${s.title}`}</p>
        <h3 className="text-sm font-semibold text-gray-900">{s.title}</h3>
        <p className="mt-1 text-sm text-gray-600">{s.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <button onClick={finish} className="text-xs text-gray-400 hover:underline">{strings.tour.skip}</button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{step + 1}/{STEPS.length}</span>
            {step > 0 && <button onClick={() => setStep((x) => x - 1)} className="rounded border border-gray-300 px-3 py-1 text-xs">{strings.tour.back}</button>}
            <button
              onClick={() => (step < STEPS.length - 1 ? setStep((x) => x + 1) : finish())}
              className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
              autoFocus
            >
              {step < STEPS.length - 1 ? strings.tour.next : strings.tour.done}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

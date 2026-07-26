import { useEffect, useState } from 'react';

/**
 * Widget skins (F1.5) — config-driven registry so new figures are additions,
 * not rewrites. Every skin obeys the non-distraction rules: no cycle faster
 * than 3s, static under prefers-reduced-motion. No animation libraries.
 */
export type SkinId = 'pill' | 'orb' | 'companion';

interface SkinProps { active: boolean; }

function Pill({ active }: SkinProps) {
  return (
    <div className={`skin pill${active ? ' active' : ''}`} aria-hidden="true">
      <span className="pill-glyph">⚡</span>
    </div>
  );
}

function Orb({ active }: SkinProps) {
  return <div className={`skin orb${active ? ' active' : ''}`} aria-hidden="true" />;
}

/** "Forgi" — a hand-animated inline-SVG companion. Blinks every 3–5s, gentle bob. */
function Companion({ active }: SkinProps) {
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      t = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        schedule();
      }, 3000 + Math.random() * 2000);
    };
    schedule();
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`skin companion${active ? ' active' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48" width="100%" height="100%">
        <circle cx="24" cy="24" r="20" fill="var(--forgi-body)" />
        <circle cx="24" cy="24" r="20" fill="none" stroke="var(--forgi-ring)" strokeWidth="1.5" />
        {/* eyes */}
        <ellipse cx="17" cy="22" rx="2.4" ry={blink ? 0.4 : 3} fill="#0b0d12" />
        <ellipse cx="31" cy="22" rx="2.4" ry={blink ? 0.4 : 3} fill="#0b0d12" />
        {/* smile */}
        <path d="M17 30 Q24 35 31 30" fill="none" stroke="#0b0d12" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </div>
  );
}

export const SKINS: Record<SkinId, (p: SkinProps) => React.JSX.Element> = {
  pill: Pill,
  orb: Orb,
  companion: Companion,
};

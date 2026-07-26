import Link from 'next/link';
import { strings } from '@/lib/strings';

/** A compact, static mock of a scored prompt result — the product, shown not told. */
function ProductMock() {
  const dims = [
    ['Specificity', 3],
    ['Platform fit', 3],
    ['Constraint completeness', 3],
    ['Context efficiency', 2],
  ] as const;
  return (
    <div className="pf-rise mx-auto mt-16 max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-lg">
      <div className="flex items-center gap-2 border-b border-line bg-stone-50 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-stone-300" />
        <span className="ml-2 font-mono text-[11px] text-stone-400">PromptForge — Midjourney</span>
      </div>
      <div className="p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-signal-good/25">
            <span className="font-display text-xl font-bold text-signal-good">94</span>
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-ink">Excellent</p>
            <p className="text-xs text-stone-400">Grounded in 5 doc passages</p>
          </div>
          <span className="pf-badge ml-auto">Forged</span>
        </div>
        <div className="mt-5 space-y-2">
          {dims.map(([label, score]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-44 text-xs text-stone-500">{label}</span>
              <div className="h-1.5 flex-1 rounded-full bg-stone-100">
                <div
                  className={`h-1.5 rounded-full ${score === 3 ? 'bg-signal-good' : 'bg-signal-mid'}`}
                  style={{ width: `${(score / 3) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <pre className="mt-5 overflow-x-auto whitespace-pre-wrap rounded-xl border border-line bg-stone-50 px-4 py-3 font-mono text-xs leading-relaxed text-stone-700">
          a red bicycle, leaning against a brick wall, golden hour, 50mm f/2.8, rule of thirds --ar 16:9 --style raw
        </pre>
      </div>
    </div>
  );
}

const STEPS = [
  { n: '01', title: 'Describe the gist', body: 'Type a rough idea — "an image of a horse running." No prompt-craft required.' },
  { n: '02', title: 'Answer a few questions', body: 'A short interview pins down intent, style, and constraints — only what matters.' },
  { n: '03', title: 'Get a forged prompt', body: 'A platform-tailored prompt, scored 0–100, explained, and editable node-by-node.' },
];

export default function HomePage() {
  const features = [
    { title: strings.landingFeatureTitle1, body: strings.landingFeature1 },
    { title: strings.landingFeatureTitle2, body: strings.landingFeature2 },
    { title: strings.landingFeatureTitle3, body: strings.landingFeature3 },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="hero-wash border-b border-line">
        <div className="dot-grid">
          <div className="mx-auto max-w-4xl px-4 py-24 text-center sm:px-6 lg:px-8">
            <span className="pf-badge">
              <span className="h-1.5 w-1.5 rounded-full bg-ember-500" />
              {strings.landingBadge}
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl font-display text-5xl font-bold leading-[1.05] tracking-tight text-ink sm:text-6xl">
              {strings.landingHero}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-stone-600">{strings.landingSubtitle}</p>
            <div className="mt-9 flex items-center justify-center gap-3">
              <Link href="/try" className="pf-btn pf-btn-primary !px-6 !py-3 text-[0.95rem]">
                {strings.landingCta}
              </Link>
              <Link href="/build" className="pf-btn pf-btn-secondary !px-6 !py-3 text-[0.95rem]">
                {strings.navBuild}
              </Link>
            </div>
            <ProductMock />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ember-600">How it works</p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">From spark to sharp prompt</h2>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="relative">
              <span className="font-mono text-sm font-semibold text-ember-600">{s.n}</span>
              <div className="mt-2 h-px w-full bg-line" />
              <h3 className="mt-4 font-display text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="pf-card p-6 transition-shadow hover:shadow-md">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-ember-50 text-ember-600">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1.5 3 4 4 4 7a4 4 0 0 1-8 0c0-1 .5-2 1.2-2.8" /><path d="M12 21v-4" /></svg>
                </div>
                <h3 className="mt-4 font-display font-semibold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Library + Platforms teaser */}
      <section className="border-t border-line">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-16 sm:grid-cols-2 sm:px-6 lg:px-8">
          <Link href="/library" className="pf-card group p-7 transition-all hover:-translate-y-0.5 hover:border-ember-300 hover:shadow-md">
            <h3 className="font-display text-lg font-semibold text-ink">{strings.landingLibraryTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{strings.landingLibraryBody}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ember-700">
              {strings.landingBrowse} <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
          <Link href="/platforms" className="pf-card group p-7 transition-all hover:-translate-y-0.5 hover:border-ember-300 hover:shadow-md">
            <h3 className="font-display text-lg font-semibold text-ink">{strings.landingPlatformsTitle}</h3>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">{strings.landingPlatformsBody}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ember-700">
              {strings.landingExplore} <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </span>
          </Link>
        </div>
      </section>
    </div>
  );
}

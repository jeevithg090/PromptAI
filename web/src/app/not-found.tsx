import type { Metadata } from 'next';
import Link from 'next/link';
import { strings } from '@/lib/strings';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  const s = strings.notFound;
  return (
    <section className="hero-wash">
      <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:py-32">
        <span className="pf-badge">{s.eyebrow}</span>
        <h1 className="mt-5 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">{s.title}</h1>
        <p className="mt-4 text-base text-ink-soft">{s.body}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/" className="pf-btn pf-btn-primary">{s.home}</Link>
          <Link href="/build" className="pf-btn pf-btn-secondary">{s.build}</Link>
          <Link href="/library" className="pf-btn pf-btn-secondary">{s.library}</Link>
        </div>
      </div>
    </section>
  );
}

import Link from 'next/link';
import { strings } from '@/lib/strings';

export default function HomePage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <section className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          {strings.landingHero}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          {strings.landingSubtitle}
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/try"
            className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700"
          >
            {strings.landingCta}
          </Link>
          <Link
            href="/build"
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {strings.navBuild}
          </Link>
        </div>
      </section>

      <section className="mt-24 grid gap-8 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900">Platform-aware drafting</h3>
          <p className="mt-2 text-sm text-gray-600">{strings.landingFeature1}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900">Quality score</h3>
          <p className="mt-2 text-sm text-gray-600">{strings.landingFeature2}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900">Edit node-by-node</h3>
          <p className="mt-2 text-sm text-gray-600">{strings.landingFeature3}</p>
        </div>
      </section>
    </div>
  );
}
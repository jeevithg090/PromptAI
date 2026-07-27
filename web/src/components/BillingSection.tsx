'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

type Usage = { plan: string; used: number; budget: number; byok: boolean; projectsAllowed: boolean; visualPreview: boolean };

/** Plan & usage panel — shows the caller's plan, monthly token usage vs budget,
 *  and an upgrade path via Stripe Checkout (gracefully degrades if billing is
 *  not configured on the server). */
export default function BillingSection() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [upgrading, setUpgrading] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.meUsage()
      .then((res) => setUsage(res as Usage))
      .catch(() => setError('Could not load your plan.'))
      .finally(() => setLoading(false));
  }, []);

  const upgrade = async () => {
    setUpgrading(true);
    setNotice('');
    setError('');
    try {
      const res = await api.billingCheckout();
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      setError('Checkout did not return a URL.');
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 501) {
        setNotice('Billing is not configured on this deployment yet.');
      } else {
        setError('Could not start checkout.');
      }
    } finally {
      setUpgrading(false);
    }
  };

  const pct = usage && usage.budget > 0 ? Math.min(100, Math.round((usage.used / usage.budget) * 100)) : 0;
  const near = pct >= 80;

  return (
    <div>
      <h2 className="text-sm font-medium text-gray-700">Plan &amp; usage</h2>
      {loading ? (
        <p className="mt-2 text-sm text-gray-500">Loading…</p>
      ) : error ? (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      ) : usage ? (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-900">
                Current plan: <span className="font-semibold capitalize">{usage.plan}</span>
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {usage.byok ? 'Bring-your-own-key enabled · ' : ''}
                {usage.projectsAllowed ? 'Projects enabled' : 'Projects locked'}
                {usage.visualPreview ? ' · Visual preview enabled' : ''}
              </p>
            </div>
            {usage.plan === 'free' && (
              <button
                onClick={upgrade}
                disabled={upgrading}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {upgrading ? 'Starting…' : 'Upgrade to Pro'}
              </button>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>This month</span>
              <span>{usage.used.toLocaleString()} / {usage.budget.toLocaleString()} tokens</span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full ${near ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {notice && <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-700">{notice}</p>}
        </div>
      ) : null}
    </div>
  );
}

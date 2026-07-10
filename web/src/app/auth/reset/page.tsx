'use client';

import { useState } from 'react';
import Link from 'next/link';
import { strings } from '@/lib/strings';
import { useAuth } from '@/components/AuthProvider';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const { resetPassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(true);
    const result = await resetPassword(email);
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-sm px-4 py-16 text-center">
        <p className="text-lg text-gray-900">{strings.authResetSent}</p>
        <Link href="/auth/signin" className="mt-4 inline-block text-sm text-gray-900 underline">
          {strings.authSignIn}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">{strings.authResetPassword}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            {strings.authEmail}
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
        >
          {pending ? strings.authPending : strings.authSendReset}
        </button>
        <p className="text-center text-sm text-gray-600">
          <Link href="/auth/signin" className="text-gray-900 underline">
            {strings.authSignIn}
          </Link>
        </p>
      </form>
    </div>
  );
}
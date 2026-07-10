'use client';

import { Suspense } from 'react';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { strings } from '@/lib/strings';
import { useAuth } from '@/components/AuthProvider';

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const { signIn } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setPending(true);
    const result = await signIn(email, password);
    setPending(false);
    if (result.error) {
      setError(result.error);
    } else {
      const next = searchParams.get('next') ?? '/build';
      router.push(next);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          {strings.authPassword}
        </label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
      >
        {pending ? strings.authPending : strings.authSignIn}
      </button>
      <p className="text-center text-sm text-gray-600">
        {strings.authNoAccount}{' '}
        <Link href="/auth/signup" className="font-medium text-gray-900 underline">
          {strings.navSignUp}
        </Link>
      </p>
      <p className="text-center text-sm">
        <Link href="/auth/reset" className="text-gray-600 underline">
          {strings.authResetPassword}
        </Link>
      </p>
    </form>
  );
}

export default function SignInPage() {
  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold text-gray-900">{strings.authSignIn}</h1>
      <div className="mt-6">
        <Suspense fallback={<p className="text-sm text-gray-600">{strings.loading}</p>}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
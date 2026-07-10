'use client';

import Link from 'next/link';
import { strings } from '@/lib/strings';
import { AuthProvider, useAuth } from './AuthProvider';

function NavBar() {
  const { user, signOut } = useAuth();

  return (
    <header className="border-b border-gray-200">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <Link href="/" className="text-lg font-bold text-gray-900">
          {strings.appName}
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/try" className="text-gray-600 hover:text-gray-900">
            {strings.navTry}
          </Link>
          <Link href="/build" className="text-gray-600 hover:text-gray-900">
            {strings.navBuild}
          </Link>
          {user ? (
            <>
              <Link href="/library" className="text-gray-600 hover:text-gray-900">
                {strings.navLibrary}
              </Link>
              <Link href="/history" className="text-gray-600 hover:text-gray-900">
                {strings.navHistory}
              </Link>
              <Link href="/account" className="text-gray-600 hover:text-gray-900">
                {strings.navAccount}
              </Link>
              <button onClick={() => signOut()} className="text-gray-600 hover:text-gray-900">
                {strings.navSignOut}
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/signin" className="text-gray-600 hover:text-gray-900">
                {strings.navSignIn}
              </Link>
              <Link
                href="/auth/signup"
                className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-gray-700"
              >
                {strings.navSignUp}
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

export function LayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-400">
          &copy; {new Date().getFullYear()} {strings.appName}
        </footer>
      </div>
    </AuthProvider>
  );
}
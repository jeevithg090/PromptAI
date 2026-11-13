import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Shared prompts are reachable by link only; keep them out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ShareLayout({ children }: { children: ReactNode }) {
  return children;
}

import { strings } from '@/lib/strings';

/** Inline, announced error with a retry button — for data that failed to load. */
export default function LoadError({ message, onRetry, className = '' }: { message: string; onRetry: () => void; className?: string }) {
  return (
    <div role="alert" className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 ${className}`}>
      <p className="text-sm text-red-700">{message}</p>
      <button type="button" onClick={onRetry} className="pf-btn pf-btn-secondary !py-2">{strings.tryRetry}</button>
    </div>
  );
}

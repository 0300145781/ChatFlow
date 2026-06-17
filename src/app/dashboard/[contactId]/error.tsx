'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Chat Room Error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-background p-4">
      <div className="w-full max-w-sm bg-white dark:bg-[#111] border border-border rounded-2xl p-6 text-center shadow-lg flex flex-col items-center">
        <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-lg font-bold mb-2">Chat Room Error</h3>
        <p className="text-sm text-muted-foreground mb-6">
          We encountered an issue loading this conversation.
        </p>
        <div className="flex gap-2 w-full">
          <button
            onClick={() => reset()}
            className="flex-1 bg-primary/10 text-primary hover:bg-primary/20 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/dashboard"
            className="flex-1 bg-black/5 dark:bg-white/5 text-foreground hover:bg-black/10 dark:hover:bg-white/10 py-2.5 rounded-xl text-sm font-medium transition-colors"
          >
            Go Back
          </Link>
        </div>
      </div>
    </div>
  );
}

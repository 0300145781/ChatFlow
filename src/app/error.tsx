'use client'; // Error components must be Client Components

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import Link from 'next/link';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service in production
    console.error("Global Application Error:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background text-foreground p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white dark:bg-[#111] border border-border rounded-3xl p-8 flex flex-col items-center text-center shadow-xl"
      >
        <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>
        
        <h2 className="text-2xl font-bold mb-2">Something went wrong!</h2>
        <p className="text-muted-foreground mb-8 text-sm leading-relaxed">
          The application encountered an unexpected error. Don't worry, your data is safe.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <button
            onClick={() => reset()}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 px-4 rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            <RefreshCcw className="w-4 h-4" />
            Try Again
          </button>
          
          <Link 
            href="/dashboard"
            className="flex-1 flex items-center justify-center gap-2 bg-black/5 dark:bg-white/5 text-foreground py-3 px-4 rounded-xl font-medium hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          >
            <Home className="w-4 h-4" />
            Dashboard
          </Link>
        </div>
        
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-8 p-4 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-xl text-xs text-left w-full overflow-auto max-h-32 border border-red-100 dark:border-red-900/30">
            <span className="font-bold">Dev Details:</span><br />
            {error.message}
          </div>
        )}
      </motion.div>
    </div>
  );
}

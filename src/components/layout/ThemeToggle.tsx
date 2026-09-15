'use client';

import { useTheme } from '@/context/ThemeContext';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isLight = mounted && theme === 'light';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="relative flex items-center justify-center h-8 w-8 rounded-none border border-brand-border hover:border-brand-accent/60 bg-brand-surface/70 hover:bg-brand-surface-hover text-brand-text-muted hover:text-brand-text transition-all duration-300 cursor-pointer shadow-xs focus:outline-none focus:ring-1 focus:ring-brand-accent/40"
      title={isLight ? 'Switch to Dark atmosphere' : 'Switch to Light atmosphere (Ivory & Champagne Gold)'}
      aria-label={isLight ? 'Switch to Dark theme' : 'Switch to Light theme'}
    >
      {isLight ? (
        // Moon icon for Light Mode (clicking switches back to Dark)
        <svg
          className="h-3.5 w-3.5 text-brand-accent transition-transform duration-300 hover:-rotate-12"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      ) : (
        // Sun icon for Dark Mode (clicking switches to Light)
        <svg
          className="h-3.5 w-3.5 text-brand-accent transition-transform duration-300 hover:rotate-45"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="4" strokeWidth="1.5" />
          <path
            strokeLinecap="round"
            strokeWidth={1.5}
            d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          />
        </svg>
      )}
    </button>
  );
}

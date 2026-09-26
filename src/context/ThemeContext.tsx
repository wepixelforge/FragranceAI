'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const THEME_STORAGE_KEY = 'fragrance_theme';

function isLightDefaultPath(path: string): boolean {
  const normalized = path.toLowerCase();
  return (
    normalized === '/thescentstories' ||
    normalized.startsWith('/thescentstories/') ||
    normalized === '/scentira' ||
    normalized.startsWith('/scentira/') ||
    normalized === '/souqscent' ||
    normalized.startsWith('/souqscent/')
  );
}

function brandDefaultTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    if (isLightDefaultPath(window.location.pathname || '')) {
      return 'light';
    }
  } catch {
    // Ignore path errors
  }
  return 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
        document.documentElement.classList.toggle('light', savedTheme === 'light');
      } else {
        const initial = brandDefaultTheme();
        setThemeState(initial);
        document.documentElement.setAttribute('data-theme', initial);
        document.documentElement.classList.toggle('light', initial === 'light');
      }
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
  }, []);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage errors
    }
    document.documentElement.setAttribute('data-theme', newTheme);
    document.documentElement.classList.toggle('light', newTheme === 'light');
  };

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

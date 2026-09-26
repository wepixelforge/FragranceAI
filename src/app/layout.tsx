import type { Metadata } from 'next';
import { Geist, Playfair_Display } from 'next/font/google';
import { ThemeProvider } from '@/context/ThemeContext';
import { CartProvider } from '@/context/CartContext';
import CartToast from '@/components/layout/CartToast';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  display: 'swap',
});

const playfairDisplay = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Fragrance Discovery — AI-Powered Perfume Finder',
  description: 'Discover your perfect fragrance with AI-powered recommendations. Describe what you love, and we\'ll find your match.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${playfairDisplay.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('fragrance_theme');
                  var path = (location.pathname || '').toLowerCase();
                  var lightDefault = path === '/thescentstories' || path.indexOf('/thescentstories/') === 0
                    || path === '/scentira' || path.indexOf('/scentira/') === 0
                    || path === '/souqscent' || path.indexOf('/souqscent/') === 0;
                  if (saved === 'light' || saved === 'dark') {
                    document.documentElement.setAttribute('data-theme', saved);
                    if (saved === 'light') document.documentElement.classList.add('light');
                    else document.documentElement.classList.remove('light');
                  } else if (lightDefault) {
                    document.documentElement.setAttribute('data-theme', 'light');
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.setAttribute('data-theme', 'dark');
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <CartProvider>
            {children}
            <CartToast />
          </CartProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

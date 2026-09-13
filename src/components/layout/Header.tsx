'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BrandConfig } from '@/types/brand';

interface HeaderProps {
  brand: BrandConfig;
}

export default function Header({ brand }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const variant = brand.designVariant;

  // Variant-specific navigation links
  const getNavLinks = () => {
    switch (variant) {
      case 'oriental-artisanal':
        return [
          { label: 'Attar Vault', href: `/${brand.slug}/shop` },
          { label: 'Pure Ouds', href: `/${brand.slug}/shop?family=oud` },
          { label: 'Attar Advisor', href: `/${brand.slug}/finder` },
        ];
      case 'luxury-editorial':
        return [
          { label: 'Atelier Editions', href: `/${brand.slug}/shop` },
          { label: 'Extraits De Parfum', href: `/${brand.slug}/shop` },
          { label: 'Private Consultation', href: `/${brand.slug}/finder` },
        ];
      case 'discovery-niche':
        return [
          { label: 'All Formulations', href: `/${brand.slug}/shop` },
          { label: '10ml Trials', href: `/${brand.slug}/shop` },
          { label: 'Scent Profile Lab', href: `/${brand.slug}/finder` },
        ];
      case 'catalogue-modern':
      default:
        return [
          { label: 'Home', href: `/${brand.slug}` },
          { label: '380+ Catalogue', href: `/${brand.slug}/shop` },
          { label: 'AI Fragrance Finder', href: `/${brand.slug}/finder` },
        ];
    }
  };

  const navLinks = getNavLinks();

  // ── Render 1: ORIENTAL ARTISANAL (Arabian Aroma) ─────────────────────────────
  if (variant === 'oriental-artisanal') {
    return (
      <header className="sticky top-0 z-50 border-b border-brand-border bg-brand-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link href={`/${brand.slug}`} className="flex items-center gap-3 group">
            <div className="h-10 w-10 rounded-full border border-brand-accent/60 flex items-center justify-center bg-brand-primary text-brand-accent shadow-sm">
              <span className="font-serif text-xs font-bold tracking-wider">✦</span>
            </div>
            <div>
              <span className="font-serif text-lg font-bold tracking-wide text-brand-text block">
                {brand.name}
              </span>
              <span className="text-[9px] uppercase tracking-[0.25em] text-brand-accent font-semibold block">
                Artisanal Attars & Ouds
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs font-medium tracking-wider text-brand-text-muted hover:text-brand-accent transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href={`/${brand.slug}/finder`}
              className="hidden sm:inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold tracking-wider uppercase shadow-md transition-all duration-200 hover:opacity-90"
              style={{ backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }}
            >
              <span>✦</span>
              <span>Find Signature Attar</span>
            </Link>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-brand-text"
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="border-t border-brand-border bg-brand-surface p-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setIsMenuOpen(false)} className="text-sm font-medium text-brand-text p-2">
                  {l.label}
                </Link>
              ))}
              <Link
                href={`/${brand.slug}/finder`}
                onClick={() => setIsMenuOpen(false)}
                className="w-full text-center rounded-full py-3 text-xs font-bold uppercase tracking-wider mt-2"
                style={{ backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }}
              >
                Find Signature Attar
              </Link>
            </nav>
          </div>
        )}
      </header>
    );
  }

  // ── Render 2: LUXURY EDITORIAL (Al-Maham) ───────────────────────────────────
  if (variant === 'luxury-editorial') {
    return (
      <header className="sticky top-0 z-50 border-b border-brand-border bg-brand-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6 sm:px-10">
          <Link href={`/${brand.slug}`} className="group">
            <span className="font-serif italic text-2xl font-normal tracking-wide text-brand-text block">
              {brand.name}
            </span>
            <span className="text-[8px] uppercase tracking-[0.35em] text-brand-text-muted block">
              Haute Parfumerie · Atelier Expressions
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-10">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-text-muted hover:text-brand-text transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link
              href={`/${brand.slug}/finder`}
              className="hidden sm:inline-flex items-center gap-2 border border-brand-text px-6 py-2.5 text-[10px] font-bold tracking-[0.2em] uppercase transition-all duration-300 hover:bg-brand-text hover:text-brand-bg"
            >
              Private Consultation
            </Link>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-brand-text"
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 8h16M4 16h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="border-t border-brand-border bg-brand-surface p-6 md:hidden">
            <nav className="flex flex-col gap-4">
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setIsMenuOpen(false)} className="text-xs uppercase tracking-widest text-brand-text">
                  {l.label}
                </Link>
              ))}
              <Link
                href={`/${brand.slug}/finder`}
                onClick={() => setIsMenuOpen(false)}
                className="w-full text-center border border-brand-text py-3 text-xs uppercase tracking-widest font-bold mt-2"
              >
                Private Consultation
              </Link>
            </nav>
          </div>
        )}
      </header>
    );
  }

  // ── Render 3: DISCOVERY NICHE (World of Perfumers) ──────────────────────────
  if (variant === 'discovery-niche') {
    return (
      <header className="sticky top-0 z-50 border-b border-brand-border bg-brand-surface/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <Link href={`/${brand.slug}`} className="flex items-center gap-3 group">
            <div className="h-8 px-2 rounded-md bg-brand-primary text-brand-primary-fg flex items-center justify-center font-mono text-xs font-bold tracking-wider">
              {brand.monogram}
            </div>
            <div>
              <span className="font-mono text-xs uppercase tracking-wider font-bold text-brand-text block">
                {brand.name}
              </span>
              <span className="text-[9px] font-mono text-brand-accent uppercase block">
                Sugandhim Labs · Climate-Tested
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-xs font-semibold text-brand-text-muted hover:text-brand-text transition-colors px-2 py-1 rounded hover:bg-brand-surface-hover"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href={`/${brand.slug}/finder`}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/50 bg-brand-accent/10 px-4 py-2 text-xs font-bold text-brand-accent hover:bg-brand-accent hover:text-white transition-all duration-200"
            >
              <span>⚡</span>
              <span>Scent Profile Matcher</span>
            </Link>

            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 text-brand-text"
              aria-label="Menu"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isMenuOpen && (
          <div className="border-t border-brand-border bg-brand-surface p-4 md:hidden">
            <nav className="flex flex-col gap-2">
              {navLinks.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setIsMenuOpen(false)} className="text-sm font-semibold text-brand-text p-2 rounded hover:bg-brand-surface-hover">
                  {l.label}
                </Link>
              ))}
              <Link
                href={`/${brand.slug}/finder`}
                onClick={() => setIsMenuOpen(false)}
                className="w-full text-center rounded-lg py-2.5 text-xs font-bold bg-brand-accent text-white mt-2"
              >
                Launch Scent Profile Matcher
              </Link>
            </nav>
          </div>
        )}
      </header>
    );
  }

  // ── Render 4: CATALOGUE MODERN (TM Perfume House default) ───────────────────
  return (
    <header className="sticky top-0 z-50 border-b border-brand-border-light bg-brand-surface/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
        <Link href={`/${brand.slug}`} className="flex items-center gap-3 group">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold tracking-widest shadow-sm"
            style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
          >
            {brand.monogram}
          </div>
          <div>
            <span className="font-serif text-lg font-bold tracking-tight text-brand-text block">
              {brand.name}
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-brand-accent font-semibold block">
              380+ Fragrance Discovery
            </span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted hover:text-brand-text transition-colors"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={`/${brand.slug}/finder`}
            className="hidden sm:inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider shadow-md transition-all hover:opacity-90 border border-brand-accent/40"
            style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
          >
            <span className="text-brand-accent">✦</span>
            <span>AI Scent Finder</span>
          </Link>

          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-brand-text"
            aria-label="Menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
            </svg>
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="border-t border-brand-border-light bg-brand-surface p-4 md:hidden">
          <nav className="flex flex-col gap-2">
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setIsMenuOpen(false)} className="text-sm font-semibold uppercase tracking-wider text-brand-text p-2">
                {l.label}
              </Link>
            ))}
            <Link
              href={`/${brand.slug}/finder`}
              onClick={() => setIsMenuOpen(false)}
              className="w-full text-center rounded-xl py-3 text-xs font-bold uppercase tracking-wider mt-2"
              style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
            >
              Launch AI Fragrance Finder
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

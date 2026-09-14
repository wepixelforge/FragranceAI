'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { BrandConfig } from '@/types/brand';

interface HeaderProps {
  brand: BrandConfig;
}

export default function Header({ brand }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const variant = brand.designVariant;

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Curated, minimal navigation links per brand
  const getNavLinks = () => {
    switch (variant) {
      case 'oriental-artisanal':
        return [
          { key: 'shop', label: 'Attar Vault', href: `/${brand.slug}/shop` },
          { key: 'ouds', label: 'Pure Ouds', href: `/${brand.slug}/shop?family=oud` },
          { key: 'finder', label: 'Scent Advisor', href: `/${brand.slug}/finder` },
        ];
      case 'luxury-editorial':
        return [
          { key: 'shop', label: 'Atelier Archives', href: `/${brand.slug}/shop` },
          { key: 'extraits', label: 'Extraits De Parfum', href: `/${brand.slug}/shop` },
          { key: 'finder', label: 'Consultation', href: `/${brand.slug}/finder` },
        ];
      case 'discovery-niche':
        return [
          { key: 'all', label: 'Formulations', href: `/${brand.slug}/shop` },
          { key: 'trials', label: '10ml Trials', href: `/${brand.slug}/shop?trial=true` },
          { key: 'finder', label: 'Scent Lab', href: `/${brand.slug}/finder` },
        ];
      case 'catalogue-modern':
      default:
        return [
          { key: 'shop', label: 'Catalogue', href: `/${brand.slug}/shop` },
          { key: 'featured', label: 'Best Sellers', href: `/${brand.slug}#featured` },
          { key: 'finder', label: 'Scent Finder', href: `/${brand.slug}/finder` },
        ];
    }
  };

  const navLinks = getNavLinks();

  const getCtaLabel = () => {
    switch (variant) {
      case 'oriental-artisanal':
        return '✦ Attar Advisor';
      case 'luxury-editorial':
        return 'Private Consultation';
      case 'discovery-niche':
        return '✦ Scent Concierge';
      default:
        return '✦ Find My Fragrance';
    }
  };

  const getSubtitle = () => {
    switch (variant) {
      case 'oriental-artisanal':
        return 'Pure Attars & Ouds';
      case 'luxury-editorial':
        return 'Haute Parfumerie · Atelier';
      case 'discovery-niche':
        return 'Climate-Tested Perfumery';
      default:
        return 'Recreated Extraits';
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#0B0B0A]/95 border-b border-[rgba(237,232,223,0.08)] backdrop-blur-md py-3'
          : 'bg-[#0B0B0A]/80 border-b border-[rgba(237,232,223,0.05)] backdrop-blur-sm py-4 sm:py-5'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-8">
        {/* Brand Logo / Monogram on Left */}
        <Link href={`/${brand.slug}`} className="group flex items-center gap-3">
          <div className="h-8 w-8 rounded-none border border-[rgba(237,232,223,0.2)] flex items-center justify-center bg-[#131415] text-[#EDE8DF] text-xs font-serif group-hover:border-[#B79A64] transition-colors">
            {brand.monogram}
          </div>
          <div>
            <span className="font-serif text-base sm:text-lg font-normal tracking-wide text-[#EDE8DF] block leading-tight">
              {brand.name}
            </span>
            <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.25em] text-[#A0998F] block font-light">
              {getSubtitle()}
            </span>
          </div>
        </Link>

        {/* Minimal Editorial Navigation (Desktop) */}
        <nav className="hidden md:flex items-center gap-10">
          {navLinks.map((l) => (
            <Link
              key={l.key}
              href={l.href}
              className="relative text-[11px] font-medium uppercase tracking-[0.22em] text-[#A0998F] hover:text-[#EDE8DF] transition-colors py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-[#B79A64] hover:after:w-full after:transition-all after:duration-300"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right CTA & Mobile Toggle */}
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href={`/${brand.slug}/finder`}
            className="hidden sm:inline-flex items-center gap-2 border border-[#B79A64]/40 bg-[#121211]/80 hover:bg-[#B79A64]/15 hover:border-[#B79A64] px-5 py-2.5 text-[10px] font-medium tracking-[0.22em] uppercase text-[#EDE8DF] transition-all duration-300 shadow-sm"
          >
            <span>{getCtaLabel()}</span>
          </Link>

          {/* Minimal Mobile Trigger */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-[#EDE8DF] hover:text-[#B79A64] transition-colors"
            aria-label="Navigation Menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.2}
                d={isMenuOpen ? "M6 18L18 6M6 6l12 12" : "M3 8h18M3 16h18"}
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMenuOpen && (
        <div className="md:hidden border-t border-[rgba(237,232,223,0.08)] bg-[#0B0B0A]/98 backdrop-blur-xl px-6 py-8 animate-fade-in">
          <nav className="flex flex-col gap-6">
            {navLinks.map((l) => (
              <Link
                key={`m-${l.key}`}
                href={l.href}
                onClick={() => setIsMenuOpen(false)}
                className="text-xs uppercase tracking-[0.25em] text-[#A0998F] hover:text-[#EDE8DF] transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <div className="pt-4 border-t border-[rgba(237,232,223,0.08)]">
              <Link
                href={`/${brand.slug}/finder`}
                onClick={() => setIsMenuOpen(false)}
                className="w-full text-center block border border-[#B79A64]/50 py-3 text-[11px] font-medium tracking-[0.22em] uppercase text-[#EDE8DF] hover:bg-[#B79A64]/10 transition-colors"
              >
                {getCtaLabel()}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

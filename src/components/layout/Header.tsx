'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { BrandConfig } from '@/types/brand';
import { useCart } from '@/context/CartContext';
import ThemeToggle from './ThemeToggle';

interface HeaderProps {
  brand: BrandConfig;
}

export default function Header({ brand }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const { itemCount } = useCart(brand.slug);
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
      case 'sampling-concierge':
        return [
          { key: 'shop', label: 'Catalogue', href: `/${brand.slug}/shop` },
          { key: 'samples', label: 'Samples', href: `/${brand.slug}/shop?format=sample` },
          { key: 'discover', label: 'Discover', href: `/${brand.slug}#shop-by-occasion` },
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
      case 'sampling-concierge':
        return 'Need help?';
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
      case 'sampling-concierge':
        return 'Samples · Pocket · Full size';
      default:
        return 'Recreated Extraits';
    }
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-brand-bg/95 border-b border-brand-border backdrop-blur-md py-3 shadow-xs'
          : 'bg-brand-bg/85 border-b border-brand-border-light backdrop-blur-sm py-4 sm:py-5'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-8">
        {/* Brand Logo / Monogram on Left */}
        <Link href={`/${brand.slug}`} className="group flex items-center gap-3">
          <div className="h-8 w-8 rounded-none border border-brand-border flex items-center justify-center bg-brand-surface text-brand-text text-xs font-serif group-hover:border-brand-accent transition-colors">
            {brand.monogram}
          </div>
          <div>
            <span className="font-serif text-base sm:text-lg font-normal tracking-wide text-brand-text block leading-tight">
              {brand.name}
            </span>
            <span className="text-[8px] sm:text-[9px] uppercase tracking-[0.25em] text-brand-text-muted block font-light">
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
              className="relative text-[11px] font-medium uppercase tracking-[0.22em] text-brand-text-muted hover:text-brand-text transition-colors py-1 after:absolute after:bottom-0 after:left-0 after:w-0 after:h-px after:bg-brand-accent hover:after:w-full after:transition-all after:duration-300"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Right CTA, Theme Toggle & Mobile Trigger */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href={`/${brand.slug}/finder`}
            className="hidden sm:inline-flex items-center gap-2 border border-brand-accent/40 bg-brand-surface/80 hover:bg-brand-accent/15 hover:border-brand-accent px-4 lg:px-5 py-2 text-[10px] font-medium tracking-[0.22em] uppercase text-brand-text transition-all duration-300 shadow-xs"
          >
            <span>{getCtaLabel()}</span>
          </Link>

          {/* Theme Switcher Toggle */}
          <ThemeToggle />

          {/* Cart Icon & Item Badge */}
          <Link
            href={`/${brand.slug}/cart`}
            className="relative p-2 text-brand-text hover:text-brand-accent transition-colors flex items-center justify-center"
            aria-label={`Shopping Cart with ${itemCount} items`}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.3}
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
              />
            </svg>
            {itemCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-accent text-[9px] font-medium text-brand-primary-fg shadow-xs">
                {itemCount}
              </span>
            )}
          </Link>

          {/* Minimal Mobile Trigger */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-brand-text hover:text-brand-accent transition-colors"
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
        <div className="md:hidden border-t border-brand-border bg-brand-bg/98 backdrop-blur-xl px-6 py-8 animate-fade-in">
          <nav className="flex flex-col gap-6">
            {navLinks.map((l) => (
              <Link
                key={`m-${l.key}`}
                href={l.href}
                onClick={() => setIsMenuOpen(false)}
                className="text-xs uppercase tracking-[0.25em] text-brand-text-muted hover:text-brand-text transition-colors"
              >
                {l.label}
              </Link>
            ))}
            <Link
              key="m-cart"
              href={`/${brand.slug}/cart`}
              onClick={() => setIsMenuOpen(false)}
              className="text-xs uppercase tracking-[0.25em] text-brand-text-muted hover:text-brand-text transition-colors flex items-center justify-between"
            >
              <span>Shopping Cart</span>
              {itemCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-brand-accent text-[10px] text-brand-primary-fg font-medium">
                  {itemCount}
                </span>
              )}
            </Link>
            <div className="pt-4 border-t border-brand-border">
              <Link
                href={`/${brand.slug}/finder`}
                onClick={() => setIsMenuOpen(false)}
                className="w-full text-center block border border-brand-accent/50 py-3 text-[11px] font-medium tracking-[0.22em] uppercase text-brand-text hover:bg-brand-accent/10 transition-colors"
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

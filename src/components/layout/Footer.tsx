import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

interface FooterProps {
  brand: BrandConfig;
}

export default function Footer({ brand }: FooterProps) {
  return (
    <footer className="border-t border-brand-border bg-brand-surface text-brand-text">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
          {/* Brand Column */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-serif border border-white/15"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: brand.colors.accent }}
              >
                {brand.monogram}
              </div>
              <span className="font-serif text-lg tracking-wide text-brand-text">
                {brand.name}
              </span>
            </div>
            <p className="text-xs text-brand-text-muted leading-relaxed max-w-sm font-light">
              {brand.description}
            </p>
          </div>

          {/* Navigation Links */}
          <div className="md:col-span-3">
            <h4 className="text-[10px] uppercase tracking-widest font-mono text-brand-accent mb-4">
              {brand.slug === 'scentira' ? 'Shop' : brand.slug === 'thescentstories' ? 'Shop' : 'Archive & Navigation'}
            </h4>
            <nav className="flex flex-col gap-2.5">
              <Link
                href={brand.slug === 'scentira' ? '/Scentira' : `/${brand.slug}`}
                className="text-xs text-brand-text-muted hover:text-brand-text transition-colors"
              >
                {brand.slug === 'scentira' || brand.slug === 'thescentstories' ? 'Home' : 'Maison Entrance'}
              </Link>
              <Link
                href={brand.slug === 'scentira' ? '/Scentira/shop' : `/${brand.slug}/shop`}
                className="text-xs text-brand-text-muted hover:text-brand-text transition-colors"
              >
                {brand.slug === 'scentira' ? 'Shop' : brand.slug === 'thescentstories' ? 'Catalogue' : 'Complete Collection'}
              </Link>
              <Link
                href={
                  brand.slug === 'scentira'
                    ? '/Scentira/shop?format=discovery-set'
                    : brand.slug === 'thescentstories'
                    ? `/${brand.slug}/shop?format=sample`
                    : `/${brand.slug}/finder`
                }
                className="text-xs text-brand-text-muted hover:text-brand-text transition-colors"
              >
                {brand.slug === 'scentira' ? 'Discovery Sets' : brand.slug === 'thescentstories' ? 'Samples' : 'Scent Concierge'}
              </Link>
            </nav>
          </div>

          {/* Consultation Column */}
          <div className="md:col-span-4">
            <h4 className="text-[10px] uppercase tracking-widest font-mono text-brand-accent mb-4">
              {brand.slug === 'scentira'
                ? 'Need a hand?'
                : brand.slug === 'thescentstories'
                ? 'Need a hand?'
                : 'Private Consultation'}
            </h4>
            <p className="text-xs text-brand-text-muted leading-relaxed mb-4 font-light">
              {brand.slug === 'scentira'
                ? 'Tell us a mood, an occasion, a budget, or a fragrance you already wear.'
                : brand.slug === 'thescentstories'
                ? 'Not sure what to choose? Tell us an occasion, a budget, or a fragrance you already love.'
                : 'Consult with our digital sommelier to explore creations aligned with your preferred accords, longevity, and climate.'}
            </p>
            <Link
              href={brand.slug === 'scentira' ? '/Scentira/finder' : `/${brand.slug}/finder`}
              className="group inline-flex items-center gap-2 text-xs uppercase tracking-widest font-medium transition-colors hover:text-brand-accent"
              style={{ color: brand.colors.accent }}
            >
              <span>
                {brand.slug === 'scentira'
                  ? 'Find a fragrance'
                  : brand.slug === 'thescentstories'
                  ? 'Ask us'
                  : 'Begin Scent Session'}
              </span>
              <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        <div className="mt-14 border-t border-brand-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[10px] uppercase tracking-widest text-brand-text-muted/60 font-mono">
          <p>
            {brand.slug === 'scentira'
              ? `${brand.name} · India`
              : brand.slug === 'thescentstories'
              ? `${brand.name} · Mumbai`
              : `Concept demonstration curated for ${brand.name}.`}
          </p>
          <p>
            {brand.slug === 'scentira'
              ? 'Decants · Discovery sizes · Full bottles'
              : brand.slug === 'thescentstories'
              ? 'Authentic samples · Pocket sizes · Full bottles'
              : 'Independent evaluation prototype · Editorial discovery engine'}
          </p>
        </div>
      </div>
    </footer>
  );
}

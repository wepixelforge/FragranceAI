import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

interface FooterProps {
  brand: BrandConfig;
}

export default function Footer({ brand }: FooterProps) {
  return (
    <footer className="border-t border-brand-border bg-brand-surface">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold"
                style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
              >
                {brand.monogram}
              </div>
              <span className="text-sm font-semibold tracking-tight text-brand-text">
                {brand.name}
              </span>
            </div>
            <p className="text-sm text-brand-text-muted leading-relaxed max-w-xs">
              {brand.description}
            </p>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted mb-4">
              Explore
            </h4>
            <nav className="flex flex-col gap-2.5">
              <Link
                href={`/${brand.slug}`}
                className="text-sm text-brand-text-muted hover:text-brand-text transition-colors"
              >
                Home
              </Link>
              <Link
                href={`/${brand.slug}/shop`}
                className="text-sm text-brand-text-muted hover:text-brand-text transition-colors"
              >
                Shop All
              </Link>
              <Link
                href={`/${brand.slug}/finder`}
                className="text-sm text-brand-text-muted hover:text-brand-text transition-colors"
              >
                Fragrance Finder
              </Link>
            </nav>
          </div>

          {/* AI discovery */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-text-muted mb-4">
              Not Sure What to Choose?
            </h4>
            <p className="text-sm text-brand-text-muted leading-relaxed mb-4">
              Our AI fragrance assistant can help you find the perfect scent based on your preferences.
            </p>
            <Link
              href={`/${brand.slug}/finder`}
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors"
              style={{ color: brand.colors.accent }}
            >
              Try the Fragrance Finder
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="mt-10 border-t border-brand-border-light pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-brand-text-muted">
            Concept demonstration prepared for {brand.name}.
          </p>
          <p className="text-xs text-brand-text-muted">
            Independent prototype for evaluation · Client-side discovery engine
          </p>
        </div>
      </div>
    </footer>
  );
}

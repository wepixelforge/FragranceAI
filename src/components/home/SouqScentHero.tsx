import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

const PUBLIC_PATH = '/SouqScent';

export default function SouqScentHero({ brand }: { brand: BrandConfig }) {
  return (
    <section className="relative overflow-hidden border-b border-brand-border-light bg-brand-bg py-16 sm:py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -right-16 top-10 h-72 w-72 rounded-full bg-brand-accent/15 blur-3xl" />
        <div className="absolute bottom-0 left-10 h-56 w-56 rounded-full bg-brand-text/5 blur-3xl" />
      </div>
      <div className="relative mx-auto grid max-w-7xl items-end gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-8">
          <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">{brand.badgeText}</p>
          <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.12] text-brand-text sm:text-5xl lg:text-6xl">
            {brand.homepage.heroTitle}
          </h1>
          <p className="mt-6 max-w-xl text-sm leading-relaxed text-brand-text-muted sm:text-base">
            {brand.homepage.heroSubtitle}
          </p>
          <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link
              href={`${PUBLIC_PATH}/shop`}
              className="border border-brand-text bg-brand-text px-8 py-3.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-primary-fg transition-colors hover:bg-transparent hover:text-brand-text"
            >
              {brand.homepage.ctaSecondary}
            </Link>
            <Link
              href={`${PUBLIC_PATH}/finder`}
              className="border border-brand-accent px-8 py-3.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-text transition-colors hover:bg-brand-accent/15"
            >
              {brand.homepage.ctaPrimary}
            </Link>
          </div>
        </div>
        <div className="lg:col-span-4">
          <div className="border border-brand-border bg-brand-surface p-6">
            <p className="text-[10px] uppercase tracking-[0.22em] text-brand-accent">How to shop</p>
            <ul className="mt-4 space-y-3 text-sm text-brand-text-muted">
              <li>Browse the catalogue by gender, house or family.</li>
              <li>Or describe the occasion, season and budget.</li>
              <li>The consultant only recommends listed SouqScent products.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

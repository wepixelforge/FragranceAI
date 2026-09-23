import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

const PUBLIC_PATH = '/Scentira';

export default function ScentiraHero({ brand }: { brand: BrandConfig }) {
  return (
    <section className="relative overflow-hidden border-b border-brand-border-light bg-brand-bg py-16 sm:py-20 lg:py-24">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">
          {brand.badgeText}
        </p>
        <h1 className="mt-4 max-w-3xl font-serif text-4xl leading-[1.1] text-brand-text sm:text-5xl lg:text-6xl">
          {brand.homepage.heroTitle}
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-relaxed text-brand-text-muted sm:text-base">
          {brand.homepage.heroSubtitle}
        </p>
        <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Link
            href={`${PUBLIC_PATH}/finder`}
            className="border border-brand-accent bg-brand-accent px-8 py-3.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-primary-fg transition-colors hover:bg-transparent hover:text-brand-text"
          >
            {brand.homepage.ctaPrimary}
          </Link>
          <Link
            href={`${PUBLIC_PATH}/shop`}
            className="border border-brand-border px-8 py-3.5 text-center text-[11px] font-medium uppercase tracking-[0.2em] text-brand-text transition-colors hover:border-brand-accent hover:text-brand-accent"
          >
            {brand.homepage.ctaSecondary}
          </Link>
        </div>
      </div>
    </section>
  );
}

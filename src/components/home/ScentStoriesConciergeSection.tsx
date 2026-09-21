import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

export default function ScentStoriesConciergeSection({ brand }: { brand: BrandConfig }) {
  const prompts = brand.finder.examplePrompts;

  return (
    <section className="border-t border-brand-border bg-brand-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">Fragrance &amp; Sampling Concierge</p>
        <h2 className="mt-3 font-serif text-3xl sm:text-4xl text-brand-text">Describe the scent. We will also choose the format.</h2>
        <p className="mt-3 max-w-2xl text-sm text-brand-text-muted leading-relaxed">
          The concierge matches fragrance direction and a sensible way to try or buy it — sample, pocket size, discovery set or full bottle — from the live catalogue only.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {prompts.map((prompt) => (
            <Link
              key={prompt}
              href={`/${brand.slug}/finder?q=${encodeURIComponent(prompt)}`}
              className="border border-brand-border bg-brand-bg px-4 py-4 text-sm text-brand-text hover:border-brand-accent/50 transition-colors"
            >
              “{prompt}”
            </Link>
          ))}
        </div>
        <Link
          href={`/${brand.slug}/finder`}
          className="mt-8 inline-flex border border-brand-text px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] text-brand-text hover:bg-brand-text hover:text-brand-bg transition-colors"
        >
          Open the concierge
        </Link>
      </div>
    </section>
  );
}

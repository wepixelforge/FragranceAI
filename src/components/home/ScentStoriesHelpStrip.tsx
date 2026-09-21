'use client';

import { BrandConfig } from '@/types/brand';
import { useScentFinder } from '@/context/ScentFinderContext';

export default function ScentStoriesHelpStrip({ brand }: { brand: BrandConfig }) {
  const { openConsultant } = useScentFinder();

  return (
    <section className="border-t border-brand-border bg-brand-surface py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">Not sure what to choose?</p>
          <h2 className="mt-2 font-serif text-2xl sm:text-3xl text-brand-text">
            Tell me what you&apos;re looking for.
          </h2>
          <p className="mt-2 max-w-xl text-sm text-brand-text-muted leading-relaxed">
            An occasion, a budget, a scent you already love — or just that you want to try samples first.
          </p>
        </div>
        <button
          type="button"
          onClick={openConsultant}
          aria-label={`Ask ${brand.name} for shopping help`}
          className="shrink-0 border border-brand-text px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] text-brand-text hover:bg-brand-text hover:text-brand-bg transition-colors"
        >
          Ask us
        </button>
      </div>
    </section>
  );
}

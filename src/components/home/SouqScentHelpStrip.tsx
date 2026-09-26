import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

const PUBLIC_PATH = '/SouqScent';

export default function SouqScentHelpStrip({ brand }: { brand: BrandConfig }) {
  const prompts = brand.finder.examplePrompts;

  return (
    <section className="border-t border-brand-border bg-brand-surface py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">{brand.finder.title}</p>
        <h2 className="mt-3 max-w-3xl font-serif text-2xl text-brand-text sm:text-3xl">
          {brand.finder.subtitle}
        </h2>
        <div className="mt-8 flex flex-wrap gap-3">
          {prompts.map((prompt) => (
            <Link
              key={prompt}
              href={`${PUBLIC_PATH}/finder?q=${encodeURIComponent(prompt)}`}
              className="border border-brand-border bg-brand-bg px-4 py-2 text-sm text-brand-text transition-colors hover:border-brand-accent/60"
            >
              {prompt}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

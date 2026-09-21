import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

const PURPOSES = [
  { label: 'Try before you buy', q: 'I have never tried it and want a sample first' },
  { label: 'Daily wear', q: 'I want something fresh for daily wear under 1000' },
  { label: 'Date night', q: 'I want a warm date night fragrance' },
  { label: 'Wedding', q: 'I need a wedding fragrance around 3000' },
  { label: 'Office', q: 'I want something fresh for the office' },
  { label: 'Travel', q: 'I travel a lot and want something small' },
  { label: 'Gifting', q: 'I need a fragrance gift discovery set' },
  { label: 'Explore niche', q: 'I have never tried niche perfume before' },
];

export default function ScentStoriesPurposesSection({ brand }: { brand: BrandConfig }) {
  return (
    <section id="shop-by-occasion" className="border-t border-brand-border bg-brand-surface py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">Shop by occasion</p>
        <h2 className="mt-3 font-serif text-3xl text-brand-text">Start from the moment, not the notes.</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          {PURPOSES.map((item) => (
            <Link
              key={item.label}
              href={`/${brand.slug}/finder?q=${encodeURIComponent(item.q)}`}
              className="border border-brand-border px-4 py-2 text-sm text-brand-text hover:border-brand-accent/50"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

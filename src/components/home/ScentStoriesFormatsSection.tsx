import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

const FORMATS = [
  { label: 'Samples & Vials', href: 'format=sample', note: '1–5ml official samples' },
  { label: 'Miniatures', href: 'format=miniature', note: 'Dab-size official minis' },
  { label: 'Pocket Perfumes', href: 'format=pocket', note: 'Travel sprays' },
  { label: 'Testers', href: 'format=tester', note: 'Juice without retail box' },
  { label: 'Discovery Sets', href: 'format=discovery-set', note: 'Several fragrances at once' },
  { label: 'Full-Size Bottles', href: 'format=full-size', note: 'When you already know' },
];

export default function ScentStoriesFormatsSection({ brand }: { brand: BrandConfig }) {
  return (
    <section className="border-t border-brand-border py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-accent">Shop by format</p>
        <h2 className="mt-3 font-serif text-3xl text-brand-text">Samples, travel sizes and full bottles.</h2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FORMATS.map((item) => (
            <Link
              key={item.label}
              href={`/${brand.slug}/shop?${item.href}`}
              className="border border-brand-border bg-brand-surface p-6 hover:border-brand-accent/40 transition-colors"
            >
              <h3 className="font-serif text-xl text-brand-text">{item.label}</h3>
              <p className="mt-2 text-sm text-brand-text-muted">{item.note}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

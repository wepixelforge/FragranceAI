import Link from 'next/link';
import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import ProductCard from '@/components/shop/ProductCard';

interface ScentStoriesCollectionRowProps {
  brand: BrandConfig;
  products: Product[];
  eyebrow: string;
  title: string;
  href: string;
  hrefLabel: string;
}

export default function ScentStoriesCollectionRow({
  brand,
  products,
  eyebrow,
  title,
  href,
  hrefLabel,
}: ScentStoriesCollectionRowProps) {
  if (products.length === 0) return null;

  return (
    <section className="py-20 sm:py-24 border-t border-brand-border bg-brand-bg">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-10 border-b border-brand-border pb-5 gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.28em] text-brand-accent block mb-2">
              {eyebrow}
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-normal text-brand-text">{title}</h2>
          </div>
          <Link
            href={href}
            className="text-[11px] uppercase tracking-[0.2em] text-brand-accent hover:underline"
          >
            {hrefLabel} →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} brand={brand} />
          ))}
        </div>
      </div>
    </section>
  );
}

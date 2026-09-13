'use client';

import Link from 'next/link';
import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import ProductCard from '@/components/shop/ProductCard';

interface FeaturedProductsProps {
  brand: BrandConfig;
  products: Product[];
}

export default function FeaturedProducts({ brand, products }: FeaturedProductsProps) {
  const getSectionTitle = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return {
          title: 'Master Concentrated Attars',
          subtitle: 'Our most revered alcohol-free pure oils and rich oriental extraits.',
          cta: 'Explore Attar Vault',
        };
      case 'luxury-editorial':
        return {
          title: 'The Atelier Extraits',
          subtitle: 'Expressions of transcendent rarity crafted with 35% pure perfume oils.',
          cta: 'The Full Collection',
        };
      case 'discovery-niche':
        return {
          title: 'Climate-Tested Formulations',
          subtitle: 'Engineered for extreme heat resilience. Available in 10ml trials and 50ml EDPs.',
          cta: 'Browse Lab Catalog',
        };
      default:
        return {
          title: 'Featured Fragrances',
          subtitle: 'Our most celebrated 30% extraits, crafted for unforgettable sillage.',
          cta: 'View All Fragrances',
        };
    }
  };

  const info = getSectionTitle();

  return (
    <section className="py-20 sm:py-28 border-t border-brand-border-light bg-brand-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-12">
          <div>
            <h2 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-brand-text">
              {info.title}
            </h2>
            <p className="mt-2 text-brand-text-muted text-sm sm:text-base">
              {info.subtitle}
            </p>
          </div>
          <Link
            href={`/${brand.slug}/shop`}
            className="hidden items-center gap-1 text-sm font-semibold transition-colors hover:opacity-80 sm:inline-flex"
            style={{ color: brand.colors.accent }}
          >
            {info.cta}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} brand={brand} />
          ))}
        </div>

        <div className="mt-10 text-center sm:hidden">
          <Link
            href={`/${brand.slug}/shop`}
            className="inline-flex items-center gap-1 text-sm font-semibold"
            style={{ color: brand.colors.accent }}
          >
            {info.cta}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

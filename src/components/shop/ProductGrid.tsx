'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { Product, FragranceFamily, Gender } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  brand: BrandConfig;
}

type PriceRange = 'all' | 'under-500' | '500-1000' | '1000-plus';

interface Filters {
  gender: Gender | 'all';
  fragranceFamily: FragranceFamily | 'all';
  priceRange: PriceRange;
}

const genderOptions: { value: Gender | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
];

const familyOptions: { value: FragranceFamily | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'sweet', label: 'Sweet' },
  { value: 'woody', label: 'Woody' },
  { value: 'oud', label: 'Oud' },
  { value: 'floral', label: 'Floral' },
  { value: 'citrus', label: 'Citrus' },
  { value: 'musky', label: 'Musky' },
  { value: 'oriental', label: 'Oriental' },
  { value: 'spicy', label: 'Spicy' },
  { value: 'aquatic', label: 'Aquatic' },
  { value: 'aromatic', label: 'Aromatic' },
  { value: 'gourmand', label: 'Gourmand' },
];

const priceOptions: { value: PriceRange; label: string }[] = [
  { value: 'all', label: 'All Prices' },
  { value: 'under-500', label: 'Under ₹500' },
  { value: '500-1000', label: '₹500 – ₹1,000' },
  { value: '1000-plus', label: '₹1,000+' },
];

export default function ProductGrid({ products, brand }: ProductGridProps) {
  const [filters, setFilters] = useState<Filters>({
    gender: 'all',
    fragranceFamily: 'all',
    priceRange: 'all',
  });

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      // Gender filter
      if (filters.gender !== 'all' && product.gender !== filters.gender) {
        return false;
      }

      // Fragrance family filter
      if (
        filters.fragranceFamily !== 'all' &&
        !product.fragranceFamily.includes(filters.fragranceFamily)
      ) {
        return false;
      }

      // Price filter
      if (filters.priceRange === 'under-500' && product.price >= 500) return false;
      if (filters.priceRange === '500-1000' && (product.price < 500 || product.price > 1000)) return false;
      if (filters.priceRange === '1000-plus' && product.price < 1000) return false;

      return true;
    });
  }, [products, filters]);

  const activeFilterCount = Object.values(filters).filter((v) => v !== 'all').length;

  return (
    <div>
      {/* Filter bar */}
      <div className="mb-8 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-text">
            {filteredProducts.length} Fragrance{filteredProducts.length !== 1 ? 's' : ''}
          </h2>
          {activeFilterCount > 0 && (
            <button
              onClick={() => setFilters({ gender: 'all', fragranceFamily: 'all', priceRange: 'all' })}
              className="text-xs font-medium text-brand-text-muted hover:text-brand-text transition-colors"
            >
              Clear filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Conversational Discovery Shortcut Banner */}
        <div className="rounded-2xl border border-brand-accent/30 bg-brand-surface p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-start gap-2.5">
            <span className="text-brand-accent text-base mt-0.5">✦</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-brand-text">
                  {brand.slug === 'tmperfumehouse'
                    ? 'Skip Manual Filtering in 380+ Catalogue'
                    : brand.slug === 'almaham'
                    ? 'Private Atelier Fragrance Consultation'
                    : brand.slug === 'worldofperfumers'
                    ? 'Find & Test Before Buying Full Bottle'
                    : 'Intelligent Fragrance Discovery'}
                </span>
                <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 text-[9px] font-bold text-brand-accent uppercase">
                  AI
                </span>
              </div>
              <p className="text-xs text-brand-text-muted mt-0.5">
                {brand.slug === 'tmperfumehouse'
                  ? 'Describe what you want naturally: "Fresh everyday perfume under ₹800" or "Alternative to Dior Sauvage"'
                  : brand.slug === 'almaham'
                  ? 'Describe your character or desired mood: "Dark sensual evening extrait for formal events"'
                  : brand.slug === 'worldofperfumers'
                  ? 'Find scents suited to Indian climate with low-risk 10ml pocket discovery sprays from ₹149'
                  : 'Let our Scent Concierge match your exact preferences in natural language.'}
              </p>
            </div>
          </div>
          <Link
            href={`/${brand.slug}/finder`}
            className="rounded-lg px-3.5 py-2 text-xs font-bold shadow-sm whitespace-nowrap self-end sm:self-auto hover:opacity-90 transition-opacity"
            style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
          >
            {brand.slug === 'tmperfumehouse'
              ? 'Find My Scent →'
              : brand.slug === 'almaham'
              ? 'Begin Consultation →'
              : brand.slug === 'worldofperfumers'
              ? 'Help Me Explore →'
              : 'Open Finder →'}
          </Link>
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Gender pills */}
          <div className="flex flex-wrap gap-1.5">
            {genderOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilters((prev) => ({ ...prev, gender: opt.value }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  filters.gender === opt.value
                    ? 'border-transparent text-white'
                    : 'border-brand-border text-brand-text-muted hover:border-brand-text-muted'
                }`}
                style={
                  filters.gender === opt.value
                    ? { backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }
                    : undefined
                }
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hidden sm:block w-px bg-brand-border-light" />

          {/* Fragrance family pills */}
          <div className="flex flex-wrap gap-1.5">
            {familyOptions
              .filter((opt) => {
                if (opt.value === 'all') return true;
                return products.some((p) => p.fragranceFamily.includes(opt.value as FragranceFamily));
              })
              .map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilters((prev) => ({ ...prev, fragranceFamily: opt.value }))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    filters.fragranceFamily === opt.value
                      ? 'border-transparent'
                      : 'border-brand-border text-brand-text-muted hover:border-brand-text-muted'
                  }`}
                  style={
                    filters.fragranceFamily === opt.value
                      ? { backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }
                      : undefined
                  }
                >
                  {opt.label}
                </button>
              ))}
          </div>

          <div className="hidden sm:block w-px bg-brand-border-light" />

          {/* Price pills */}
          <div className="flex flex-wrap gap-1.5">
            {priceOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilters((prev) => ({ ...prev, priceRange: opt.value }))}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  filters.priceRange === opt.value
                    ? 'border-transparent'
                    : 'border-brand-border text-brand-text-muted hover:border-brand-text-muted'
                }`}
                style={
                  filters.priceRange === opt.value
                    ? { backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }
                    : undefined
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Grid */}
      {filteredProducts.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 stagger-children">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} brand={brand} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <p className="text-brand-text-muted">No fragrances match your filters.</p>
          <button
            onClick={() => setFilters({ gender: 'all', fragranceFamily: 'all', priceRange: 'all' })}
            className="mt-3 text-sm font-medium transition-colors"
            style={{ color: brand.colors.accent }}
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}

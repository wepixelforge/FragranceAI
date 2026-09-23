'use client';

import Link from 'next/link';
import { useState, useMemo } from 'react';
import { Product, FragranceFamily, Gender, ProductFormat } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import ProductCard from './ProductCard';

interface ProductGridProps {
  products: Product[];
  brand: BrandConfig;
  initialFormat?: string;
}

type PriceRange = 'all' | 'under-500' | '500-1000' | '1000-plus';

interface Filters {
  gender: Gender | 'all';
  fragranceFamily: FragranceFamily | 'all';
  priceRange: PriceRange;
  format: ProductFormat | 'all';
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
  { value: 'fougere', label: 'Fougere' },
  { value: 'green', label: 'Green' },
  { value: 'chypre', label: 'Chypre' },
];

const formatOptions: { value: ProductFormat | 'all'; label: string }[] = [
  { value: 'all', label: 'All formats' },
  { value: 'sample', label: 'Samples' },
  { value: 'vial', label: 'Vials' },
  { value: 'pocket', label: 'Pocket' },
  { value: 'miniature', label: 'Miniatures' },
  { value: 'tester', label: 'Testers' },
  { value: 'discovery-set', label: 'Discovery sets' },
  { value: 'full-size', label: 'Full size' },
];

function normalizeFormat(value?: string): ProductFormat | 'all' {
  if (!value) return 'all';
  if (value === 'samples') return 'sample';
  return formatOptions.some((opt) => opt.value === value) ? (value as ProductFormat) : 'all';
}

const priceOptions: { value: PriceRange; label: string }[] = [
  { value: 'all', label: 'All Prices' },
  { value: 'under-500', label: 'Under ₹500' },
  { value: '500-1000', label: '₹500 – ₹1,000' },
  { value: '1000-plus', label: '₹1,000+' },
];

export default function ProductGrid({ products, brand, initialFormat }: ProductGridProps) {
  const [filters, setFilters] = useState<Filters>({
    gender: 'all',
    fragranceFamily: 'all',
    priceRange: 'all',
    format: normalizeFormat(initialFormat),
  });

  const isSampling = brand.designVariant === 'sampling-concierge';

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

      if (filters.format !== 'all') {
        if (filters.format === 'sample' || filters.format === 'vial') {
          if (product.format !== 'sample' && product.format !== 'vial') return false;
        } else if (product.format !== filters.format) {
          return false;
        }
      }

      return true;
    });
  }, [products, filters]);

  const activeFilterCount = Object.values(filters).filter((v) => v !== 'all').length;

  return (
    <div>
      {/* Filter & Discovery Controls */}
      <div className="mb-10 flex flex-col gap-6">
        <div className="flex items-center justify-between border-b border-brand-border pb-4">
          <div className="flex items-baseline gap-3">
            <h2 className="font-serif text-xl tracking-tight text-brand-text">
              Collection
            </h2>
            <span className="text-xs uppercase tracking-widest text-brand-text-muted">
              ({filteredProducts.length} {filteredProducts.length === 1 ? 'Flacon' : 'Flacons'})
            </span>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() =>
                setFilters({ gender: 'all', fragranceFamily: 'all', priceRange: 'all', format: 'all' })
              }
              className="text-xs tracking-wider uppercase text-brand-accent hover:underline transition-all"
            >
              Reset Filters ({activeFilterCount})
            </button>
          )}
        </div>

        {/* Conversational Discovery Shortcut Banner - Editorial Luxury */}
        <div className="hairline-border rounded-xl bg-brand-surface/70 backdrop-blur-md p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 max-w-2xl">
            <span className="text-brand-accent text-sm mt-0.5 select-none">✦</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-brand-text">
                  {brand.slug === 'tmperfumehouse'
                    ? 'Curated Scent Concierge'
                    : brand.slug === 'almaham'
                    ? 'Private Atelier Fragrance Consultation'
                    : brand.slug === 'worldofperfumers'
                    ? 'Olfactory Discovery Guidance'
                    : brand.slug === 'thescentstories'
                    ? "Can't decide?"
                    : brand.slug === 'scentira'
                    ? "Can't decide?"
                    : 'Personal Fragrance Consultation'}
                </span>
                {brand.slug !== 'thescentstories' && brand.slug !== 'scentira' && (
                <span className="text-[9px] tracking-widest uppercase px-1.5 py-0.5 rounded border border-brand-accent/30 text-brand-accent">
                  AI
                </span>
                )}
              </div>
              <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                {brand.slug === 'tmperfumehouse'
                  ? 'Skip manual catalogue searching. Inquire naturally: "Fresh everyday perfume under ₹800" or "Alternative to Dior Sauvage".'
                  : brand.slug === 'almaham'
                  ? 'Describe your desired atmosphere: "Dark sensual evening extrait for formal occasions" or "Pure Assam oud blend".'
                  : brand.slug === 'worldofperfumers'
                  ? 'Identify creations engineered for your climate and explore low-risk 10ml trials before choosing a full bottle.'
                  : brand.slug === 'thescentstories'
                  ? "Tell me what you're looking for — a scent, an occasion, or a budget."
                  : brand.slug === 'scentira'
                  ? "Tell us a mood, an occasion, a budget, or a fragrance you already wear."
                  : 'Describe your occasion, budget, or preferred notes in natural language for a bespoke recommendation.'}
              </p>
            </div>
          </div>
          <Link
            href={brand.slug === 'scentira' ? '/Scentira/finder' : `/${brand.slug}/finder`}
            className="hairline-border rounded-full px-5 py-2.5 text-xs font-medium tracking-wide uppercase whitespace-nowrap self-end sm:self-auto hover:border-brand-accent hover:text-brand-accent transition-all duration-300"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: brand.colors.accent }}
          >
            {brand.slug === 'tmperfumehouse'
              ? 'Begin Consultation →'
              : brand.slug === 'almaham'
              ? 'Enter Atelier →'
              : brand.slug === 'worldofperfumers'
              ? 'Find My Formula →'
              : brand.slug === 'thescentstories'
              ? 'Ask us →'
              : brand.slug === 'scentira'
              ? 'Find a fragrance →'
              : 'Open Concierge →'}
          </Link>
        </div>

        {/* Restrained Filter Row */}
        <div className="flex flex-col gap-4 pt-1">
          {/* Gender selection */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-brand-text-muted mr-2 font-mono">
              Gender
            </span>
            {genderOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilters((prev) => ({ ...prev, gender: opt.value }))}
                className={`rounded-full px-3 py-1 text-xs tracking-wider uppercase transition-all duration-200 ${
                  filters.gender === opt.value
                    ? 'border border-brand-accent bg-brand-accent/15 text-brand-accent font-medium'
                    : 'border border-brand-border bg-transparent text-brand-text-muted hover:border-brand-border-light hover:text-brand-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Fragrance family selection */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-brand-text-muted mr-2 font-mono">
              Family
            </span>
            {familyOptions
              .filter((opt) => {
                if (opt.value === 'all') return true;
                return products.some((p) => p.fragranceFamily.includes(opt.value as FragranceFamily));
              })
              .map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFilters((prev) => ({ ...prev, fragranceFamily: opt.value }))}
                  className={`rounded-full px-3 py-1 text-xs tracking-wider uppercase transition-all duration-200 ${
                    filters.fragranceFamily === opt.value
                      ? 'border border-brand-accent bg-brand-accent/15 text-brand-accent font-medium'
                      : 'border border-brand-border bg-transparent text-brand-text-muted hover:border-brand-border-light hover:text-brand-text'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
          </div>

          {isSampling && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-brand-text-muted mr-2 font-mono">
                Format
              </span>
              {formatOptions
                .filter((opt) => {
                  if (opt.value === 'all') return true;
                  if (opt.value === 'sample' || opt.value === 'vial') {
                    return products.some((p) => p.format === 'sample' || p.format === 'vial');
                  }
                  return products.some((p) => p.format === opt.value);
                })
                .map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setFilters((prev) => ({ ...prev, format: opt.value }))}
                    className={`rounded-full px-3 py-1 text-xs tracking-wider uppercase transition-all duration-200 ${
                      filters.format === opt.value
                        ? 'border border-brand-accent bg-brand-accent/15 text-brand-accent font-medium'
                        : 'border border-brand-border bg-transparent text-brand-text-muted hover:border-brand-border-light hover:text-brand-text'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
            </div>
          )}

          {/* Price selection */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-brand-text-muted mr-2 font-mono">
              Budget
            </span>
            {priceOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilters((prev) => ({ ...prev, priceRange: opt.value }))}
                className={`rounded-full px-3 py-1 text-xs tracking-wider uppercase transition-all duration-200 ${
                  filters.priceRange === opt.value
                    ? 'border border-brand-accent bg-brand-accent/15 text-brand-accent font-medium'
                    : 'border border-brand-border bg-transparent text-brand-text-muted hover:border-brand-border-light hover:text-brand-text'
                }`}
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
        <div className="py-24 text-center hairline-border rounded-2xl bg-brand-surface/40">
          <p className="font-serif text-lg text-brand-text-muted">
            {brand.slug === 'scentira'
              ? 'No fragrances to show yet.'
              : 'No flacons match your selected criteria.'}
          </p>
          <button
            onClick={() =>
              setFilters({ gender: 'all', fragranceFamily: 'all', priceRange: 'all', format: 'all' })
            }
            className="mt-4 text-xs uppercase tracking-widest font-medium transition-colors hover:underline"
            style={{ color: brand.colors.accent }}
          >
            Reset All Filters
          </button>
        </div>
      )}
    </div>
  );
}

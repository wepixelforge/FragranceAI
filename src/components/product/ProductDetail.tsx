'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { useCart } from '@/context/CartContext';
import { formatPrice } from '@/lib/brand-utils';
import { formatLabel } from '@/lib/sampling-format';
import BottleVisual from '@/components/shop/BottleVisual';
import ProductCard from '@/components/shop/ProductCard';

interface ProductDetailProps {
  product: Product;
  brand: BrandConfig;
  similarProducts: Product[];
  relatedFormats?: Product[];
}

export default function ProductDetail({ product, brand, similarProducts, relatedFormats = [] }: ProductDetailProps) {
  const router = useRouter();
  const { isInCart, addItem } = useCart(brand.slug);
  const [selectedFormat, setSelectedFormat] = useState<'standard' | 'trial'>('standard');

  const inCart = isInCart(product.id, brand.slug);

  const isOriental = brand.designVariant === 'oriental-artisanal';
  const isLuxury = brand.designVariant === 'luxury-editorial';
  const isDiscovery = brand.designVariant === 'discovery-niche';
  const isSampling = brand.designVariant === 'sampling-concierge';

  const formatLongevity = (l: string) => {
    const map: Record<string, string> = {
      light: '3–4 Hours',
      moderate: '5–7 Hours',
      'long-lasting': '8–10 Hours',
      'beast-mode': '12+ Hours (High Adhesion)',
    };
    return map[l] || l;
  };

  const getConcentrationText = () => {
    if (isOriental) return '100% Pure Alcohol-Free Attar Oil';
    if (isLuxury) return '35% Haute Parfumerie Pure Extrait';
    if (isDiscovery) return 'EDP Concentrate · Indian Heat Tested';
    if (isSampling) return product.concentration || formatLabel(product.format);
    return '30% Extrait de Parfum Strength';
  };

  const currentPrice = isDiscovery && selectedFormat === 'trial' ? 149 : product.price;

  return (
    <div className="pb-24 sm:pb-32 bg-brand-bg text-brand-text">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12">
        
        {/* Editorial Breadcrumbs */}
        <nav className="mb-8 flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-brand-text-muted font-light">
          <Link href={`/${brand.slug}`} className="hover:text-brand-text transition-colors">
            Home
          </Link>
          <span className="text-brand-border">/</span>
          <Link href={`/${brand.slug}/shop`} className="hover:text-brand-text transition-colors">
            Collection
          </Link>
          <span className="text-brand-border">/</span>
          <span className="text-brand-text">{product.name}</span>
        </nav>

        {/* Main Product Showcase Grid */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16 items-start">
          
          {/* Left: Bottle Photography Stage */}
          <div className="lg:col-span-6 lg:sticky lg:top-28">
            <div className="relative aspect-[3/4] overflow-hidden bg-brand-stage p-8 sm:p-12 flex flex-col items-center justify-between border border-brand-border">
              {/* Subtle Ambient Underglow */}
              <div
                className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.015] to-transparent pointer-events-none"
              />

              {/* Minimalist Top Indicator */}
              <div className="relative z-10 w-full flex justify-between items-center text-[10px] tracking-[0.22em] uppercase text-brand-text-muted">
                <span>{getConcentrationText()}</span>
                <span className="text-brand-accent">{product.gender}</span>
              </div>

              {/* Dominant Bottle Focal Point */}
              <div className="relative z-10 my-auto py-6">
                <BottleVisual product={product} brand={brand} size="lg" priority />
              </div>

              {/* Stage Subtitle */}
              <div className="relative z-10 text-center border-t border-brand-border-light pt-4 w-full text-[10px] uppercase tracking-[0.2em] text-brand-text-muted font-light">
                {isSampling
                  ? [product.size, product.concentration || formatLabel(product.format)]
                      .filter(Boolean)
                      .join(' — ')
                  : `${product.size} — Artisanal Batch`}
              </div>
            </div>
          </div>

          {/* Right: Editorial Typography & Progressive Details */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              {/* Scent Family */}
              <span className="text-[11px] uppercase tracking-[0.25em] text-brand-accent font-medium block">
                {product.fragranceFamily.join(' · ')}
              </span>

              {/* Title */}
              <h1 className="font-serif text-3xl sm:text-5xl font-normal tracking-tight text-brand-text mt-2 leading-tight">
                {product.name}
              </h1>

              {/* Price & Size */}
              <div className="mt-4 flex items-baseline gap-4">
                <span className="font-serif text-2xl sm:text-3xl text-brand-text font-normal">
                  {formatPrice(currentPrice)}
                </span>
                <span className="text-xs text-brand-text-muted font-light">
                  {isDiscovery && selectedFormat === 'trial'
                    ? '10ml Pocket Discovery Spray'
                    : isSampling
                    ? `${product.size}${product.format ? ` · ${formatLabel(product.format)}` : ''}`
                    : `${product.size} Full Bottle`}
                </span>
              </div>

              {isSampling && relatedFormats.length > 0 && (
                <div className="mt-6 border border-brand-border p-4 bg-brand-surface">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted block mb-3 font-medium">
                    Other listed formats
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {relatedFormats.map((alt) => (
                      <Link
                        key={alt.id}
                        href={`/${brand.slug}/product/${alt.slug}`}
                        className="p-3 text-left border border-brand-border hover:border-brand-accent/40 transition-all"
                      >
                        <span className="block text-xs font-normal text-brand-text">
                          {formatLabel(alt.format)} · {alt.size}
                        </span>
                        <span className="block text-[11px] text-brand-accent font-serif mt-0.5">
                          {formatPrice(alt.price)}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Discovery Size Selector (if World of Perfumers) */}
              {isDiscovery && (
                <div className="mt-6 border border-brand-border p-4 bg-brand-surface">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted block mb-3 font-medium">
                    Select Allocation Format:
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedFormat('standard')}
                      className={`p-3 text-left border transition-all cursor-pointer ${
                        selectedFormat === 'standard'
                          ? 'border-brand-accent bg-brand-surface-hover'
                          : 'border-brand-border bg-transparent hover:border-brand-accent/40'
                      }`}
                    >
                      <span className="block text-xs font-normal text-brand-text">50ml Full Bottle</span>
                      <span className="block text-[11px] text-brand-accent font-serif mt-0.5">{formatPrice(product.price)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFormat('trial')}
                      className={`p-3 text-left border transition-all cursor-pointer ${
                        selectedFormat === 'trial'
                          ? 'border-brand-accent bg-brand-surface-hover'
                          : 'border-brand-border bg-transparent hover:border-brand-accent/40'
                      }`}
                    >
                      <span className="block text-xs font-normal text-brand-text">10ml Pocket Trial</span>
                      <span className="block text-[11px] text-brand-accent font-serif mt-0.5">₹149 (Test First)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Poetic Description */}
              <p className="mt-6 text-sm sm:text-base text-brand-text-muted font-light leading-relaxed">
                {product.description}
              </p>

              {/* ── Olfactory Notes Pyramid (Editorial Visual Hierarchy) ───────── */}
              <div className="mt-8 border-y border-brand-border py-6 space-y-5">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-brand-accent font-medium block">
                    Top Notes &mdash; Opening Impression
                  </span>
                  <p className="font-serif text-base sm:text-lg text-brand-text font-light mt-1">
                    {product.topNotes.join(' · ')}
                  </p>
                </div>

                <div className="border-t border-brand-border-light pt-4">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-brand-accent font-medium block">
                    Heart Notes &mdash; The Core Character
                  </span>
                  <p className="font-serif text-base sm:text-lg text-brand-text font-light mt-1">
                    {product.heartNotes.join(' · ')}
                  </p>
                </div>

                <div className="border-t border-brand-border-light pt-4">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-brand-accent font-medium block">
                    Base Notes &mdash; Lasting Resonance
                  </span>
                  <p className="font-serif text-base sm:text-lg text-brand-text font-light mt-1">
                    {product.baseNotes.join(' · ')}
                  </p>
                </div>
              </div>

              {/* Performance Indicators (Restrained Grid) */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-brand-border">
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-brand-text-muted block">Longevity</span>
                  <span className="text-xs text-brand-text font-light block mt-1">
                    {formatLongevity(product.longevity)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-brand-text-muted block">Sillage</span>
                  <span className="text-xs text-brand-text font-light block mt-1 capitalize">
                    {product.intensity}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-brand-text-muted block">Occasion</span>
                  <span className="text-xs text-brand-text font-light block mt-1 capitalize">
                    {product.occasion[0]?.replace('-', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-brand-text-muted block">Season</span>
                  <span className="text-xs text-brand-text font-light block mt-1 capitalize">
                    {product.season[0]?.replace('-', ' ')}
                  </span>
                </div>
              </div>

              {/* Primary Action Button */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={() => {
                    if (inCart) {
                      router.push(`/${brand.slug}/cart`);
                    } else {
                      addItem(product.id, brand.slug);
                    }
                  }}
                  className="w-full border border-brand-accent bg-brand-accent text-brand-primary-fg hover:bg-transparent hover:text-brand-text py-4 text-xs font-medium tracking-[0.22em] uppercase transition-all duration-300 cursor-pointer shadow-lg"
                >
                  {inCart
                    ? 'GO TO CART →'
                    : isDiscovery && selectedFormat === 'trial'
                    ? 'Acquire 10ml Pocket Trial (₹149)'
                    : isSampling
                    ? `Add ${formatLabel(product.format)} — ${formatPrice(product.price)}`
                    : 'Acquire Full Bottle'}
                </button>

                {/* Contextual shopping help */}
                <div className="p-4 border border-brand-border bg-brand-surface flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2.5">
                    <span className="text-brand-accent text-xs">✦</span>
                    <span className="text-xs text-brand-text-muted font-light">
                      {isSampling
                        ? 'Like this style but want something fresher?'
                        : 'Wondering how this compares to your favorites?'}
                    </span>
                  </div>
                  <Link
                    href={
                      isSampling
                        ? `/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`I like ${product.name} but want something similar`)}`
                        : `/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Compare ${product.name} with other blends in the collection`)}`
                    }
                    className="text-[10px] uppercase tracking-[0.2em] text-brand-accent hover:underline font-medium shrink-0"
                  >
                    {isSampling ? 'Ask us →' : 'Consult Concierge →'}
                  </Link>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* ── Similar / Complementary Formulations ──────────────────────────── */}
        {similarProducts.length > 0 && (
          <div className="mt-24 pt-12 border-t border-brand-border">
            <div className="flex items-baseline justify-between mb-8">
              <div>
                <span className="text-[10px] uppercase tracking-[0.22em] text-brand-accent font-medium block">
                  {isSampling ? 'Related fragrances' : 'Curated Pairings'}
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-normal text-brand-text mt-1">
                  {isSampling ? 'You may also like' : 'Complementary Creations'}
                </h2>
              </div>
              <Link
                href={`/${brand.slug}/shop`}
                className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted hover:text-brand-text transition-colors"
              >
                {isSampling ? 'Explore more →' : 'View Full Archives →'}
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
              {similarProducts.slice(0, 3).map((p) => (
                <ProductCard key={p.id} product={p} brand={brand} />
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

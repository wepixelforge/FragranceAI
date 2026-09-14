'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { formatPrice } from '@/lib/brand-utils';
import BottleVisual from '@/components/shop/BottleVisual';
import ProductCard from '@/components/shop/ProductCard';

interface ProductDetailProps {
  product: Product;
  brand: BrandConfig;
  similarProducts: Product[];
}

export default function ProductDetail({ product, brand, similarProducts }: ProductDetailProps) {
  const [addedToCollection, setAddedToCollection] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<'standard' | 'trial'>('standard');

  const isOriental = brand.designVariant === 'oriental-artisanal';
  const isLuxury = brand.designVariant === 'luxury-editorial';
  const isDiscovery = brand.designVariant === 'discovery-niche';

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
    return '30% Extrait de Parfum Strength';
  };

  const currentPrice = isDiscovery && selectedFormat === 'trial' ? 149 : product.price;

  return (
    <div className="pb-24 sm:pb-32 bg-[#0B0B0A] text-[#EDE8DF]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12">
        
        {/* Editorial Breadcrumbs */}
        <nav className="mb-8 flex items-center gap-2 text-[10px] tracking-[0.2em] uppercase text-[#A0998F] font-light">
          <Link href={`/${brand.slug}`} className="hover:text-[#EDE8DF] transition-colors">
            Home
          </Link>
          <span className="text-[rgba(237,232,223,0.2)]">/</span>
          <Link href={`/${brand.slug}/shop`} className="hover:text-[#EDE8DF] transition-colors">
            Collection
          </Link>
          <span className="text-[rgba(237,232,223,0.2)]">/</span>
          <span className="text-[#EDE8DF]">{product.name}</span>
        </nav>

        {/* Main Product Showcase Grid */}
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 lg:gap-16 items-start">
          
          {/* Left: Bottle Photography Stage */}
          <div className="lg:col-span-6 lg:sticky lg:top-28">
            <div className="relative aspect-[3/4] overflow-hidden bg-[#0F0F0E] p-8 sm:p-12 flex flex-col items-center justify-between border border-[rgba(237,232,223,0.08)]">
              {/* Subtle Ambient Underglow */}
              <div
                className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.015] to-transparent pointer-events-none"
              />

              {/* Minimalist Top Indicator */}
              <div className="relative z-10 w-full flex justify-between items-center text-[10px] tracking-[0.22em] uppercase text-[#A0998F]">
                <span>{getConcentrationText()}</span>
                <span className="text-[#B79A64]">{product.gender}</span>
              </div>

              {/* Dominant Bottle Focal Point */}
              <div className="relative z-10 my-auto py-6">
                <BottleVisual product={product} brand={brand} size="lg" />
              </div>

              {/* Stage Subtitle */}
              <div className="relative z-10 text-center border-t border-[rgba(237,232,223,0.06)] pt-4 w-full text-[10px] uppercase tracking-[0.2em] text-[#A0998F] font-light">
                {product.size} &mdash; Artisanal Batch
              </div>
            </div>
          </div>

          {/* Right: Editorial Typography & Progressive Details */}
          <div className="lg:col-span-6 flex flex-col justify-between">
            <div>
              {/* Scent Family */}
              <span className="text-[11px] uppercase tracking-[0.25em] text-[#B79A64] font-medium block">
                {product.fragranceFamily.join(' · ')}
              </span>

              {/* Title */}
              <h1 className="font-serif text-3xl sm:text-5xl font-normal tracking-tight text-[#EDE8DF] mt-2 leading-tight">
                {product.name}
              </h1>

              {/* Price & Size */}
              <div className="mt-4 flex items-baseline gap-4">
                <span className="font-serif text-2xl sm:text-3xl text-[#EDE8DF] font-normal">
                  {formatPrice(currentPrice)}
                </span>
                <span className="text-xs text-[#A0998F] font-light">
                  {isDiscovery && selectedFormat === 'trial' ? '10ml Pocket Discovery Spray' : `${product.size} Full Bottle`}
                </span>
              </div>

              {/* Discovery Size Selector (if World of Perfumers) */}
              {isDiscovery && (
                <div className="mt-6 border border-[rgba(237,232,223,0.1)] p-4 bg-[#121211]">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[#A0998F] block mb-3 font-medium">
                    Select Allocation Format:
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedFormat('standard')}
                      className={`p-3 text-left border transition-all cursor-pointer ${
                        selectedFormat === 'standard'
                          ? 'border-[#B79A64] bg-[#181816]'
                          : 'border-[rgba(237,232,223,0.1)] bg-transparent hover:border-[#B79A64]/40'
                      }`}
                    >
                      <span className="block text-xs font-normal text-[#EDE8DF]">50ml Full Bottle</span>
                      <span className="block text-[11px] text-[#B79A64] font-serif mt-0.5">{formatPrice(product.price)}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFormat('trial')}
                      className={`p-3 text-left border transition-all cursor-pointer ${
                        selectedFormat === 'trial'
                          ? 'border-[#B79A64] bg-[#181816]'
                          : 'border-[rgba(237,232,223,0.1)] bg-transparent hover:border-[#B79A64]/40'
                      }`}
                    >
                      <span className="block text-xs font-normal text-[#EDE8DF]">10ml Pocket Trial</span>
                      <span className="block text-[11px] text-[#B79A64] font-serif mt-0.5">₹149 (Test First)</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Poetic Description */}
              <p className="mt-6 text-sm sm:text-base text-[#A0998F] font-light leading-relaxed">
                {product.description}
              </p>

              {/* ── Olfactory Notes Pyramid (Editorial Visual Hierarchy) ───────── */}
              <div className="mt-8 border-y border-[rgba(237,232,223,0.08)] py-6 space-y-5">
                <div>
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[#B79A64] font-medium block">
                    Top Notes &mdash; Opening Impression
                  </span>
                  <p className="font-serif text-base sm:text-lg text-[#EDE8DF] font-light mt-1">
                    {product.topNotes.join(' · ')}
                  </p>
                </div>

                <div className="border-t border-[rgba(237,232,223,0.06)] pt-4">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[#B79A64] font-medium block">
                    Heart Notes &mdash; The Core Character
                  </span>
                  <p className="font-serif text-base sm:text-lg text-[#EDE8DF] font-light mt-1">
                    {product.heartNotes.join(' · ')}
                  </p>
                </div>

                <div className="border-t border-[rgba(237,232,223,0.06)] pt-4">
                  <span className="text-[10px] uppercase tracking-[0.22em] text-[#B79A64] font-medium block">
                    Base Notes &mdash; Lasting Resonance
                  </span>
                  <p className="font-serif text-base sm:text-lg text-[#EDE8DF] font-light mt-1">
                    {product.baseNotes.join(' · ')}
                  </p>
                </div>
              </div>

              {/* Performance Indicators (Restrained Grid) */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-b border-[rgba(237,232,223,0.08)]">
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#A0998F] block">Longevity</span>
                  <span className="text-xs text-[#EDE8DF] font-light block mt-1">
                    {formatLongevity(product.longevity)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#A0998F] block">Sillage</span>
                  <span className="text-xs text-[#EDE8DF] font-light block mt-1 capitalize">
                    {product.intensity}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#A0998F] block">Occasion</span>
                  <span className="text-xs text-[#EDE8DF] font-light block mt-1 capitalize">
                    {product.occasion[0]?.replace('-', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#A0998F] block">Season</span>
                  <span className="text-xs text-[#EDE8DF] font-light block mt-1 capitalize">
                    {product.season[0]?.replace('-', ' ')}
                  </span>
                </div>
              </div>

              {/* Primary Action Button */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={() => setAddedToCollection(true)}
                  disabled={addedToCollection}
                  className="w-full border border-[#B79A64] bg-[#B79A64] text-[#0B0B0A] hover:bg-transparent hover:text-[#EDE8DF] py-4 text-xs font-medium tracking-[0.22em] uppercase transition-all duration-300 disabled:opacity-50 cursor-pointer shadow-lg"
                >
                  {addedToCollection
                    ? '✓ Added to Allocation'
                    : isDiscovery && selectedFormat === 'trial'
                    ? 'Acquire 10ml Pocket Trial (₹149)'
                    : 'Acquire Full Bottle'}
                </button>

                {/* Scent Concierge Guidance Link */}
                <div className="p-4 border border-[rgba(237,232,223,0.08)] bg-[#121211] flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[#B79A64] text-xs">✦</span>
                    <span className="text-xs text-[#A0998F] font-light">
                      Wondering how this compares to your favorites?
                    </span>
                  </div>
                  <Link
                    href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Compare ${product.name} with other blends in the collection`)}`}
                    className="text-[10px] uppercase tracking-[0.2em] text-[#B79A64] hover:underline font-medium shrink-0"
                  >
                    Consult Concierge →
                  </Link>
                </div>
              </div>

            </div>
          </div>

        </div>

        {/* ── Similar / Complementary Formulations ──────────────────────────── */}
        {similarProducts.length > 0 && (
          <div className="mt-24 pt-12 border-t border-[rgba(237,232,223,0.08)]">
            <div className="flex items-baseline justify-between mb-8">
              <div>
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#B79A64] font-medium block">
                  Curated Pairings
                </span>
                <h2 className="font-serif text-2xl sm:text-3xl font-normal text-[#EDE8DF] mt-1">
                  Complementary Creations
                </h2>
              </div>
              <Link
                href={`/${brand.slug}/shop`}
                className="text-[10px] uppercase tracking-[0.2em] text-[#A0998F] hover:text-[#EDE8DF] transition-colors"
              >
                View Full Archives →
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

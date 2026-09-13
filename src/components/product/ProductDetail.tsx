'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { formatPrice } from '@/lib/brand-utils';
import BottleVisual from '@/components/shop/BottleVisual';

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
      light: '2-4 hours',
      moderate: '4-6 hours',
      'long-lasting': '6-8+ hours',
      'beast-mode': '8-12+ hours (Beast Mode)',
    };
    return map[l] || l;
  };

  const getConcentrationBadge = () => {
    if (isOriental) return '100% Alcohol-Free Pure Oil';
    if (isLuxury) return '35% Pure Extrait';
    if (isDiscovery) return 'EDP Concentrate';
    return '30% Extrait Concentration';
  };

  const currentPrice = selectedFormat === 'trial' ? 149 : product.price;

  return (
    <div className="pb-20 sm:pb-8">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-16">
        
        {/* Left: Luxury Flacon Visual Column */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
          <div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-gradient-to-b from-neutral-900 via-neutral-950 to-black p-8 flex flex-col items-center justify-between shadow-2xl border border-white/10">
            {/* Ambient Glow */}
            <div
              className="absolute h-64 w-64 rounded-full blur-3xl opacity-20"
              style={{ backgroundColor: brand.colors.accent }}
            />

            {/* Top Badge */}
            <div className="relative z-10 w-full flex justify-between items-center">
              <span className="rounded-full border border-white/20 bg-black/60 backdrop-blur-md px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                {isOriental ? 'Concentrated Attar' : isLuxury ? 'Atelier Expression' : isDiscovery ? 'Climate Spec' : 'Extrait Standard'}
              </span>
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                style={{ backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }}
              >
                {product.intensity}
              </span>
            </div>

            {/* Bottle Visual */}
            <div className="relative z-10 my-auto scale-110 sm:scale-125">
              <BottleVisual product={product} brand={brand} size="lg" />
            </div>

            {/* Bottom Flacon Metadata */}
            <div className="relative z-10 text-center mt-auto pt-4 border-t border-white/10 w-full">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">
                {product.size} · {getConcentrationBadge()}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Product Details & Notes Pyramid */}
        <div className="lg:col-span-7">
          {/* Breadcrumbs */}
          <nav className="mb-4 flex items-center gap-2 text-xs text-brand-text-muted">
            <Link href={`/${brand.slug}`} className="hover:text-brand-text transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href={`/${brand.slug}/shop`} className="hover:text-brand-text transition-colors">
              Shop
            </Link>
            <span>/</span>
            <span className="text-brand-text font-medium">{product.name}</span>
          </nav>

          {/* Title & Price */}
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-brand-text">
            {product.name}
          </h1>
          <p className="mt-1 text-sm text-brand-text-muted font-medium capitalize">
            {product.tags.slice(0, 3).join(' · ')}
          </p>

          <div className="mt-4 flex items-baseline gap-4">
            <span className="font-serif text-3xl font-bold text-brand-text">
              {formatPrice(currentPrice)}
            </span>
            <span className="text-sm text-brand-text-muted">Inclusive of all taxes</span>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 px-2.5 py-0.5 text-xs font-bold">
              In Stock
            </span>
          </div>

          {/* World of Perfumers Size/Trial Selector */}
          {isDiscovery && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-2 font-mono">
                Select Format:
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedFormat('standard')}
                  className={`rounded-lg p-2.5 text-left border transition-all ${
                    selectedFormat === 'standard'
                      ? 'border-[#0284C7] bg-white shadow-sm ring-1 ring-[#0284C7]'
                      : 'border-slate-200 bg-white/60 hover:bg-white'
                  }`}
                >
                  <span className="block text-xs font-bold text-slate-900">{product.size} Full Flacon</span>
                  <span className="block text-[11px] text-slate-500 font-mono">{formatPrice(product.price)}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedFormat('trial')}
                  className={`rounded-lg p-2.5 text-left border transition-all ${
                    selectedFormat === 'trial'
                      ? 'border-[#0284C7] bg-white shadow-sm ring-1 ring-[#0284C7]'
                      : 'border-slate-200 bg-white/60 hover:bg-white'
                  }`}
                >
                  <span className="block text-xs font-bold text-slate-900">10ml Pocket Spray</span>
                  <span className="block text-[11px] text-emerald-600 font-mono font-bold">₹149 (Trial First)</span>
                </button>
              </div>
            </div>
          )}

          {/* Attributes Pills */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-brand-border bg-brand-surface-hover px-3 py-1 text-xs font-semibold text-brand-text">
              {product.gender === 'men' ? '♂ Men' : product.gender === 'women' ? '♀ Women' : '⚥ Unisex'}
            </span>
            {product.fragranceFamily.map((f) => (
              <span
                key={f}
                className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
                style={{ backgroundColor: `${brand.colors.accent}15`, color: brand.colors.accent }}
              >
                {f}
              </span>
            ))}
            <span className="rounded-full border border-brand-border bg-brand-surface-hover px-3 py-1 text-xs font-semibold text-brand-text">
              {getConcentrationBadge()}
            </span>
          </div>

          {/* Brand-Specific Value Callout */}
          <div className="mt-6 rounded-2xl border border-brand-accent/30 bg-brand-surface-hover p-4 flex items-start gap-3">
            <span className="text-brand-accent text-lg">✦</span>
            <div>
              <h4 className="text-xs font-bold text-brand-text uppercase tracking-wider">
                {isOriental
                  ? 'Traditional Alcohol-Free Formulation'
                  : isLuxury
                  ? 'Private Haute Parfumerie Standard'
                  : isDiscovery
                  ? 'Engineered for Indian Weather Resilience'
                  : 'Crafted for Indian Climate & Endurance'}
              </h4>
              <p className="mt-0.5 text-xs text-brand-text-muted leading-relaxed">
                {isOriental
                  ? 'Pure concentrated perfume oil that absorbs into the skin without drying alcohol, projecting an intimate, warming scent bubble throughout the day.'
                  : isLuxury
                  ? 'Formulated with an extraordinary 35% pure perfume oil concentration for unrivaled depth, evolution, and 12+ hour sillage.'
                  : isDiscovery
                  ? 'Fortified with high-heat fixatives tested at 42°C to eliminate rapid evaporation in extreme heat and humid transit.'
                  : 'Formulated as an Extrait de Parfum with 30% pure fragrance oil concentration to ensure 8-12+ hours longevity.'}
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="mt-6 text-sm sm:text-base text-brand-text-muted leading-relaxed">
            {product.description}
          </p>

          {/* Olfactory Notes Pyramid */}
          <div className="mt-8 rounded-2xl border border-brand-border-light bg-brand-surface p-6 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-widest text-brand-text-muted mb-4">
              Olfactory Pyramid
            </h3>
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-brand-text mb-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Top Notes (First 15 mins)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {product.topNotes.map((note) => (
                    <span key={note} className="rounded-lg bg-brand-surface-hover border border-brand-border-light px-3 py-1 text-xs text-brand-text font-medium">
                      {note}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-brand-text mb-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-rose-400" />
                  Heart Notes (2 - 5 Hours)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {product.heartNotes.map((note) => (
                    <span key={note} className="rounded-lg bg-brand-surface-hover border border-brand-border-light px-3 py-1 text-xs text-brand-text font-medium">
                      {note}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-brand-text mb-1.5 flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  Base Notes (6 - 12+ Hours)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {product.baseNotes.map((note) => (
                    <span key={note} className="rounded-lg bg-brand-surface-hover border border-brand-border-light px-3 py-1 text-xs text-brand-text font-medium">
                      {note}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Performance & Occasion Grid */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-brand-border-light bg-brand-surface p-3.5 text-center">
              <span className="block text-[10px] font-semibold text-brand-text-muted uppercase">Occasion</span>
              <span className="mt-1 block text-xs font-bold text-brand-text capitalize truncate">
                {product.occasion[0]?.replace('-', ' ')}
              </span>
            </div>
            <div className="rounded-xl border border-brand-border-light bg-brand-surface p-3.5 text-center">
              <span className="block text-[10px] font-semibold text-brand-text-muted uppercase">Season</span>
              <span className="mt-1 block text-xs font-bold text-brand-text capitalize truncate">
                {product.season[0]?.replace('-', ' ')}
              </span>
            </div>
            <div className="rounded-xl border border-brand-border-light bg-brand-surface p-3.5 text-center">
              <span className="block text-[10px] font-semibold text-brand-text-muted uppercase">Longevity</span>
              <span className="mt-1 block text-xs font-bold text-brand-text truncate">
                {formatLongevity(product.longevity)}
              </span>
            </div>
            <div className="rounded-xl border border-brand-border-light bg-brand-surface p-3.5 text-center">
              <span className="block text-[10px] font-semibold text-brand-text-muted uppercase">Sillage</span>
              <span className="mt-1 block text-xs font-bold text-brand-text capitalize truncate">
                {product.intensity}
              </span>
            </div>
          </div>

          {/* Best For */}
          <div className="mt-6 rounded-2xl border border-brand-border-light bg-brand-surface p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted mb-2.5">
              Best For
            </h3>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {product.bestFor.map((item) => (
                <li key={item} className="flex items-center gap-2 text-xs text-brand-text font-medium">
                  <span className="text-brand-accent font-bold">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Desktop CTAs */}
          <div className="mt-8 space-y-3">
            <button
              onClick={() => setAddedToCollection(true)}
              disabled={addedToCollection}
              className="w-full rounded-xl py-4 text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-60 shadow-lg"
              style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
            >
              {addedToCollection ? '✓ Added to Order' : isDiscovery && selectedFormat === 'trial' ? 'Order 10ml Pocket Trial (₹149)' : 'Add to Collection'}
            </button>

            {/* Contextual Scent Concierge Consultation Box */}
            <div className="rounded-2xl border border-brand-accent/40 bg-brand-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-brand-accent text-base">✦</span>
                <h4 className="text-xs font-bold text-brand-text uppercase tracking-wider">
                  Not Sure If {product.name} Is Right For You?
                </h4>
              </div>
              <p className="text-xs text-brand-text-muted leading-relaxed">
                Consult our {brand.finder.assistantName || 'Scent Concierge'} to compare with other creations in our collection:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {isLuxury ? (
                  <>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`I appreciate ${product.name}, but desire a darker, more mysterious evening presence`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-serif hover:border-brand-accent transition-colors block text-left"
                    >
                      🌑 &ldquo;I desire a darker, more mysterious evening presence&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Recommend a hybrid blend combining the character of ${product.name} with fresh citrus accords`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-serif hover:border-brand-accent transition-colors block text-left"
                    >
                      🌿 &ldquo;Recommend a hybrid accord with fresher top notes&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`How does the 35% extrait concentration in ${product.name} evolve on skin over 10 hours?`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-serif hover:border-brand-accent transition-colors block text-left"
                    >
                      ⏳ &ldquo;How does the 35% concentration evolve on skin?&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Compare ${product.name} with other private atelier formulations`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-serif hover:border-brand-accent transition-colors block text-left"
                    >
                      🏛 &ldquo;Compare with other private atelier formulations&rdquo;
                    </Link>
                  </>
                ) : isDiscovery ? (
                  <>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`I want to test ${product.name} in 10ml size before buying 50ml`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-mono hover:border-[#0284C7] transition-colors block text-left"
                    >
                      🧪 &ldquo;Test 10ml pocket spray (₹149) before full bottle&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`How does ${product.name} perform in 40°C Indian summer heat?`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-mono hover:border-[#0284C7] transition-colors block text-left"
                    >
                      ☀️ &ldquo;How does it perform in 40°C Indian summer heat?&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Show me 3 trial-worthy office perfumes similar to ${product.name}`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-mono hover:border-[#0284C7] transition-colors block text-left"
                    >
                      💼 &ldquo;Show me 3 trial-worthy office perfumes&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Help me build a 3-fragrance 10ml trial set including ${product.name}`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-mono hover:border-[#0284C7] transition-colors block text-left"
                    >
                      📦 &ldquo;Help me build a 3-fragrance trial set&rdquo;
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`I like ${product.name} but want something sweeter from the 380+ catalogue`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-medium hover:border-brand-accent transition-colors block text-left"
                    >
                      🍯 &ldquo;I like this, but want something sweeter&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Find another high-longevity recreation like ${product.name}`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-medium hover:border-brand-accent transition-colors block text-left"
                    >
                      ⚡ &ldquo;High-longevity recreation like this&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`I want an alternative to ${product.name} that is fresher for daily office wear`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-medium hover:border-brand-accent transition-colors block text-left"
                    >
                      🌿 &ldquo;Fresher office alternative in catalogue&rdquo;
                    </Link>
                    <Link
                      href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Show me alternatives to ${product.name} under ₹800`)}`}
                      className="rounded-lg border border-brand-border-light bg-brand-surface-hover p-2.5 text-[11px] text-brand-text font-medium hover:border-brand-accent transition-colors block text-left"
                    >
                      💰 &ldquo;Show me catalogue options under ₹800&rdquo;
                    </Link>
                  </>
                )}
              </div>

              <Link
                href={`/${brand.slug}/finder?ref=${product.slug}&q=${encodeURIComponent(`Tell me about ${product.name} and compare it with other fragrances`)}`}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-accent hover:underline pt-1"
              >
                <span>Open {brand.finder.assistantName || 'Consultant'} for {product.name}</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Designer Inspiration Section */}
          {product.similarTo.length > 0 && (
            <div className="mt-8 rounded-2xl border border-brand-border-light bg-brand-surface p-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted mb-2">
                {isLuxury ? 'Atelier Expression Of' : 'Similar Profile To'}
              </h3>
              <div className="flex flex-wrap gap-2">
                {product.similarTo.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-brand-border bg-brand-surface-hover px-3 py-1 text-xs text-brand-text font-medium"
                  >
                    ✦ {name}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-brand-text-muted italic">
                *Stylistic olfactory comparison only. Hand-blended with original master formulation ingredients.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cross-Sell: Similar Fragrances */}
      {similarProducts.length > 0 && (
        <div className="mt-20 border-t border-brand-border-light pt-12">
          <h2 className="font-serif text-2xl font-bold text-brand-text mb-6">
            Complementary Fragrances
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {similarProducts.slice(0, 4).map((p) => (
              <Link
                key={p.id}
                href={`/${brand.slug}/product/${p.slug}`}
                className="group rounded-2xl border border-brand-border-light bg-brand-surface p-4 transition-all duration-300 hover:border-brand-accent/50 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <div className="h-12 w-9 rounded-md bg-neutral-900 border border-white/10 flex items-center justify-center shrink-0">
                    <span className="text-[9px] font-bold text-[#D4AF37]">{brand.monogram}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-serif text-sm font-bold text-brand-text truncate group-hover:text-brand-accent transition-colors">
                      {p.name}
                    </h4>
                    <p className="text-xs text-brand-text-muted">{formatPrice(p.price)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sticky Mobile Purchase & Discovery Bar */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-brand-surface/95 backdrop-blur-xl border-t border-brand-border p-3 flex items-center gap-3 sm:hidden shadow-2xl">
        <div className="flex-1">
          <span className="block text-xs font-bold text-brand-text line-clamp-1">{product.name}</span>
          <span className="block text-xs text-brand-accent font-semibold">{formatPrice(currentPrice)}</span>
        </div>
        <Link
          href={`/${brand.slug}/finder?q=${encodeURIComponent(`Tell me about ${product.name}`)}`}
          className="rounded-lg border border-brand-border px-3 py-2 text-xs font-medium text-brand-text"
        >
          Ask AI
        </Link>
        <button
          onClick={() => setAddedToCollection(true)}
          disabled={addedToCollection}
          className="rounded-lg px-4 py-2 text-xs font-bold shadow-md shrink-0"
          style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
        >
          {addedToCollection ? 'Added' : 'Add to Bag'}
        </button>
      </div>
    </div>
  );
}

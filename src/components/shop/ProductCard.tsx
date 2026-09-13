'use client';

import Link from 'next/link';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { formatPrice } from '@/lib/brand-utils';
import BottleVisual from './BottleVisual';

interface ProductCardProps {
  product: Product;
  brand: BrandConfig;
}

export default function ProductCard({ product, brand }: ProductCardProps) {
  const cardStyle = brand.layout?.cardStyle || 'modern-flacon';

  // 1. ORNATE ATTAR CARD (Arabian Aroma)
  if (cardStyle === 'ornate-attar') {
    return (
      <Link
        href={`/${brand.slug}/product/${product.slug}`}
        className="group block"
      >
        <div className="rounded-3xl border border-[#DFD0B8] bg-white overflow-hidden transition-all duration-300 hover:border-[#E5A93C] hover:shadow-xl relative flex flex-col h-full">
          {/* Ornate Visual Container */}
          <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-b from-[#08111D] via-[#0E1E33] to-[#08111D] flex items-center justify-center p-4">
            {/* Saffron Ambient Glow */}
            <div className="absolute h-48 w-48 rounded-full blur-3xl opacity-20 bg-[#E5A93C] group-hover:opacity-35 transition-opacity" />

            {/* Traditional Geometric Pattern Overlay */}
            <div className="absolute inset-0 bg-[radial-gradient(#E5A93C_1px,transparent_1px)] [background-size:16px_16px] opacity-10 pointer-events-none" />

            {/* Alcohol Free Badge */}
            <div className="absolute top-3 left-3 z-20 rounded-full bg-[#E5A93C]/15 backdrop-blur-md border border-[#E5A93C]/40 px-2.5 py-0.5 text-[9px] font-bold text-[#E5A93C] tracking-wide">
              ✦ Alcohol-Free Pure Attar
            </div>

            {/* Featured Badge */}
            {product.featured && (
              <div className="absolute top-3 right-3 z-20 rounded-full bg-[#E5A93C] text-[#071120] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shadow-sm">
                Master Blend
              </div>
            )}

            {/* Bottle Visual */}
            <BottleVisual product={product} brand={brand} />

            {/* Hover Notes Overlay */}
            <div className="absolute inset-0 z-30 bg-[#071120]/85 backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex flex-col justify-between p-5 text-white">
              <div>
                <span className="text-[10px] uppercase tracking-[0.25em] text-[#E5A93C] font-serif block">
                  Artisanal Note Profile
                </span>
                <p className="mt-2 text-xs font-serif leading-relaxed text-white/90">
                  {product.topNotes.slice(0, 2).join(', ')} · {product.heartNotes[0]} · {product.baseNotes[0]}
                </p>
              </div>

              <div className="space-y-2 border-t border-white/15 pt-3 text-xs">
                <div className="flex justify-between text-white/70">
                  <span>Application</span>
                  <span className="text-white font-medium">Roll-On Pulse Points</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Trail</span>
                  <span className="text-white font-medium capitalize">{product.intensity} Sillage</span>
                </div>
                <div className="w-full text-center rounded-full bg-[#E5A93C] text-[#071120] py-2 text-xs font-bold shadow-md">
                  Explore Pure Attar →
                </div>
              </div>
            </div>
          </div>

          {/* Product Details Section */}
          <div className="p-5 flex-1 flex flex-col justify-between bg-[#FAF6EF]/50">
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#0D1726] group-hover:text-[#E5A93C] transition-colors line-clamp-1">
                    {product.name}
                  </h3>
                  <p className="text-xs text-[#5C5446] font-medium mt-0.5">
                    Traditional Concentrated Perfume Oil
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="font-serif text-lg font-bold text-[#0D1726]">
                    {formatPrice(product.price)}
                  </span>
                  <span className="block text-[10px] text-[#5C5446] font-medium">
                    {product.size} Roll-On
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-[#DFD0B8]/60 flex items-center justify-between text-[11px] text-[#5C5446]">
              <span className="font-serif italic capitalize">
                {product.fragranceFamily.join(' · ')}
              </span>
              <span className="rounded-full bg-[#E5A93C]/15 text-[#0D1726] px-2 py-0.5 text-[10px] font-semibold">
                Pure Oil
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // 2. EDITORIAL MONOLITH CARD (Al-Maham Fragrances)
  if (cardStyle === 'editorial-monolith') {
    return (
      <Link
        href={`/${brand.slug}/product/${product.slug}`}
        className="group block"
      >
        <div className="rounded-none border border-[#D8D0C2] bg-white transition-all duration-300 hover:border-[#D4AF37] hover:shadow-2xl relative flex flex-col h-full">
          {/* Editorial Visual Container */}
          <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-b from-[#020A07] via-[#041A14] to-[#010805] flex items-center justify-center p-5">
            {/* Deep Emerald Ambient Glow */}
            <div className="absolute h-52 w-52 rounded-full blur-3xl opacity-20 bg-[#D4AF37] group-hover:opacity-35 transition-opacity" />

            {/* Niche Inspiration Tag */}
            {product.similarTo && product.similarTo.length > 0 && (
              <div className="absolute top-4 left-4 z-20 border border-[#D4AF37]/50 bg-[#041A14]/80 backdrop-blur-md px-3 py-1 text-[9px] font-serif tracking-widest text-[#D4AF37] uppercase">
                Inspired by {product.similarTo[0]}
              </div>
            )}

            {/* Extrait Concentration Badge */}
            <div className="absolute top-4 right-4 z-20 bg-[#D4AF37] text-[#041A14] px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest">
              35% EXTRAIT
            </div>

            {/* Monolith Bottle */}
            <BottleVisual product={product} brand={brand} />

            {/* Editorial Hover Overlay */}
            <div className="absolute inset-0 z-30 bg-[#041A14]/90 backdrop-blur-md opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex flex-col justify-between p-6 text-white">
              <div>
                <span className="text-[9px] uppercase tracking-[0.35em] text-[#D4AF37] font-serif block">
                  Atelier Olfactory Accord
                </span>
                <p className="mt-3 text-xs font-serif italic leading-relaxed text-white/95">
                  {product.description}
                </p>
              </div>

              <div className="space-y-2 border-t border-white/15 pt-4 text-xs font-serif">
                <div className="flex justify-between text-white/70">
                  <span>Longevity</span>
                  <span className="text-white font-medium capitalize">{product.longevity.replace('-', ' ')}</span>
                </div>
                <div className="flex justify-between text-white/70">
                  <span>Occasion</span>
                  <span className="text-white font-medium capitalize">{product.occasion[0]?.replace('-', ' ')}</span>
                </div>
                <div className="w-full text-center bg-[#D4AF37] text-[#041A14] py-2.5 text-xs font-serif font-bold uppercase tracking-widest mt-2">
                  View Private Formulation →
                </div>
              </div>
            </div>
          </div>

          {/* Editorial Details Section */}
          <div className="p-6 flex-1 flex flex-col justify-between bg-[#F9F8F5]">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#58615A] block">
                {product.fragranceFamily.join(' / ')}
              </span>
              <h3 className="font-serif text-lg font-normal text-[#061711] group-hover:text-[#D4AF37] transition-colors mt-1">
                {product.name}
              </h3>
            </div>

            <div className="mt-4 pt-3 border-t border-[#D8D0C2] flex items-center justify-between">
              <div>
                <span className="font-serif text-lg font-medium text-[#061711]">
                  {formatPrice(product.price)}
                </span>
                <span className="block text-[10px] text-[#58615A] tracking-wider">
                  {product.size} Flacon
                </span>
              </div>
              <span className="text-[10px] font-serif tracking-widest text-[#061711] uppercase border border-[#061711]/20 px-2 py-1">
                Atelier
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // 3. MINIMAL TECHNICAL SPEC CARD (World of Perfumers)
  if (cardStyle === 'minimal-spec') {
    return (
      <Link
        href={`/${brand.slug}/product/${product.slug}`}
        className="group block"
      >
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden transition-all duration-300 hover:border-[#0284C7] hover:shadow-lg relative flex flex-col h-full">
          {/* Lab Visual Container */}
          <div className="relative aspect-[3/4] overflow-hidden bg-[#0B1120] flex items-center justify-center p-4">
            {/* Blue Ambient Glow */}
            <div className="absolute h-44 w-44 rounded-full blur-3xl opacity-20 bg-[#0284C7] group-hover:opacity-35 transition-opacity" />

            {/* Climate Tested Pill */}
            <div className="absolute top-3 left-3 z-20 rounded-md bg-[#0284C7]/20 border border-[#0284C7]/40 px-2 py-0.5 text-[9px] font-mono text-[#38BDF8] font-bold">
              ★ Indian Climate Tested
            </div>

            {/* 10ml Pocket Trial Tag */}
            <div className="absolute top-3 right-3 z-20 rounded-md bg-white/90 text-slate-900 px-2 py-0.5 text-[9px] font-mono font-bold shadow-sm">
              10ml from ₹149
            </div>

            {/* Bottle Visual */}
            <BottleVisual product={product} brand={brand} />

            {/* Hover Technical Spec Overlay */}
            <div className="absolute inset-0 z-30 bg-[#0F172A]/90 backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex flex-col justify-between p-5 text-white font-mono">
              <div>
                <span className="text-[9px] uppercase tracking-wider text-[#38BDF8] font-bold block">
                  Perfumer Formulation Spec
                </span>
                <p className="mt-2 text-xs text-slate-200 font-sans leading-relaxed">
                  {product.description}
                </p>
              </div>

              <div className="space-y-1.5 border-t border-slate-700 pt-3 text-[11px]">
                <div className="flex justify-between text-slate-400">
                  <span>Heat Resilience</span>
                  <span className="text-emerald-400 font-bold">High (Tested to 40°C)</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Wear Time</span>
                  <span className="text-white capitalize">{product.longevity.replace('-', ' ')}</span>
                </div>
                <div className="w-full text-center rounded-lg bg-[#0284C7] text-white py-2 text-xs font-bold font-sans mt-2">
                  Test Formula Details →
                </div>
              </div>
            </div>
          </div>

          {/* Product Details Section */}
          <div className="p-4 flex-1 flex flex-col justify-between bg-white">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono text-[#0284C7] font-semibold uppercase">
                  {product.fragranceFamily[0]}
                </span>
                <span className="text-slate-300">·</span>
                <span className="text-[10px] font-mono text-slate-500">
                  {product.intensity} projection
                </span>
              </div>
              <h3 className="font-sans text-base font-bold text-slate-900 group-hover:text-[#0284C7] transition-colors line-clamp-1">
                {product.name}
              </h3>
              {product.similarTo && product.similarTo.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Vibe: {product.similarTo[0]}
                </p>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-bold text-base text-slate-900">
                    {formatPrice(product.price)}
                  </span>
                  <span className="text-[11px] text-slate-500 font-medium">
                    (50ml Full)
                  </span>
                </div>
                <span className="text-[11px] text-[#0284C7] font-semibold block mt-0.5">
                  or ₹149 for 10ml Pocket Trial
                </span>
              </div>

              <span className="rounded-lg bg-sky-50 text-[#0284C7] border border-[#0284C7]/30 px-3 py-1.5 text-xs font-mono font-bold group-hover:bg-[#0284C7] group-hover:text-white transition-all shadow-sm">
                Try 10ml →
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // 4. MODERN EXTRAIT CARD (TM Perfume House / Default)
  return (
    <Link
      href={`/${brand.slug}/product/${product.slug}`}
      className="group block"
    >
      <div className="rounded-2xl border border-brand-border-light bg-brand-surface overflow-hidden transition-all duration-300 hover:border-brand-accent/50 hover:shadow-xl">
        {/* Luxury Flacon Visual Container */}
        <div className="relative aspect-[3/4] overflow-hidden bg-gradient-to-b from-[#161514] to-[#25221F] flex items-center justify-center">
          {/* Ambient back-glow */}
          <div
            className="absolute h-48 w-48 rounded-full blur-3xl opacity-25 transition-opacity duration-500 group-hover:opacity-40"
            style={{ backgroundColor: brand.colors.accent }}
          />

          {/* Bottle Visual */}
          <BottleVisual product={product} brand={brand} />

          {/* Designer Inspiration Pill */}
          {product.similarTo && product.similarTo.length > 0 && (
            <div className="absolute top-3 left-3 z-20 rounded-full bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 text-[9px] font-medium text-white/90">
              <span className="text-[#D4AF37] mr-1">✦</span>
              Style of {product.similarTo[0]}
            </div>
          )}

          {/* Featured Ribbon */}
          {product.featured && (
            <div
              className="absolute top-3 right-3 z-20 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider shadow-sm"
              style={{ backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }}
            >
              Top Pick
            </div>
          )}

          {/* Hover Notes Overlay */}
          <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex flex-col justify-between p-4">
            <div className="text-center pt-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#D4AF37] font-semibold">
                Olfactory Notes
              </span>
              <p className="mt-2 text-xs text-white/90 font-medium line-clamp-2">
                {product.topNotes.slice(0, 2).join(', ')} · {product.heartNotes[0]} · {product.baseNotes[0]}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-white/70 border-t border-white/10 pt-2">
                <span>Longevity</span>
                <span className="text-white font-medium capitalize">{product.longevity.replace('-', ' ')}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-white/70">
                <span>Occasion</span>
                <span className="text-white font-medium capitalize">{product.occasion[0]?.replace('-', ' ')}</span>
              </div>
              <div
                className="w-full text-center rounded-lg py-2 text-xs font-semibold shadow-md transition-transform duration-200 group-hover:scale-100"
                style={{ backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }}
              >
                Explore Scent Profile →
              </div>
            </div>
          </div>
        </div>

        {/* Product Details Section */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-serif text-base font-semibold text-brand-text truncate group-hover:text-brand-accent transition-colors">
                {product.name}
              </h3>
              <p className="mt-0.5 text-xs text-brand-text-muted">
                {product.fragranceFamily.map(f => f.charAt(0).toUpperCase() + f.slice(1)).join(' · ')}
              </p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-base font-semibold text-brand-text">
                {formatPrice(product.price)}
              </span>
              <span className="block text-[10px] text-brand-text-muted">
                {product.size}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 flex-wrap">
            <span className="rounded-full border border-brand-border-light bg-brand-surface-hover px-2 py-0.5 text-[10px] text-brand-text-muted font-medium">
              {product.gender === 'men' ? '♂ Men' : product.gender === 'women' ? '♀ Women' : '⚥ Unisex'}
            </span>
            <span className="rounded-full border border-brand-border-light bg-brand-surface-hover px-2 py-0.5 text-[10px] text-brand-text-muted font-medium">
              30% Extrait
            </span>
            <span className="rounded-full border border-brand-border-light bg-brand-surface-hover px-2 py-0.5 text-[10px] text-brand-text-muted font-medium">
              {product.intensity === 'strong' ? 'High Sillage' : product.intensity === 'subtle' ? 'Intimate Sillage' : 'Balanced Sillage'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

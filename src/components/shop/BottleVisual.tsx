'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';

interface BottleVisualProps {
  product: Product;
  brand: BrandConfig;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  priority?: boolean;
}

export default function BottleVisual({
  product,
  brand,
  size = 'md',
  priority = false,
}: BottleVisualProps) {
  const [imageError, setImageError] = useState(false);
  const cardStyle = brand.layout?.cardStyle || 'modern-flacon';
  const isWorldOfPerfumers =
    product.brandSlug === 'worldofperfumers' || brand.slug === 'worldofperfumers';
  const isScentStories =
    product.brandSlug === 'thescentstories' || brand.slug === 'thescentstories';

  useEffect(() => {
    setImageError(false);
  }, [product.id, product.imageUrl]);

  // Liquid and ambient color calculations based on fragrance family
  const getFamilyColor = (family: string) => {
    switch (family) {
      case 'woody':
      case 'oud':
        return {
          liquid: 'from-[#8C5E32]/75 via-[#C18C4D]/55 to-[#593816]/85',
          bg: 'from-[#1C1611] to-[#2E241B]',
          glow: '#C18C4D',
          accent: '#D4AF37',
        };
      case 'oriental':
      case 'spicy':
      case 'gourmand':
      case 'sweet':
        return {
          liquid: 'from-[#C47D3B]/80 via-[#E6A868]/55 to-[#8B4513]/85',
          bg: 'from-[#1A1412] to-[#2B1F19]',
          glow: '#E6A868',
          accent: '#F39C12',
        };
      case 'fresh':
      case 'aquatic':
      case 'citrus':
        return {
          liquid: 'from-[#3A7D8C]/70 via-[#72B4C2]/50 to-[#244E57]/80',
          bg: 'from-[#0F171A] to-[#16252A]',
          glow: '#72B4C2',
          accent: '#38BDF8',
        };
      case 'floral':
        return {
          liquid: 'from-[#B35B72]/70 via-[#E092A5]/50 to-[#7A3647]/80',
          bg: 'from-[#1A1215] to-[#2B1A20]',
          glow: '#E092A5',
          accent: '#FB7185',
        };
      default:
        return {
          liquid: 'from-[#C8A97E]/75 via-[#E4D1B8]/50 to-[#8A6F49]/80',
          bg: 'from-[#161514] to-[#25221F]',
          glow: '#C8A97E',
          accent: '#C8A97E',
        };
    }
  };

  const primaryFamily = product.fragranceFamily[0] || 'woody';
  const palette = getFamilyColor(primaryFamily);

  // Scaling
  const scaleClass = size === 'sm' ? 'scale-75' : size === 'lg' ? 'scale-125 sm:scale-135' : 'scale-95 sm:scale-100';

  // Photographic Product Image (authentic brand imagery, e.g. World of Perfumers)
  if (product.imageUrl && !imageError) {
    const sizeContainerClass =
      size === 'sm'
        ? 'h-36 w-32 max-h-full max-w-full'
        : size === 'lg'
        ? 'h-80 w-64 sm:h-96 sm:w-80 max-h-full max-w-full'
        : 'h-52 w-44 sm:h-64 sm:w-52 max-h-full max-w-full';

    return (
      <div
        className={`relative flex items-center justify-center select-none ${sizeContainerClass} ${
          isScentStories ? 'p-4 sm:p-5' : 'p-3 sm:p-4'
        } transition-transform duration-500 group-hover:scale-105`}
      >
        <Image
          src={product.imageUrl}
          alt={product.name}
          fill
          sizes={
            size === 'sm'
              ? '128px'
              : size === 'lg'
                ? '(max-width: 640px) 80vw, 420px'
                : '(max-width: 640px) 45vw, 208px'
          }
          className="object-contain object-center p-2 sm:p-3 select-none"
          onError={() => setImageError(true)}
          priority={priority}
        />
      </div>
    );
  }

  // The Scent Stories: never invent a bottle when official photography is missing.
  if (isScentStories) {
    const sizeContainerClass =
      size === 'sm'
        ? 'h-36 w-32'
        : size === 'lg'
        ? 'h-80 w-64 sm:h-96 sm:w-80'
        : 'h-52 w-44 sm:h-64 sm:w-52';
    return (
      <div
        className={`relative flex flex-col items-center justify-center select-none ${sizeContainerClass} px-5 text-center border border-brand-border/60 bg-brand-surface`}
      >
        <span className="font-serif text-sm text-brand-text line-clamp-3 leading-snug">
          {product.name}
        </span>
        <span className="mt-2 text-[10px] tracking-[0.16em] uppercase text-brand-text-muted">
          {product.size || 'Official Sample'}
        </span>
        <span className="mt-1 text-[9px] tracking-[0.14em] uppercase text-brand-text-muted">
          Image unavailable
        </span>
      </div>
    );
  }

  // World of Perfumers: never invent a fake bottle when photography is missing or failed.
  if (isWorldOfPerfumers) {
    const sizeContainerClass =
      size === 'sm'
        ? 'h-36 w-32'
        : size === 'lg'
        ? 'h-80 w-64 sm:h-96 sm:w-80'
        : 'h-52 w-44 sm:h-64 sm:w-52';
    return (
      <div
        className={`relative flex flex-col items-center justify-center select-none ${sizeContainerClass} px-4 text-center`}
      >
        <span className="text-[10px] tracking-[0.28em] uppercase text-brand-text-muted">
          {brand.monogram}
        </span>
        <span className="mt-2 font-serif text-sm text-brand-text line-clamp-2">{product.name}</span>
        <span className="mt-1 text-[9px] tracking-[0.18em] uppercase text-brand-text-muted">
          Image unavailable
        </span>
      </div>
    );
  }

  // 1. ORNATE ATTAR BOTTLE (Arabian Aroma)
  if (cardStyle === 'ornate-attar') {
    return (
      <div className={`relative flex flex-col items-center select-none transition-transform duration-500 ${scaleClass}`}>
        {/* Ornate Golden Dome Cap with Finial */}
        <div className="relative flex flex-col items-center">
          {/* Top finial bead */}
          <div className="h-2 w-2 rounded-full bg-gradient-to-r from-[#D4AF37] via-[#FFF3B0] to-[#997314] shadow-sm -mb-0.5" />
          {/* Domed oriental cap */}
          <div className="h-6 w-8 rounded-t-full bg-gradient-to-b from-[#FFF3B0] via-[#D4AF37] to-[#8C6B17] shadow-md border-b border-[#735712] relative overflow-hidden">
            {/* Engraved fluting */}
            <div className="absolute inset-0 flex justify-around opacity-30">
              <div className="w-0.5 h-full bg-[#3D2C04]" />
              <div className="w-0.5 h-full bg-[#3D2C04]" />
              <div className="w-0.5 h-full bg-[#3D2C04]" />
            </div>
          </div>
          {/* Ornate Neck Collar */}
          <div className="h-1.5 w-10 bg-gradient-to-r from-[#997314] via-[#FFF3B0] to-[#997314] rounded-sm shadow-inner" />
        </div>

        {/* Faceted Crystal Roll-On Flacon */}
        <div className="relative h-36 w-20 rounded-t-md rounded-b-2xl overflow-hidden border border-[#D4AF37]/50 bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-md mt-0.5 flex flex-col justify-between p-1.5 shadow-2xl">
          {/* Viscous Perfume Oil Volume */}
          <div
            className={`absolute inset-x-1 bottom-1 top-2 rounded-b-xl bg-gradient-to-t ${palette.liquid} backdrop-blur-sm transition-all duration-300`}
          />

          {/* Oriental Arch Cutout Outline */}
          <div className="absolute inset-1.5 rounded-t-lg rounded-b-xl border border-white/20 pointer-events-none" />

          {/* Roll-on applicator bead hint */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 h-2 w-4 rounded-full bg-white/40 blur-[0.5px]" />

          {/* Saffron & Gold Attar Cartouche */}
          <div className="relative z-20 my-auto mx-auto w-[88%] bg-[#080E18]/90 backdrop-blur-md rounded border border-[#E5A93C] p-2 flex flex-col items-center justify-center text-center shadow-lg">
            <span className="text-[8px] font-bold tracking-[0.3em] text-[#E5A93C] uppercase">
              {brand.monogram}
            </span>
            <span className="text-[7px] font-serif font-bold text-white uppercase mt-0.5 line-clamp-1">
              {product.name}
            </span>
            <div className="h-px w-6 bg-[#E5A93C]/40 my-0.5" />
            <span className="text-[5px] tracking-[0.15em] text-[#E5A93C]/90 uppercase font-semibold">
              PURE ATTAR OIL
            </span>
          </div>

          {/* Thick Crystal Faceted Base */}
          <div className="relative z-10 h-3 w-full bg-gradient-to-t from-white/30 to-white/10 rounded-b-xl border-t border-white/30" />
        </div>
      </div>
    );
  }

  // 2. EDITORIAL MONOLITH FLACON (Al-Maham)
  if (cardStyle === 'editorial-monolith') {
    return (
      <div className={`relative flex flex-col items-center select-none transition-transform duration-500 ${scaleClass}`}>
        {/* Heavy Brushed Antique Gold Cap */}
        <div className="h-5 w-11 bg-gradient-to-r from-[#B8860B] via-[#E6CA65] to-[#8B6508] shadow-lg border-b border-black/30 relative">
          <div className="absolute inset-0 bg-[radial-gradient(#000000_1px,transparent_1px)] [background-size:4px_4px] opacity-10" />
        </div>

        {/* Monolithic Glass Flacon with Clean Sharp Lines */}
        <div className="relative h-40 w-24 rounded-none overflow-hidden border border-white/15 bg-gradient-to-b from-[#08120F] via-[#041A14] to-[#010D0A] mt-0.5 flex flex-col justify-between p-2 shadow-2xl">
          {/* Subtle Deep Liquid Underglow */}
          <div
            className={`absolute inset-x-1 bottom-1 top-4 bg-gradient-to-t ${palette.liquid} opacity-85 backdrop-blur-sm`}
          />

          {/* Architectural Light Razor Highlight */}
          <div className="absolute top-0 bottom-0 left-2 w-0.5 bg-white/40 blur-[0.3px]" />

          {/* Brushed Brass Metal Plaque */}
          <div className="relative z-20 my-auto mx-auto w-[90%] bg-gradient-to-b from-[#D4AF37] via-[#C5A028] to-[#997314] p-[1px] shadow-2xl">
            <div className="bg-[#041A14] p-2 flex flex-col items-center justify-center text-center">
              <span className="text-[8px] tracking-[0.4em] text-[#D4AF37] uppercase font-serif">
                AL-MAHAM
              </span>
              <span className="text-[7px] font-serif italic text-white/95 mt-1 line-clamp-1">
                {product.name}
              </span>
              <div className="h-px w-6 bg-[#D4AF37]/50 my-1" />
              <span className="text-[5px] tracking-[0.25em] text-[#D4AF37] uppercase font-bold">
                EXTRAIT DE PARFUM · 35%
              </span>
            </div>
          </div>

          {/* Heavy Monolithic Glass Base */}
          <div className="relative z-10 h-3.5 w-full bg-white/20 border-t border-white/30 backdrop-blur-sm" />
        </div>
      </div>
    );
  }

  // 3. MINIMAL TECHNICAL SPEC LAB FLACON (World of Perfumers)
  if (cardStyle === 'minimal-spec') {
    return (
      <div className={`relative flex flex-col items-center select-none transition-transform duration-500 ${scaleClass}`}>
        {/* Technical Matte Black Atomizer Cap */}
        <div className="h-6 w-9 rounded-t-sm bg-gradient-to-b from-[#2A303C] to-[#12161D] shadow-md border-b border-black/50 relative flex items-center justify-center">
          <div className="h-1 w-5 bg-[#0284C7] rounded-full" />
        </div>

        {/* Cylindrical Laboratory Bottle */}
        <div className="relative h-38 w-22 rounded-b-lg overflow-hidden border border-slate-700/60 bg-[#0F172A]/90 mt-0.5 flex flex-col justify-between p-2 shadow-2xl">
          {/* Liquid Tint */}
          <div
            className={`absolute inset-x-1 bottom-1 top-3 rounded-b-md bg-gradient-to-t ${palette.liquid} opacity-80 backdrop-blur-sm`}
          />

          {/* Lab Measurement Graduations on Left Edge */}
          <div className="absolute left-1.5 top-6 bottom-6 flex flex-col justify-between pointer-events-none opacity-40">
            <span className="text-[5px] text-white font-mono">- 50ml</span>
            <span className="text-[5px] text-white font-mono">- 40ml</span>
            <span className="text-[5px] text-white font-mono">- 30ml</span>
            <span className="text-[5px] text-white font-mono">- 20ml</span>
            <span className="text-[5px] text-white font-mono">- 10ml</span>
          </div>

          {/* Technical Spec Label */}
          <div className="relative z-20 my-auto ml-3 mr-1 bg-white/95 text-slate-900 rounded p-2 flex flex-col items-start text-left shadow-lg border border-slate-300">
            <div className="flex items-center justify-between w-full">
              <span className="text-[7px] font-mono font-bold text-[#0284C7] uppercase">
                EDP FLACON
              </span>
              <span className="text-[6px] font-mono text-slate-500">
                IND-CLIMATE
              </span>
            </div>
            <span className="text-[8px] font-bold text-slate-900 uppercase tracking-tight mt-0.5 line-clamp-1">
              {product.name}
            </span>
            <span className="text-[6px] text-slate-600 font-mono mt-0.5 capitalize">
              {product.fragranceFamily[0]} · {product.longevity.replace('-', ' ')}
            </span>
            <div className="mt-1 flex items-center gap-1 w-full">
              <span className="text-[5px] bg-slate-900 text-white font-mono px-1 py-0.5 rounded-xs">
                EDP CONCENTRATE
              </span>
            </div>
          </div>

          {/* Heavy Lab Base */}
          <div className="relative z-10 h-2.5 w-full bg-white/20 rounded-b-md border-t border-white/30 backdrop-blur-sm" />
        </div>
      </div>
    );
  }

  // 4. MODERN EXTRAIT FLACON (TM Perfume House / Default)
  return (
    <div className={`relative flex flex-col items-center select-none transition-transform duration-500 ${scaleClass}`}>
      {/* Metallic Atomizer Cap */}
      <div className="metallic-cap-gold h-5 w-8 rounded-t-sm relative shadow-md">
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1.5 w-6 bg-gradient-to-r from-[#997314] via-[#F3E5AB] to-[#997314] rounded-sm" />
      </div>

      {/* Heavy Glass Flacon Body */}
      <div className="relative h-36 w-24 rounded-lg overflow-hidden glass-flacon border border-white/20 mt-1 flex flex-col justify-between p-2 shadow-2xl">
        {/* Liquid Volume */}
        <div
          className={`absolute inset-x-1 bottom-1 top-4 rounded-b-md bg-gradient-to-t ${palette.liquid} backdrop-blur-sm`}
        />

        {/* Vertical Glass Caustic Highlights */}
        <div className="absolute top-0 bottom-0 left-2 w-1 bg-white/30 blur-[0.5px] rounded-full pointer-events-none" />
        <div className="absolute top-0 bottom-0 right-3 w-0.5 bg-white/20 blur-[0.5px] rounded-full pointer-events-none" />

        {/* Center Embossed Luxury Label */}
        <div className="relative z-20 my-auto mx-auto w-[82%] bg-[#0A0A0A]/85 backdrop-blur-md rounded border border-[#D4AF37]/60 p-2 flex flex-col items-center justify-center text-center shadow-lg">
          <span className="text-[9px] font-bold tracking-[0.25em] text-[#D4AF37] uppercase">
            {brand.monogram}
          </span>
          <span className="text-[7px] font-medium tracking-wider text-white/90 uppercase line-clamp-1 mt-0.5">
            {product.name}
          </span>
          <span className="text-[5px] tracking-[0.2em] text-[#D4AF37]/80 uppercase mt-1">
            EXTRAIT DE PARFUM
          </span>
        </div>

        {/* Heavy Crystal Glass Base */}
        <div className="relative z-10 h-3 w-full bg-white/25 rounded-b-md border-t border-white/30 backdrop-blur-md" />
      </div>
    </div>
  );
}

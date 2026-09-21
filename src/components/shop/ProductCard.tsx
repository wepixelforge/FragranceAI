'use client';

import Link from 'next/link';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { formatPrice } from '@/lib/brand-utils';
import { formatLabel } from '@/lib/sampling-format';
import BottleVisual from './BottleVisual';

interface ProductCardProps {
  product: Product;
  brand: BrandConfig;
}

export default function ProductCard({ product, brand }: ProductCardProps) {
  const isDiscovery = brand.designVariant === 'discovery-niche';
  const isOriental = brand.designVariant === 'oriental-artisanal';
  const isLuxury = brand.designVariant === 'luxury-editorial';
  const isSampling = brand.designVariant === 'sampling-concierge';

  const getDescriptor = () => {
    if (product.character) return product.character;
    if (product.topNotes && product.topNotes.length > 0) {
      return `${product.topNotes.slice(0, 2).join(', ')} with a base of ${product.baseNotes[0] || 'warm woods'}.`;
    }
    return product.description;
  };

  const getCtaLabel = () => {
    if (isDiscovery) return 'Try 10ml →';
    if (isOriental) return 'View Attar →';
    if (isLuxury) return 'View Extrait →';
    if (isSampling) return 'View format →';
    return 'Explore Scent →';
  };

  return (
    <Link
      href={`/${brand.slug}/product/${product.slug}`}
      className="group block relative flex flex-col h-full bg-brand-surface border border-brand-border hover:border-brand-accent/40 transition-all duration-500 overflow-hidden shadow-xs"
    >
      {/* Product Image Stage */}
      <div className={`relative aspect-[3/4] overflow-hidden bg-brand-stage flex items-center justify-center p-6 sm:p-8 ${isSampling ? 'image-stage' : ''}`}>
        {/* Soft Ambient Radial Underglow */}
        <div
          className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.015] to-transparent pointer-events-none"
        />

        {/* Minimalist Olfactory Badge on Hover */}
        <div className="absolute top-4 left-4 z-20 text-[9px] uppercase tracking-[0.22em] text-brand-text-muted opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          {product.intensity} presence
        </div>

        {/* Product Bottle Visual */}
        <div className="relative z-10 transition-transform duration-700 ease-out group-hover:scale-103">
          <BottleVisual product={product} brand={brand} />
        </div>
      </div>

      {/* Editorial Content Presentation */}
      <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between border-t border-brand-border-light bg-brand-surface">
        <div>
          {/* Scent Family / Character */}
          <span className="text-[10px] uppercase tracking-[0.22em] text-brand-accent font-medium block">
            {isSampling && product.format
              ? `${formatLabel(product.format)} · ${product.fragranceFamily.slice(0, 2).join(' · ')}`
              : product.fragranceFamily.slice(0, 2).join(' · ')}
          </span>

          {/* Product Title */}
          <h3 className="font-serif text-lg sm:text-xl font-normal text-brand-text group-hover:text-brand-accent transition-colors mt-1.5 leading-snug line-clamp-2">
            {product.name}
          </h3>
          {isSampling && product.houseBrand && (
            <p className="mt-1 text-[11px] text-brand-text-muted">{product.houseBrand}</p>
          )}

          {/* Concise Poetic Descriptor */}
          <p className="mt-2 text-xs text-brand-text-muted line-clamp-2 font-light leading-relaxed">
            {getDescriptor()}
          </p>
        </div>

        {/* Price & Action */}
        <div className="mt-5 pt-4 border-t border-brand-border-light flex items-baseline justify-between">
          <div>
            <span className="font-serif text-base text-brand-text font-normal">
              {formatPrice(product.price)}
            </span>
            {isDiscovery && (
              <span className="text-[10px] text-brand-text-muted block mt-0.5 font-light">
                10ml trial from ₹149
              </span>
            )}
            {isSampling && (
              <span className="text-[10px] text-brand-text-muted block mt-0.5 font-light">
                {product.size}
              </span>
            )}
          </div>

          <span className="text-[10px] font-medium tracking-[0.2em] uppercase text-brand-accent group-hover:translate-x-0.5 transition-transform duration-300">
            {getCtaLabel()}
          </span>
        </div>
      </div>
    </Link>
  );
}

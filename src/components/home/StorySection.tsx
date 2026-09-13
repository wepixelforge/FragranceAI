'use client';

import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

interface StorySectionProps {
  brand: BrandConfig;
}

export default function StorySection({ brand }: StorySectionProps) {
  if (!brand.homepage.storyHeadline || !brand.homepage.storyBody) {
    return null;
  }

  const isOriental = brand.designVariant === 'oriental-artisanal';
  const isLuxury = brand.designVariant === 'luxury-editorial';
  const isDiscovery = brand.designVariant === 'discovery-niche';

  return (
    <section className="py-20 sm:py-28 border-t border-brand-border-light bg-brand-surface relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left / Editorial narrative */}
          <div className="lg:col-span-7">
            <span
              className="text-xs font-bold uppercase tracking-widest block mb-3"
              style={{ color: brand.colors.accent }}
            >
              {isOriental ? '✦ The Heritage of the East' : isLuxury ? '✦ Atelier Philosophy' : isDiscovery ? '✦ Sugandhim Laboratory Notes' : '✦ Craftsmanship & Heritage'}
            </span>

            <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-brand-text leading-tight">
              {brand.homepage.storyHeadline}
            </h2>

            <p className="mt-6 text-base sm:text-lg leading-relaxed text-brand-text-muted">
              {brand.homepage.storyBody}
            </p>

            <div className="mt-8 flex items-center gap-6">
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-brand-text block">
                  {isOriental ? '100%' : isLuxury ? '35%' : isDiscovery ? '42°C' : '380+'}
                </span>
                <span className="text-xs text-brand-text-muted uppercase tracking-wider">
                  {isOriental ? 'Alcohol-Free Attars' : isLuxury ? 'Oil Concentration' : isDiscovery ? 'Heat Tested' : 'Catalogue Creations'}
                </span>
              </div>
              <div className="h-10 w-px bg-brand-border-light" />
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-brand-text block">
                  {isOriental ? 'Assam & Taif' : isLuxury ? 'Niche Inspired' : isDiscovery ? '10ml Sprays' : 'Extrait Standard'}
                </span>
                <span className="text-xs text-brand-text-muted uppercase tracking-wider">
                  {isOriental ? 'Noble Origins' : isLuxury ? 'Master Expressions' : isDiscovery ? 'Trial From ₹149' : 'High Sillage'}
                </span>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href={`/${brand.slug}/finder`}
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
                style={{ color: brand.colors.accent }}
              >
                <span>Explore with AI Sommelier</span>
                <span>→</span>
              </Link>
            </div>
          </div>

          {/* Right / Visual Monogram Seal Frame */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-sm aspect-square rounded-3xl border border-brand-border bg-gradient-to-br from-brand-bg via-brand-surface to-brand-bg p-8 flex flex-col items-center justify-center text-center shadow-xl">
              <div
                className="h-24 w-24 rounded-2xl flex items-center justify-center font-serif text-4xl font-bold shadow-md mb-4"
                style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
              >
                {brand.monogram}
              </div>
              <h3 className="font-serif text-xl font-bold text-brand-text">
                {brand.name}
              </h3>
              <p className="text-xs text-brand-text-muted mt-1 max-w-xs">
                {brand.subTagline || brand.tagline}
              </p>
              <div className="mt-4 pt-4 border-t border-brand-border-light w-full text-[11px] text-brand-text-muted font-medium">
                {brand.specialty}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

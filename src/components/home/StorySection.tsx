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
    <section className="py-24 sm:py-32 border-t border-brand-border bg-brand-surface/30 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left / Editorial narrative */}
          <div className="lg:col-span-7">
            <span
              className="text-[10px] uppercase tracking-widest block mb-4 font-mono"
              style={{ color: brand.colors.accent }}
            >
              {isOriental ? '✦ The Heritage of the East' : isLuxury ? '✦ Atelier Philosophy' : isDiscovery ? '✦ Sugandhim Laboratory Notes' : '✦ Craftsmanship & Heritage'}
            </span>

            <h2 className="editorial-title font-serif text-3xl sm:text-5xl font-normal tracking-tight text-brand-text leading-tight">
              {brand.homepage.storyHeadline}
            </h2>

            <p className="mt-6 text-sm sm:text-base leading-relaxed text-brand-text-muted max-w-xl">
              {brand.homepage.storyBody}
            </p>

            <div className="mt-10 flex items-center gap-8 border-y border-brand-border py-6 max-w-lg">
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-light text-brand-text block">
                  {isOriental ? '100%' : isLuxury ? '35%' : isDiscovery ? '42°C' : '380+'}
                </span>
                <span className="text-[10px] text-brand-text-muted uppercase tracking-widest mt-1 block">
                  {isOriental ? 'Pure Alcohol-Free Oils' : isLuxury ? 'Pure Oil Concentration' : isDiscovery ? 'Indian Climate Tested' : 'Catalogue Formulations'}
                </span>
              </div>
              <div className="h-10 w-px bg-brand-border" />
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-light text-brand-text block">
                  {isOriental ? 'Assam & Taif' : isLuxury ? 'Niche Inspired' : isDiscovery ? '10ml Sprays' : 'Extrait Standard'}
                </span>
                <span className="text-[10px] text-brand-text-muted uppercase tracking-widest mt-1 block">
                  {isOriental ? 'Noble Botanical Sources' : isLuxury ? 'Master Extraits' : isDiscovery ? 'Trial Discovery Sprays' : 'Exceptional Sillage'}
                </span>
              </div>
            </div>

            <div className="mt-8">
              <Link
                href={`/${brand.slug}/finder`}
                className="group inline-flex items-center gap-2 text-xs font-medium uppercase tracking-widest transition-colors hover:text-brand-accent"
                style={{ color: brand.colors.accent }}
              >
                <span>Consult with Scent Concierge</span>
                <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>

          {/* Right / Visual Monogram Seal Frame */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="relative w-full max-w-sm aspect-[4/5] rounded-2xl hairline-border bg-gradient-to-b from-[#161615] via-[#0E0E0D] to-[#0B0B0A] p-8 sm:p-10 flex flex-col items-center justify-between text-center shadow-2xl">
              <div className="w-full flex justify-between items-center text-[9px] uppercase tracking-widest text-brand-text-muted/60 font-mono">
                <span>ESTABLISHED</span>
                <span>AUTHENTIC</span>
              </div>

              <div className="flex flex-col items-center">
                <div
                  className="h-20 w-20 rounded-full flex items-center justify-center font-serif text-3xl font-light tracking-wider hairline-border mb-6 shadow-inner"
                  style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: `${brand.colors.accent}40`, color: brand.colors.accent }}
                >
                  {brand.monogram}
                </div>
                <h3 className="font-serif text-2xl font-normal tracking-wide text-brand-text">
                  {brand.name}
                </h3>
                <p className="text-xs text-brand-text-muted mt-2 max-w-xs leading-relaxed">
                  {brand.subTagline || brand.tagline}
                </p>
              </div>

              <div className="border-t border-brand-border pt-4 w-full text-[10px] uppercase tracking-widest text-brand-accent/80 font-mono">
                {brand.specialty}
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

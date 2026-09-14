'use client';

import Link from 'next/link';
import { BrandConfig } from '@/types/brand';
import { getFeaturedProducts, getProducts } from '@/data';
import BottleVisual from '@/components/shop/BottleVisual';

interface HeroSectionProps {
  brand: BrandConfig;
}

export default function HeroSection({ brand }: HeroSectionProps) {
  const products = getProducts(brand.slug);
  const featured = getFeaturedProducts(brand.slug);
  // Select authentic centerpiece product for the visual hero stage
  const heroProduct = featured[0] || products[0];

  const getEyebrow = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return 'The Heritage of Pure Oils';
      case 'luxury-editorial':
        return 'Haute Parfumerie · Atelier';
      case 'discovery-niche':
        return 'Curated Olfactory Discovery';
      default:
        return 'Recreated Masterpieces';
    }
  };

  const getHeroTitle = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return 'The Essence of the East.';
      case 'luxury-editorial':
        return 'What Does Your Presence Evoke?';
      case 'discovery-niche':
        return 'Discover Your Signature.';
      default:
        return 'Find Your Signature Scent.';
    }
  };

  const getHeroSubtitle = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return 'Pure, concentrated perfume oils and sacred oriental extraits crafted to warm on pulse points and leave an intimate, unforgettable trail.';
      case 'luxury-editorial':
        return 'Step beyond ordinary department store fragrances. Explore bespoke extraits de parfum crafted with 35% oil concentration to mirror your personal stature.';
      case 'discovery-niche':
        return 'Stop blind-buying full bottles. Explore Indian climate-tested master creations, and test your favourites with 10ml pocket discovery sprays before committing.';
      default:
        return 'Skip the complex note pyramids and endless browsing. Tell our Scent Concierge what you love, and match your bottle in moments.';
    }
  };

  return (
    <section className="relative min-h-[82vh] lg:min-h-[88vh] flex items-center overflow-hidden bg-[#0B0B0A] border-b border-[rgba(237,232,223,0.06)] py-16 lg:py-24">
      {/* Subtle Atmospheric Light Stage */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[140px] opacity-15"
          style={{ backgroundColor: brand.colors.accent }}
        />
        <div className="absolute top-1/4 left-1/3 w-[350px] h-[350px] rounded-full blur-[120px] opacity-10 bg-white/5" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          
          {/* Left Editorial Narrative Column */}
          <div className="lg:col-span-7 flex flex-col justify-center text-left">
            {/* Minimalist Eyebrow */}
            <div className="flex items-center gap-3 mb-5">
              <span
                className="h-1 w-1 rounded-full"
                style={{ backgroundColor: brand.colors.accent }}
              />
              <span
                className="text-[10px] sm:text-xs tracking-[0.25em] uppercase font-medium"
                style={{ color: brand.colors.accent }}
              >
                {getEyebrow()}
              </span>
            </div>

            {/* Confident Large Headline */}
            <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-normal tracking-tight text-[#EDE8DF] leading-[1.08]">
              {getHeroTitle()}
            </h1>

            {/* Poetic Subtitle */}
            <p className="mt-6 text-sm sm:text-base lg:text-lg text-[#A0998F] max-w-xl font-light leading-relaxed">
              {getHeroSubtitle()}
            </p>

            {/* Editorial Action Bar */}
            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href={`/${brand.slug}/finder`}
                className="border border-[#B79A64] bg-[#B79A64] text-[#0B0B0A] hover:bg-transparent hover:text-[#EDE8DF] px-8 py-4 text-[11px] font-medium tracking-[0.22em] uppercase transition-all duration-300 text-center shadow-lg hover:shadow-[#B79A64]/10"
              >
                Find My Fragrance
              </Link>
              <Link
                href={`/${brand.slug}/shop`}
                className="border border-[rgba(237,232,223,0.18)] hover:border-[#B79A64] text-[#EDE8DF] hover:text-[#B79A64] px-8 py-4 text-[11px] font-medium tracking-[0.22em] uppercase transition-all duration-300 text-center"
              >
                Explore Collection →
              </Link>
            </div>

            {/* Quiet Heritage Markers */}
            <div className="mt-12 pt-8 border-t border-[rgba(237,232,223,0.08)] flex items-center gap-8 sm:gap-12">
              <div>
                <span className="block font-serif text-xl sm:text-2xl text-[#EDE8DF] font-light">
                  {brand.designVariant === 'oriental-artisanal'
                    ? '100%'
                    : brand.designVariant === 'luxury-editorial'
                    ? '35%'
                    : brand.designVariant === 'discovery-niche'
                    ? '10ml'
                    : '30%'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#A0998F]">
                  {brand.designVariant === 'oriental-artisanal'
                    ? 'Pure Attar Oil'
                    : brand.designVariant === 'luxury-editorial'
                    ? 'Pure Extrait'
                    : brand.designVariant === 'discovery-niche'
                    ? 'Pocket Trials'
                    : 'Oil Strength'}
                </span>
              </div>
              <div className="h-8 w-px bg-[rgba(237,232,223,0.08)]" />
              <div>
                <span className="block font-serif text-xl sm:text-2xl text-[#EDE8DF] font-light">
                  {brand.designVariant === 'discovery-niche' ? '42°C' : '10-12h'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#A0998F]">
                  {brand.designVariant === 'discovery-niche' ? 'Heat Resilience' : 'Endurance'}
                </span>
              </div>
              <div className="h-8 w-px bg-[rgba(237,232,223,0.08)]" />
              <div>
                <span className="block font-serif text-xl sm:text-2xl text-[#EDE8DF] font-light">
                  {brand.designVariant === 'discovery-niche' ? '₹149' : 'Private'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-[#A0998F]">
                  {brand.designVariant === 'discovery-niche' ? 'Trials First' : 'Consultation'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Product Hero Visual Stage */}
          {heroProduct && (
            <div className="lg:col-span-5 flex justify-center">
              <Link
                href={`/${brand.slug}/product/${heroProduct.slug}`}
                className="group relative w-full max-w-[360px] sm:max-w-[420px] aspect-[3/4] flex flex-col items-center justify-between p-8 rounded-none border border-[rgba(237,232,223,0.08)] bg-[#121211]/60 backdrop-blur-sm hover:border-[#B79A64]/40 transition-all duration-700 overflow-hidden"
              >
                {/* Subtle Radial Glow */}
                <div
                  className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent pointer-events-none"
                />

                {/* Top Badge */}
                <div className="relative z-10 w-full flex justify-between items-center text-[10px] tracking-[0.2em] uppercase text-[#A0998F]">
                  <span>Featured Blend</span>
                  <span className="text-[#B79A64]">₹{heroProduct.price}</span>
                </div>

                {/* Hero Bottle Focal Point */}
                <div className="relative z-10 my-auto py-4 transition-transform duration-700 ease-out group-hover:scale-104">
                  <BottleVisual product={heroProduct} brand={brand} size="lg" />
                </div>

                {/* Bottom Product Monograph */}
                <div className="relative z-10 w-full text-center border-t border-[rgba(237,232,223,0.08)] pt-4">
                  <h3 className="font-serif text-lg font-normal text-[#EDE8DF] tracking-wide group-hover:text-[#B79A64] transition-colors">
                    {heroProduct.name}
                  </h3>
                  <p className="text-[11px] text-[#A0998F] mt-1 capitalize font-light">
                    {heroProduct.fragranceFamily.slice(0, 2).join(' · ')} &mdash; {heroProduct.intensity} presence
                  </p>
                  <span className="text-[10px] tracking-[0.2em] uppercase text-[#B79A64] mt-2 block opacity-0 group-hover:opacity-100 transition-opacity">
                    Discover Details →
                  </span>
                </div>
              </Link>
            </div>
          )}

        </div>
      </div>
    </section>
  );
}

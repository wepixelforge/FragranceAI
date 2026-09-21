import Link from 'next/link';
import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import BottleVisual from '@/components/shop/BottleVisual';

interface HeroSectionProps {
  brand: BrandConfig;
  heroProduct?: Product;
}

export default function HeroSection({ brand, heroProduct }: HeroSectionProps) {

  const getEyebrow = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return 'The Heritage of Pure Oils';
      case 'luxury-editorial':
        return 'Haute Parfumerie · Atelier';
      case 'discovery-niche':
        return 'Curated Olfactory Discovery';
      case 'sampling-concierge':
        return 'Authentic samples & bottles';
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
      case 'sampling-concierge':
        return brand.homepage.heroTitle;
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
      case 'sampling-concierge':
        return brand.homepage.heroSubtitle;
      default:
        return 'Skip the complex note pyramids and endless browsing. Tell our Scent Concierge what you love, and match your bottle in moments.';
    }
  };

  return (
    <section className={`relative flex items-center overflow-hidden bg-brand-bg border-b border-brand-border-light ${
      brand.designVariant === 'sampling-concierge'
        ? 'lg:min-h-[78vh] py-10 sm:py-14 lg:py-20'
        : 'min-h-[82vh] lg:min-h-[88vh] py-16 lg:py-24'
    }`}>
      {/* Subtle Atmospheric Light Stage */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 right-1/4 -translate-y-1/2 w-[500px] h-[500px] rounded-full blur-[140px] opacity-15"
          style={{ backgroundColor: brand.colors.accent }}
        />
        <div className="absolute top-1/4 left-1/3 w-[350px] h-[350px] rounded-full blur-[120px] opacity-10 bg-white/5" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 w-full">
        <div className={`grid grid-cols-1 lg:grid-cols-12 items-center ${
          brand.designVariant === 'sampling-concierge' ? 'gap-8 lg:gap-16' : 'gap-12 lg:gap-16'
        }`}>
          
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
            <h1 className={`font-serif font-normal tracking-tight text-brand-text leading-[1.08] ${
              brand.designVariant === 'sampling-concierge'
                ? 'text-3xl sm:text-5xl lg:text-7xl'
                : 'text-4xl sm:text-6xl lg:text-7xl'
            }`}>
              {getHeroTitle()}
            </h1>

            {/* Poetic Subtitle */}
            <p className="mt-6 text-sm sm:text-base lg:text-lg text-brand-text-muted max-w-xl font-light leading-relaxed">
              {getHeroSubtitle()}
            </p>

            {/* Editorial Action Bar */}
            <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link
                href={
                  brand.designVariant === 'sampling-concierge'
                    ? `/${brand.slug}/shop`
                    : `/${brand.slug}/finder`
                }
                className="border border-brand-accent bg-brand-accent text-brand-primary-fg hover:bg-transparent hover:text-brand-text px-8 py-4 text-[11px] font-medium tracking-[0.22em] uppercase transition-all duration-300 text-center shadow-lg hover:shadow-brand-accent/10 cursor-pointer"
              >
                {brand.designVariant === 'sampling-concierge'
                  ? brand.homepage.ctaPrimary
                  : 'Find My Fragrance'}
              </Link>
              <Link
                href={
                  brand.designVariant === 'sampling-concierge'
                    ? `/${brand.slug}/shop?format=sample`
                    : `/${brand.slug}/shop`
                }
                className="border border-brand-border hover:border-brand-accent text-brand-text hover:text-brand-accent px-8 py-4 text-[11px] font-medium tracking-[0.22em] uppercase transition-all duration-300 text-center"
              >
                {brand.designVariant === 'sampling-concierge'
                  ? brand.homepage.ctaSecondary
                  : 'Explore Collection →'}
              </Link>
            </div>

            {/* Quiet Heritage Markers */}
            <div className={`border-t border-brand-border-light flex items-center gap-8 sm:gap-12 ${
              brand.designVariant === 'sampling-concierge' ? 'mt-8 pt-6' : 'mt-12 pt-8'
            }`}>
              <div>
                <span className="block font-serif text-xl sm:text-2xl text-brand-text font-light">
                  {brand.designVariant === 'oriental-artisanal'
                    ? '100%'
                    : brand.designVariant === 'luxury-editorial'
                    ? '35%'
                    : brand.designVariant === 'discovery-niche'
                    ? '10ml'
                    : brand.designVariant === 'sampling-concierge'
                    ? 'Sample'
                    : '30%'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-brand-text-muted">
                  {brand.designVariant === 'oriental-artisanal'
                    ? 'Pure Attar Oil'
                    : brand.designVariant === 'luxury-editorial'
                    ? 'Pure Extrait'
                    : brand.designVariant === 'discovery-niche'
                    ? 'Pocket Trials'
                    : brand.designVariant === 'sampling-concierge'
                    ? 'Before Full Size'
                    : 'Oil Strength'}
                </span>
              </div>
              <div className="h-8 w-px bg-brand-border-light" />
              <div>
                <span className="block font-serif text-xl sm:text-2xl text-brand-text font-light">
                  {brand.designVariant === 'discovery-niche'
                    ? '42°C'
                    : brand.designVariant === 'sampling-concierge'
                    ? '6'
                    : '10-12h'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-brand-text-muted">
                  {brand.designVariant === 'discovery-niche'
                    ? 'Heat Resilience'
                    : brand.designVariant === 'sampling-concierge'
                    ? 'Formats to Try'
                    : 'Endurance'}
                </span>
              </div>
              <div className="h-8 w-px bg-brand-border-light" />
              <div>
                <span className="block font-serif text-xl sm:text-2xl text-brand-text font-light">
                  {brand.designVariant === 'discovery-niche'
                    ? '₹149'
                    : brand.designVariant === 'sampling-concierge'
                    ? '200+'
                    : 'Private'}
                </span>
                <span className="text-[10px] uppercase tracking-[0.18em] text-brand-text-muted">
                  {brand.designVariant === 'discovery-niche'
                    ? 'Trials First'
                    : brand.designVariant === 'sampling-concierge'
                    ? 'Houses Stocked'
                    : 'Consultation'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Product Hero Visual Stage */}
          {heroProduct && (
            <div className="lg:col-span-5 flex justify-center">
              <Link
                href={`/${brand.slug}/product/${heroProduct.slug}`}
                className={`group relative w-full flex flex-col items-center justify-between rounded-none border border-brand-border bg-brand-surface/70 backdrop-blur-sm hover:border-brand-accent/40 transition-all duration-700 overflow-hidden shadow-sm ${
                  brand.designVariant === 'sampling-concierge'
                    ? 'max-w-[240px] sm:max-w-[360px] lg:max-w-[420px] mx-auto aspect-[3/4] p-5 sm:p-8'
                    : 'max-w-[360px] sm:max-w-[420px] aspect-[3/4] p-8'
                }`}
              >
                {/* Subtle Radial Glow */}
                <div
                  className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent pointer-events-none"
                />

                {/* Top Badge */}
                <div className="relative z-10 w-full flex justify-between items-center text-[10px] tracking-[0.2em] uppercase text-brand-text-muted">
                  <span>{brand.designVariant === 'sampling-concierge' ? 'Featured' : 'Featured Blend'}</span>
                  <span className="text-brand-accent">₹{heroProduct.price}</span>
                </div>

                {/* Hero Bottle Focal Point */}
                <div className="relative z-10 my-auto py-4 transition-transform duration-700 ease-out group-hover:scale-104">
                  <BottleVisual product={heroProduct} brand={brand} size="lg" priority />
                </div>

                {/* Bottom Product Monograph */}
                <div className="relative z-10 w-full text-center border-t border-brand-border-light pt-4">
                  <h3 className="font-serif text-lg font-normal text-brand-text tracking-wide group-hover:text-brand-accent transition-colors">
                    {heroProduct.name}
                  </h3>
                  <p className="text-[11px] text-brand-text-muted mt-1 capitalize font-light">
                    {brand.designVariant === 'sampling-concierge'
                      ? heroProduct.size
                      : `${heroProduct.fragranceFamily.slice(0, 2).join(' · ')} — ${heroProduct.intensity} presence`}
                  </p>
                  <span className="text-[10px] tracking-[0.2em] uppercase text-brand-accent mt-2 block opacity-0 group-hover:opacity-100 transition-opacity">
                    {brand.designVariant === 'sampling-concierge' ? 'View product →' : 'Discover Details →'}
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

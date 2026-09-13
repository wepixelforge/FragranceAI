'use client';

import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

interface HeroSectionProps {
  brand: BrandConfig;
}

export default function HeroSection({ brand }: HeroSectionProps) {
  const heroType = brand.layout?.heroType || 'split-catalogue';

  // ── 1. CENTERED ORIENTAL HERO (Arabian Aroma) ──────────────────────────────
  if (heroType === 'centered-oriental') {
    return (
      <section className="relative overflow-hidden bg-gradient-to-b from-[#071120] via-[#0B1A2F] to-[#071120] text-[#FAF6EF] py-20 sm:py-28 border-b border-[#E5A93C]/30">
        {/* Subtle Islamic Geometric Pattern Backdrop */}
        <div className="absolute inset-0 bg-[radial-gradient(#E5A93C_1px,transparent_1px)] [background-size:24px_24px] opacity-15 pointer-events-none" />

        {/* Golden Central Aura */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[550px] w-[550px] rounded-full bg-[#E5A93C] blur-[150px] opacity-15 pointer-events-none" />

        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 text-center">
          {/* Brand Heritage Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E5A93C]/40 bg-[#E5A93C]/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-[#E5A93C] uppercase mb-6 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[#E5A93C]" />
            {brand.badgeText}
          </div>

          {/* Centered Heading */}
          <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#FAF6EF] leading-tight">
            {brand.homepage.heroTitle}
          </h1>

          {/* Heritage Subtitle */}
          <p className="mt-6 text-base sm:text-lg text-[#DFD0B8] max-w-2xl mx-auto leading-relaxed">
            {brand.homepage.heroSubtitle}
          </p>

          {/* Dual CTAs: Shop First, Scent Advisor Second */}
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={`/${brand.slug}/shop`}
              className="w-full sm:w-auto rounded-full px-8 py-4 text-sm font-bold uppercase tracking-wider transition-all duration-200 bg-[#E5A93C] text-[#071120] hover:bg-[#F3B74B] shadow-xl hover:shadow-[#E5A93C]/20"
            >
              {brand.homepage.ctaPrimary}
            </Link>
            <Link
              href={`/${brand.slug}/finder`}
              className="w-full sm:w-auto rounded-full border border-[#E5A93C]/60 bg-[#071120]/80 backdrop-blur-md px-8 py-4 text-sm font-semibold tracking-wider text-[#FAF6EF] hover:border-[#E5A93C] hover:bg-[#E5A93C]/10 transition-all flex items-center justify-center gap-2"
            >
              <span>✦</span>
              <span>{brand.homepage.ctaSecondary}</span>
            </Link>
          </div>

          {/* Atmospheric Bottle Display Trio */}
          <div className="mt-16 flex items-center justify-center gap-6 sm:gap-10">
            {/* Left Bottle */}
            <div className="hidden sm:flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
              <div className="h-24 w-12 rounded-t-md rounded-b-xl border border-[#D4AF37]/30 bg-gradient-to-t from-amber-950/80 to-transparent p-1 shadow-lg" />
              <span className="text-[10px] text-[#DFD0B8] mt-2">White Amber</span>
            </div>

            {/* Centerpiece Bottle */}
            <div className="flex flex-col items-center scale-110 sm:scale-125">
              <div className="relative flex flex-col items-center">
                <div className="h-4 w-6 rounded-t-full bg-gradient-to-b from-[#FFF3B0] to-[#D4AF37] shadow-md border-b border-[#735712]" />
                <div className="relative h-36 w-20 rounded-t-md rounded-b-2xl border border-[#E5A93C] bg-gradient-to-b from-[#1C1108] to-[#0D1826] p-2 flex flex-col justify-between items-center shadow-2xl">
                  <span className="text-[8px] font-bold tracking-[0.25em] text-[#E5A93C] uppercase mt-2">AA</span>
                  <span className="text-[6px] font-serif font-bold text-white uppercase text-center">Dehn Al Oud Royal</span>
                  <div className="h-1.5 w-full bg-white/20 rounded-b-xl" />
                </div>
              </div>
              <span className="text-xs font-serif font-bold text-[#E5A93C] mt-4">Pure Concentrated Oil</span>
            </div>

            {/* Right Bottle */}
            <div className="hidden sm:flex flex-col items-center opacity-60 hover:opacity-100 transition-opacity">
              <div className="h-24 w-12 rounded-t-md rounded-b-xl border border-[#D4AF37]/30 bg-gradient-to-t from-rose-950/80 to-transparent p-1 shadow-lg" />
              <span className="text-[10px] text-[#DFD0B8] mt-2">Taif Rose</span>
            </div>
          </div>

          {/* Three Heritage Pillars */}
          <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12 border-t border-[#E5A93C]/20 text-left">
            <div className="rounded-2xl border border-[#DFD0B8]/20 bg-white/5 p-5 backdrop-blur-sm">
              <span className="text-[#E5A93C] font-serif text-lg">01</span>
              <h3 className="font-serif font-bold text-base text-[#FAF6EF] mt-1">100% Alcohol-Free</h3>
              <p className="text-xs text-[#DFD0B8] mt-1 leading-relaxed">
                Formulated as pure perfume oil extracts that never dry out your skin or project synthetic fumes.
              </p>
            </div>
            <div className="rounded-2xl border border-[#DFD0B8]/20 bg-white/5 p-5 backdrop-blur-sm">
              <span className="text-[#E5A93C] font-serif text-lg">02</span>
              <h3 className="font-serif font-bold text-base text-[#FAF6EF] mt-1">Traditional Aged Ouds</h3>
              <p className="text-xs text-[#DFD0B8] mt-1 leading-relaxed">
                Authentic Assam and Cambodian agarwood distillations, cured for smokiness and enduring warmth.
              </p>
            </div>
            <div className="rounded-2xl border border-[#DFD0B8]/20 bg-white/5 p-5 backdrop-blur-sm">
              <span className="text-[#E5A93C] font-serif text-lg">03</span>
              <h3 className="font-serif font-bold text-base text-[#FAF6EF] mt-1">Pulse Point Roll-On</h3>
              <p className="text-xs text-[#DFD0B8] mt-1 leading-relaxed">
                Pocket-friendly 6ml & 12ml crystalline vials designed for targeted application that warms over hours.
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── 2. EDITORIAL ASYMMETRIC HERO (Al-Maham Fragrances) ─────────────────────
  if (heroType === 'editorial-asymmetric') {
    return (
      <section className="relative overflow-hidden bg-[#041A14] text-[#F9F8F5] py-20 sm:py-28 border-b border-[#D4AF37]/30">
        {/* Subtle Ambient Glow */}
        <div className="absolute top-1/3 right-10 h-96 w-96 rounded-full bg-[#D4AF37] blur-[160px] opacity-15 pointer-events-none" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            
            {/* Left Column: Monolithic Editorial Text */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 border border-[#D4AF37]/40 bg-[#D4AF37]/10 px-3.5 py-1 text-[10px] font-mono tracking-[0.3em] text-[#D4AF37] uppercase mb-6">
                {brand.badgeText}
              </div>

              <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-normal tracking-tight text-[#F9F8F5] leading-[1.12]">
                {brand.homepage.heroTitle}
              </h1>

              <p className="mt-6 text-base sm:text-lg text-[#D8D0C2] leading-relaxed max-w-xl font-serif">
                {brand.homepage.heroSubtitle}
              </p>

              {/* Dual CTAs */}
              <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  href={`/${brand.slug}/shop`}
                  className="bg-[#D4AF37] text-[#041A14] px-8 py-4 text-xs font-serif font-bold uppercase tracking-widest hover:bg-[#E6CA65] transition-colors text-center shadow-xl"
                >
                  {brand.homepage.ctaPrimary}
                </Link>
                <Link
                  href={`/${brand.slug}/finder`}
                  className="border border-[#D4AF37]/60 bg-transparent text-[#D4AF37] px-8 py-4 text-xs font-serif tracking-widest uppercase hover:bg-[#D4AF37]/10 transition-colors text-center flex items-center justify-center gap-2"
                >
                  <span>✦</span>
                  <span>{brand.homepage.ctaSecondary}</span>
                </Link>
              </div>

              {/* Atelier Pillars */}
              <div className="mt-12 pt-8 border-t border-[#D4AF37]/20 flex items-center gap-8 text-xs font-serif">
                <div>
                  <span className="block text-lg font-bold text-[#D4AF37]">35% Extrait</span>
                  <span className="text-[#D8D0C2]/80">Pure Oil Concentration</span>
                </div>
                <div className="h-8 w-px bg-[#D4AF37]/30" />
                <div>
                  <span className="block text-lg font-bold text-[#D4AF37]">12+ Hours</span>
                  <span className="text-[#D8D0C2]/80">Boardroom & Gala Sillage</span>
                </div>
                <div className="h-8 w-px bg-[#D4AF37]/30" />
                <div>
                  <span className="block text-lg font-bold text-[#D4AF37]">Haute Niche</span>
                  <span className="text-[#D8D0C2]/80">Hand-Blended In Small Batches</span>
                </div>
              </div>
            </div>

            {/* Right Column: High-Fashion Monolith Showcase Card */}
            <div className="lg:col-span-5 flex justify-center">
              <div className="w-full max-w-md border border-[#D4AF37]/40 bg-gradient-to-b from-[#020A07] via-[#041A14] to-[#010805] p-8 shadow-2xl text-center relative">
                <div className="border border-[#D4AF37]/20 p-6">
                  <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-3 mb-6">
                    <span className="text-[10px] font-mono tracking-[0.3em] text-[#D4AF37] uppercase">
                      THE ATELIER COLLECTION
                    </span>
                    <span className="text-[9px] font-mono bg-[#D4AF37] text-[#041A14] px-2 py-0.5 font-bold">
                      35% PURE EXTRAIT
                    </span>
                  </div>

                  {/* Bottle Graphic Preview */}
                  <div className="my-6 flex flex-col items-center">
                    <div className="h-5 w-12 bg-gradient-to-r from-[#B8860B] via-[#E6CA65] to-[#8B6508] shadow-md" />
                    <div className="h-40 w-24 border border-white/20 bg-gradient-to-b from-amber-950/80 via-emerald-950/60 to-black p-2 flex flex-col items-center justify-center shadow-2xl relative">
                      <div className="border border-[#D4AF37] bg-[#041A14] p-2 text-center w-full">
                        <span className="text-[8px] font-serif tracking-widest text-[#D4AF37] block">AL-MAHAM</span>
                        <span className="text-[7px] font-serif italic text-white block mt-0.5">Sovereign Elysium</span>
                      </div>
                    </div>
                  </div>

                  <h3 className="font-serif text-2xl font-normal text-white mt-4">
                    Sovereign Elysium Extrait
                  </h3>
                  <p className="text-xs font-serif italic text-[#D8D0C2] mt-1">
                    Inspired by Roja Elysium Parfum Pour Homme
                  </p>
                  <p className="text-xs text-[#D8D0C2]/80 mt-3 leading-relaxed">
                    Crisp grapefruit and zesty lime cascading into rare cedarwood, ambergris, and pink pepper. Formulated for 12-hour boardroom and evening projection.
                  </p>

                  <div className="mt-6 flex items-center justify-between border-t border-[#D4AF37]/20 pt-4">
                    <span className="font-serif text-xl text-[#D4AF37]">₹1,299</span>
                    <Link
                      href={`/${brand.slug}/product/sovereign-elysium`}
                      className="border border-[#D4AF37] bg-transparent text-[#D4AF37] px-4 py-2 text-xs font-serif tracking-wider uppercase hover:bg-[#D4AF37] hover:text-[#041A14] transition-all"
                    >
                      Examine Profile →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    );
  }

  // ── 3. DISCOVERY LAB WORKBENCH HERO (World of Perfumers) ───────────────────
  if (heroType === 'discovery-lab') {
    return (
      <section className="relative overflow-hidden bg-[#0B1120] text-slate-100 py-16 sm:py-24 border-b border-slate-800">
        {/* Technical Grid Lines */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

        {/* Electric Blue Lab Glow */}
        <div className="absolute top-1/4 left-1/3 h-80 w-80 rounded-full bg-[#0284C7] blur-[150px] opacity-20 pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            
            {/* Left: Technical Discovery Narrative */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-md border border-[#0284C7]/40 bg-[#0284C7]/10 px-3 py-1 text-xs font-mono text-[#38BDF8] mb-4">
                <span className="h-2 w-2 rounded-full bg-[#38BDF8] animate-ping" />
                {brand.badgeText}
              </div>

              <h1 className="font-sans text-3xl sm:text-5xl font-black tracking-tight text-white uppercase leading-tight">
                {brand.homepage.heroTitle}
              </h1>

              <p className="mt-4 text-base text-slate-300 max-w-xl leading-relaxed">
                {brand.homepage.heroSubtitle}
              </p>

              {/* Dual CTAs */}
              <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
                <Link
                  href={`/${brand.slug}/shop`}
                  className="rounded-lg px-8 py-4 text-xs font-bold font-mono uppercase tracking-wider bg-[#0284C7] text-white hover:bg-[#0369A1] transition-all shadow-xl text-center"
                >
                  {brand.homepage.ctaPrimary}
                </Link>
                <Link
                  href={`/${brand.slug}/finder`}
                  className="rounded-lg border border-slate-700 bg-slate-800/80 px-8 py-4 text-xs font-mono tracking-wider text-slate-200 hover:border-[#0284C7] hover:text-white transition-all text-center flex items-center justify-center gap-2"
                >
                  <span>✦</span>
                  <span>{brand.homepage.ctaSecondary}</span>
                </Link>
              </div>

              {/* Lab Protocol Metrics */}
              <div className="mt-10 pt-6 border-t border-slate-800 grid grid-cols-3 gap-4 font-mono text-left">
                <div>
                  <span className="block text-base sm:text-lg font-bold text-white">42°C Tested</span>
                  <span className="text-[11px] text-slate-400">High-Heat Adhesion</span>
                </div>
                <div>
                  <span className="block text-base sm:text-lg font-bold text-[#38BDF8]">₹149 Trials</span>
                  <span className="text-[11px] text-slate-400">10ml Pocket Sprays</span>
                </div>
                <div>
                  <span className="block text-base sm:text-lg font-bold text-emerald-400">Nikhil Singhal</span>
                  <span className="text-[11px] text-slate-400">Master Perfumer</span>
                </div>
              </div>
            </div>

            {/* Right: Technical Spec / Pocket Trial Feature */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6 shadow-2xl backdrop-blur-md">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full bg-emerald-500" />
                    <span className="text-xs font-mono font-bold text-white uppercase">
                      CLIMATE RESILIENCE PROTOCOL
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[#38BDF8] bg-[#0284C7]/20 px-2 py-0.5 rounded">
                    SUGANDHIM LABS
                  </span>
                </div>

                <div className="my-5 grid grid-cols-2 gap-3 text-left font-mono">
                  <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 block">Trial Format</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">10ml Pocket Spray</span>
                    <span className="text-[11px] text-emerald-400 font-semibold">From ₹149</span>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 p-3 border border-slate-700/50">
                    <span className="text-[10px] text-slate-400 block">Temperature Spec</span>
                    <span className="text-sm font-bold text-white mt-0.5 block">Tested to 42°C</span>
                    <span className="text-[11px] text-[#38BDF8] font-semibold">High Heat Adhesion</span>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div>
                    <span className="text-[9px] font-mono text-slate-400 uppercase">RECOMMENDED DISCOVERY:</span>
                    <h4 className="text-sm font-bold text-white mt-0.5">Coastal Surge EDP</h4>
                    <p className="text-xs text-slate-400 mt-0.5 font-sans">
                      Italian bergamot + cold sea salt + ambroxan. Engineered to remain crisp and sharp through humid transit.
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                    <span className="font-mono text-[#38BDF8] font-bold">₹149 / 10ml · ₹699 / 50ml</span>
                    <Link
                      href={`/${brand.slug}/product/coastal-surge-edp`}
                      className="rounded bg-[#0284C7] px-3 py-1.5 font-mono text-[11px] font-bold text-white hover:bg-[#0369A1] transition-colors"
                    >
                      View Formula →
                    </Link>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    );
  }

  // ── 4. SPLIT CATALOGUE HERO (TM Perfume House / Default) ───────────────────
  return (
    <section className="relative overflow-hidden border-b border-brand-border-light bg-gradient-to-b from-brand-bg via-brand-surface to-brand-bg py-16 sm:py-24">
      {/* Ambient glow */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full blur-3xl opacity-15 pointer-events-none"
        style={{ backgroundColor: brand.colors.accent }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-12">
          
          {/* Left Column: Brand Framing & Emotion */}
          <div className="lg:col-span-7 animate-fade-in-up">
            {/* Concept Demo Badge */}
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-3.5 py-1 text-xs font-semibold tracking-wider uppercase shadow-sm"
              style={{
                borderColor: `${brand.colors.accent}40`,
                backgroundColor: `${brand.colors.accent}12`,
                color: brand.colors.accent,
              }}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: brand.colors.accent }} />
              {brand.badgeText}
            </div>

            {/* Clear Brand Headline */}
            <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-brand-text leading-[1.18]">
              {brand.homepage.heroTitle}
            </h1>

            {/* Subtitle selling the perfume house */}
            <p className="mt-4 text-base sm:text-lg leading-relaxed text-brand-text-muted max-w-xl">
              {brand.homepage.heroSubtitle}
            </p>

            {/* Dual CTAs: Shop Primary, Scent Concierge Secondary */}
            <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 max-w-lg">
              <Link
                href={`/${brand.slug}/shop`}
                className="rounded-xl px-8 py-4 text-sm font-semibold text-center transition-all duration-200 hover:opacity-90 shadow-lg"
                style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
              >
                {brand.homepage.ctaPrimary}
              </Link>
              <Link
                href={`/${brand.slug}/finder`}
                className="rounded-xl border border-brand-border bg-brand-surface px-6 py-4 text-sm font-medium text-brand-text hover:border-brand-accent hover:shadow-md transition-all text-center flex items-center justify-center gap-2"
              >
                <span style={{ color: brand.colors.accent }}>✦</span>
                <span>{brand.homepage.ctaSecondary}</span>
              </Link>
            </div>

            {/* Value / Trust Signals */}
            <div className="mt-10 grid grid-cols-3 gap-4 border-t border-brand-border-light pt-6 text-left">
              <div>
                <span className="block text-base sm:text-lg font-serif font-bold text-brand-text">380+ Extraits</span>
                <span className="text-xs text-brand-text-muted">Masterpiece Inspirations</span>
              </div>
              <div>
                <span className="block text-base sm:text-lg font-serif font-bold text-brand-text">30% Oil</span>
                <span className="text-xs text-brand-text-muted">Pure Extrait Strength</span>
              </div>
              <div>
                <span className="block text-base sm:text-lg font-serif font-bold text-brand-text">All India</span>
                <span className="text-xs text-brand-text-muted">Express Delivery</span>
              </div>
            </div>
          </div>

          {/* Right Column: Hero Flacon Visual Showcase */}
          <div className="lg:col-span-5 flex items-center justify-center">
            <div className="w-full max-w-md rounded-3xl border border-brand-border-light bg-brand-surface p-7 shadow-2xl relative overflow-hidden">
              {/* Card top banner */}
              <div className="flex items-center justify-between border-b border-brand-border-light pb-4">
                <div className="flex items-center gap-2.5">
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm"
                    style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
                  >
                    {brand.monogram}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-brand-text tracking-wide uppercase">
                      Featured Creation
                    </h3>
                    <p className="text-[10px] text-brand-text-muted">Handcrafted in small batches</p>
                  </div>
                </div>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                  Best Seller
                </span>
              </div>

              {/* Matched Product Preview */}
              <div className="my-6 flex items-center gap-5 rounded-2xl bg-gradient-to-br from-neutral-900 to-neutral-950 p-5 text-white shadow-xl">
                {/* Flacon Graphic */}
                <div className="relative h-28 w-18 shrink-0 rounded-md glass-flacon border border-white/20 bg-gradient-to-t from-amber-950 via-amber-800/60 to-transparent flex flex-col items-center justify-between p-1.5 shadow-md">
                  <div className="metallic-cap-gold h-3 w-6 rounded-t-xs -mt-1 shadow-sm" />
                  <div className="my-auto text-center">
                    <span className="block text-[8px] font-bold tracking-widest text-[#D4AF37]">
                      {brand.monogram}
                    </span>
                    <span className="block text-[6px] text-white/80 font-medium">
                      50ML
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-white/30 rounded-xs" />
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full bg-[#D4AF37]/20 text-[#D4AF37] text-[9px] font-bold px-2 py-0.5">
                      30% Extrait
                    </span>
                    <span className="text-[10px] text-white/60">Long-Lasting</span>
                  </div>
                  <h4 className="font-serif text-lg font-bold text-white mt-1 truncate">
                    Midnight Velvet
                  </h4>
                  <p className="text-xs text-white/70 line-clamp-1 mt-0.5">
                    Bourbon Vanilla · Tonka Bean · Warm Amber
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-sm font-bold text-[#D4AF37]">₹899</span>
                    <span className="text-[10px] text-white/50">Free Shipping</span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <Link
                href={`/${brand.slug}/product/midnight-velvet`}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-xs font-semibold transition-all duration-200 shadow-md hover:opacity-95"
                style={{ backgroundColor: brand.colors.accent, color: brand.colors.accentForeground }}
              >
                View Fragrance Profile →
              </Link>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

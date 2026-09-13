'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandConfig } from '@/types/brand';

interface QuickDiscoverySectionProps {
  brand: BrandConfig;
}

export default function QuickDiscoverySection({ brand }: QuickDiscoverySectionProps) {
  const router = useRouter();

  const getSectionContent = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return {
          eyebrow: '✦ Traditional Scent Advisor',
          title: 'Not Sure Which Attar Suits You?',
          description: 'Traditional perfumery terms like Dehn, Mukhallat, and Shamama can feel unfamiliar. Describe the mood, occasion, or feeling you want to evoke, and our advisor will select the right pure oil.',
          cta: 'Consult Scent Advisor',
          pills: [
            { label: 'Warm & elegant for special evenings', q: 'Something warm and elegant for a special evening' },
            { label: 'Fresh alcohol-free for daily wear', q: 'Fresh and alcohol-free for everyday office wear' },
            { label: 'Traditional dehn al oud for weddings', q: 'Traditional dehn al oud for weddings and festive prayers' },
            { label: 'Sweet honeyed amber roll-on under ₹600', q: 'A sweet honeyed amber roll-on under ₹600' },
          ],
        };
      case 'luxury-editorial':
        return {
          eyebrow: '✦ Private Consultation',
          title: 'Curate a Scent That Suits Your Stature',
          description: 'True luxury is not about browsing dozens of bottles — it is about finding the singular expression that mirrors your character. Share an atmosphere or a niche house you admire for private curation.',
          cta: 'Begin Private Consultation',
          pills: [
            { label: 'Roja Elysium inspired expression', q: 'An inspired expression of Roja Elysium with crisp citrus' },
            { label: 'Warm boozy Kilian Angels\' Share', q: 'A warm boozy gourmand like Kilian Angels Share' },
            { label: 'Aristocratic & confident boardroom wear', q: 'Something that smells aristocratic, rare, and confident' },
            { label: 'Commanding black-tie leather and oud', q: 'A commanding winter leather and oud for black-tie galas' },
          ],
        };
      case 'discovery-niche':
        return {
          eyebrow: '✦ Scent Profile Consultant',
          title: 'Stop Blind-Buying 100ml Bottles',
          description: 'Tell us what you usually wear, your daily transit conditions, or what you enjoy. We will map your olfactory taste to climate-tested formulas with 10ml pocket discovery sprays from ₹149.',
          cta: 'Match Scent Profile',
          pills: [
            { label: 'Fresh and clean for college & commute', q: 'I like fresh, clean fragrances for daily college wear' },
            { label: 'Date night under ₹800', q: 'Something for a date night under ₹800' },
            { label: 'Survives 40°C Indian summer heat', q: 'Like Dior Sauvage but long-lasting in summer heat' },
            { label: 'Cozy cardamom chai for monsoons', q: 'A cozy cardamom chai scent for rainy monsoons' },
          ],
        };
      default:
        return {
          eyebrow: '✦ Personal Scent Concierge',
          title: 'Not Sure What to Wear?',
          description: 'You don\'t need to understand complex fragrance note pyramids. Describe the occasion, your budget, or a perfume you already love, and our concierge will recommend the perfect match from our 380+ extraits.',
          cta: 'Find My Scent',
          pills: [
            { label: 'Date night under ₹1,000', q: 'What should I wear on a date night under ₹1,000?' },
            { label: 'Fresh & clean for office wear', q: 'Something fresh and clean for office use' },
            { label: 'Similar to Dior Sauvage but warmer', q: 'I like Dior Sauvage but want something warmer' },
            { label: 'I hate sweet perfumes. Something woody', q: 'I hate very sweet perfumes. Give me something woody' },
          ],
        };
    }
  };

  const content = getSectionContent();

  return (
    <section className="py-20 sm:py-24 border-t border-brand-border-light bg-brand-surface relative overflow-hidden">
      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-80 w-80 rounded-full blur-[130px] opacity-10 pointer-events-none"
        style={{ backgroundColor: brand.colors.accent }}
      />

      <div className="relative mx-auto max-w-4xl px-4 sm:px-6 text-center">
        {/* Eyebrow badge */}
        <span
          className="text-xs font-bold uppercase tracking-widest block mb-3"
          style={{ color: brand.colors.accent }}
        >
          {content.eyebrow}
        </span>

        {/* Headline */}
        <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-brand-text">
          {content.title}
        </h2>

        {/* Description */}
        <p className="mt-4 text-base sm:text-lg text-brand-text-muted max-w-2xl mx-auto leading-relaxed">
          {content.description}
        </p>

        {/* Curated consultation scenario pills */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-2 max-w-2xl mx-auto">
          {content.pills.map((pill, i) => (
            <button
              key={i}
              onClick={() => router.push(`/${brand.slug}/finder?q=${encodeURIComponent(pill.q)}`)}
              className="rounded-full border border-brand-border bg-brand-bg px-4 py-2 text-xs font-medium text-brand-text hover:border-brand-accent hover:shadow-sm transition-all"
            >
              &ldquo;{pill.label}&rdquo;
            </button>
          ))}
        </div>

        {/* Primary Action Button */}
        <div className="mt-8 flex items-center justify-center">
          <Link
            href={`/${brand.slug}/finder`}
            className="rounded-xl px-8 py-4 text-sm font-semibold transition-all duration-200 hover:opacity-90 shadow-lg flex items-center gap-2"
            style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
          >
            <span>{content.cta}</span>
            <span>→</span>
          </Link>
        </div>

        <p className="mt-4 text-xs text-brand-text-muted">
          Instant recommendations based on your occasion, notes, or favorite fragrance style.
        </p>
      </div>
    </section>
  );
}

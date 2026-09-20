import Link from 'next/link';
import { BrandConfig } from '@/types/brand';

interface QuickDiscoverySectionProps {
  brand: BrandConfig;
}

export default function QuickDiscoverySection({ brand }: QuickDiscoverySectionProps) {

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
    <section className="py-24 sm:py-32 border-t border-brand-border bg-brand-surface/20 relative overflow-hidden">
      {/* Ambient subtle glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full blur-[140px] opacity-10 pointer-events-none"
        style={{ backgroundColor: brand.colors.accent }}
      />

      <div className="relative mx-auto max-w-3xl px-4 sm:px-6 text-center">
        {/* Eyebrow badge */}
        <span
          className="text-[10px] uppercase tracking-widest block mb-4 font-mono"
          style={{ color: brand.colors.accent }}
        >
          {content.eyebrow}
        </span>

        {/* Headline */}
        <h2 className="editorial-title font-serif text-3xl sm:text-5xl font-normal tracking-tight text-brand-text leading-tight">
          {content.title}
        </h2>

        {/* Description */}
        <p className="mt-5 text-sm sm:text-base text-brand-text-muted max-w-xl mx-auto leading-relaxed">
          {content.description}
        </p>

        {/* Curated consultation inquiry chips */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-2.5 max-w-2xl mx-auto">
          {content.pills.map((pill, i) => (
            <Link
              key={i}
              href={`/${brand.slug}/finder?q=${encodeURIComponent(pill.q)}`}
              className="hairline-border rounded-full bg-brand-surface/60 px-4 py-2 text-xs text-brand-text-muted hover:text-brand-text hover:border-brand-accent/50 transition-all duration-200"
            >
              &ldquo;{pill.label}&rdquo;
            </Link>
          ))}
        </div>

        {/* Primary Action Button */}
        <div className="mt-10 flex items-center justify-center">
          <Link
            href={`/${brand.slug}/finder`}
            className="group hairline-border rounded-full px-8 py-3.5 text-xs uppercase tracking-widest font-medium transition-all duration-300 hover:border-brand-accent hover:text-brand-accent flex items-center gap-3"
            style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: brand.colors.accent }}
          >
            <span>{content.cta}</span>
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </Link>
        </div>

        <p className="mt-4 text-[11px] uppercase tracking-widest text-brand-text-muted/60 font-mono">
          Interactive consultation · Tailored to occasion, climate & notes
        </p>
      </div>
    </section>
  );
}

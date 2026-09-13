import { BrandConfig } from '@/types/brand';

interface BusinessValueSectionProps {
  brand: BrandConfig;
}

const businessPillars = [
  {
    tag: 'PRODUCT DISCOVERY',
    title: 'Easier Product Discovery',
    description: 'Can help customers discover fragrances they might otherwise overlook by translating everyday descriptions — like "something fresh for everyday wear" — into relevant catalogue matches.',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    ),
  },
  {
    tag: 'CATALOGUE NAVIGATION',
    title: 'Better Catalogue Navigation',
    description: 'Can make large catalogues easier to navigate. Instead of browsing page after page of bottles, customers get guided directly to products that fit their specific situation.',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    tag: 'CONFIDENCE & CLARITY',
    title: 'Reduced Decision Friction',
    description: 'Can help reduce decision friction by explaining why each fragrance matches, giving shoppers greater confidence before they commit to a purchase online.',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    tag: 'STYLE COMPARISON',
    title: 'Product Comparison & Alternatives',
    description: 'Can help customers find alternatives when they already know a scent style they enjoy (such as a familiar designer fragrance), mapping reference styles to your own blends.',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    ),
  },
  {
    tag: 'PERSONALIZATION',
    title: 'Personalized Recommendations',
    description: 'Can adapt recommendations to personal preferences — respecting strict budget caps, preferred scent families, and desired longevity without complex filter menus.',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
  {
    tag: 'GIFTING GUIDANCE',
    title: 'Thoughtful Gift Recommendations',
    description: 'Can assist gift buyers who may know nothing about perfumery by guiding them through simple recipient-focused prompts ("a gift for my brother under ₹1,200").',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    ),
  },
];

export default function BusinessValueSection({ brand }: BusinessValueSectionProps) {
  return (
    <section className="py-20 sm:py-24 border-t border-brand-border-light bg-brand-surface">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center mb-16">
          <span
            className="rounded-full border px-3.5 py-1 text-xs font-semibold uppercase tracking-wider inline-block"
            style={{ borderColor: `${brand.colors.accent}40`, color: brand.colors.accent }}
          >
            How Guided Discovery Helps
          </span>
          <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-brand-text mt-4">
            {brand.homepage.valuePropositionTitle || 'Helping Customers Choose with Confidence'}
          </h2>
          <p className="mt-4 text-base text-brand-text-muted leading-relaxed">
            {brand.homepage.valuePropositionSubtitle || 'Buying fragrance online is inherently difficult because shoppers cannot smell notes through a screen. A guided, conversational discovery experience bridges that gap.'}
          </p>
        </div>

        {/* 6 Tasteful Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {businessPillars.map((pillar, index) => (
            <div
              key={index}
              className="rounded-2xl border border-brand-border-light bg-brand-bg p-6 sm:p-7 transition-all duration-200 hover:border-brand-accent/40"
            >
              <div
                className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${brand.colors.accent}15`, color: brand.colors.accent }}
              >
                {pillar.icon}
              </div>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-brand-accent mb-1.5">
                {pillar.tag}
              </span>
              <h3 className="font-serif text-lg font-bold text-brand-text mb-2">
                {pillar.title}
              </h3>
              <p className="text-xs sm:text-sm text-brand-text-muted leading-relaxed">
                {pillar.description}
              </p>
            </div>
          ))}
        </div>

        {/* Subtle Pitch CTA Box for Brand Owners */}
        <div className="mt-16 rounded-3xl border border-brand-border-light bg-gradient-to-br from-brand-surface via-brand-surface-hover to-brand-surface p-8 sm:p-12">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-accent">
                Concept Demonstration for {brand.name}
              </span>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold text-brand-text mt-2">
                Imagine this experience across your entire fragrance collection.
              </h3>
              <p className="mt-3 text-sm sm:text-base text-brand-text-muted leading-relaxed max-w-2xl">
                This prototype illustrates how an intelligent discovery layer can be tailored to your brand identity, product names, notes, and pricing — without rebuilding your store or relying on generic chatbots.
              </p>
            </div>
            <div className="lg:col-span-4 flex flex-col items-start lg:items-end gap-3">
              <a
                href={`/${brand.slug}/finder`}
                className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 shadow-md"
                style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
              >
                Try the Discovery Experience →
              </a>
              <span className="text-[11px] text-brand-text-muted italic">
                Interested in seeing this with your own catalogue?
              </span>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-brand-border-light/60 text-center sm:text-left">
            <p className="text-[11px] text-brand-text-muted/70">
              *Independent concept demonstration prepared for review. Not an official endorsement by {brand.name}.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

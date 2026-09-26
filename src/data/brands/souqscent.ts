import { BrandConfig } from '@/types/brand';

/**
 * SouqScent storefront config.
 *
 * Internal slug is `souqscent`. Public URL alias is /SouqScent.
 * Colour tokens are a demo approximation of a warm Gulf-retail storefront —
 * not official SouqScent hex values.
 */
export const souqscent: BrandConfig = {
  slug: 'souqscent',
  name: 'SouqScent',
  tagline: 'Original Arabic perfumes, easier to choose.',
  subTagline: 'Occasion, season, performance — then the bottle.',
  description:
    'SouqScent is a Qatar-based Arabic perfume retailer available in India, focused on authentic Middle Eastern houses with detailed fragrance guidance on every listing.',
  monogram: 'SQ',
  designVariant: 'souq-marketplace',
  badgeText: 'Arabic perfumes · India',
  origin: 'Qatar / India',
  specialty: 'Authentic Arabic and Middle Eastern perfumes with occasion, season and performance guidance',
  colors: {
    primary: '#2C2118',
    primaryForeground: '#F6EFE4',
    accent: '#C4842A',
    accentForeground: '#2C2118',
    background: '#F6EFE4',
    surface: '#FFF8EE',
    surfaceHover: '#EFE4D2',
    text: '#2C2118',
    textMuted: '#7A6A58',
    border: 'rgba(44, 33, 24, 0.14)',
    borderLight: 'rgba(44, 33, 24, 0.07)',
  },
  typography: {
    headingFont: 'serif',
    headingStyle: 'normal',
    letterSpacing: 'normal',
  },
  layout: {
    heroType: 'split-catalogue',
    cardStyle: 'modern-flacon',
    buttonShape: 'rounded-lg',
  },
  homepage: {
    heroTitle: 'Find an Arabic fragrance that fits the moment.',
    heroSubtitle:
      'Shop authentic Lattafa, Rasasi, Afnan, Armaf and other Gulf houses — then describe the occasion, season or budget if you want a quicker path through the catalogue.',
    ctaPrimary: 'Find Your Fragrance',
    ctaSecondary: 'Shop Perfumes',
    valuePropositionTitle: 'Guidance built into the catalogue',
    valuePropositionSubtitle:
      'Every listing is meant to help you choose by scent family, occasion and how the fragrance wears — not just by bottle name.',
    sectionsOrder: ['hero', 'help', 'purposes', 'featured'],
    storyHeadline: 'A fragrance guide that also happens to sell',
    storyBody:
      'SouqScent focuses on original Arabic perfumes for Indian buyers. Tell us the weather, the occasion, how loud you want it, and what you can spend.',
  },
  finder: {
    title: 'Not sure what suits you?',
    subtitle: 'Tell me what you are looking for — occasion, style, budget, or a fragrance you already know.',
    assistantName: 'Fragrance Consultant',
    assistantTitle: 'Catalogue help',
    welcomeMessage: 'Tell me what you are looking for.',
    examplePrompts: [
      'Something fresh for the office',
      'Perfume for a wedding under ₹3,000',
      'Something long-lasting but not too loud',
      'I like sweet fragrances, what should I try?',
      'Something similar to Khamrah but less sweet',
      'Help me find my signature fragrance',
    ],
  },
  meta: {
    title: 'SouqScent — Original Arabic Perfumes in India',
    description:
      'Shop authentic Arabic and Middle Eastern perfumes. Filter by gender, family and budget, or describe what you need to the fragrance consultant.',
  },
};

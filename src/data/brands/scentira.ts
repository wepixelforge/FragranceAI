import { BrandConfig } from '@/types/brand';

/**
 * Scentira storefront config.
 *
 * Internal slug is always `scentira`. Public URL alias is /Scentira.
 * Colour tokens are demo approximations of a light commercial Shopify
 * storefront — not official brand hex values (those were unverified).
 */
export const scentira: BrandConfig = {
  slug: 'scentira',
  name: 'Scentira',
  tagline: 'Find the fragrance that\'s right for you.',
  subTagline: 'Decants, discovery sizes and full bottles.',
  description:
    'Scentira is an online fragrance destination in India for authentic designer, niche and Middle Eastern perfumes — available as discovery sizes, decants and full bottles.',
  monogram: 'SC',
  designVariant: 'decant-finder',
  badgeText: 'Decants · Discovery sets · Full bottles',
  origin: 'India',
  specialty: 'Authentic fragrances in discovery sizes, decants and full bottles',
  colors: {
    primary: '#171717',
    primaryForeground: '#FAFAFA',
    accent: '#8B5E3C',
    accentForeground: '#FAFAFA',
    background: '#FAFAFA',
    surface: '#FFFFFF',
    surfaceHover: '#F3F1EE',
    text: '#171717',
    textMuted: '#6B6560',
    border: 'rgba(23, 23, 23, 0.12)',
    borderLight: 'rgba(23, 23, 23, 0.06)',
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
    heroTitle: 'Find the fragrance that\'s right for you.',
    heroSubtitle:
      'Explore fragrances across designer, niche and Middle Eastern houses — from discovery sizes and decants to full bottles.',
    ctaPrimary: 'Find Your Fragrance',
    ctaSecondary: 'Shop Fragrances',
    valuePropositionTitle: 'Try a size that fits how you shop',
    valuePropositionSubtitle:
      'Start with a discovery size, move to a decant when you want more wears, or choose a full bottle when you already know the scent.',
    sectionsOrder: ['hero', 'help', 'formats', 'how-it-works', 'featured'],
    storyHeadline: 'A large catalogue, easier to navigate',
    storyBody:
      'Scentira carries designer, niche and Middle Eastern houses. Tell us a mood, an occasion, a budget, or a fragrance you already wear.',
  },
  finder: {
    title: 'Not sure what to choose?',
    subtitle: 'Tell us what you\'re looking for — a mood, an occasion, a budget, or a scent you already know.',
    assistantName: 'Fragrance Finder',
    assistantTitle: 'Catalogue help',
    welcomeMessage: 'Need help finding a fragrance?',
    examplePrompts: [
      'Something fresh for summer',
      'Something similar to Khamrah but less sweet',
      'Date-night fragrance under ₹3,000',
      'I don\'t know what I like',
    ],
  },
  meta: {
    title: 'Scentira — Fragrances, Decants & Discovery Sets',
    description:
      'Shop authentic designer, niche and Middle Eastern fragrances. Discovery sizes, decants and full bottles.',
  },
};

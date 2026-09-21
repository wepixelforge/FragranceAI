import { BrandConfig } from '@/types/brand';

export const thescentstories: BrandConfig = {
  slug: 'thescentstories',
  name: 'The Scent Stories',
  tagline: 'Find your next fragrance.',
  subTagline: 'Authentic samples, pocket sizes, discovery sets and full bottles.',
  description:
    'An authorised multi-brand fragrance retailer for authentic, factory-sealed samples, vials, pocket perfumes, miniatures, testers, discovery sets and full-size bottles.',
  monogram: 'TSS',
  designVariant: 'sampling-concierge',
  badgeText: 'Authentic samples · Miniatures · Discovery sets',
  origin: 'Mumbai, India',
  specialty: 'Authentic samples, pocket perfumes, discovery sets and full-size fragrances',
  colors: {
    primary: '#1C1916',
    primaryForeground: '#F6F1E8',
    accent: '#8A6A45',
    accentForeground: '#F6F1E8',
    background: '#F6F1E8',
    surface: '#FFFCF7',
    surfaceHover: '#EFE8DC',
    text: '#1C1916',
    textMuted: '#6B645A',
    border: 'rgba(28, 25, 22, 0.12)',
    borderLight: 'rgba(28, 25, 22, 0.06)',
  },
  typography: {
    headingFont: 'serif',
    headingStyle: 'normal',
    letterSpacing: 'normal',
  },
  layout: {
    heroType: 'editorial-asymmetric',
    cardStyle: 'editorial-monolith',
    buttonShape: 'rounded-lg',
  },
  homepage: {
    heroTitle: 'Discover fragrances worth trying.',
    heroSubtitle:
      'Official samples, pocket perfumes, discovery sets and full-size bottles from houses you already know — so you can try a scent before you commit.',
    ctaPrimary: 'Shop Fragrances',
    ctaSecondary: 'Explore Samples',
    valuePropositionTitle: 'Try it before you buy the bottle',
    valuePropositionSubtitle:
      'Official brand-packaged samples, miniatures and travel sizes — wear a fragrance in real life before spending on a full bottle.',
    sectionsOrder: [
      'hero',
      'featured',
      'samples',
      'formats',
      'pocket',
      'discovery-sets',
      'purposes',
      'help',
      'how-it-works',
    ],
    storyHeadline: 'Authentic formats from 200+ houses',
    storyBody:
      'The Scent Stories stocks authentic, factory-sealed samples, pocket sizes, discovery sets and full bottles from luxury and niche houses.',
  },
  finder: {
    title: 'Need help finding a fragrance?',
    subtitle:
      'Tell me what you are looking for — a fragrance, an occasion, a budget, or a scent you already love.',
    assistantName: 'Fragrance advisor',
    assistantTitle: 'Shopping help',
    welcomeMessage: 'Need help finding a fragrance?',
    examplePrompts: [
      'Something for a date',
      'Under ₹1,000',
      'Something similar to Sauvage',
      'I want to try samples',
      'Something for travel',
    ],
  },
  meta: {
    title: 'The Scent Stories — Samples, Pocket Sizes & Full Bottles',
    description:
      'Shop authentic perfume samples, pocket sizes, discovery sets and full bottles. Try a fragrance before you commit.',
  },
};

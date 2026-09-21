export type DesignVariant = 
  | 'catalogue-modern'    // TM Perfume House: Large catalogue, high-volume e-commerce, instant prompt search
  | 'oriental-artisanal'   // Arabian Aroma: Traditional alcohol-free attars, rich ouds, warm atmospheric heritage
  | 'luxury-editorial'     // Al-Maham: High-fashion atelier, generous whitespace, bespoke consultation
  | 'discovery-niche'      // World of Perfumers: Modern discovery lab, trial sizes, climate-tested formulas
  | 'sampling-concierge';  // The Scent Stories: fragrance discovery + try-before-you-commit formats

export interface BrandConfig {
  slug: string;
  name: string;
  tagline: string;
  subTagline?: string;
  description: string;
  monogram: string;
  designVariant: DesignVariant;
  badgeText: string;
  foundingYear?: string;
  origin?: string;
  specialty: string;
  colors: {
    primary: string;
    primaryForeground: string;
    accent: string;
    accentForeground: string;
    background: string;
    surface: string;
    surfaceHover: string;
    text: string;
    textMuted: string;
    border: string;
    borderLight: string;
  };
  typography: {
    headingFont: 'serif' | 'sans';
    headingStyle: 'normal' | 'uppercase' | 'editorial-italic';
    letterSpacing: 'normal' | 'wide' | 'widest';
  };
  layout: {
    heroType: 'split-catalogue' | 'centered-oriental' | 'editorial-asymmetric' | 'discovery-lab';
    cardStyle: 'modern-flacon' | 'ornate-attar' | 'editorial-monolith' | 'minimal-spec';
    buttonShape: 'rounded-xl' | 'rounded-full' | 'rounded-none' | 'rounded-lg';
  };
  homepage: {
    heroTitle: string;
    heroSubtitle: string;
    ctaPrimary: string;
    ctaSecondary: string;
    valuePropositionTitle: string;
    valuePropositionSubtitle: string;
    sectionsOrder: Array<
      | 'hero'
      | 'quick-discovery'
      | 'featured'
      | 'fragrance-families'
      | 'story'
      | 'value'
      | 'concierge'
      | 'formats'
      | 'purposes'
      | 'how-it-works'
      | 'help'
      | 'samples'
      | 'pocket'
      | 'discovery-sets'
    >;
    storyHeadline?: string;
    storyBody?: string;
  };
  finder: {
    title: string;
    subtitle: string;
    assistantName: string;
    assistantTitle: string;
    welcomeMessage?: string;
    examplePrompts: string[];
    starterPrompts?: string[];
  };
  meta: {
    title: string;
    description: string;
  };
}

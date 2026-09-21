import { FragranceFamily, Product } from '@/types/product';

/**
 * Shared fragrance-family vocabulary.
 * Intent extraction, state, and ranking must all use this list so
 * "fruity" / typos / synonyms cannot drift from the canonical schema.
 */
export const CANONICAL_FAMILIES: FragranceFamily[] = [
  'fresh',
  'sweet',
  'woody',
  'oud',
  'floral',
  'citrus',
  'spicy',
  'aquatic',
  'musky',
  'oriental',
  'aromatic',
  'gourmand',
  'fougere',
  'green',
  'chypre',
  'fruity',
];

export const CONSULTATION_FAMILY_WORDS = [
  'fresh',
  'floral',
  'woody',
  'sweet',
  'spicy',
  'gourmand',
  'citrus',
  'aquatic',
  'oriental',
  'oud',
  'musky',
  'amber',
  'fruity',
  'aromatic',
] as const;

/** Word-boundary family matcher used by replacement / new-direction detectors. */
export const FAMILY_ALTERNATION = CONSULTATION_FAMILY_WORDS.join('|');

/**
 * Surface language → canonical family.
 * Includes obvious misspellings and natural variants — not a single hardcoded typo.
 */
const FAMILY_ALIASES: Record<string, FragranceFamily> = {
  fresh: 'fresh',
  clean: 'fresh',
  crisp: 'fresh',
  refreshing: 'fresh',
  sweet: 'sweet',
  sugary: 'sweet',
  vanilla: 'sweet',
  caramel: 'sweet',
  gourmand: 'gourmand',
  woody: 'woody',
  wood: 'woody',
  woods: 'woody',
  sandalwood: 'woody',
  cedar: 'woody',
  oud: 'oud',
  oudh: 'oud',
  agarwood: 'oud',
  floral: 'floral',
  flowers: 'floral',
  rose: 'floral',
  jasmine: 'floral',
  citrus: 'citrus',
  lemon: 'citrus',
  bergamot: 'citrus',
  aquatic: 'aquatic',
  marine: 'aquatic',
  ocean: 'aquatic',
  spicy: 'spicy',
  spice: 'spicy',
  oriental: 'oriental',
  amber: 'oriental',
  musky: 'musky',
  musk: 'musky',
  aromatic: 'aromatic',
  fruity: 'fruity',
  fruit: 'fruity',
  fruits: 'fruity',
  frooty: 'fruity',
  fruitty: 'fruity',
  fruty: 'fruity',
  fruitti: 'fruity',
  fruitier: 'fruity',
  fruitiest: 'fruity',
  fruitforward: 'fruity',
};

/** Real fruit notes already present in catalogue metadata — not invented families. */
export const FRUITY_NOTE_TOKENS = [
  'peach',
  'pear',
  'apple',
  'berry',
  'berries',
  'strawberry',
  'raspberry',
  'blackcurrant',
  'pineapple',
  'mango',
  'lychee',
  'cherry',
  'plum',
  'apricot',
  'melon',
  'grape',
  'fig',
  'red fruits',
  'granny smith',
  'fruit',
  'fruits',
  'fruity',
];

const COMPANION_FAMILIES_NOT_IMPLIED_BY_FRUITY = new Set(['fresh', 'sweet', 'citrus', 'gourmand']);

export function normalizeFragranceLanguage(text: string): string {
  if (!text) return '';
  return text
    .replace(/fruit[\s-]+forward/gi, 'fruity')
    .replace(/fruit[\s-]+fwd/gi, 'fruity')
    .replace(/\bfruitier\b/gi, 'fruity')
    .replace(/\bfruitiest\b/gi, 'fruity')
    .replace(/\bfrooty\b/gi, 'fruity')
    .replace(/\bfruitty\b/gi, 'fruity')
    .replace(/\bfruty\b/gi, 'fruity')
    .replace(/\bfruitti\b/gi, 'fruity')
    .replace(/\bfruity\s+scent\b/gi, 'fruity')
    .replace(/\bfruity\s+fragrance\b/gi, 'fruity');
}

export function extractCanonicalFamilies(text: string): FragranceFamily[] {
  const lower = normalizeFragranceLanguage(text).toLowerCase();
  const found: FragranceFamily[] = [];
  for (const [alias, family] of Object.entries(FAMILY_ALIASES)) {
    if (new RegExp(`\\b${alias}\\b`, 'i').test(lower) && !found.includes(family)) {
      found.push(family);
    }
  }
  return found;
}

/**
 * Prevent the LLM / polarity layer from translating "fruity" into fresh+sweet+citrus
 * unless the customer actually said those words.
 */
export function stripInventedCompanionFamilies(message: string, families: string[]): string[] {
  const spoken = new Set(extractCanonicalFamilies(message));
  const unique = Array.from(new Set(families.map((f) => String(f).toLowerCase().trim()).filter(Boolean)));
  if (!spoken.has('fruity')) return unique;
  return unique.filter((family) => {
    if (family === 'fruity') return true;
    if (!COMPANION_FAMILIES_NOT_IMPLIED_BY_FRUITY.has(family)) return true;
    return spoken.has(family as FragranceFamily);
  });
}

export function productHasFruityCharacter(product: Product): boolean {
  if (product.fragranceFamily.some((family) => family.toLowerCase() === 'fruity')) {
    return true;
  }
  const haystack = [
    ...product.topNotes,
    ...product.heartNotes,
    ...product.baseNotes,
    ...product.tags,
  ]
    .join(' ')
    .toLowerCase();
  return FRUITY_NOTE_TOKENS.some((token) => {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[\\s-]+');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  });
}

export function productMatchesRequestedFamily(product: Product, family: string): boolean {
  const target = family.toLowerCase().trim();
  if (!target) return false;
  if (product.fragranceFamily.some((item) => item.toLowerCase() === target)) {
    return true;
  }
  if (target === 'fruity') {
    return productHasFruityCharacter(product);
  }
  return false;
}

/**
 * After a greeting, a new shopping query should start a fresh consultation.
 * Refinements ("make it warmer", "something else") keep the active thread.
 */
export function isFreshConsultationQuery(text: string): boolean {
  const lower = normalizeFragranceLanguage(text).toLowerCase();
  if (
    /\b(make it|warmer|fresher|stronger|lighter|cheaper|something else|another option|show me more|keep|still|also)\b/i.test(
      lower
    )
  ) {
    return false;
  }
  return (
    extractCanonicalFamilies(lower).length > 0 ||
    /\b(i\s+want|i\s+need|looking\s+for|recommend|show\s+me\s+something|give\s+me\s+something)\b/i.test(lower)
  );
}

import { Product, RecommendationResult, StructuredPreferences } from '@/types/product';
import { extractUnusualConcept } from './conversation-callback';

export type ScentConceptKind =
  | 'none'
  | 'fragrance_direction'
  | 'catalogue_grounded'
  | 'unsupported_object'
  | 'unsupported_other';

export interface ScentConceptAnalysis {
  kind: ScentConceptKind;
  topic: string | null;
  vocabHits: string[];
  catalogueHits: string[];
  hasIndefiniteArticle: boolean;
}

const QUERY_STOPWORDS = new Set([
  'want',
  'wanted',
  'wanna',
  'like',
  'something',
  'some',
  'perfume',
  'perfumes',
  'fragrance',
  'fragrances',
  'scent',
  'scents',
  'scented',
  'smells',
  'smell',
  'that',
  'this',
  'these',
  'those',
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'about',
  'have',
  'has',
  'get',
  'give',
  'show',
  'find',
  'need',
  'please',
  'again',
  'actually',
]);

/**
 * Olfactive / atmospheric directions — not object or food instances.
 * Used only to decide whether a "smells like X" request may enter matching.
 */
const OLFACTIVE_DIRECTIONS = new Set<string>([
  'fresh',
  'woody',
  'floral',
  'oriental',
  'spicy',
  'citrus',
  'gourmand',
  'aquatic',
  'oud',
  'amber',
  'musky',
  'musk',
  'sweet',
  'aromatic',
  'leather',
  'smoky',
  'smoke',
  'incense',
  'vanilla',
  'earthy',
  'earth',
  'mineral',
  'metallic',
  'metal',
  'rain',
  'petrichor',
  'ozone',
  'grass',
  'ocean',
  'marine',
  'sea',
  'library',
  'books',
  'paper',
  'fireplace',
  'moss',
  'soil',
  'green',
  'fire',
  'woodsmoke',
  'vetiver',
  'suede',
  'benzoin',
  'frankincense',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !QUERY_STOPWORDS.has(token));
}

export function catalogueTokenSet(products: Product[]): Set<string> {
  const tokens = new Set<string>();
  for (const product of products) {
    for (const value of [
      product.name,
      ...product.fragranceFamily,
      ...product.topNotes,
      ...product.heartNotes,
      ...product.baseNotes,
      ...product.tags,
      ...(product.similarTo || []),
    ]) {
      tokenize(String(value)).forEach((token) => tokens.add(token));
    }
  }
  return tokens;
}

export function analyzeScentConcept(message: string, products: Product[] = []): ScentConceptAnalysis {
  const topic = extractUnusualConcept(
    message,
    products.map((product) => product.name)
  );
  if (!topic) {
    return {
      kind: 'none',
      topic: null,
      vocabHits: [],
      catalogueHits: [],
      hasIndefiniteArticle: false,
    };
  }

  const topicTokens = tokenize(topic);
  const catalogue = catalogueTokenSet(products);
  const vocabHits = topicTokens.filter((token) => OLFACTIVE_DIRECTIONS.has(token));
  const catalogueHits = topicTokens.filter((token) => catalogue.has(token));
  const hasIndefiniteArticle = /\bsmells?\s+like\s+(?:a|an)\s+/i.test(message);

  if (vocabHits.length > 0) {
    return { kind: 'fragrance_direction', topic, vocabHits, catalogueHits, hasIndefiniteArticle };
  }
  if (catalogueHits.length > 0) {
    return { kind: 'catalogue_grounded', topic, vocabHits, catalogueHits, hasIndefiniteArticle };
  }
  if (hasIndefiniteArticle) {
    return { kind: 'unsupported_object', topic, vocabHits, catalogueHits, hasIndefiniteArticle };
  }
  return { kind: 'unsupported_other', topic, vocabHits, catalogueHits, hasIndefiniteArticle };
}

export function isUnsupportedScentConcept(analysis: ScentConceptAnalysis): boolean {
  return analysis.kind === 'unsupported_object' || analysis.kind === 'unsupported_other';
}

export function hasStructuredDiscoveryPrefs(prefs: StructuredPreferences): boolean {
  return Boolean(
    (prefs.fragranceFamilies && prefs.fragranceFamilies.length > 0) ||
      (prefs.notes && prefs.notes.length > 0) ||
      (prefs.occasion && prefs.occasion.length > 0) ||
      (prefs.season && prefs.season.length > 0) ||
      prefs.gender ||
      prefs.category ||
      prefs.warmth ||
      prefs.freshness ||
      prefs.intensity ||
      prefs.intensityPreference ||
      prefs.sillageMax ||
      prefs.sillagePreference ||
      prefs.isSimilarityRequest ||
      (prefs.referencePerfumes && prefs.referencePerfumes.length > 0) ||
      prefs.budget?.max
  );
}

export function isMeaningfulPartialMatch(
  result: RecommendationResult,
  prefs: StructuredPreferences,
  trade: { matchedPreferences: string[]; unmetPreferences: string[] }
): boolean {
  if (result.score <= 0) return false;

  const scentMatched = (trade.matchedPreferences || []).filter((item) => !/^under ₹/i.test(item));
  if (scentMatched.length === 0) return false;

  const unmetCore = (trade.unmetPreferences || []).filter((item) => !/^under ₹/i.test(item));
  if (unmetCore.length >= 2) return false;

  const concreteReasons = (result.matchReasons || []).filter((reason) =>
    ['fragrance-family', 'notes', 'occasion', 'similar', 'season'].includes(reason.type)
  );
  const nuanceReasons = (result.matchReasons || []).filter(
    (reason) =>
      reason.type === 'intensity' ||
      (reason.type === 'tag' && /\b(warm|fresh|strong|controlled|longevity)\b/i.test(reason.label))
  );

  if (concreteReasons.length === 0 && nuanceReasons.length === 0) return false;

  const requestedScent =
    Boolean(prefs.fragranceFamilies?.length) ||
    Boolean(prefs.notes?.length) ||
    Boolean(prefs.occasion?.length) ||
    Boolean(prefs.season?.length) ||
    Boolean(prefs.warmth) ||
    Boolean(prefs.freshness) ||
    Boolean(prefs.intensity) ||
    Boolean(prefs.isSimilarityRequest);

  return requestedScent;
}

export function unsupportedConceptQuestion(topic: string): string {
  return `When you say a '${topic}' scent, do you mean the materials, the interior or atmosphere around it, or the overall smell of the ${topic} itself?`;
}

export function unsupportedConceptInterpretations(topic: string): string[] {
  return [
    `I won't map a '${topic}' request to a fragrance family until you choose an aspect—then I can search in that direction.`,
  ];
}

export function unusualFragranceBriefQuestion(topic: string): string {
  return `That's an unusual fragrance brief. I don't have an exact ${topic}-scented match, but we can explore spicy, savory, herbal, smoky, or gourmand directions if those aspects of it appeal to you.`;
}

export function querySimilarityStopwords(): Set<string> {
  return QUERY_STOPWORDS;
}

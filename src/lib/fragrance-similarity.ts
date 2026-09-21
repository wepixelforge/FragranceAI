import { Product, StructuredPreferences } from '@/types/product';
import { querySimilarityStopwords } from './request-match-quality';

export type SparseVector = Record<string, number>;

/**
 * Lightweight fragrance embedding space.
 * Query and products are projected onto the same named dimensions, then ranked
 * with cosine similarity. No extra model download — this is a small, local ML ranker.
 */
const SYNONYMS: Record<string, SparseVector> = {
  oud: { oud: 1, agarwood: 0.9, incense: 0.45, woody: 0.55, oriental: 0.4, leather: 0.3, amber: 0.3, sandalwood: 0.25 },
  'oud-ish': { oud: 0.85, agarwood: 0.75, woody: 0.65, incense: 0.4, oriental: 0.4, leather: 0.35, amber: 0.3 },
  oudish: { oud: 0.85, agarwood: 0.75, woody: 0.65, incense: 0.4, oriental: 0.4, leather: 0.35 },
  agarwood: { agarwood: 1, oud: 0.8, woody: 0.5, incense: 0.35 },
  manly: { men: 1, masculine: 0.95, woody: 0.45, spicy: 0.35, leather: 0.4, oud: 0.2 },
  masculine: { men: 1, masculine: 0.95, woody: 0.4, spicy: 0.3, leather: 0.35 },
  gentlemanly: { men: 0.85, masculine: 0.8, woody: 0.35 },
  woody: { woody: 1, cedar: 0.5, sandalwood: 0.5, oud: 0.35, vetiver: 0.3 },
  spicy: { spicy: 1, pepper: 0.45, cinnamon: 0.3, oriental: 0.25 },
  oriental: { oriental: 1, amber: 0.5, oud: 0.4, spicy: 0.3, woody: 0.25 },
  arabian: { oud: 0.9, oriental: 0.85, spicy: 0.55, amber: 0.45, incense: 0.4, woody: 0.4 },
  arabic: { oud: 0.9, oriental: 0.85, spicy: 0.55, amber: 0.45, incense: 0.4 },
  attar: { oud: 0.85, oriental: 0.7, incense: 0.4 },
  bakhoor: { oud: 0.8, incense: 0.7, oriental: 0.55, spicy: 0.35 },
  fresh: { fresh: 1, citrus: 0.55, aquatic: 0.45, clean: 0.4 },
  citrus: { citrus: 1, fresh: 0.5, lemon: 0.4, bergamot: 0.4 },
  aquatic: { aquatic: 1, fresh: 0.5, marine: 0.5 },
  floral: { floral: 1, rose: 0.45, jasmine: 0.4 },
  sweet: { sweet: 1, gourmand: 0.55, vanilla: 0.45 },
  gourmand: { gourmand: 1, sweet: 0.55, vanilla: 0.4 },
  musky: { musky: 1, musk: 0.8, woody: 0.25 },
  leather: { leather: 1, woody: 0.35, masculine: 0.3, oud: 0.2 },
  amber: { amber: 1, oriental: 0.45, warm: 0.4 },
  warm: { warm: 1, amber: 0.4, oriental: 0.3, woody: 0.25 },
};

const LEVEL_WEIGHT: Record<string, number> = {
  none: 0,
  trace: 0.25,
  subtle: 0.35,
  moderate: 0.7,
  dominant: 1,
  cool: 0.2,
  neutral: 0.4,
  warm: 0.8,
  'very-warm': 1,
  fresh: 0.7,
  'very-fresh': 1,
  sweet: 0.8,
  'very-sweet': 1,
};

function add(vector: SparseVector, key: string, weight: number) {
  if (!key || weight === 0) return;
  const dim = key.toLowerCase().trim();
  if (!dim) return;
  vector[dim] = (vector[dim] || 0) + weight;
}

function mergeSynonyms(vector: SparseVector, token: string, weight = 1) {
  const clean = token.toLowerCase().trim();
  if (!clean) return;
  add(vector, clean, weight);
  const mapped = SYNONYMS[clean];
  if (mapped) {
    for (const [dim, value] of Object.entries(mapped)) {
      add(vector, dim, value * weight);
    }
  }
}

function tokenize(text: string, forQuery = false): string[] {
  const stop = querySimilarityStopwords();
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\- ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && (!forQuery || !stop.has(token)));
}

export function cosineSimilarity(a: SparseVector, b: SparseVector): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const value of Object.values(a)) magA += value * value;
  for (const value of Object.values(b)) magB += value * value;
  if (magA === 0 || magB === 0) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    dot += (a[key] || 0) * (b[key] || 0);
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export function buildQueryVector(prefs: StructuredPreferences, rawQuery?: string): SparseVector {
  const vector: SparseVector = {};
  const query = (rawQuery || prefs.rawQuery || '').toLowerCase();

  for (const family of prefs.fragranceFamilies || prefs.fragranceFamily || []) {
    mergeSynonyms(vector, family, 1.2);
  }
  for (const note of prefs.notes || []) {
    mergeSynonyms(vector, note, 1);
  }
  if (prefs.gender || prefs.category) {
    mergeSynonyms(vector, prefs.gender || prefs.category || '', 1.1);
  }
  for (const vibe of prefs.vibes || []) {
    mergeSynonyms(vector, vibe, 0.9);
  }
  if (prefs.intensity === 'strong' || prefs.intensityPreference === 'strong') {
    add(vector, 'strong', 0.6);
  }
  if (prefs.warmth === 'warmer') add(vector, 'warm', 0.7);
  if (prefs.freshness === 'fresher') mergeSynonyms(vector, 'fresh', 0.8);

  for (const token of tokenize(query, true)) {
    mergeSynonyms(vector, token, 0.85);
  }
  if (query.includes('oud-ish') || query.includes('oudish') || query.includes('oud like')) {
    mergeSynonyms(vector, 'oud-ish', 1.3);
  }

  return vector;
}

export function buildProductVector(product: Product): SparseVector {
  const vector: SparseVector = {};

  for (const family of product.fragranceFamily) {
    mergeSynonyms(vector, family, 1.15);
  }
  for (const note of [...product.topNotes, ...product.heartNotes, ...product.baseNotes]) {
    mergeSynonyms(vector, note, 0.7);
  }
  for (const tag of product.tags) {
    mergeSynonyms(vector, tag.replace(/-/g, ' '), 0.55);
  }
  mergeSynonyms(vector, product.gender, 0.9);
  if (product.gender === 'men' || product.gender === 'unisex') {
    mergeSynonyms(vector, 'masculine', 0.45);
  }

  add(vector, 'oud', LEVEL_WEIGHT[product.oudLevel || 'none'] || 0);
  add(vector, 'woody', LEVEL_WEIGHT[product.woodyLevel || 'none'] || 0);
  add(vector, 'spicy', LEVEL_WEIGHT[product.spicyLevel || 'none'] || 0);
  add(vector, 'warm', LEVEL_WEIGHT[product.warmth || 'neutral'] || 0);
  add(vector, 'fresh', LEVEL_WEIGHT[product.freshness || 'none'] || 0);
  add(vector, 'sweet', LEVEL_WEIGHT[product.sweetness || 'none'] || 0);

  for (const token of tokenize(`${product.name} ${product.description} ${product.character || ''}`)) {
    mergeSynonyms(vector, token, 0.25);
  }

  return vector;
}

export function mlSimilarityScore(
  product: Product,
  prefs: StructuredPreferences,
  against?: SparseVector
): { similarity: number; percent: number } {
  const similarity = cosineSimilarity(against || buildQueryVector(prefs), buildProductVector(product));
  return {
    similarity,
    percent: Math.round(similarity * 100),
  };
}

const SIZE_AND_FORMAT =
  /\b(\d+(\.\d+)?\s*ml|\d+\s*oz|official\s+sample|sample|tester|decant|travel\s+spray|full\s+(bottle|size)|without\s+box|miniature|mini|edp|edt|extrait|parfum|perfume|cologne|elixir|intense|eau\s+de\s+(parfum|toilette|cologne))\b/gi;

const LINE_STOPWORDS = new Set([
  'the', 'de', 'du', 'of', 'by', 'and', 'le', 'la', 'les', 'pour', 'for', 'him', 'her',
  'homme', 'woman', 'women', 'men', 'man', 'unisex', 'maison', 'francis', 'kurkdjian',
]);

export function scentLineKey(name: string): string {
  return name
    .toLowerCase()
    .replace(SIZE_AND_FORMAT, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function lineTokens(name: string): string[] {
  return scentLineKey(name)
    .split(' ')
    .filter((token) => token.length > 1 && !LINE_STOPWORDS.has(token));
}

export function isSameScentLine(a: string, b: string): boolean {
  const ta = lineTokens(a);
  const tb = lineTokens(b);
  if (ta.length < 2 || tb.length < 2) {
    const ka = scentLineKey(a);
    return Boolean(ka) && ka === scentLineKey(b);
  }
  const sa = ta.join(' ');
  const sb = tb.join(' ');
  return sa === sb || sa.includes(sb) || sb.includes(sa);
}

export function isSimilarityAsk(text: string): boolean {
  const lower = (text || '').toLowerCase();
  return /\b(similar(\s+to)?|something\s+like|smells?\s+like|dupe|clone|alternative\s+to|inspired\s+by|close\s+to|reminiscent|in\s+the\s+vein\s+of|along\s+the\s+lines\s+of)\b/i.test(
    lower
  );
}

export function cosineToProduct(candidate: Product, reference: Product): number {
  return cosineSimilarity(buildProductVector(candidate), buildProductVector(reference));
}

export function buildReferenceNameVector(name: string): SparseVector {
  const vector: SparseVector = {};
  for (const token of lineTokens(name)) {
    mergeSynonyms(vector, token, 1.1);
  }
  return vector;
}

export function similarityToReferences(
  candidate: Product,
  referenceProducts: Product[],
  referenceNames: string[]
): number {
  let best = 0;
  for (const reference of referenceProducts) {
    best = Math.max(best, cosineToProduct(candidate, reference));
  }
  if (best === 0 && referenceNames.length > 0) {
    const nameVector = referenceNames.reduce((acc, name) => {
      const next = buildReferenceNameVector(name);
      for (const [key, value] of Object.entries(next)) {
        acc[key] = (acc[key] || 0) + value;
      }
      return acc;
    }, {} as SparseVector);
    best = Math.max(best, cosineSimilarity(nameVector, buildProductVector(candidate)));
  }
  const haystack = (candidate.similarTo || []).map((item) => item.toLowerCase());
  for (const name of referenceNames) {
    const key = scentLineKey(name);
    if (key && haystack.some((item) => isSameScentLine(item, name) || item.includes(key))) {
      best = Math.max(best, 0.82);
    }
  }
  return best;
}

export function sameScentLineIds(
  products: Product[],
  referenceProducts: Product[],
  referenceNames: string[]
): string[] {
  const names = [
    ...referenceProducts.map((product) => product.name),
    ...referenceNames.filter(Boolean),
  ];
  if (names.length === 0) return [];
  return products
    .filter((product) => names.some((name) => isSameScentLine(product.name, name)))
    .map((product) => product.id);
}

export function resolveCatalogueReferences(
  products: Product[],
  query: string,
  referenceNames: string[] = []
): Product[] {
  const lower = (query || '').toLowerCase();
  const matched = new Map<string, Product>();
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);

  for (const product of sorted) {
    const name = product.name.toLowerCase();
    if (name.length < 6) continue;
    if (lower.includes(name)) matched.set(product.id, product);
  }

  for (const ref of referenceNames) {
    const refLower = ref.toLowerCase();
    for (const product of products) {
      if (isSameScentLine(product.name, ref) || product.name.toLowerCase().includes(refLower)) {
        matched.set(product.id, product);
      }
    }
  }

  return Array.from(matched.values());
}

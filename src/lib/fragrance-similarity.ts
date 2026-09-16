import { Product, StructuredPreferences } from '@/types/product';

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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\- ]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2);
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

  for (const token of tokenize(query)) {
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
  prefs: StructuredPreferences
): { similarity: number; percent: number } {
  const similarity = cosineSimilarity(buildQueryVector(prefs), buildProductVector(product));
  return {
    similarity,
    percent: Math.round(similarity * 100),
  };
}

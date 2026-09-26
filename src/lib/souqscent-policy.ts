import { BrandConfig } from '@/types/brand';
import { Product, RecommendationResult, StructuredPreferences } from '@/types/product';
import { Stage1IntentOutput, PreferenceUpdateItem, ConversationState } from '@/types/chat';
import { formatPrice } from '@/lib/brand-utils';

/**
 * SouqScent consultant policy.
 * Isolated from Scentira format rules and other brand voice.
 * LLM language → this module / Stage 1 → shared deterministic engine.
 */

const GENERIC_IDENTITY_TOKENS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'something',
  'similar',
  'like',
  'want',
  'need',
  'tell',
  'about',
  'show',
  'give',
  'perfume',
  'fragrance',
  'edp',
  'extrait',
  'ml',
  'exclusive',
  'unobtainium',
  'original',
  'version',
  'bottle',
  'elixir',
  'intense',
  'man',
  'men',
  'women',
  'gold',
  'blue',
  'noir',
  'collection',
]);

const ALIASES: Record<string, string> = {
  khamrah: 'lattafa khamrah waha',
  'khamrah waha': 'lattafa khamrah waha',
  azul: 'rayhaan azul',
  'rayhaan azul': 'rayhaan azul',
  cdnim: 'armaf club de nuit intense man parfum 150ml',
  'club de nuit intense': 'armaf club de nuit intense man parfum 150ml',
  'hawas chrome': 'rasasi hawas chrome',
  '9pm': 'afnan 9 pm',
  '9 pm': 'afnan 9 pm',
};

/** Tunable SouqScent soft-ranking weights. Hard constraints still eliminate. */
export const SOUQSCENT_SCORE_WEIGHTS = {
  occasion: 40,
  season: 36,
  fragranceFamily: 38,
  negativePreference: 42,
  notes: 28,
  longevity: 22,
  projection: 22,
  intensity: 20,
  referenceSimilarity: 48,
  featuredTieBreak: 4,
} as const;

export const SOUQSCENT_GROQ_NOTE = `
SouqScent rules:
- Recommend only listed SouqScent catalogue products. Never invent products, prices, notes, longevity hours, or projection.
- Most listings do not publish structured note pyramids. Do not output top/heart/base notes.
- "Delhi summer" / humid / hot weather → season summer. No live weather data.
- "at least N hours" is longevity, never budget or bottle size.
- "3k" / "₹3,000" is budget when framed as under/below/budget.
- "not too loud" → moderate projection cap. "I don't like sweet" → exclude sweet/gourmand.
- "Who is Elon Musk?" is OUT_OF_SCOPE. Do not map Musk to musky.
- Reference names must be high-confidence catalogue matches. Do not match on a single shared token such as Elixir.
`;

export function isSouqScentBrand(brand?: Pick<BrandConfig, 'slug'> | string | null): boolean {
  const slug = typeof brand === 'string' ? brand : brand?.slug;
  return slug === 'souqscent';
}

export function isSouqScentCatalogue(products: Product[]): boolean {
  return products.length > 0 && products.every((product) => product.brandSlug === 'souqscent');
}

export function souqscentHasStructuredNotes(product: Product): boolean {
  return product.topNotes.length > 0 || product.heartNotes.length > 0 || product.baseNotes.length > 0;
}

function upsertUpdate(
  updates: PreferenceUpdateItem[],
  field: PreferenceUpdateItem['field'],
  operation: PreferenceUpdateItem['operation'],
  value: PreferenceUpdateItem['value']
): PreferenceUpdateItem[] {
  return [...updates.filter((item) => item.field !== field), { field, operation, value }];
}

function normalizeIdentity(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function identityTokens(value: string): string[] {
  return normalizeIdentity(value)
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_IDENTITY_TOKENS.has(token));
}

function uniqueProductForNeedle(needle: string, products: Product[]): Product | null {
  const clean = normalizeIdentity(needle);
  if (!clean) return null;

  const exact = products.find(
    (product) => normalizeIdentity(product.name) === clean || product.slug === clean.replace(/\s+/g, '-')
  );
  if (exact) return exact;

  const alias = ALIASES[clean];
  if (alias) {
    const aliased = uniqueProductForNeedle(alias, products);
    if (aliased) return aliased;
  }

  const contained = products.filter((product) => {
    const name = normalizeIdentity(product.name);
    return name.includes(clean) && (clean.length >= 5 || clean.split(' ').length >= 2);
  });
  if (contained.length === 1) return contained[0];

  const tokenHits = products.filter((product) => {
    const nameTokens = new Set(identityTokens(product.name));
    return identityTokens(clean).every((token) => nameTokens.has(token) || normalizeIdentity(product.name).includes(token));
  });
  if (tokenHits.length === 1) return tokenHits[0];

  return null;
}

/**
 * High-confidence SouqScent identity. One shared token (Elixir) is never enough.
 */
export function resolveSouqScentNamedProduct(message: string, products: Product[]): Product | null {
  const souqProducts = products.filter((product) => product.brandSlug === 'souqscent');
  const clean = normalizeIdentity(message);
  if (!clean) return null;

  const aliasKeys = Object.keys(ALIASES).sort((a, b) => b.length - a.length);
  for (const key of aliasKeys) {
    if (new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(clean)) {
      const hit = uniqueProductForNeedle(ALIASES[key], souqProducts);
      if (hit) return hit;
    }
  }

  const sorted = [...souqProducts].sort((a, b) => b.name.length - a.name.length);
  for (const product of sorted) {
    const name = normalizeIdentity(product.name);
    if (name.length >= 8 && clean.includes(name)) return product;
  }

  const queryTokens = identityTokens(clean);
  if (queryTokens.length === 0) return null;

  const scored = souqProducts
    .map((product) => {
      const nameTokens = identityTokens(product.name);
      const overlap = queryTokens.filter((token) => nameTokens.includes(token) || token.length >= 5 && normalizeIdentity(product.name).includes(token));
      return { product, overlap: overlap.length, distinctive: overlap.filter((token) => token.length >= 5) };
    })
    .filter((row) => row.distinctive.length > 0)
    .sort((a, b) => b.overlap - a.overlap || b.distinctive.length - a.distinctive.length);

  if (scored.length === 1 && scored[0].distinctive.length >= 1) return scored[0].product;
  if (scored.length >= 2 && scored[0].overlap > scored[1].overlap && scored[0].distinctive.length >= 2) {
    return scored[0].product;
  }
  return null;
}

export function resolveSouqScentCompareProducts(message: string, products: Product[]): Product[] {
  const parts = message.split(/\b(?:and|vs\.?|versus|with)\b/i);
  const found: Product[] = [];
  for (const part of parts) {
    const hit = resolveSouqScentNamedProduct(part, products);
    if (hit && !found.some((item) => item.id === hit.id)) found.push(hit);
  }
  if (found.length >= 2) return found.slice(0, 2);

  const a = resolveSouqScentNamedProduct(message, products);
  return a ? [a] : [];
}

export function isSouqScentConcentrationQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    /\b(eau de parfum|eau de toilette|\bedp\b|\bedt\b)\b/.test(lower) &&
    /\b(difference|between|what is|what'?s|vs\.?|versus)\b/.test(lower)
  );
}

export function souqscentConcentrationReply(): string {
  return 'Eau de parfum (EDP) is a higher fragrance-oil concentration than eau de toilette (EDT), so it usually smells denser and can last longer. SouqScent listings use the concentration printed on each product; I will not invent a wear-time from the concentration name alone.';
}

export function isSouqScentOutOfScope(message: string): boolean {
  const lower = message.toLowerCase().trim();
  if (isSouqScentConcentrationQuestion(message)) return false;
  if (/\bwho\s+is\s+elon\s+musk\b/.test(lower)) return true;
  if (/\bwhat\s+is\s+elon\s+musk\b/.test(lower)) return true;
  if (
    /^(who|what)\s+is\s+[a-z][a-z]+(?:\s+[a-z][a-z]+)?\??$/.test(lower) &&
    !/\b(perfume|fragrance|scent|khamrah|azul|hawas|lattafa|armaf)\b/.test(lower)
  ) {
    return true;
  }
  return false;
}

function isSouqNonBudgetNumber(message: string): boolean {
  const lower = message.toLowerCase();
  const hasBudgetCue =
    /\b(under|below|less than|within|budget|₹|rs\.?|around|between|up\s+to|price doesn'?t matter)\b/.test(lower) ||
    /₹/.test(message);
  if (hasBudgetCue) return false;
  return /\b\d+\s*(hours?|hrs?|ml|mls)\b/.test(lower);
}

function isSouqScentBroadDiscovery(message: string): boolean {
  const t = message
    .toLowerCase()
    .replace(/[?.!,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(what should i try|i don'?t know what i like|help me find (a )?perfume|give me a recommendation|surprise me|recommend something( for me)?|i don'?t know where to start)$/.test(
    t
  );
}

function budgetParseText(message: string): string {
  return message.toLowerCase().replace(/\b\d+(?:\.\d+)?\s*(hours?|hrs?|ml|mls)\b/g, ' ');
}

function parseSouqBudget(message: string): { min: number | null; max: number | null } | null {
  const lower = budgetParseText(message);
  if (/\b(price doesn'?t matter|no budget|budget is not an issue)\b/.test(lower)) {
    return { min: null, max: null };
  }
  if (/\b(at\s+least|minimum|min)\s+\d+\s*hours?\b/.test(lower) && !/\b(under|below|budget|₹|rs)\b/.test(lower)) {
    return null;
  }
  const kMatch = lower.match(
    /(?:under|below|less than|within|max|budget(?:\s+is|\s+of)?|up\s+to)\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)\s*k\b/
  );
  if (kMatch) return { min: null, max: Math.round(parseFloat(kMatch[1]) * 1000) };

  const under = lower.match(/(?:under|below|less than|within|max|up\s+to)\s*(?:₹|rs\.?)?\s*([\d,]+)/);
  if (under) {
    const amount = parseInt(under[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(amount) && amount >= 200) return { min: null, max: amount };
  }
  const around = lower.match(/\b(?:around|about|approximately)\s*(?:₹|rs\.?)?\s*([\d,]+)/);
  if (around) {
    const amount = parseInt(around[1].replace(/,/g, ''), 10);
    if (!Number.isNaN(amount)) {
      const pad = Math.max(200, Math.round(amount * 0.2));
      return { min: Math.max(0, amount - pad), max: amount + pad };
    }
  }
  const between = lower.match(/between\s*(?:₹|rs\.?)?\s*([\d,]+)\s*(?:and|to|-)\s*(?:₹|rs\.?)?\s*([\d,]+)/);
  if (between) {
    const a = parseInt(between[1].replace(/,/g, ''), 10);
    const b = parseInt(between[2].replace(/,/g, ''), 10);
    if (!Number.isNaN(a) && !Number.isNaN(b)) return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  return null;
}

function parseSouqSeason(message: string): string | null {
  const lower = message.toLowerCase();
  if (/\b(delhi\s+summer|hot\s+weather|humid|monsoon|rainy\s+season|summer)\b/.test(lower)) return 'summer';
  if (/\b(cold\s+weather|cool\s+weather|winter)\b/.test(lower)) return 'winter';
  if (/\b(spring)\b/.test(lower)) return 'spring';
  if (/\b(autumn|fall)\b/.test(lower)) return 'autumn';
  return null;
}

function parseSouqOccasion(message: string): string | null {
  const lower = message.toLowerCase();
  if (/\b(office|work|workplace|college)\b/.test(lower)) return 'office';
  if (/\b(date\s*night|date)\b/.test(lower)) return 'date-night';
  if (/\b(wedding|festive|formal)\b/.test(lower)) return 'wedding';
  if (/\b(party|club)\b/.test(lower)) return 'party';
  if (/\b(evening)\b/.test(lower)) return 'evening';
  if (/\b(travel)\b/.test(lower)) return 'travel';
  if (/\b(gym|beach)\b/.test(lower)) return 'daily';
  if (/\b(daily|everyday|casual)\b/.test(lower)) return 'daily';
  return null;
}

function parseSouqLongevity(message: string): string | null {
  const lower = message.toLowerCase();
  if (/\b(at\s+least|minimum|min)\s+\d+\s*hours?\b/.test(lower)) return 'long-lasting';
  if (/\b\d+\s*hours?\b/.test(lower) && /\b(last|lasting|longevity|wear)\b/.test(lower)) return 'long-lasting';
  if (/\b(long[\s-]*lasting|all\s+day|full\s+day)\b/.test(lower)) return 'long-lasting';
  return null;
}

function wordToPosition(value: string): number | null {
  const map: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
  if (map[value]) return map[value];
  const num = parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
}

export function resolveSouqScentOrdinals(message: string, state?: ConversationState): string[] {
  const set = state?.lastCanonicalProductSet || [];
  if (set.length === 0) return [];
  const lower = message.toLowerCase();
  const pair = lower.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:\s+one)?\s+and\s+(?:the\s+)?(first|second|third|fourth|fifth|\d+)/
  );
  const indexes: number[] = [];
  if (pair) {
    const a = wordToPosition(pair[1]);
    const b = wordToPosition(pair[2]);
    if (a) indexes.push(a);
    if (b) indexes.push(b);
  } else {
    const single = lower.match(/\b(?:the\s+)?(first|second|third|fourth|fifth|last)(?:\s+one)?\b/);
    if (single) {
      if (single[1] === 'last') indexes.push(set.length);
      else {
        const n = wordToPosition(single[1]);
        if (n) indexes.push(n);
      }
    }
  }
  return indexes
    .map((index) => set[index - 1]?.name)
    .filter((name): name is string => Boolean(name));
}

export function applySouqScentContextToStage1(
  stage1: Stage1IntentOutput,
  message: string,
  products: Product[],
  state?: ConversationState
): Stage1IntentOutput {
  const next: Stage1IntentOutput = {
    ...stage1,
    updates: [...(stage1.updates || [])],
    fragrance_families: [...(stage1.fragrance_families || [])],
    preferred_notes: [...(stage1.preferred_notes || [])],
    excluded_notes: [...(stage1.excluded_notes || [])],
    excluded_families: [...(stage1.excluded_families || [])],
    preferences: { ...(stage1.preferences || {}) },
  };
  const lower = message.toLowerCase();

  if (isSouqScentConcentrationQuestion(message)) {
    return {
      ...next,
      intent: 'PRODUCT_INFO',
      request_type: 'other',
      needs_recommendations: false,
      needs_clarification: false,
      requires_product_data: false,
      is_similarity_request: false,
      target_product_names: [],
      out_of_scope_answer: souqscentConcentrationReply(),
    };
  }

  if (isSouqScentOutOfScope(message)) {
    return {
      ...next,
      intent: 'OUT_OF_SCOPE',
      request_type: 'other',
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      requires_product_data: false,
      is_similarity_request: false,
      reference_perfume: null,
      target_product_names: [],
      product_reference: null,
      out_of_scope_answer:
        "I help with SouqScent fragrances — occasion, style, budget, or a perfume you already know. I can't answer that, but I can help you find a scent from the catalogue.",
      updates: [],
      preferences: {},
    };
  }

  if (/\bmusk\b/.test(lower) && /\belon\b/.test(lower)) {
    next.fragrance_families = next.fragrance_families.filter((family) => family !== 'musky');
  }

  const budget = parseSouqBudget(message);
  if (budget?.max != null) {
    next.budget = { min: budget.min, max: budget.max };
    next.updates = upsertUpdate(next.updates || [], 'budget.max', 'SET', budget.max);
    if (budget.min != null) next.updates = upsertUpdate(next.updates || [], 'budget.min', 'SET', budget.min);
  } else if (
    isSouqNonBudgetNumber(message) ||
    (/\b\d+(?:\.\d+)?\s*(hours?|hrs?|ml|mls)\b/i.test(message) && !/₹|rs\.?/.test(message.toLowerCase()))
  ) {
    next.budget = { min: null, max: null };
    next.updates = (next.updates || []).filter(
      (item) => item.field !== 'budget.max' && item.field !== 'budget.min'
    );
  }

  const season = parseSouqSeason(message);
  if (season) {
    next.season = season;
    next.updates = upsertUpdate(next.updates || [], 'season', 'SET', season);
  }

  const occasion = parseSouqOccasion(message);
  if (occasion) {
    next.occasion = occasion;
    next.updates = upsertUpdate(next.updates || [], 'occasion', 'SET', occasion);
  }

  const longevity = parseSouqLongevity(message);
  if (longevity) {
    next.longevity = longevity;
    next.updates = upsertUpdate(next.updates || [], 'longevity', 'SET', longevity);
  }

  const quieter =
    /\b(not too loud|not loud|not too strong|doesn'?t fill the room|not too heavy|don'?t want (?:something |anything )?(?:too )?(loud|strong)|nothing too loud|less loud|less projection|less sillage|quieter|softer projection|not as loud|more intimate)\b/.test(
      lower
    );
  if (quieter) {
    next.sillage = 'moderate';
    next.sillageMax = null;
    next.updates = (next.updates || []).filter((item) => item.field !== 'sillage' && item.field !== 'sillageMax');
    next.updates = upsertUpdate(next.updates, 'sillage', 'SET', 'moderate');
  }

  if (/\b(masculine|for men|for him|mens)\b/.test(lower) && !/\bnot (?:too |overly )?masculine\b/.test(lower)) {
    next.gender = 'men';
    next.updates = upsertUpdate(next.updates || [], 'gender', 'SET', 'men');
  } else if (/\b(feminine|for women|for her|womens)\b/.test(lower)) {
    next.gender = 'women';
    next.updates = upsertUpdate(next.updates || [], 'gender', 'SET', 'women');
  }

  if (/\b(freshie|fresh|clean|citrusy|aquatic)\b/.test(lower) && !/\bnot (?:too )?(fresh|clean)\b/.test(lower)) {
    if (!next.fragrance_families.includes('fresh')) next.fragrance_families.push('fresh');
    next.updates = upsertUpdate(next.updates || [], 'fragrance_families', 'SET', next.fragrance_families);
  }
  if (/\b(woody|oudy|oud)\b/.test(lower) && !/\b(don'?t like|avoid|no)\s+oud\b/.test(lower)) {
    const add = /\boud/.test(lower) ? 'oud' : 'woody';
    if (!next.fragrance_families.includes(add)) next.fragrance_families.push(add);
    next.updates = upsertUpdate(next.updates || [], 'fragrance_families', 'SET', next.fragrance_families);
  }

  const hardSweet = /\b(don'?t like sweet|do not like sweet|hate sweet|avoid sweet|no sweet|nothing sweet|i don'?t like sweet perfumes)\b/.test(
    lower
  );
  const softSweet = /\b(not too sweet|not overly sweet|less sweet|not that sweet)\b/.test(lower);
  const relaxSweet = /\b(a little sweetness is okay|sweetness is okay|sweet is okay|a bit of sweetness)\b/.test(lower);
  const wantSweeter =
    !hardSweet &&
    !softSweet &&
    /\b(a little sweeter|little sweeter|sweeter|more sweet|a bit sweeter)\b/.test(lower);
  if (hardSweet) {
    for (const family of ['sweet', 'gourmand']) {
      if (!next.excluded_families.includes(family)) next.excluded_families.push(family);
    }
    next.updates = upsertUpdate(next.updates || [], 'excluded_families', 'ADD', ['sweet', 'gourmand']);
  } else if (softSweet) {
    if (!next.excluded_families.includes('gourmand')) next.excluded_families.push('gourmand');
    next.updates = upsertUpdate(next.updates || [], 'excluded_families', 'ADD', ['gourmand']);
  } else if (relaxSweet || wantSweeter) {
    next.sweetness = 'sweeter';
    next.updates = upsertUpdate(next.updates || [], 'sweetness', 'SET', 'sweeter');
    if (relaxSweet) {
      next.excluded_families = next.excluded_families.filter(
        (family) => family !== 'sweet' && family !== 'gourmand'
      );
      next.updates = upsertUpdate(next.updates || [], 'excluded_families', 'REMOVE', ['sweet', 'gourmand']);
    }
  }

  if (/\b(don'?t (?:like|want) oud|avoid oud|no oud|nothing with oud)\b/.test(lower)) {
    if (!next.excluded_families.includes('oud')) next.excluded_families.push('oud');
    if (!next.excluded_notes.includes('oud')) next.excluded_notes.push('oud');
  }
  if (/\b(avoid vanilla|don'?t like vanilla|no vanilla)\b/.test(lower)) {
    if (!next.excluded_notes.includes('vanilla')) next.excluded_notes.push('vanilla');
  }

  const ordinalNames = resolveSouqScentOrdinals(message, state);
  const usedOrdinals =
    ordinalNames.length > 0 &&
    /\b(show|tell|give|more about|the first|the second|the third|the last)\b/.test(lower) &&
    !/\badd\b/.test(lower);
  if (usedOrdinals) {
    next.intent = ordinalNames.length > 1 ? 'COMPARE_PRODUCTS' : 'PRODUCT_INFO';
    next.target_product_names = ordinalNames;
    next.needs_recommendations = false;
    next.requires_product_data = true;
    next.is_similarity_request = false;
  }

  const infoAsk = !usedOrdinals && /\b(tell me about|how much is|is .+ available|what is)\b/.test(lower);
  const compareAsk = !usedOrdinals && /\b(compare|vs\.?|versus)\b/.test(lower);
  const similarAsk =
    !usedOrdinals && /\b(something like|similar to|alternative to)\b/.test(lower);
  const likeNamedAsk = !usedOrdinals && /\bi like\b/.test(lower) && !/\bi like the (first|second|third|last)\b/.test(lower);

  if (compareAsk) {
    const compared = resolveSouqScentCompareProducts(message, products);
    if (compared.length >= 2) {
      next.intent = 'COMPARE_PRODUCTS';
      next.target_product_names = compared.map((product) => product.name);
      next.needs_recommendations = false;
      next.requires_product_data = true;
    }
  } else if (infoAsk && !similarAsk) {
    const named = resolveSouqScentNamedProduct(message, products);
    if (named) {
      next.intent = 'PRODUCT_INFO';
      next.target_product_names = [named.name];
      next.needs_recommendations = false;
      next.requires_product_data = true;
    } else if (/\b(tell me about|how much is)\b/.test(lower)) {
      next.intent = 'PRODUCT_INFO';
      next.target_product_names = [];
      next.product_reference = null;
      next.needs_recommendations = false;
      next.requires_product_data = false;
      next.is_similarity_request = false;
      next.reference_perfume = null;
    }
  } else if (similarAsk || likeNamedAsk) {
    const named = resolveSouqScentNamedProduct(message, products);
    if (named) {
      next.intent = 'SIMILAR_TO_REFERENCE';
      next.reference_perfume = named.name;
      next.is_similarity_request = true;
      next.needs_recommendations = true;
      next.requires_product_data = true;
      next.updates = upsertUpdate(next.updates || [], 'reference_perfume', 'SET', named.name);
    } else if (similarAsk) {
      next.is_similarity_request = true;
      next.reference_perfume = null;
      next.needs_recommendations = true;
      next.clarification_reason = 'reference_not_in_catalogue';
    }
  }

  if (hardSweet && !occasion && !next.budget?.max && next.fragrance_families.length === 0) {
    next.intent = 'RECOMMENDATION';
    next.needs_recommendations = true;
    next.requires_product_data = true;
    next.is_broad_recommendation = true;
    next.is_surprise_me = false;
  }

  if (
    isSouqScentBroadDiscovery(message) &&
    next.intent !== 'OUT_OF_SCOPE' &&
    next.intent !== 'CART_ASSISTANCE' &&
    next.intent !== 'PRODUCT_INFO' &&
    next.intent !== 'COMPARE_PRODUCTS'
  ) {
    next.intent = 'RECOMMENDATION';
    next.needs_recommendations = true;
    next.is_broad_recommendation = true;
    next.is_surprise_me = true;
    next.needs_clarification = false;
    next.is_discovery_start = false;
    next.requires_product_data = true;
  }

  if (
    next.budget?.max ||
    next.occasion ||
    next.season ||
    next.gender ||
    next.fragrance_families.length > 0 ||
    next.excluded_families.length > 0
  ) {
    if (next.intent === 'OUT_OF_SCOPE') {
      /* keep */
    } else if (next.intent !== 'PRODUCT_INFO' && next.intent !== 'COMPARE_PRODUCTS' && next.intent !== 'CART_ASSISTANCE') {
      next.needs_recommendations = true;
      next.requires_product_data = true;
      if (next.intent === 'GREETING' || next.intent === 'GENERAL_CONVERSATION' || next.intent === 'CLARIFICATION') {
        next.intent = next.is_refinement ? 'REFINE_RECOMMENDATION' : 'RECOMMENDATION';
      }
    }
  }

  return next;
}

export function souqscentHardGenderFilter(
  product: Product,
  preferences: StructuredPreferences
): { valid: boolean; reason?: string } {
  const requested = preferences.gender || preferences.category;
  if (!requested) return { valid: true };
  if (product.gender === 'unisex') return { valid: true };
  if (product.gender !== requested) {
    return { valid: false, reason: `Gender ${product.gender} does not match requested ${requested}` };
  }
  return { valid: true };
}

export function souqscentExplanation(result: RecommendationResult, prefs: StructuredPreferences): string {
  const product = result.product;
  const bits: string[] = [`${product.fragranceFamily.slice(0, 2).join(' / ')} profile`];
  if (prefs.occasion?.[0] && product.occasion.includes(prefs.occasion[0] as Product['occasion'][number])) {
    bits.push(`suited to ${prefs.occasion[0].replace('-', ' ')}`);
  } else if (product.occasion[0]) {
    bits.push(`listed for ${product.occasion[0].replace('-', ' ')} wear`);
  }
  if (prefs.budget?.max && product.price <= prefs.budget.max) {
    bits.push(`within your ${formatPrice(prefs.budget.max)} budget`);
  }
  if (prefs.sillageMax || prefs.sillagePreference === 'moderate') {
    bits.push('moderate projection based on the listed information');
  }
  if (prefs.longevity === 'long-lasting' || prefs.longevityPreference === 'long-lasting') {
    bits.push(
      product.longevity === 'long-lasting' || product.longevity === 'beast-mode'
        ? 'listed as longer-wearing'
        : 'longevity is not published in hours on this listing'
    );
  }
  return `Why this matches: ${bits.join(', ')}.`;
}

export function souqscentDetailedReasons(
  result: RecommendationResult,
  prefs: StructuredPreferences
): RecommendationResult['detailedReasons'] {
  const product = result.product;
  const details: RecommendationResult['detailedReasons'] = [
    {
      category: 'Profile',
      text: `Listed families: ${product.fragranceFamily.join(', ') || 'not specified in the available catalogue data'}.`,
    },
  ];
  if (souqscentHasStructuredNotes(product)) {
    details.push({
      category: 'Profile',
      text: `Notes: ${[...product.topNotes, ...product.heartNotes, ...product.baseNotes].slice(0, 6).join(', ')}.`,
    });
  } else {
    details.push({
      category: 'Profile',
      text: 'Structured note pyramid is not specified in the available catalogue data.',
    });
  }
  details.push({
    category: 'Performance',
    text: `Listed longevity ${product.longevity.replace('-', ' ')}; listed projection ${product.projection || product.intensity}. Hours are not published on this listing.`,
  });
  details.push({
    category: 'Budget',
    text: prefs.budget?.max
      ? `${formatPrice(product.price)} (${product.size}) — within ${formatPrice(prefs.budget.max)}.`
      : `${formatPrice(product.price)} (${product.size}).`,
  });
  return details;
}

export function applySouqScentResultHonesty(
  results: RecommendationResult[],
  prefs: StructuredPreferences
): RecommendationResult[] {
  return results.map((result) => ({
    ...result,
    explanation: souqscentExplanation(result, prefs),
    detailedReasons: souqscentDetailedReasons(result, prefs),
  }));
}

export function souqscentUnknownProductReply(): string {
  return 'I could not find that fragrance in the current SouqScent catalogue, so I will not substitute another product.';
}

export function souqscentMissingReferenceReply(reference: string): string {
  return `${reference} is not in the current SouqScent catalogue, so I will not invent its notes or performance. Tell me a style, occasion or budget and I can recommend listed bottles.`;
}

export function souqscentNoMatchReply(): string {
  return "I couldn't find a match within all of those constraints. I can relax one of them — for example budget or projection — if you'd like.";
}

export function souqscentProductInfoReply(product: Product, message?: string): string {
  const notes = souqscentHasStructuredNotes(product)
    ? `Listed notes: ${[...product.topNotes, ...product.heartNotes, ...product.baseNotes].slice(0, 8).join(', ')}.`
    : 'A structured note pyramid is not specified in the available catalogue data.';
  const base = `${product.name} by ${product.houseBrand || 'the listed house'} is ${formatPrice(product.price)} for ${product.size}. Families: ${product.fragranceFamily.join(', ')}. ${notes}`;
  if (message && /\boffice\b/i.test(message)) {
    const officeNote = product.occasion.includes('office')
      ? 'The catalogue lists it for office wear.'
      : product.occasion.includes('daily')
        ? 'Office suitability is not explicitly listed; the catalogue lists daily wear.'
        : 'Office suitability is not specified in the available catalogue data.';
    return `${base} ${officeNote}`;
  }
  return base;
}

export function souqscentCompareReply(products: Product[]): string {
  if (products.length < 2) return souqscentUnknownProductReply();
  const [a, b] = products;
  const field = (label: string, left: string, right: string) =>
    `• ${label}: ${left || 'Not specified in the available catalogue data.'} vs ${right || 'Not specified in the available catalogue data.'}`;
  return [
    `Comparison using listed SouqScent data only: ${a.name} vs ${b.name}.`,
    field('Price', formatPrice(a.price), formatPrice(b.price)),
    field('Size', a.size, b.size),
    field('Family', a.fragranceFamily.join(', '), b.fragranceFamily.join(', ')),
    field('Occasion', a.occasion.map((item) => item.replace('-', ' ')).join(', '), b.occasion.map((item) => item.replace('-', ' ')).join(', ')),
    field('Season', a.season.join(', '), b.season.join(', ')),
    field('Longevity (listed)', a.longevity.replace('-', ' '), b.longevity.replace('-', ' ')),
    field('Projection (listed)', a.projection || a.intensity, b.projection || b.intensity),
    'Hours and unpublished notes are not invented.',
  ].join('\n');
}

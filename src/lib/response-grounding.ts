import { Product, RecommendationResult } from '@/types/product';
import { ConversationState, Stage1IntentOutput } from '@/types/chat';

export type ComparativeDimension = 'intensity' | 'sillage' | 'warmth' | 'freshness' | 'sweetness' | 'price' | 'woodiness';

export interface ComparativeContext {
  type: string;
  dimension: ComparativeDimension;
  previousProductNames: string[];
  previousValue: string | null;
  newValue: string | null;
  improved: boolean;
  alreadyAtBound: boolean;
}

export interface RecommendationPresentation {
  recommendationStatus: string;
  recommendationCount: number;
  primary: { productId: string; name: string; rank: number } | null;
  products: { productId: string; brandSlug: string; name: string; rank: number; intensity?: string | null }[];
}

export function intensityRank(value?: string | null): number {
  const v = (value || '').toLowerCase();
  if (v.includes('beast')) return 4;
  if (v.includes('strong')) return 3;
  if (v.includes('moderate')) return 2;
  if (v.includes('subtle') || v.includes('light')) return 1;
  return 0;
}

export function sillageRank(value?: string | null): number {
  const v = (value || '').toLowerCase();
  if (v.includes('enormous') || v.includes('beast')) return 4;
  if (v.includes('strong')) return 3;
  if (v.includes('moderate')) return 2;
  if (v.includes('intimate') || v.includes('soft')) return 1;
  return 0;
}

export function warmthRank(value?: string | null): number {
  const v = (value || '').toLowerCase();
  if (v.includes('very-warm') || v === 'warmer') return 4;
  if (v.includes('warm')) return 3;
  if (v.includes('neutral') || v.includes('moderate')) return 2;
  if (v.includes('cool')) return 1;
  return 0;
}

function maxRank(products: Product[], fn: (p: Product) => number): number {
  return products.reduce((max, p) => Math.max(max, fn(p)), 0);
}

function minPositiveRank(products: Product[], fn: (p: Product) => number): number {
  const ranks = products.map(fn).filter((n) => n > 0);
  return ranks.length ? Math.min(...ranks) : 0;
}

export function buildRecommendationPresentation(
  results: RecommendationResult[],
  status?: string
): RecommendationPresentation {
  const products = results.map((r, idx) => ({
    productId: r.product.id,
    brandSlug: r.product.brandSlug,
    name: r.product.name,
    rank: idx + 1,
    intensity: r.product.intensity,
  }));
  return {
    recommendationStatus: status || (results.length > 0 ? 'SUCCESS' : 'NO_VALID_MATCH'),
    recommendationCount: results.length,
    primary: products[0]
      ? { productId: products[0].productId, name: products[0].name, rank: 1 }
      : null,
    products,
  };
}

export function detectComparativeRefinement(
  message: string,
  stage1: Stage1IntentOutput
): { type: string; dimension: ComparativeDimension } | null {
  const lower = message.toLowerCase();
  if (/\b(loud(er)?|more\s+noticeable|more\s+projection|stronger\s+(trail|sillage)|more\s+sillage)\b/.test(lower)) {
    return { type: 'louder', dimension: 'sillage' };
  }
  if (/\b(quiet(er)?|softer\s+trail|less\s+projection|less\s+loud)\b/.test(lower)) {
    return { type: 'quieter', dimension: 'sillage' };
  }
  if (/\b(stronger|more\s+intense|more\s+intensity)\b/.test(lower) || (stage1.is_refinement && stage1.intensity === 'strong' && /\bstrong/.test(lower))) {
    return { type: 'stronger', dimension: 'intensity' };
  }
  if (/\b(lighter|softer|more\s+subtle|less\s+intense)\b/.test(lower)) {
    return { type: 'lighter', dimension: 'intensity' };
  }
  if (/\b(warmer|more\s+warmth)\b/.test(lower) || stage1.warmth === 'warmer') {
    return { type: 'warmer', dimension: 'warmth' };
  }
  if (/\b(cooler|less\s+warm)\b/.test(lower) || stage1.warmth === 'cooler') {
    return { type: 'cooler', dimension: 'warmth' };
  }
  if (/\b(fresher|more\s+fresh)\b/.test(lower) || stage1.freshness === 'fresher') {
    return { type: 'fresher', dimension: 'freshness' };
  }
  if (/\b(less\s+sweet|not\s+as\s+sweet)\b/.test(lower)) {
    return { type: 'less_sweet', dimension: 'sweetness' };
  }
  if (/\b(more\s+woody)\b/.test(lower)) {
    return { type: 'more_woody', dimension: 'woodiness' };
  }
  if (/\b(less\s+woody)\b/.test(lower)) {
    return { type: 'less_woody', dimension: 'woodiness' };
  }
  if (/\bcheaper\b/.test(lower) || stage1.relative_price === 'cheaper') {
    return { type: 'cheaper', dimension: 'price' };
  }
  return null;
}

export function buildComparativeContext(
  message: string,
  stage1: Stage1IntentOutput,
  previousProducts: Product[],
  nextProducts: Product[]
): ComparativeContext | null {
  const detected = detectComparativeRefinement(message, stage1);
  if (!detected) return null;

  let previousValue: string | null = null;
  let newValue: string | null = null;
  let improved = false;
  let alreadyAtBound = false;

  if (detected.dimension === 'intensity') {
    previousValue = previousProducts[0]?.intensity || null;
    newValue = nextProducts[0]?.intensity || null;
    const prevMax = maxRank(previousProducts, (p) => intensityRank(p.intensity));
    const nextMin = minPositiveRank(nextProducts, (p) => intensityRank(p.intensity));
    const nextMax = maxRank(nextProducts, (p) => intensityRank(p.intensity));
    if (detected.type === 'stronger') {
      improved = nextProducts.length > 0 && nextMin > prevMax && prevMax > 0;
      alreadyAtBound = prevMax >= 3 && nextMax <= prevMax && nextProducts.length > 0;
      if (!improved && nextProducts.length > 0 && nextMax > prevMax) improved = true;
    } else if (detected.type === 'lighter') {
      improved = nextProducts.length > 0 && nextMax < prevMax && prevMax > 0;
      alreadyAtBound = prevMax > 0 && prevMax <= 1;
    }
  } else if (detected.dimension === 'sillage') {
    previousValue = previousProducts[0]?.sillage || previousProducts[0]?.projection || null;
    newValue = nextProducts[0]?.sillage || nextProducts[0]?.projection || null;
    const prevMax = maxRank(previousProducts, (p) => sillageRank(p.sillage || p.projection));
    const nextMax = maxRank(nextProducts, (p) => sillageRank(p.sillage || p.projection));
    if (detected.type === 'louder') {
      improved = nextMax > prevMax && prevMax > 0;
      alreadyAtBound = prevMax >= 3 && nextMax <= prevMax;
    }
  } else if (detected.dimension === 'warmth') {
    previousValue = previousProducts[0]?.warmth || null;
    newValue = nextProducts[0]?.warmth || null;
    const prevMax = maxRank(previousProducts, (p) => warmthRank(p.warmth));
    const nextMax = maxRank(nextProducts, (p) => warmthRank(p.warmth));
    if (detected.type === 'warmer') {
      improved = nextMax > prevMax;
      alreadyAtBound = prevMax >= 3 && nextMax <= prevMax && nextProducts.length > 0;
    }
  }

  return {
    type: detected.type,
    dimension: detected.dimension,
    previousProductNames: previousProducts.map((p) => p.name),
    previousValue,
    newValue,
    improved,
    alreadyAtBound,
  };
}

export function findCatalogueNamesInText(text: string, products: Product[]): string[] {
  if (!text) return [];
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);
  const found: string[] = [];
  let remaining = ` ${text} `;
  for (const p of sorted) {
    const name = p.name;
    const re = new RegExp(`(^|[^a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
    if (re.test(remaining)) {
      found.push(p.name);
      remaining = remaining.replace(re, ' ');
    }
  }
  return found;
}

export function evaluateRecommendationGrounding(
  reply: string,
  results: RecommendationResult[],
  catalogue: Product[],
  options?: { intent?: string; status?: string; contextNames?: string[] }
): { ok: boolean; reason?: string; mentionedCanonical: string[]; extraNames: string[] } {
  const mentioned = findCatalogueNamesInText(reply, catalogue);
  const canonicalNames = results.map((r) => r.product.name);
  const canonicalLower = new Set(canonicalNames.map((n) => n.toLowerCase()));
  const contextLower = new Set((options?.contextNames || []).map((n) => n.toLowerCase()));
  const extraNames = mentioned.filter(
    (n) => !canonicalLower.has(n.toLowerCase()) && !contextLower.has(n.toLowerCase())
  );
  const mentionedCanonical = mentioned.filter((n) => canonicalLower.has(n.toLowerCase()));

  const isRecIntent =
    !options?.intent ||
    [
      'RECOMMENDATION',
      'REFINE_RECOMMENDATION',
      'SHOW_ALTERNATIVES',
      'SIMILAR_TO_REFERENCE',
      'BUDGET_CHANGE',
      'PREFERENCE_UPDATE',
    ].includes(options.intent);

  if (extraNames.length > 0 && isRecIntent && results.length > 0) {
    return {
      ok: false,
      reason: `mentioned products outside canonical set: ${extraNames.join(', ')}`,
      mentionedCanonical,
      extraNames,
    };
  }

  if (results.length === 0 && isRecIntent && mentioned.length > 0) {
    return {
      ok: false,
      reason: 'named products when canonical set is empty',
      mentionedCanonical,
      extraNames: mentioned,
    };
  }

  if (results.length >= 2 && isRecIntent) {
    if (mentionedCanonical.length < 2) {
      return {
        ok: false,
        reason: `canonical has ${results.length} products but reply mentions ${mentionedCanonical.length}`,
        mentionedCanonical,
        extraNames,
      };
    }
  }

  if (results.length > 0 && isRecIntent) {
    const lower = reply.toLowerCase();
    if (
      /\bi don'?t have (a fragrance that'?s stronger|anything stronger|another option that fits|a fragrance)\b/i.test(lower) ||
      /\bno suitable (option|match)/i.test(lower) ||
      /\bcouldn'?t find (a|another) (suitable )?option/i.test(lower) ||
      /\bstronger than the strong-intensity options\b/i.test(lower)
    ) {
      return {
        ok: false,
        reason: 'contradictory no-match language while canonical products exist',
        mentionedCanonical,
        extraNames,
      };
    }
  }

  return { ok: true, mentionedCanonical, extraNames };
}

export function previousProductsFromState(
  state: ConversationState | undefined,
  catalogue: Product[]
): Product[] {
  const ids = state?.lastRecommendationIds || [];
  return ids
    .map((id) => catalogue.find((p) => p.id === id))
    .filter(Boolean) as Product[];
}

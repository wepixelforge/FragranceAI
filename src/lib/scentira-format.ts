import { ConversationState, Stage1IntentOutput } from '@/types/chat';
import type { FormatIntent, Product, StructuredPreferences } from '@/types/product';
import { extractKnownReferencePerfume, messageHasReferenceCue, POPULAR_REFERENCE_PERFUMES } from '@/lib/query-parser';

export type ScentiraSizeMl = 5 | 10 | 20;

const SCENTIRA_NAME_STOP = new Set([
  'lattafa',
  'rasasi',
  'ajmal',
  'armaf',
  'afnan',
  'riiffs',
  'fragrance',
  'world',
  'french',
  'avenue',
  'arabiyat',
  'prestige',
  'perfumes',
  'rayhaan',
  'hermes',
  'guerlain',
  'calvin',
  'klein',
  'dolce',
  'gabbana',
  'eau',
  'parfum',
  'decant',
  'bottle',
  'discovery',
  'set',
  'sample',
  'official',
  'vial',
  'tester',
  'majed',
]);

export function isScentiraProduct(product: Product): boolean {
  return product.brandSlug === 'scentira';
}

export function isScentiraDecant(product: Product): boolean {
  if (!isScentiraProduct(product)) return false;
  if ((product.tags || []).includes('decant')) return true;
  return /\bdecant\b/i.test(product.size || '');
}

export function isScentiraDiscoverySet(product: Product): boolean {
  return isScentiraProduct(product) && product.format === 'discovery-set';
}

export function isScentiraFullBottle(product: Product): boolean {
  return isScentiraProduct(product) && product.format === 'full-size';
}

export function scentiraSizeMl(product: Product): number | null {
  const match = String(product.size || '').match(/(\d+(?:\.\d+)?)\s*ml/i);
  return match ? Number(match[1]) : null;
}

export function scentiraFormatLabel(product: Product): string {
  if (isScentiraDiscoverySet(product)) return 'Discovery set';
  if (isScentiraDecant(product)) {
    const ml = scentiraSizeMl(product);
    return ml ? `${ml}ml decant` : 'Decant';
  }
  if (product.format === 'vial') return product.size || 'Official vial';
  if (isScentiraFullBottle(product)) return product.size || 'Full bottle';
  return product.size || 'Fragrance';
}

function hasBoundedToken(haystack: string, token: string): boolean {
  if (!token || token.length < 3) return false;
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}

function titleCaseToken(token: string): string {
  return token.replace(/\b\w/g, (char) => char.toUpperCase());
}

function scentiraNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[—–-]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !SCENTIRA_NAME_STOP.has(token) && !/^\d/.test(token));
}

export function extractScentiraPopularReference(message: string): string | null {
  const lower = message.toLowerCase();
  const hits = POPULAR_REFERENCE_PERFUMES.filter((ref) => hasBoundedToken(lower, ref)).sort(
    (a, b) => b.length - a.length
  );
  return hits[0] ? titleCaseToken(hits[0]) : null;
}

export function extractScentiraAnyReference(message: string, products: Product[]): string | null {
  return (
    extractScentiraCatalogueReference(message, products) ||
    extractKnownReferencePerfume(message, products) ||
    extractScentiraPopularReference(message)
  );
}

export function extractScentiraCatalogueReference(message: string, products: Product[]): string | null {
  const lower = message.toLowerCase();
  const hits: { token: string; count: number }[] = [];
  const counts = new Map<string, number>();

  for (const product of products.filter(isScentiraProduct)) {
    for (const token of scentiraNameTokens(product.name)) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  for (const [token, count] of counts) {
    if (hasBoundedToken(lower, token)) hits.push({ token, count });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => b.token.length - a.token.length || b.count - a.count);
  return titleCaseToken(hits[0].token);
}

export function resolveScentiraNamedProduct(message: string, products: Product[]): Product | null {
  const pool = products.filter(isScentiraProduct);
  const lower = message.toLowerCase();
  const sizeMl = /\b100\s*ml\b/.test(lower)
    ? 100
    : /\b20\s*ml\b/.test(lower)
      ? 20
      : /\b10\s*ml\b/.test(lower)
        ? 10
        : /\b5\s*ml\b/.test(lower)
          ? 5
          : null;

  const tokenHits = new Map<string, Product[]>();
  for (const product of pool) {
    for (const token of scentiraNameTokens(product.name)) {
      if (!hasBoundedToken(lower, token)) continue;
      const list = tokenHits.get(token) || [];
      if (!list.some((item) => item.id === product.id)) list.push(product);
      tokenHits.set(token, list);
    }
  }
  if (tokenHits.size === 0) return null;

  const ranked = [...tokenHits.entries()].sort((a, b) => b[0].length - a[0].length);
  let candidates = pool;
  for (const [, hits] of ranked) {
    const next = candidates.filter((product) => hits.some((hit) => hit.id === product.id));
    if (next.length > 0) candidates = next;
  }

  if (sizeMl != null) {
    const sized = candidates.filter((product) => scentiraSizeMl(product) === sizeMl);
    if (sized.length > 0) candidates = sized;
  }

  return (
    candidates.find((product) => product.featured) ||
    candidates.find((product) => scentiraSizeMl(product) === 10 && isScentiraDecant(product)) ||
    candidates.find((product) => scentiraSizeMl(product) === 5) ||
    candidates[0] ||
    null
  );
}

export function isScentiraProductInfoAsk(message: string): boolean {
  const t = message.toLowerCase();
  if (/\b(something like|similar to|recommend|show me something|i want something)\b/.test(t)) return false;
  return /\b(tell me about|how much|what size|is (this|it) a decant|is (this|it) a (full )?bottle|what is|describe|price of|notes of|do you have)\b/.test(
    t
  );
}

export function parseScentiraFormatContext(message: string): {
  formatPreference: FormatIntent | null;
  scentiraDecantOnly: boolean;
  requestedSizeMl: ScentiraSizeMl | null;
  explorationIntent: Stage1IntentOutput['exploration_intent'];
  experienceLevel: Stage1IntentOutput['experience_level'];
} {
  const t = message.toLowerCase();
  const requestedSizeMl: ScentiraSizeMl | null = /\b20\s*ml\b/.test(t)
    ? 20
    : /\b10\s*ml\b/.test(t)
      ? 10
      : /\b5\s*ml\b/.test(t)
        ? 5
        : null;

  const wantsDecant = /\bdecants?\b/.test(t);
  const wantsDiscoverySet =
    /\bdiscovery\s+sets?\b/.test(t) ||
    /\b(i want to explore|help me explore|let me explore)\b/.test(t) ||
    /\bexplore\s+(a\s+)?(few|several)\b/.test(t);
  const wantsFullBottle =
    /\b(full[- ]size|full[- ]bottles?|retail\s+bottles?)\b/.test(t) ||
    (/\bbottles?\b/.test(t) &&
      !wantsDecant &&
      !wantsDiscoverySet &&
      !/\b(sample|vial|decant|5\s*ml|10\s*ml|20\s*ml)\b/.test(t));
  const wantsTryFirst =
    /\b(try\s+(it\s+)?(first|before)|before\s+buy|don'?t\s+want\s+to\s+commit|never\s+tried|safer\s+way\s+to\s+try)\b/.test(
      t
    );
  const wantsTravelSize = /\btravel\s+size\b/.test(t);
  const wantsSmall = (/\b(small|something\s+small|compact)\b/.test(t) || wantsTravelSize) && !wantsFullBottle;
  const wantsSample = /\bsamples?\b/.test(t) && !wantsDecant && !wantsDiscoverySet;

  let formatPreference: FormatIntent | null = null;
  let scentiraDecantOnly = false;

  if (wantsDiscoverySet) {
    formatPreference = 'DISCOVERY_SET';
  } else if (requestedSizeMl === 5) {
    formatPreference = 'MINIATURE';
    scentiraDecantOnly = true;
  } else if (requestedSizeMl === 10 || requestedSizeMl === 20) {
    formatPreference = 'POCKET_SIZE';
    scentiraDecantOnly = true;
  } else if (wantsDecant || wantsTravelSize) {
    scentiraDecantOnly = true;
  } else if (wantsFullBottle) {
    formatPreference = 'FULL_SIZE';
  } else if (wantsTryFirst || wantsSample) {
    formatPreference = 'TRY_SAMPLE';
  } else if (wantsSmall) {
    scentiraDecantOnly = true;
  }

  const experienceLevel = /\b(never\s+tried|new\s+to|beginner|first\s+time|don'?t\s+know\s+what\s+i\s+like)\b/.test(t)
    ? 'beginner'
    : /\b(already\s+(own|know|love)|experienced)\b/.test(t)
      ? 'experienced'
      : null;

  const explorationIntent = wantsFullBottle
    ? 'full-bottle-confidence'
    : wantsDiscoverySet || /\b(i don'?t know what i like|explore|no preference)\b/.test(t)
      ? 'compare-several'
      : wantsTryFirst || experienceLevel === 'beginner'
        ? 'sampling'
        : wantsDecant || wantsSmall
          ? 'travel'
          : null;

  return { formatPreference, scentiraDecantOnly, requestedSizeMl, explorationIntent, experienceLevel };
}

export function applyScentiraContextToStage1(
  stage1: Stage1IntentOutput,
  message: string,
  products: Product[] = []
): Stage1IntentOutput {
  const parsed = parseScentiraFormatContext(message);
  const hasScentiraFormat = Boolean(parsed.formatPreference || parsed.scentiraDecantOnly || parsed.requestedSizeMl);
  const isBroadScentira =
    /\b(i don'?t know what i like|i don'?t have anything specific|show me something good|what should i try|no preference)\b/i.test(
      message
    );
  const wearingOnly =
    /\b(usually\s+wear|currently\s+(use|wear)|already\s+(use|wear)|i\s+(use|wear)|is what i use)\b/i.test(
      message
    ) &&
    !/\b(recommend|give\s+me|show\s+me|want|similar|alternative|something like)\b/i.test(message);

  const next: Stage1IntentOutput = {
    ...stage1,
    format_preference: hasScentiraFormat ? parsed.formatPreference : stage1.format_preference ?? null,
    exploration_intent: parsed.explorationIntent ?? stage1.exploration_intent ?? null,
    experience_level: parsed.experienceLevel ?? stage1.experience_level ?? null,
    scentira_decant_only: parsed.scentiraDecantOnly || Boolean(stage1.scentira_decant_only),
    requested_size_ml: parsed.requestedSizeMl ?? stage1.requested_size_ml ?? null,
  };

  if (/\bless\s+sweet\b/i.test(message)) {
    const excluded = new Set([...(next.excluded_families || []), 'sweet', 'gourmand']);
    next.excluded_families = Array.from(excluded);
    next.sweetness = null;
    next.needs_recommendations = next.intent === 'OUT_OF_SCOPE' ? next.needs_recommendations : true;
    next.updates = [
      ...(next.updates || []).filter((update) => update.field !== 'excluded_families'),
      { field: 'excluded_families', operation: 'ADD', value: ['sweet', 'gourmand'] },
    ];
  }

  if (
    !next.reference_perfume &&
    next.intent !== 'OUT_OF_SCOPE' &&
    next.intent !== 'CART_ASSISTANCE' &&
    (messageHasReferenceCue(message) || wearingOnly)
  ) {
    const extracted = extractScentiraAnyReference(message, products);
    if (extracted) {
      next.reference_perfume = extracted;
      if (!wearingOnly) {
        next.is_similarity_request = true;
        next.needs_recommendations = true;
        next.requires_product_data = true;
      }
    }
  }

  if (isBroadScentira && next.intent !== 'OUT_OF_SCOPE') {
    next.intent = 'RECOMMENDATION';
    next.needs_recommendations = true;
    next.is_broad_recommendation = true;
    next.is_surprise_me = true;
    next.needs_clarification = false;
    next.requires_product_data = true;
    if (next.request_type === 'other' || !next.request_type) {
      next.request_type = 'new_consultation';
    }
  }

  if (wearingOnly && next.intent !== 'OUT_OF_SCOPE' && next.intent !== 'CART_ASSISTANCE') {
    next.intent = 'PREFERENCE_UPDATE';
    next.needs_recommendations = false;
    next.is_similarity_request = false;
    next.needs_clarification = false;
    next.requires_product_data = false;
    if (!next.reference_perfume) {
      next.reference_perfume = extractScentiraAnyReference(message, products);
    }
  } else if (
    (next.intent === 'CUSTOMER_OBJECTION' || next.intent === 'CLARIFICATION') &&
    /\b(something like|similar to|alternative to|smells?\s+like)\b/i.test(message)
  ) {
    next.intent = 'SIMILAR_TO_REFERENCE';
    next.needs_recommendations = true;
    next.is_similarity_request = true;
    next.requires_product_data = true;
    next.needs_clarification = false;
    if (!next.reference_perfume) {
      next.reference_perfume = extractScentiraAnyReference(message, products);
    }
  }

  return next;
}

const SCENTIRA_SWEET_GOURMAND_SIGNAL =
  /\b(sweet|sweeter|gourmand|sugary|sugar|candy|caramel|toffee|chocolate)\b/i;

export function scentiraViolatesExcludedFamily(
  product: Product,
  excludedFamilies: string[] | undefined
): { valid: boolean; reason?: string } {
  if (!isScentiraProduct(product) || !excludedFamilies || excludedFamilies.length === 0) {
    return { valid: true };
  }
  const haystack = [product.name, product.description, ...(product.tags || []), ...(product.fragranceFamily || [])]
    .join(' ')
    .toLowerCase();
  for (const fam of excludedFamilies) {
    const target = fam.toLowerCase().trim();
    if (!target) continue;
    if (target === 'sweet' || target === 'gourmand') {
      if (SCENTIRA_SWEET_GOURMAND_SIGNAL.test(haystack)) {
        return { valid: false, reason: `Verified Scentira copy indicates a ${target} profile` };
      }
    }
  }
  return { valid: true };
}

export function scentiraResolvedCartMessage(message: string, state?: ConversationState): string {
  const selected = state?.lastSelectedProductSet || [];
  if (selected.length === 0) return message;
  if (!/\badd\s+(it|them|this|that|these|those)\b/i.test(message)) return message;
  return `Add ${selected.map((item) => item.name).join(' and ')} to cart`;
}

export function applyScentiraCartFollowUp(
  stage1: Stage1IntentOutput,
  message: string,
  state?: ConversationState
): Stage1IntentOutput {
  if (stage1.intent !== 'CART_ASSISTANCE') return stage1;
  const selected = state?.lastSelectedProductSet || [];
  if (selected.length === 0) return stage1;
  if (!/\badd\s+(it|them|this|that|these|those)\b/i.test(message)) return stage1;
  return {
    ...stage1,
    product_references: selected.map((item) => item.name),
    target_product_names: selected.map((item) => item.name),
  };
}

export function scentiraAsksOriginalKhamrah(message: string): boolean {
  const t = message.toLowerCase();
  if (!/\bkhamrah\b/.test(t)) return false;
  if (/\b(something like|similar to|alternative to)\b/.test(t)) return false;
  return /\b(original|the original|classic khamrah|do you (still )?have (original )?khamrah|have (original )?khamrah)\b/.test(
    t
  );
}

export function scentiraOriginalKhamrahReply(products: Product[]): string {
  const related = products.filter((product) => isScentiraProduct(product) && /khamrah/i.test(product.name));
  const listed = related
    .map((product) => `${product.name} — ${product.size} at ₹${product.price}`)
    .join('; ');
  return listed
    ? `We don't currently stock original Lattafa Khamrah or Khamrah Qahwa as a standalone in-stock bottle. What we do have: ${listed}. I can walk you through any of these or help you pick a format.`
    : `We don't currently stock original Lattafa Khamrah or Khamrah Qahwa as a standalone in-stock bottle.`;
}

export function detectScentiraFormatEducation(message: string): boolean {
  const t = message.toLowerCase();
  if (
    /\b(i want|give me|show me|add|buy|recommend|actually)\b/.test(t) &&
    !/\b(difference|different|versus|\bvs\b|better for|should i)\b/.test(t)
  ) {
    return false;
  }
  return (
    /\b(decant|sample|full bottle|discovery set|5\s*ml|10\s*ml|20\s*ml|format)\b/.test(t) &&
    /\b(difference|different|vs|versus|better for|should i get|what.?s better|what size)\b/.test(t)
  );
}

export function scentiraFormatEducationReply(message: string): string {
  const t = message.toLowerCase();
  if (/\bdecant\b/.test(t) && /\b(bottle|full)\b/.test(t)) {
    return 'A Scentira decant is a 5ml, 10ml, or 20ml pour from the same fragrance so you can try it before a full bottle. A full bottle is the retail size when you already know the scent. I will only suggest a size that is actually listed.';
  }
  if (/\btry\b/.test(t) || /\bsample\b/.test(t)) {
    return 'If you have not worn it yet, start with a small listed format — a discovery vial or a 5ml decant when that SKU exists. I will not invent a size that is not in the catalogue.';
  }
  return 'Scentira formats are listed SKUs: discovery/sample options, 5ml / 10ml / 20ml decants, and full bottles. I only recommend a format when that exact product is in stock.';
}

export function scentiraHardFormatFilter(
  product: Product,
  preferences: StructuredPreferences
): { valid: boolean; reason?: string } {
  if (!isScentiraProduct(product)) return { valid: true };

  const sizeMl = preferences.requestedSizeMl;
  if (sizeMl && scentiraSizeMl(product) !== sizeMl) {
    return { valid: false, reason: `Size ${product.size} does not match requested ${sizeMl}ml` };
  }

  if (preferences.scentiraDecantOnly && !isScentiraDecant(product)) {
    return { valid: false, reason: `Not a Scentira decant (${product.size})` };
  }

  const intent = preferences.formatPreference;
  if (!intent || intent === 'NO_FORMAT_PREFERENCE') return { valid: true };

  if (intent === 'FULL_SIZE') {
    return isScentiraFullBottle(product)
      ? { valid: true }
      : { valid: false, reason: 'Requested a full bottle' };
  }
  if (intent === 'DISCOVERY_SET') {
    return isScentiraDiscoverySet(product)
      ? { valid: true }
      : { valid: false, reason: 'Requested a discovery set' };
  }
  if (intent === 'MINIATURE') {
    return product.format === 'miniature' || scentiraSizeMl(product) === 5
      ? { valid: true }
      : { valid: false, reason: 'Requested a 5ml decant' };
  }
  if (intent === 'POCKET_SIZE') {
    return product.format === 'pocket' || scentiraSizeMl(product) === 10 || scentiraSizeMl(product) === 20
      ? { valid: true }
      : { valid: false, reason: 'Requested a 10/20ml decant' };
  }
  if (intent === 'TRY_SAMPLE' || intent === 'TRY_VIAL') {
    const tryFirst =
      product.format === 'vial' ||
      product.format === 'miniature' ||
      scentiraSizeMl(product) === 5 ||
      ((product.tags || []).includes('tester') && scentiraSizeMl(product) != null && scentiraSizeMl(product)! <= 5);
    return tryFirst ? { valid: true } : { valid: false, reason: 'Requested a small try-first format' };
  }
  return { valid: true };
}

export const SCENTIRA_GROQ_NOTE = `
SCENTIRA FORMAT LADDER (this brand only):
- Discover: 1.5ml discovery/sample options that actually exist in the catalogue.
- Try: 5ml / 10ml / 20ml decants. Call them decants, never official samples, factory-sealed samples, or official minis.
- Commit: full bottle.
If the user asks for a decant, 5ml, 10ml, 20ml, or a full bottle, treat that as a hard format requirement.
If they name a fragrance that is not an exact in-stock SKU (for example original Khamrah), do not invent availability. Stay with listed Scentira products.
`;

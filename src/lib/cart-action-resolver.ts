import { Product } from '@/types/product';
import {
  CanonicalProductRef,
  CartActionItem,
  CartActionPayload,
  ConversationState,
  Stage1IntentOutput,
} from '@/types/chat';
import { BrandConfig } from '@/types/brand';
import { safeGroqCompletion, getGroqModel } from './groq-client';

export interface CartResolutionResult {
  action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART';
  resolved: Product[];
  failed: { reference: string; reason: string }[];
  needsClarification: boolean;
  clarificationQuestion?: string;
}

const ORDINAL_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function wordToNumber(raw: string): number | null {
  const t = raw.toLowerCase().trim();
  if (ORDINAL_WORDS[t] != null) return ORDINAL_WORDS[t];
  const n = parseInt(t, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function isExplicitCartActionQuery(message: string, products: Product[] = []): boolean {
  const lower = message.toLowerCase();
  if (
    /\b(add|put|remove)\b[\s\S]{0,120}\b(cart|basket)\b/i.test(lower) ||
    /\b(what(?:'s|s|\s+is)\s+in\s+my\s+cart|show\s+(?:me\s+)?my\s+cart|view\s+(?:my\s+)?cart)\b/i.test(lower) ||
    /\b(how\s+many\s+(?:perfumes?|items?|fragrances?)\s+(?:are\s+)?(?:in\s+(?:my\s+)?cart|do\s+i\s+have))\b/i.test(lower) ||
    /\b(how\s+much\s+(?:is|for)\s+my\s+cart|what(?:'s|s|\s+is)\s+my\s+(?:cart\s+)?(?:sub)?total|how\s+much\s+is\s+(?:the\s+)?(?:sub)?total)\b/i.test(lower) ||
    /\b(do\s+i\s+have\s+anything\s+in\s+my\s+cart|is\s+my\s+cart\s+empty)\b/i.test(lower) ||
    /\b(add|put)\s+(all|both|these|those|them|everything)\b/i.test(lower) ||
    /\b(add|put)\s+(?:numbers?\s+)?(?:the\s+)?(?:first|second|third|fourth|fifth|\d+)\b/i.test(lower) ||
    /\b(i'?ll take|let'?s get|yeah add|okay add|ok add)\s+(all|both|the first|those|these|them)\b/i.test(lower)
  ) {
    return true;
  }
  if (products.length > 0 && /\b(add|put|remove)\b/i.test(lower) && !/\b(recommend|show me|similar)\b/i.test(lower)) {
    const named = findNamedProductsInText(message, products);
    if (named.length >= 2) return true;
  }
  return false;
}

export function inferCartActionType(message: string): 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART' {
  const lower = message.toLowerCase();
  if (/\b(remove|take\s+.+\s+out)\b/.test(lower) && !/\badd\b/.test(lower)) {
    return 'REMOVE_FROM_CART';
  }
  if (
    /\b(what(?:'s|s|\s+is)\s+in\s+my\s+cart|show\s+(?:me\s+)?my\s+cart|view\s+(?:my\s+)?cart)\b/.test(lower) ||
    /\b(how\s+many\s+(?:perfumes?|items?|fragrances?)\s+(?:are\s+)?(?:in\s+(?:my\s+)?cart|do\s+i\s+have))\b/.test(lower) ||
    /\b(how\s+much\s+(?:is|for)\s+my\s+cart|what(?:'s|s|\s+is)\s+my\s+(?:cart\s+)?(?:sub)?total|how\s+much\s+is\s+(?:the\s+)?(?:sub)?total)\b/.test(lower) ||
    /\b(do\s+i\s+have\s+anything\s+in\s+my\s+cart|is\s+my\s+cart\s+empty)\b/.test(lower)
  ) {
    return 'VIEW_CART';
  }
  if (/\b(add|put|i'?ll take|let'?s get)\b/.test(lower)) {
    return 'ADD_TO_CART';
  }
  return 'VIEW_CART';
}

export function matchBrandProductByName(query: string, products: Product[]): Product | undefined {
  if (!query) return undefined;
  const clean = query.toLowerCase().trim().replace(/[“”"']/g, '');
  if (!clean || /^(this|that|it|these|those|them|both|all)$/.test(clean)) {
    return undefined;
  }

  const exact = products.find(
    (p) => p.name.toLowerCase() === clean || p.slug.toLowerCase() === clean
  );
  if (exact) return exact;

  const contained = products
    .filter((p) => {
      const name = p.name.toLowerCase();
      return name.length >= 4 && (clean.includes(name) || name.includes(clean));
    })
    .sort((a, b) => b.name.length - a.name.length);
  if (contained.length === 1) return contained[0];
  if (contained.length > 1) {
    const best = contained[0];
    if (best.name.toLowerCase() === clean || clean.includes(best.name.toLowerCase())) {
      return best;
    }
  }

  let bestFuzzy: Product | undefined;
  let bestDist = Infinity;
  for (const p of products) {
    const name = p.name.toLowerCase();
    const dist = levenshtein(clean, name);
    const allowed = Math.max(1, Math.floor(name.length * 0.25));
    if (dist <= allowed && dist < bestDist) {
      bestDist = dist;
      bestFuzzy = p;
    }
  }
  return bestFuzzy;
}

export function findNamedProductsInText(text: string, products: Product[]): Product[] {
  if (!text) return [];
  const sorted = [...products].sort((a, b) => b.name.length - a.name.length);
  const matched: Product[] = [];
  let remaining = ` ${text} `;
  let found = true;
  while (found) {
    found = false;
    const lower = remaining.toLowerCase();
    for (const p of sorted) {
      const name = p.name.toLowerCase();
      const idx = lower.indexOf(name);
      if (idx === -1) continue;
      const before = lower[idx - 1] || ' ';
      const after = lower[idx + name.length] || ' ';
      if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
      matched.push(p);
      remaining = remaining.slice(0, idx) + ' ' + remaining.slice(idx + name.length);
      found = true;
      break;
    }
  }
  return matched;
}

function isContextualToken(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return (
    /^(all|both|this|that|these|those|them|everything)$/.test(t) ||
    /^(all|first_n|last_n|position|range|recommendation):\d+(-\d+)?$/i.test(t) ||
    /^(first|second|third|fourth|fifth)$/.test(t) ||
    /^\d+$/.test(t)
  );
}

export function extractContextualReferences(message: string): string[] {
  const lower = message.toLowerCase();
  const refs: string[] = [];

  const allN = lower.match(/\ball(?:\s+of)?(?:\s+the)?\s+(\d+|two|three|four|five|six)\b/);
  if (allN) {
    const n = wordToNumber(allN[1]);
    if (n) refs.push(`ALL:${n}`);
  } else if (
    /\b(all of them|them all|add all|put all|all these|all those|everything)\b/.test(lower)
  ) {
    refs.push('ALL');
  }

  if (/\bboth\b/.test(lower)) {
    refs.push('BOTH');
  }

  const firstN = lower.match(/\b(?:the\s+)?first\s+(\d+|two|three|four|five)\b/);
  if (firstN) {
    const n = wordToNumber(firstN[1]);
    if (n) refs.push(`FIRST_N:${n}`);
  }

  const lastN = lower.match(/\b(?:the\s+)?last\s+(\d+|two|three|four|five)\b/);
  if (lastN) {
    const n = wordToNumber(lastN[1]);
    if (n) refs.push(`LAST_N:${n}`);
  }

  const ordinalPair = lower.match(
    /\b(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:\s+one)?\s+and\s+(?:the\s+)?(first|second|third|fourth|fifth|\d+)(?:\s+one)?\b/
  );
  if (ordinalPair && !firstN) {
    const a = wordToNumber(ordinalPair[1]);
    const b = wordToNumber(ordinalPair[2]);
    if (a) refs.push(`POSITION:${a}`);
    if (b) refs.push(`POSITION:${b}`);
  } else if (!firstN && !allN) {
    const singleOrdinal = lower.match(
      /\b(?:the\s+|number\s+|no\.?\s+|#\s*)(first|second|third|fourth|fifth|\d+)(?:\s+one)?\b/
    );
    if (singleOrdinal && !/\ball\s+\d+\b/.test(lower)) {
      const n = wordToNumber(singleOrdinal[1]);
      if (n) refs.push(`POSITION:${n}`);
    }
  }

  if (refs.some((r) => r.startsWith('POSITION:')) === false && !firstN && !allN) {
    const numberList = lower.match(
      /\b(?:add|put|remove|numbers?)\s+(\d+(?:\s*(?:,|and|&|\+)\s*\d+)+)\b/
    );
    if (numberList) {
      const nums = numberList[1].match(/\d+/g) || [];
      for (const num of nums) {
        refs.push(`POSITION:${num}`);
      }
    }
  }

  if (/\bthose two\b|\bthese two\b/.test(lower)) {
    refs.push('BOTH');
  } else if (/\b(these|those|them)\b/.test(lower) && !refs.includes('ALL') && !refs.some((r) => r.startsWith('ALL:'))) {
    refs.push('THESE');
  }

  if (/\b(this|that)\b/.test(lower) && refs.length === 0) {
    refs.push('THIS');
  }

  return refs;
}

function leftoverNameCandidates(message: string, matched: Product[]): string[] {
  let remaining = message;
  const sorted = [...matched].sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    remaining = remaining.replace(new RegExp(p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'ig'), ' ');
  }
  return remaining
    .split(/\s*(?:,| and | plus | \+| & )\s*/i)
    .map((part) =>
      part
        .replace(/\b(add|put|remove|to|in|into|my|the|a|of|cart|basket|please|fragrance|perfume|bottle)\b/gi, ' ')
        .replace(/[^a-z0-9\s-]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((part) => part.length >= 3 && !/^(all|both|this|that|these|those|them|and|or|plus|with)$/i.test(part));
}

export function extractCartProductReferences(message: string, products: Product[]): string[] {
  const named = findNamedProductsInText(message, products);
  if (named.length > 0) {
    const extras = leftoverNameCandidates(message, named);
    return [...named.map((p) => p.name), ...extras];
  }
  return extractContextualReferences(message);
}

export function normalizeProductReferencesList(
  references: string[] | undefined,
  message: string,
  products: Product[]
): string[] {
  const incoming = (references || []).map((r) => String(r).trim()).filter(Boolean);
  const expanded: string[] = [];

  const pushUniqueToken = (token: string) => {
    const t = token.trim();
    if (!t) return;
    expanded.push(t);
  };

  if (incoming.length === 0) {
    return extractCartProductReferences(message, products);
  }

  for (const raw of incoming) {
    const token = raw.replace(/^recommendation:/i, '').trim();
    const contextualFromToken = extractContextualReferences(token);
    if (contextualFromToken.length > 0 && findNamedProductsInText(token, products).length === 0) {
      contextualFromToken.forEach(pushUniqueToken);
      continue;
    }
    if (isContextualToken(token) || /^(ALL|BOTH|THIS|THAT|THESE|THOSE|FIRST_N|LAST_N|POSITION|RANGE):/i.test(token)) {
      if (/^\d+$/.test(token)) {
        pushUniqueToken(`POSITION:${token}`);
      } else if (/^(first|second|third|fourth|fifth)$/i.test(token)) {
        pushUniqueToken(`POSITION:${wordToNumber(token)}`);
      } else {
        pushUniqueToken(token.toUpperCase());
      }
      continue;
    }

    const namedInRef = findNamedProductsInText(token, products);
    if (namedInRef.length > 1) {
      namedInRef.forEach((p) => pushUniqueToken(p.name));
      continue;
    }
    if (namedInRef.length === 1) {
      pushUniqueToken(namedInRef[0].name);
      continue;
    }

    const fuzzy = matchBrandProductByName(token, products);
    if (fuzzy) {
      pushUniqueToken(fuzzy.name);
      continue;
    }

    pushUniqueToken(token);
  }

  if (expanded.length === 1) {
    const only = expanded[0];
    const namedInOnly = findNamedProductsInText(only, products);
    if (namedInOnly.length > 1) {
      return namedInOnly.map((p) => p.name);
    }
  }

  return expanded;
}

function scopedSet(set: CanonicalProductRef[] | undefined, brandSlug?: string): CanonicalProductRef[] {
  if (!set || set.length === 0) return [];
  if (!brandSlug) return set;
  return set.filter((p) => p.brandSlug === brandSlug);
}

function setFromIds(ids: string[], brandProducts: Product[], brandSlug: string): CanonicalProductRef[] {
  return ids
    .map((id) => brandProducts.find((p) => p.id === id))
    .filter(Boolean)
    .map((p) => ({
      productId: p!.id,
      brandSlug,
      name: p!.name,
    }));
}

export function getRecommendationSet(
  state: ConversationState | undefined,
  brandProducts: Product[],
  brandSlug: string
): CanonicalProductRef[] {
  const fromCanonical = scopedSet(state?.lastCanonicalProductSet, brandSlug);
  if (fromCanonical.length > 0) return fromCanonical;
  return setFromIds(state?.lastRecommendationIds || [], brandProducts, brandSlug);
}

export function getDiscussedSet(
  state: ConversationState | undefined,
  brandProducts: Product[],
  brandSlug: string
): CanonicalProductRef[] {
  const discussed = scopedSet(state?.lastDiscussedProductSet, brandSlug);
  if (discussed.length > 0) return discussed;
  return getRecommendationSet(state, brandProducts, brandSlug);
}

function productFromCanonical(ref: CanonicalProductRef, products: Product[]): Product | undefined {
  return products.find((p) => p.id === ref.productId);
}

export function resolveCartProductReferences(options: {
  references: string[];
  action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART';
  brandProducts: Product[];
  brandSlug: string;
  state?: ConversationState;
  contextProductSlug?: string;
}): CartResolutionResult {
  const { references, action, brandProducts, brandSlug, state, contextProductSlug } = options;
  const recommendationSet = getRecommendationSet(state, brandProducts, brandSlug);
  const discussedSet = getDiscussedSet(state, brandProducts, brandSlug);
  const resolved: Product[] = [];
  const failed: { reference: string; reason: string }[] = [];
  let needsClarification = false;
  let clarificationQuestion: string | undefined;

  const clarify = (question: string): CartResolutionResult => ({
    action,
    resolved: [],
    failed: [],
    needsClarification: true,
    clarificationQuestion: question,
  });

  if (action === 'VIEW_CART') {
    return { action, resolved: [], failed: [], needsClarification: false };
  }

  const addFromSet = (slice: CanonicalProductRef[]) => {
    for (const item of slice) {
      const prod = productFromCanonical(item, brandProducts);
      if (prod) resolved.push(prod);
      else failed.push({ reference: item.name, reason: 'not_in_brand_catalogue' });
    }
  };

  const contextProduct = contextProductSlug
    ? brandProducts.find((p) => p.slug === contextProductSlug || p.id === contextProductSlug)
    : undefined;

  if (references.length === 0) {
    if (contextProduct) {
      return { action, resolved: [contextProduct], failed: [], needsClarification: false };
    }
    return clarify('Which fragrance would you like me to update in your cart?');
  }

  for (const raw of references) {
    const token = raw.trim();
    const upper = token.toUpperCase();

    if (upper === 'ALL' || upper.startsWith('ALL:')) {
      const expected = upper.startsWith('ALL:') ? parseInt(upper.split(':')[1], 10) : null;
      if (recommendationSet.length === 0) {
        return clarify('I don’t have a current set of recommended fragrances to add. Which products did you mean?');
      }
      if (expected != null && recommendationSet.length !== expected) {
        return clarify(
          `I currently have ${recommendationSet.length} recommended fragrance${recommendationSet.length === 1 ? '' : 's'}, not ${expected}. Which ones should I add?`
        );
      }
      addFromSet(recommendationSet);
      continue;
    }

    if (upper === 'BOTH') {
      if (discussedSet.length === 2) {
        addFromSet(discussedSet);
      } else if (recommendationSet.length === 2) {
        addFromSet(recommendationSet);
      } else {
        return clarify('I’m not sure which two fragrances you mean. Could you name them?');
      }
      continue;
    }

    if (upper === 'THESE' || upper === 'THOSE' || upper === 'THEM') {
      const set = discussedSet.length > 0 ? discussedSet : recommendationSet;
      if (set.length === 0) {
        return clarify('I’m not sure which fragrances you mean. Could you name them?');
      }
      addFromSet(set);
      continue;
    }

    if (upper === 'THIS' || upper === 'THAT' || upper === 'IT') {
      if (contextProduct) {
        resolved.push(contextProduct);
      } else if (discussedSet.length === 1) {
        addFromSet(discussedSet);
      } else if (recommendationSet.length === 1) {
        addFromSet(recommendationSet);
      } else {
        return clarify('Which fragrance do you mean by “this”?');
      }
      continue;
    }

    if (upper.startsWith('FIRST_N:')) {
      const n = parseInt(upper.split(':')[1], 10);
      if (!recommendationSet.length || recommendationSet.length < n) {
        return clarify('I don’t have enough numbered recommendations to use that reference. Which products should I add?');
      }
      addFromSet(recommendationSet.slice(0, n));
      continue;
    }

    if (upper.startsWith('LAST_N:')) {
      const n = parseInt(upper.split(':')[1], 10);
      if (!recommendationSet.length || recommendationSet.length < n) {
        return clarify('I don’t have enough numbered recommendations to use that reference. Which products should I add?');
      }
      addFromSet(recommendationSet.slice(-n));
      continue;
    }

    if (upper.startsWith('POSITION:') || /^\d+$/.test(token)) {
      const n = parseInt(upper.includes(':') ? upper.split(':')[1] : token, 10);
      if (!recommendationSet.length || n < 1 || n > recommendationSet.length) {
        failed.push({ reference: token, reason: 'no_matching_recommendation_position' });
        needsClarification = recommendationSet.length === 0;
        continue;
      }
      addFromSet([recommendationSet[n - 1]]);
      continue;
    }

    const named = findNamedProductsInText(token, brandProducts);
    if (named.length > 0) {
      resolved.push(...named);
      continue;
    }

    const matched = matchBrandProductByName(token, brandProducts);
    if (matched) {
      resolved.push(matched);
    } else {
      failed.push({ reference: token, reason: 'not_in_brand_catalogue' });
    }
  }

  if (needsClarification && resolved.length === 0) {
    return clarify('I don’t have a numbered recommendation list to work from. Which fragrances should I add?');
  }

  if (resolved.length === 0 && failed.length > 0 && references.every((r) => isContextualToken(r))) {
    return clarify('I’m not sure which fragrances you mean. Could you name them?');
  }

  return {
    action,
    resolved,
    failed,
    needsClarification: false,
    clarificationQuestion,
  };
}

export function toCanonicalProductSet(products: Product[], brandSlug: string): CanonicalProductRef[] {
  return products.map((p) => ({
    productId: p.id,
    brandSlug: p.brandSlug || brandSlug,
    name: p.name,
  }));
}

export function buildCartActionPayload(
  result: CartResolutionResult,
  brandSlug: string
): CartActionPayload | undefined {
  if (result.action === 'VIEW_CART') {
    return {
      action: 'VIEW_CART',
      success: true,
    };
  }

  if (result.needsClarification || result.resolved.length === 0) {
    return undefined;
  }

  const items: CartActionItem[] = result.resolved.map((p) => ({
    productId: p.id,
    brandSlug,
    productName: p.name,
    quantity: 1,
  }));

  const first = items[0];
  return {
    action: result.action,
    productId: first.productId,
    brandSlug,
    productName: first.productName,
    quantity: 1,
    success: true,
    items,
    added: result.action === 'ADD_TO_CART' ? items : undefined,
    removed: result.action === 'REMOVE_FROM_CART' ? items : undefined,
    failed: result.failed,
  };
}

export async function extractCartEntitiesWithGroq(options: {
  message: string;
  brand: BrandConfig;
  products: Product[];
  canonicalSet: CanonicalProductRef[];
  contextProductName?: string | null;
}): Promise<{ cart_action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART'; product_references: string[] } | null> {
  const { message, brand, products, canonicalSet, contextProductName } = options;
  const catalogueNames = products.map((p) => p.name);
  const numberedSet = canonicalSet.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n') || '(none)';

  const prompt = `You extract cart-action entities for "${brand.name}".
Return ONLY JSON:
{
  "cart_action": "ADD_TO_CART" | "REMOVE_FROM_CART" | "VIEW_CART",
  "product_references": string[]
}

Rules:
- Split multiple product names into SEPARATE array items. Never return "Ocean Breeze and White Musk" as one string.
- Commas and "and"/"plus"/"both" separate products.
- For latest recommendations, use tokens: "ALL", "ALL:N", "BOTH", "THIS", "THESE", "FIRST_N:2", "POSITION:1", "POSITION:3".
- Example: "add all 3" with 3 recommended products -> ["ALL:3"]
- Example: "add 1 and 3" -> ["POSITION:1", "POSITION:3"]
- Example: "add the first two" -> ["FIRST_N:2"]
- Example: "add this" -> ["THIS"]
- Never invent product IDs. Names only, or the tokens above.
- If the user is asking what is in the cart, cart_action is VIEW_CART and product_references is [].

Catalogue names: ${JSON.stringify(catalogueNames)}
Latest recommended set:
${numberedSet}
Current product page: ${contextProductName || '(none)'}
`;

  const raw = await safeGroqCompletion({
    model: getGroqModel(),
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: message },
    ],
    temperature: 0,
    max_tokens: 400,
    response_format: { type: 'json_object' },
  });
  if (!raw) return null;
  try {
    let text = raw.trim();
    const first = text.indexOf('{');
    const last = text.lastIndexOf('}');
    if (first !== -1 && last > first) text = text.slice(first, last + 1);
    const parsed = JSON.parse(text);
    const action = inferCartActionType(message);
    const parsedAction =
      parsed.cart_action === 'ADD_TO_CART' ||
      parsed.cart_action === 'REMOVE_FROM_CART' ||
      parsed.cart_action === 'VIEW_CART'
        ? parsed.cart_action
        : action;
    const refs = Array.isArray(parsed.product_references)
      ? parsed.product_references.map((r: unknown) => String(r))
      : parsed.product_reference
        ? [String(parsed.product_reference)]
        : [];
    return {
      cart_action: parsedAction,
      product_references: refs,
    };
  } catch {
    return null;
  }
}

export function emptyCartStage1(
  action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART',
  references: string[]
): Stage1IntentOutput {
  return {
    intent: 'CART_ASSISTANCE',
    request_type: 'other',
    is_new_request: false,
    is_refinement: false,
    fragrance_families: [],
    preferred_notes: [],
    excluded_notes: [],
    excluded_families: [],
    product_reference: references[0] || null,
    product_references: references,
    target_product_names: references.filter((r) => !isContextualToken(r)),
    cart_action: action,
    confidence: 0.98,
    needs_recommendations: false,
    needs_clarification: false,
    preferences: {},
    requires_product_data: false,
  };
}

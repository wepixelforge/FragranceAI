import { Product, StructuredPreferences } from '@/types/product';
import {
  CanonicalProductRef,
  CartActionItem,
  CartActionPayload,
  ConversationState,
  PendingCartAction,
  Stage1IntentOutput,
} from '@/types/chat';
import { BrandConfig } from '@/types/brand';
import { safeGroqCompletion, getGroqModel } from './groq-client';
import { LiveCartContext } from './live-cart-context';
import { formatPrice } from './brand-utils';
import { parseQuery } from './query-parser';
import { getRecommendations } from './recommendation-engine';

import { isAuthorizedCartMutation } from './cart-authorization';

export { isAuthorizedCartMutation } from './cart-authorization';

export type CartMutationAction = 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART' | 'CLEAR_CART';

export interface CartResolutionResult {
  action: CartMutationAction;
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

export function detectCartConfirmation(message: string): 'CONFIRM' | 'CANCEL' | null {
  const t = message.toLowerCase().trim();
  if (!t) return null;

  const hasNo =
    /^(no|nope)[.!\s]*$/i.test(t) ||
    /\b(cancel|never\s*mind|don'?t|do\s+not|keep\s+(them|it)|leave\s+(them|it)|stop|not\s+now)\b/i.test(t);
  const hasYes = /\b(yes|yeah|yep|yup|sure|ok|okay|do\s+it|go\s+ahead|proceed|please\s+do|that'?s\s+right|confirm)\b/i.test(t);

  if (hasNo && !hasYes) return 'CANCEL';
  if (
    hasYes ||
    /\b(clear\s+it|empty\s+it|remove\s+them|remove\s+it|empty\s+the\s+cart|clear\s+the\s+cart)\b/i.test(t) ||
    (/^\s*(everything|all(\s+of\s+it)?)\s*[.!]?\s*$/i.test(t) && !/\badd\b/i.test(t))
  ) {
    return 'CONFIRM';
  }
  return null;
}

function hasCartNoun(lower: string): boolean {
  return /\b(cart|basket)\b/i.test(lower);
}

function isDiscoveryRequest(lower: string): boolean {
  return /\b(recommend|show\s+me|find\s+me|similar|something\s+(fresh|woody|floral|sweet|spicy)|for\s+(office|summer|date))\b/i.test(lower);
}

function isAddVerb(lower: string): boolean {
  return /\b(add|put|i'?ll\s+take|let'?s\s+get|i'?ll\s+take\s+this)\b/i.test(lower);
}

function isRemoveVerb(lower: string): boolean {
  return (
    /\b(remove|delete|discard)\b/i.test(lower) ||
    /\b(take|get|throw)\b[\s\S]{0,50}\b(out|away|off)\b/i.test(lower) ||
    /\bget\s+rid\s+of\b/i.test(lower) ||
    /\bi\s+don'?t\s+want\b[\s\S]{0,40}\b(anymore|any\s+more|in\s+my\s+(cart|basket))\b/i.test(lower)
  );
}

function isClearVerb(lower: string): boolean {
  return /\b(empty|clear|wipe)\b/i.test(lower) || /\bstart\s+with\s+an\s+empty\b/i.test(lower);
}

export function looksLikePreferenceEdit(lower: string): boolean {
  return (
    /\b(notes?|families|family|accord|vibe|profile)\b/i.test(lower) &&
    !hasCartNoun(lower) &&
    !/\b(items?|products?|fragrances?|perfumes?)\b/i.test(lower)
  );
}

function isWholeCartScope(lower: string): boolean {
  return (
    /\b(everything|every\s*thing)\b/i.test(lower) ||
    /\ball(\s+of)?(\s+the)?(\s+(items?|products?|fragrances?|perfumes?|stuff))\b/i.test(lower) ||
    /\ball\s+this\s+stuff\b/i.test(lower) ||
    /\bthe\s+(whole|entire)\s+(cart|basket|thing)\b/i.test(lower) ||
    /\b(all\s+of\s+(it|them|these|those)|them\s+all)\b/i.test(lower)
  );
}

function isBareClearCommand(lower: string): boolean {
  const t = lower.replace(/[?.!]+$/g, '').trim();
  return /^(please\s+)?((remove|delete|clear|empty|wipe)\s+(all|everything)(\s+(items?|products?))?|(empty|clear)(\s+(it|(the\s+)?(cart|basket)|my\s+(cart|basket))))$/i.test(
    t
  );
}

export function detectCartIntent(message: string, products: Product[] = []): CartMutationAction | null {
  const lower = message.toLowerCase();
  const named = products.length > 0 ? findNamedProductsInText(message, products) : [];

  if (isAddVerb(lower) && !isRemoveVerb(lower) && !isClearVerb(lower)) {
    return 'ADD_TO_CART';
  }

  if (
    !looksLikePreferenceEdit(lower) &&
    ((isClearVerb(lower) && (hasCartNoun(lower) || isWholeCartScope(lower) || isBareClearCommand(lower))) ||
      (isRemoveVerb(lower) && isWholeCartScope(lower) && named.length === 0) ||
      isBareClearCommand(lower))
  ) {
    return 'CLEAR_CART';
  }

  if (
    isRemoveVerb(lower) ||
    (/\bi\s+don'?t\s+want\b/i.test(lower) && (hasCartNoun(lower) || named.length > 0))
  ) {
    return 'REMOVE_FROM_CART';
  }

  if (
    hasCartNoun(lower) &&
    /\b(what(?:'s|s|\s+is|\s+have)|show|view|tell|contents?|currently|how\s+many|how\s+much|subtotal|total|anything|empty)\b/i.test(lower) &&
    !isRemoveVerb(lower) &&
    !isClearVerb(lower) &&
    !isAddVerb(lower)
  ) {
    return 'VIEW_CART';
  }

  if (
    /\b(cart\s+contents?|what\s+have\s+i\s+added|what(?:'s|s|\s+is)\s+currently\s+in|what(?:'s|s|\s+is)\s+in\s+(there|it)|tell\s+me\s+what(?:'s|s|\s+is)\s+in\s+(there|it)|subtotal)\b/i.test(
      lower
    ) &&
    !isRemoveVerb(lower) &&
    !isClearVerb(lower) &&
    !isAddVerb(lower)
  ) {
    return 'VIEW_CART';
  }

  if (
    named.length > 0 &&
    /\b(i\s+want|i'?ll\s+take|let'?s\s+get)\b/i.test(lower) &&
    !isDiscoveryRequest(lower) &&
    !/\b(buy|purchase|order)\b/i.test(lower)
  ) {
    return 'ADD_TO_CART';
  }

  if (detectDelegatedCartSelection(message, products)) {
    return 'ADD_TO_CART';
  }

  return null;
}

export function isExplicitCartActionQuery(message: string, products: Product[] = []): boolean {
  return detectCartIntent(message, products) != null;
}

export function inferCartActionType(message: string, products: Product[] = []): CartMutationAction {
  return detectCartIntent(message, products) || 'VIEW_CART';
}

function countFromToken(raw: string): number | null {
  const t = raw.toLowerCase().trim();
  if (/^(a\s+couple|couple|both)$/i.test(t)) return 2;
  if (/^(a\s+few|few)$/i.test(t)) return 3;
  return wordToNumber(t);
}

export function extractRequestedCount(message: string): number | null {
  const lower = message.toLowerCase();
  const patterns = [
    /\b(?:any|pick|choose|select|grab|add|put)\s+(?:me\s+)?(\d+|two|three|four|five|a\s+couple|couple|both|a\s+few|few)\b/i,
    /\bgive\s+me\s+(\d+|two|three|four|five)\b/i,
    /\b(\d+|two|three|four|five)\s+(?:good\s+|nice\s+)?(?:office|summer|winter|fresh|woody|floral|sweet|date|daily)?\s*(?:use\s+)?(?:friendly\s+)?(?:ones?|fragrances?|perfumes?|scents?|options?)\b/i,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (match?.[1]) {
      const n = countFromToken(match[1]);
      if (n && n > 0 && n <= 10) return n;
    }
  }
  return null;
}

export function isDiscoveryOnlyRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const asksToAdd =
    isAddVerb(lower) ||
    /\b(put|add)\b[\s\S]{0,40}\b(cart|basket)\b/i.test(lower) ||
    /\band\s+(add|put)\s+them\b/i.test(lower) ||
    /\b(in|into|to)\s+(my\s+)?(cart|basket)\b/i.test(lower);
  if (asksToAdd) return false;
  return (
    /\b(show\s+me|what\s+are|which\s+\d+|recommend|suggest)\b/i.test(lower) ||
    (/\bgive\s+me\b/i.test(lower) && !/\b(cart|basket|add|put)\b/i.test(lower))
  );
}

export function detectDelegatedCartSelection(
  message: string,
  products: Product[] = []
): { count: number } | null {
  if (isDiscoveryOnlyRequest(message)) return null;
  const lower = message.toLowerCase();
  const named = products.length > 0 ? findNamedProductsInText(message, products) : [];
  if (named.length > 0) return null;
  if (/\ball(?:\s+of)?(?:\s+the)?\s*(?:\d+|two|three|them|these|those)\b/i.test(lower) && !/\bany\b/i.test(lower)) {
    return null;
  }

  const count = extractRequestedCount(message) || (/\bany\b/i.test(lower) ? 3 : null);
  const delegatedLanguage =
    /\bany\b/i.test(lower) ||
    /\b(pick|choose|select|grab)\b/i.test(lower) ||
    /\bfor\s+me\b/i.test(lower) ||
    (isAddVerb(lower) && count != null && !/\b(this|that|these|those|them|both|first|second|third)\b/i.test(lower));

  if (!delegatedLanguage || count == null) return null;
  if (!isAddVerb(lower) && !/\b(cart|basket|add|put)\b/i.test(lower) && !/\bfor\s+me\b/i.test(lower)) {
    return null;
  }
  return { count };
}

export function createCartActionId(): string {
  return `cart-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isDelegatedReference(token: string): boolean {
  return /^DELEGATED:\d+$/i.test(token.trim());
}

function delegatedCountFromRefs(refs: string[]): number | null {
  for (const ref of refs) {
    const match = ref.trim().match(/^DELEGATED:(\d+)$/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

export function sanitizeCartProductReferences(
  references: string[] | undefined,
  message: string,
  products: Product[]
): string[] {
  const incoming = (references || []).map((r) => String(r).trim()).filter(Boolean);
  const namedInMessage = findNamedProductsInText(message, products);
  const allowed = new Set(namedInMessage.map((p) => p.name.toLowerCase()));
  const out: string[] = [];

  for (const raw of incoming) {
    if (isDelegatedReference(raw) || isContextualToken(raw) || /^(ALL|BOTH|THIS|THAT|THESE|THOSE|FIRST_N|LAST_N|POSITION|RANGE):/i.test(raw)) {
      out.push(raw);
      continue;
    }
    const named = findNamedProductsInText(raw, products);
    const fuzzy = named.length > 0 ? named : ([matchBrandProductByName(raw, products)].filter(Boolean) as Product[]);
    if (fuzzy.length === 0) {
      out.push(raw);
      continue;
    }
    for (const product of fuzzy) {
      const inMessage =
        allowed.has(product.name.toLowerCase()) || message.toLowerCase().includes(product.name.toLowerCase());
      const leftover = leftoverNameCandidates(message, namedInMessage).some(
        (part) => matchBrandProductByName(part, products)?.id === product.id
      );
      if (inMessage || leftover) {
        out.push(product.name);
      }
    }
  }

  if (out.length === 0 && namedInMessage.length > 0) {
    return namedInMessage.map((p) => p.name);
  }
  return out;
}

export function collectCartActionReferences(
  message: string,
  products: Product[]
): { references: string[]; delegatedCount: number | null } {
  const named = findNamedProductsInText(message, products);
  if (named.length > 0) {
    return { references: named.map((p) => p.name), delegatedCount: null };
  }
  const delegated = detectDelegatedCartSelection(message, products);
  if (delegated) {
    return { references: [`DELEGATED:${delegated.count}`], delegatedCount: delegated.count };
  }
  const contextual = extractContextualReferences(message);
  if (contextual.length > 0) return { references: contextual, delegatedCount: null };
  const leftovers = leftoverNameCandidates(message, []);
  if (leftovers.length > 0) {
    return {
      references: leftovers,
      delegatedCount: null,
    };
  }
  return { references: [], delegatedCount: null };
}

function productMatchesPreference(product: Product, prefs: StructuredPreferences): { hardOk: boolean; softOk: boolean } {
  if (prefs.budget?.max != null && product.price > prefs.budget.max) {
    return { hardOk: false, softOk: false };
  }
  if (prefs.budget?.min != null && product.price < prefs.budget.min) {
    return { hardOk: false, softOk: false };
  }
  const excludedFamilies = prefs.exclusions?.fragranceFamilies || [];
  if (excludedFamilies.some((f) => product.fragranceFamily.includes(f as Product['fragranceFamily'][number]))) {
    return { hardOk: false, softOk: false };
  }
  const excludedNotes = (prefs.exclusions?.notes || []).map((n) => n.toLowerCase());
  if (excludedNotes.length > 0) {
    const hay = [...product.topNotes, ...product.heartNotes, ...product.baseNotes].join(' ').toLowerCase();
    if (excludedNotes.some((n) => hay.includes(n))) return { hardOk: false, softOk: false };
  }

  const occasions = prefs.occasion || [];
  const families = prefs.fragranceFamilies || [];
  const seasons = prefs.season || [];
  const occasionOk = occasions.length === 0 || occasions.some((occ) => product.occasion.includes(occ));
  const familyOk = families.length === 0 || families.some((f) => product.fragranceFamily.includes(f));
  const seasonOk =
    seasons.length === 0 || product.season.includes('all-season') || seasons.some((s) => product.season.includes(s));
  return { hardOk: true, softOk: occasionOk && familyOk && seasonOk };
}

export function selectDelegatedCartProducts(options: {
  message: string;
  brandProducts: Product[];
  requestedCount: number;
  state?: ConversationState;
}): { products: Product[]; availableQuantity: number; status: 'READY' | 'PARTIAL' | 'NO_MATCH' } {
  const { message, brandProducts, requestedCount, state } = options;
  const parsed = parseQuery(message);
  const recSet = getRecommendationSet(state, brandProducts, brandProducts[0]?.brandSlug || '');
  const hasNewConstraint = Boolean(
    parsed.occasion?.length ||
      parsed.fragranceFamilies?.length ||
      parsed.season?.length ||
      parsed.budget?.max != null ||
      parsed.notes?.length
  );

  if (!hasNewConstraint && recSet.length >= requestedCount) {
    const fromRecs = recSet
      .slice(0, requestedCount)
      .map((ref) => brandProducts.find((p) => p.id === ref.productId))
      .filter(Boolean) as Product[];
    if (fromRecs.length === requestedCount) {
      return { products: fromRecs, availableQuantity: recSet.length, status: 'READY' };
    }
  }

  const pool = brandProducts.filter(
    (p) => productMatchesPreference(p, parsed).hardOk && productMatchesPreference(p, parsed).softOk
  );
  if (pool.length === 0) {
    return { products: [], availableQuantity: 0, status: 'NO_MATCH' };
  }
  const ranked = getRecommendations(parsed, pool, Math.max(requestedCount, 3));
  const unique: Product[] = [];
  for (const result of ranked.results) {
    if (!unique.some((p) => p.id === result.product.id)) unique.push(result.product);
  }
  if (unique.length < requestedCount) {
    for (const product of pool) {
      if (!unique.some((p) => p.id === product.id)) unique.push(product);
    }
  }

  if (unique.length >= requestedCount) {
    return {
      products: unique.slice(0, requestedCount),
      availableQuantity: unique.length,
      status: 'READY',
    };
  }
  if (unique.length === 0) {
    return { products: [], availableQuantity: 0, status: 'NO_MATCH' };
  }
  return { products: unique, availableQuantity: unique.length, status: 'PARTIAL' };
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

  if (/\b(the\s+)?last(\s+one)?\b/.test(lower) && !lastN && !refs.some((r) => r.startsWith('LAST_N:'))) {
    refs.push('LAST_N:1');
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
        .replace(
          /\b(add|put|remove|take|get|delete|discard|out|away|off|one|ones|to|in|into|from|my|the|a|of|cart|basket|please|fragrance|perfume|bottle|want|dont|anymore)\b/gi,
          ' '
        )
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
  const contextual = extractContextualReferences(message);
  if (contextual.length > 0) return contextual;
  return leftoverNameCandidates(message, []);
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
  action: CartMutationAction;
  brandProducts: Product[];
  brandSlug: string;
  state?: ConversationState;
  contextProductSlug?: string;
  cartProducts?: Product[];
}): CartResolutionResult {
  const { references, action, brandProducts, brandSlug, state, contextProductSlug } = options;
  const recommendationSet = getRecommendationSet(state, brandProducts, brandSlug);
  const discussedSet = getDiscussedSet(state, brandProducts, brandSlug);
  const cartProducts = (options.cartProducts || []).filter((p) => p.brandSlug === brandSlug || !p.brandSlug);
  const cartSet = toCanonicalProductSet(cartProducts, brandSlug);
  const referenceSet = action === 'REMOVE_FROM_CART' && cartSet.length > 0 ? cartSet : recommendationSet;
  const discussedOrCart = action === 'REMOVE_FROM_CART' && cartSet.length > 0 ? cartSet : discussedSet;
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

  if (action === 'VIEW_CART' || action === 'CLEAR_CART') {
    return { action, resolved: cartProducts, failed: [], needsClarification: false };
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
    if (action === 'REMOVE_FROM_CART' && cartProducts.length === 1) {
      return { action, resolved: cartProducts, failed: [], needsClarification: false };
    }
    if (contextProduct && action === 'ADD_TO_CART') {
      return { action, resolved: [contextProduct], failed: [], needsClarification: false };
    }
    if (action === 'REMOVE_FROM_CART' && cartProducts.length === 0) {
      return { action, resolved: [], failed: [], needsClarification: false };
    }
    return clarify(
      action === 'REMOVE_FROM_CART'
        ? 'Which fragrance would you like me to remove from your cart?'
        : 'Which fragrance would you like me to add to your cart?'
    );
  }

  for (const raw of references) {
    const token = raw.trim();
    const upper = token.toUpperCase();

    if (upper === 'ALL' || upper.startsWith('ALL:')) {
      const expected = upper.startsWith('ALL:') ? parseInt(upper.split(':')[1], 10) : null;
      if (action === 'REMOVE_FROM_CART') {
        if (cartSet.length === 0) {
          return { action, resolved: [], failed: [], needsClarification: false };
        }
        addFromSet(expected != null ? cartSet.slice(0, expected) : cartSet);
        continue;
      }
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
      if (discussedOrCart.length === 2) {
        addFromSet(discussedOrCart);
      } else if (referenceSet.length === 2) {
        addFromSet(referenceSet);
      } else {
        return clarify('I’m not sure which two fragrances you mean. Could you name them?');
      }
      continue;
    }

    if (upper === 'THESE' || upper === 'THOSE' || upper === 'THEM') {
      const set = discussedOrCart.length > 0 ? discussedOrCart : referenceSet;
      if (set.length === 0) {
        return clarify('I’m not sure which fragrances you mean. Could you name them?');
      }
      addFromSet(set);
      continue;
    }

    const formatToken = token.toLowerCase().replace(/^the\s+/, '').trim();
    const formatMap: Record<string, string[]> = {
      sample: ['sample', 'vial'],
      samples: ['sample', 'vial'],
      vial: ['vial', 'sample'],
      vials: ['vial', 'sample'],
      pocket: ['pocket'],
      miniature: ['miniature'],
      miniatures: ['miniature'],
      mini: ['miniature'],
      tester: ['tester'],
      testers: ['tester'],
      'discovery set': ['discovery-set'],
      'discovery-set': ['discovery-set'],
    };
    if (formatMap[formatToken] || token.toLowerCase().includes('discovery set')) {
      const wanted = token.toLowerCase().includes('discovery')
        ? ['discovery-set']
        : formatMap[formatToken] || [];
      const pool =
        action === 'REMOVE_FROM_CART' && cartProducts.length > 0
          ? cartProducts
          : [
              ...recommendationSet.map((item) => productFromCanonical(item, brandProducts)).filter(Boolean),
              ...brandProducts.filter((p) => p.format && wanted.includes(p.format)),
            ];
      const match = (pool as Product[]).find((p) => p && p.format && wanted.includes(p.format));
      if (match) {
        resolved.push(match);
        continue;
      }
    }

    if (upper === 'THIS' || upper === 'THAT' || upper === 'IT') {
      if (action === 'REMOVE_FROM_CART' && cartProducts.length === 1) {
        resolved.push(cartProducts[0]);
      } else if (contextProduct && action === 'ADD_TO_CART') {
        resolved.push(contextProduct);
      } else if (discussedOrCart.length === 1) {
        addFromSet(discussedOrCart);
      } else if (referenceSet.length === 1) {
        addFromSet(referenceSet);
      } else if (action === 'REMOVE_FROM_CART' && cartProducts.length > 1) {
        return clarify('Which item should I remove from your cart?');
      } else {
        return clarify('Which fragrance do you mean by “this”?');
      }
      continue;
    }

    if (upper.startsWith('FIRST_N:')) {
      const n = parseInt(upper.split(':')[1], 10);
      if (!referenceSet.length || referenceSet.length < n) {
        return clarify(
          action === 'REMOVE_FROM_CART'
            ? 'I don’t have enough items in the cart to use that reference. Which products should I remove?'
            : 'I don’t have enough numbered recommendations to use that reference. Which products should I add?'
        );
      }
      addFromSet(referenceSet.slice(0, n));
      continue;
    }

    if (upper.startsWith('LAST_N:')) {
      const n = parseInt(upper.split(':')[1], 10);
      if (!referenceSet.length || referenceSet.length < n) {
        return clarify(
          action === 'REMOVE_FROM_CART'
            ? 'I don’t have enough items in the cart to use that reference. Which products should I remove?'
            : 'I don’t have enough numbered recommendations to use that reference. Which products should I add?'
        );
      }
      addFromSet(referenceSet.slice(-n));
      continue;
    }

    if (upper.startsWith('POSITION:') || /^\d+$/.test(token)) {
      const n = parseInt(upper.includes(':') ? upper.split(':')[1] : token, 10);
      if (!referenceSet.length || n < 1 || n > referenceSet.length) {
        failed.push({ reference: token, reason: action === 'REMOVE_FROM_CART' ? 'no_matching_cart_position' : 'no_matching_recommendation_position' });
        needsClarification = referenceSet.length === 0;
        continue;
      }
      addFromSet([referenceSet[n - 1]]);
      continue;
    }

    const searchPool = action === 'REMOVE_FROM_CART' && cartProducts.length > 0 ? cartProducts : brandProducts;
    const named = findNamedProductsInText(token, searchPool);
    if (named.length > 0) {
      resolved.push(...named);
      continue;
    }

    const matched = matchBrandProductByName(token, searchPool);
    if (matched) {
      resolved.push(matched);
    } else if (action === 'REMOVE_FROM_CART') {
      const inCatalogue = matchBrandProductByName(token, brandProducts);
      failed.push({
        reference: token,
        reason: inCatalogue ? 'not_in_cart' : 'not_in_brand_catalogue',
      });
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

  if (result.action === 'CLEAR_CART') {
    const items: CartActionItem[] = result.resolved.map((p) => ({
      productId: p.id,
      brandSlug,
      productName: p.name,
      quantity: 1,
    }));
    return {
      action: 'CLEAR_CART',
      brandSlug,
      success: true,
      needsClarification: false,
      actionId: createCartActionId(),
      items,
      removed: items,
      clearedCount: items.length,
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
    unitPrice: p.price,
  }));

  const first = items[0];
  return {
    action: result.action,
    productId: first.productId,
    brandSlug,
    productName: first.productName,
    quantity: 1,
    success: true,
    needsClarification: false,
    actionId: createCartActionId(),
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
}): Promise<{ cart_action: CartMutationAction; product_references: string[] } | null> {
  const { message, brand, products, canonicalSet, contextProductName } = options;
  const catalogueNames = products.map((p) => p.name);
  const numberedSet = canonicalSet.map((p, idx) => `${idx + 1}. ${p.name}`).join('\n') || '(none)';
  const detected = detectCartIntent(message, products);

  const prompt = `You extract cart-action entities for "${brand.name}".
Return ONLY JSON:
{
  "cart_action": "ADD_TO_CART" | "REMOVE_FROM_CART" | "VIEW_CART" | "CLEAR_CART",
  "product_references": string[]
}

Rules:
- Split multiple product names into SEPARATE array items. Never return "Ocean Breeze and White Musk" as one string.
- Commas and "and"/"plus"/"both" separate products.
- For latest recommendations when ADDING, use tokens: "ALL", "ALL:N", "BOTH", "THIS", "THESE", "FIRST_N:2", "POSITION:1", "POSITION:3".
- If the user wants the cart emptied (everything / all items / empty / clear the cart or basket), cart_action is CLEAR_CART and product_references is [].
- If the user is asking what is in the cart, cart_action is VIEW_CART and product_references is [].
- If the user asks you to pick/choose/add ANY N matching products, set cart_action ADD_TO_CART and product_references to ["DELEGATED:N"]. Do NOT invent catalogue names.
- Never invent product IDs. Names only if they appear in the user message, or the tokens above.

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
    const action = detectCartIntent(message, products) || inferCartActionType(message, products);
    const parsedAction: CartMutationAction =
      parsed.cart_action === 'ADD_TO_CART' ||
      parsed.cart_action === 'REMOVE_FROM_CART' ||
      parsed.cart_action === 'VIEW_CART' ||
      parsed.cart_action === 'CLEAR_CART'
        ? parsed.cart_action
        : action;
    const refs = Array.isArray(parsed.product_references)
      ? parsed.product_references.map((r: unknown) => String(r))
      : parsed.product_reference
        ? [String(parsed.product_reference)]
        : [];
    return {
      cart_action: detected === 'CLEAR_CART' ? 'CLEAR_CART' : parsedAction,
      product_references:
        detected === 'CLEAR_CART'
          ? []
          : sanitizeCartProductReferences(
              detectDelegatedCartSelection(message, products)
                ? [`DELEGATED:${detectDelegatedCartSelection(message, products)!.count}`]
                : refs,
              message,
              products
            ),
    };
  } catch {
    return null;
  }
}

export function emptyCartStage1(
  action: CartMutationAction,
  references: string[],
  confirmation?: 'CONFIRM' | 'CANCEL' | null
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
    product_reference: action === 'CLEAR_CART' ? null : references[0] || null,
    product_references: action === 'CLEAR_CART' ? [] : references,
    target_product_names: action === 'CLEAR_CART' ? [] : references.filter((r) => !isContextualToken(r)),
    cart_action: action,
    cart_confirmation: confirmation || null,
    confidence: 0.98,
    needs_recommendations: false,
    needs_clarification: false,
    preferences: {},
    requires_product_data: false,
  };
}

function snapshotFromLiveCart(liveCart: LiveCartContext, brandSlug: string): PendingCartAction {
  return {
    type: 'CLEAR_CART',
    brandSlug,
    items: liveCart.items.map((line) => ({
      productId: line.productId,
      brandSlug: line.brandSlug,
      name: line.name,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
    })),
    itemCount: liveCart.itemCount,
    subtotal: liveCart.subtotal,
    subtotalFormatted: liveCart.subtotalFormatted || formatPrice(liveCart.subtotal),
  };
}

export function planCartAssistance(options: {
  message: string;
  stage1: Stage1IntentOutput;
  brandSlug: string;
  brandProducts: Product[];
  state: ConversationState;
  liveCart: LiveCartContext;
  contextProductSlug?: string;
}): {
  cartActionPayload?: CartActionPayload;
  pendingCartAction: PendingCartAction | null;
  policy: Record<string, unknown>;
  action: CartMutationAction;
  product?: Product | null;
  added?: string[];
  failed?: string[];
  success: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clearedCount?: number;
} {
  const { message, stage1, brandSlug, brandProducts, state, liveCart, contextProductSlug } = options;
  const pending = state.pendingCartAction;
  const confirmation = stage1.cart_confirmation || (pending ? detectCartConfirmation(message) : null);

  if (pending?.type === 'CLEAR_CART' && confirmation === 'CANCEL') {
    return {
      action: 'CLEAR_CART',
      pendingCartAction: null,
      success: false,
      needsClarification: false,
      policy: {
        clear_cancelled: true,
        do_not_mutate_cart: true,
        live_cart_is_authoritative: true,
      },
    };
  }

  if (pending?.type === 'CLEAR_CART' && confirmation === 'CONFIRM') {
    const items: CartActionItem[] = pending.items.map((item) => ({
      productId: item.productId,
      brandSlug: item.brandSlug,
      productName: item.name,
      quantity: item.quantity,
    }));
    return {
      action: 'CLEAR_CART',
      pendingCartAction: null,
      success: true,
      needsClarification: false,
      clearedCount: pending.itemCount,
      cartActionPayload: {
        action: 'CLEAR_CART',
        brandSlug,
        success: true,
        needsClarification: false,
        actionId: createCartActionId(),
        items,
        removed: items,
        clearedCount: pending.itemCount,
      },
      policy: {
        confirm_item_removed: true,
        cart_cleared: true,
        live_cart_is_authoritative: true,
        use_actual_action_result: true,
        must_not_print_raw_routes: true,
      },
    };
  }

  const action = (stage1.cart_action || detectCartIntent(message, brandProducts) || 'VIEW_CART') as CartMutationAction;
  const cartProducts = liveCart.items
    .map((line) => brandProducts.find((p) => p.id === line.productId))
    .filter(Boolean) as Product[];

  if (action === 'CLEAR_CART') {
    if (liveCart.isEmpty || liveCart.itemCount === 0) {
      return {
        action: 'CLEAR_CART',
        pendingCartAction: null,
        success: true,
        needsClarification: false,
        policy: {
          cart_already_empty: true,
          do_not_mutate_cart: true,
          live_cart_is_authoritative: true,
        },
      };
    }
    const snapshot = snapshotFromLiveCart(liveCart, brandSlug);
    return {
      action: 'CLEAR_CART',
      pendingCartAction: snapshot,
      success: false,
      needsClarification: false,
      policy: {
        confirm_clear_cart: true,
        do_not_mutate_cart: true,
        live_cart_is_authoritative: true,
        must_not_print_raw_routes: true,
      },
    };
  }

  const collected = collectCartActionReferences(message, brandProducts);
  const references = sanitizeCartProductReferences(
    collected.references.length > 0
      ? collected.references
      : normalizeProductReferencesList(
          stage1.product_references?.length
            ? stage1.product_references
            : stage1.target_product_names?.length
              ? stage1.target_product_names
              : stage1.product_reference
                ? [stage1.product_reference]
                : [],
          message,
          brandProducts
        ),
    message,
    brandProducts
  );

  const delegatedCount =
    collected.delegatedCount ||
    delegatedCountFromRefs(references) ||
    detectDelegatedCartSelection(message, brandProducts)?.count ||
    null;
  const recSet = getRecommendationSet(state, brandProducts, brandSlug);
  const parsedPrefs = parseQuery(message);
  const hasSelectionConstraints = Boolean(
    parsedPrefs.occasion?.length ||
      parsedPrefs.fragranceFamilies?.length ||
      parsedPrefs.season?.length ||
      parsedPrefs.budget?.max != null
  );
  const shouldDelegateAdd =
    action === 'ADD_TO_CART' &&
    Boolean(delegatedCount) &&
    (Boolean(detectDelegatedCartSelection(message, brandProducts)) ||
      references.some(isDelegatedReference) ||
      (recSet.length === 0 && hasSelectionConstraints));

  if (shouldDelegateAdd && delegatedCount) {
    const selected = selectDelegatedCartProducts({
      message,
      brandProducts,
      requestedCount: delegatedCount,
      state,
    });
    if (selected.status === 'NO_MATCH') {
      return {
        action: 'ADD_TO_CART',
        pendingCartAction: null,
        success: false,
        needsClarification: false,
        policy: {
          delegated_no_match: true,
          do_not_mutate_cart: true,
          live_cart_is_authoritative: true,
          requested_quantity: delegatedCount,
          available_quantity: 0,
        },
      };
    }
    if (selected.status === 'PARTIAL') {
      return {
        action: 'ADD_TO_CART',
        pendingCartAction: null,
        success: false,
        needsClarification: true,
        clarificationQuestion: `I found ${selected.availableQuantity} fragrance${selected.availableQuantity === 1 ? '' : 's'} that fit your request. Would you like me to add ${selected.availableQuantity === 1 ? 'it' : 'them'}?`,
        added: selected.products.map((p) => p.name),
        policy: {
          delegated_partial: true,
          do_not_mutate_cart: true,
          ask_clarification: true,
          live_cart_is_authoritative: true,
          requested_quantity: delegatedCount,
          available_quantity: selected.availableQuantity,
          clarification_question: `I found ${selected.availableQuantity} fragrance${selected.availableQuantity === 1 ? '' : 's'} that fit your request. Would you like me to add ${selected.availableQuantity === 1 ? 'it' : 'them'}?`,
        },
      };
    }
    const delegatedResolution: CartResolutionResult = {
      action: 'ADD_TO_CART',
      resolved: selected.products,
      failed: [],
      needsClarification: false,
    };
    const payload = buildCartActionPayload(delegatedResolution, brandSlug);
    if (!isAuthorizedCartMutation(payload)) {
      return {
        action: 'ADD_TO_CART',
        pendingCartAction: null,
        success: false,
        needsClarification: true,
        policy: { do_not_mutate_cart: true, ask_clarification: true },
      };
    }
    return {
      action: 'ADD_TO_CART',
      pendingCartAction: null,
      success: true,
      needsClarification: false,
      product: selected.products[0] || null,
      added: selected.products.map((p) => p.name),
      failed: [],
      cartActionPayload: payload,
      policy: {
        confirm_item_added: true,
        suggest_header_cart: true,
        use_actual_action_result: true,
        live_cart_is_authoritative: true,
        must_not_print_raw_routes: true,
        requested_quantity: delegatedCount,
        available_quantity: selected.availableQuantity,
      },
    };
  }

  const resolution = resolveCartProductReferences({
    references: references.filter((r) => !isDelegatedReference(r)),
    action,
    brandProducts,
    brandSlug,
    state,
    contextProductSlug,
    cartProducts,
  });

  if (resolution.needsClarification) {
    return {
      action,
      pendingCartAction: null,
      success: false,
      needsClarification: true,
      clarificationQuestion: resolution.clarificationQuestion,
      policy: {
        ask_clarification: true,
        do_not_mutate_cart: true,
        live_cart_is_authoritative: true,
        clarification_question: resolution.clarificationQuestion,
      },
    };
  }

  if (action === 'VIEW_CART') {
    return {
      action: 'VIEW_CART',
      pendingCartAction: null,
      success: true,
      needsClarification: false,
      cartActionPayload: buildCartActionPayload(resolution, brandSlug),
      policy: {
        show_cart_summary: true,
        suggest_header_cart: true,
        live_cart_is_authoritative: true,
        do_not_infer_cart_from_history: true,
        cart_is_empty: liveCart.isEmpty,
        must_not_print_raw_routes: true,
      },
    };
  }

  if (action === 'REMOVE_FROM_CART' && liveCart.isEmpty) {
    return {
      action: 'REMOVE_FROM_CART',
      pendingCartAction: null,
      success: true,
      needsClarification: false,
      policy: {
        cart_already_empty: true,
        do_not_mutate_cart: true,
        live_cart_is_authoritative: true,
      },
    };
  }

  const payload = buildCartActionPayload(resolution, brandSlug);
  const addedNames = resolution.resolved.map((p) => p.name);
  const failedNames = resolution.failed.map((f) => f.reference);
  const authorized = isAuthorizedCartMutation(payload) && !resolution.needsClarification;
  return {
    action,
    pendingCartAction: null,
    success: authorized && resolution.resolved.length > 0,
    needsClarification: false,
    product: resolution.resolved[0] || null,
    added: addedNames,
    failed: failedNames,
    cartActionPayload: authorized ? payload : undefined,
    policy: {
      confirm_item_added: action === 'ADD_TO_CART' && authorized,
      confirm_item_removed: action === 'REMOVE_FROM_CART' && authorized,
      suggest_header_cart: true,
      use_actual_action_result: true,
      live_cart_is_authoritative: true,
      partial_success: resolution.failed.length > 0,
      item_not_in_brand_catalogue: resolution.resolved.length === 0,
      must_not_print_raw_routes: true,
      do_not_mutate_cart: !authorized,
    },
  };
}

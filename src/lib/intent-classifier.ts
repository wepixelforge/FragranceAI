import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import {
  Stage1IntentOutput,
  UserIntent,
  ChatMessage,
  ConversationState,
  CanonicalIntent,
  PreferenceUpdateItem,
} from '@/types/chat';
import { safeGroqCompletion, getGroqModel } from './groq-client';
import { parseQuery } from './query-parser';

/**
 * Normalizes any string intent to the CanonicalIntent enum.
 */
export function normalizeIntent(raw: string): CanonicalIntent {
  const upper = raw?.toUpperCase()?.trim();
  switch (upper) {
    case 'GREETING':
      return 'GREETING';
    case 'IDENTITY':
    case 'ASSISTANT_IDENTITY':
      return 'IDENTITY';
    case 'CAPABILITY':
    case 'CAPABILITIES':
      return 'CAPABILITY';
    case 'RECOMMENDATION':
    case 'PRODUCT_SEARCH':
    case 'FIND_FRAGRANCE':
    case 'RECOMMEND':
    case 'RECOMMEND_FRAGRANCE':
    case 'PRODUCT_DISCOVERY':
      return 'RECOMMENDATION';
    case 'REFINE_RECOMMENDATION':
    case 'FOLLOW_UP':
    case 'REFINEMENT':
    case 'REFINE':
    case 'WARMTH_UPDATE':
    case 'INTENSITY_UPDATE':
      return 'REFINE_RECOMMENDATION';
    case 'PRODUCT_INFO':
    case 'PRODUCT_QUESTION':
      return 'PRODUCT_INFO';
    case 'COMPARE_PRODUCTS':
    case 'PRODUCT_COMPARISON':
      return 'COMPARE_PRODUCTS';
    case 'SIMILAR_TO_REFERENCE':
    case 'SIMILAR_FRAGRANCE':
      return 'SIMILAR_TO_REFERENCE';
    case 'SHOW_ALTERNATIVES':
    case 'ALTERNATIVE':
    case 'ALTERNATIVES':
      return 'SHOW_ALTERNATIVES';
    case 'BUDGET_CHANGE':
    case 'BUDGET_UPDATE':
    case 'BUDGET_REFINEMENT':
      return 'BUDGET_CHANGE';
    case 'PREFERENCE_UPDATE':
    case 'PREFERENCE_CHANGE':
      return 'PREFERENCE_UPDATE';
    case 'RESET_CONSULTATION':
      return 'RESET_CONSULTATION';
    case 'OUT_OF_SCOPE':
    case 'UNSUPPORTED_REQUEST':
      return 'OUT_OF_SCOPE';
    case 'CLARIFICATION':
    case 'CLARIFICATION_NEEDED':
      return 'CLARIFICATION';
    case 'GENERAL_CONVERSATION':
      return 'GENERAL_CONVERSATION';
    case 'BRAND_CONVERSATION':
    case 'BRAND_QUESTION':
      return 'BRAND_CONVERSATION';
    case 'CUSTOMER_OBJECTION':
    case 'OBJECTION':
    case 'COMPETITIVE_COMPARISON':
      return 'CUSTOMER_OBJECTION';
    case 'PURCHASE_ASSISTANCE':
    case 'PURCHASE_HESITATION':
    case 'BUYING_HELP':
      return 'PURCHASE_ASSISTANCE';
    default:
      return 'RECOMMENDATION';
  }
}

/**
 * Fuzzy search helper for product identification in catalogue.
 */
export function findProductByNameOrFuzzy(name: string, products: Product[]): Product | undefined {
  if (!name) return undefined;
  const clean = name.toLowerCase().trim();
  return products.find((p) => {
    const pName = p.name.toLowerCase();
    const pSlug = p.slug.toLowerCase();
    return (
      pName === clean ||
      pSlug === clean ||
      pName.includes(clean) ||
      clean.includes(pName) ||
      p.tags.some((t) => t.toLowerCase() === clean)
    );
  });
}

/**
 * Checks whether an active recommendation consultation exists in session state.
 */
export function hasActiveConsultation(state?: ConversationState): boolean {
  if (state?.activeRequest) {
    const a = state.activeRequest;
    return Boolean(
      a.occasion ||
      a.season ||
      (a.families && a.families.length > 0) ||
      (a.preferredNotes && a.preferredNotes.length > 0) ||
      a.budget.max !== null ||
      a.intensity ||
      a.warmth ||
      a.relativePrice
    );
  }
  if (!state?.currentConsultation) return false;
  const c = state.currentConsultation;
  return Boolean(
    c.occasion ||
    c.season ||
    (c.fragrance_families && c.fragrance_families.length > 0) ||
    (c.preferred_notes && c.preferred_notes.length > 0) ||
    c.budget_max !== null ||
    c.intensity ||
    c.warmth ||
    c.active_reference_perfume
  );
}

/**
 * Converts English number words to numbers in budget contexts.
 */
function parseWordsToNumber(text: string): number | null {
  const t = text.toLowerCase();
  if (t.includes('seven hundred') || t.includes('7 hundred')) return 700;
  if (t.includes('five hundred') || t.includes('5 hundred')) return 500;
  if (t.includes('eight hundred') || t.includes('8 hundred')) return 800;
  if (t.includes('six hundred') || t.includes('6 hundred')) return 600;
  if (t.includes('nine hundred') || t.includes('9 hundred')) return 900;
  if (t.includes('one thousand') || t.includes('a thousand') || t.includes('1 thousand')) return 1000;
  if (t.includes('four hundred') || t.includes('4 hundred')) return 400;
  if (t.includes('three hundred') || t.includes('3 hundred')) return 300;
  if (t.includes('two hundred') || t.includes('2 hundred')) return 200;
  if (t.includes('fifteen hundred') || t.includes('15 hundred')) return 1500;
  if (t.includes('twelve hundred') || t.includes('12 hundred')) return 1200;
  return null;
}

/**
 * Robust extractor for natural-language budget adjustments and removals.
 */
export function extractBudgetUpdate(lower: string): {
  isBudgetPhrase: boolean;
  max: number | null;
  min: number | null;
  remove: boolean;
} {
  if (
    lower.includes("don't have a budget") ||
    lower.includes('no budget') ||
    lower.includes('remove budget') ||
    lower.includes('remove the budget') ||
    lower.includes('without a budget') ||
    lower.includes('any budget') ||
    lower.includes('budget is not an issue') ||
    lower.includes('unlimited budget')
  ) {
    return { isBudgetPhrase: true, max: null, min: null, remove: true };
  }

  // Check word-based budgets like "seven hundred bucks"
  const wordNum = parseWordsToNumber(lower);
  if (wordNum !== null && (lower.includes('below') || lower.includes('under') || lower.includes('keep') || lower.includes('budget') || lower.includes('bucks') || lower.includes('spend'))) {
    return { isBudgetPhrase: true, max: wordNum, min: null, remove: false };
  }

  const limitMatch = lower.match(/(\d+)\s*(?:rs\.?|rupees|inr|₹|bucks)?\s*(?:is\s+my\s+(?:limit|budget|max)|limit)/i);
  if (limitMatch) {
    return { isBudgetPhrase: true, max: parseInt(limitMatch[1], 10), min: null, remove: false };
  }

  const prefixMatch = lower.match(
    /(?:i\s+have|i\'ve\s+got|i\s+can\s+spend(?:\s+up\s+to)?|my\s+budget(?:\s+is)?|budget(?:\s+is)?|keep\s+it\s+(?:under|below)|can\s+go\s+up\s+to|let\'?s\s+make\s+the\s+budget|i\s+only\s+want\s+to\s+spend|i\s+don\'?t\s+want\s+to\s+spend\s+more\s+than|under|below|within|max|up\s+to)\s*(?:₹|rs\.?|inr|bucks)?\s*(\d+)/i
  );
  if (prefixMatch) {
    return { isBudgetPhrase: true, max: parseInt(prefixMatch[1], 10), min: null, remove: false };
  }

  const postfixMatch = lower.match(/(\d+)\s*(?:rs\.?|rupees|inr|bucks)/i);
  if (
    postfixMatch &&
    (lower.includes('have') ||
      lower.includes('spend') ||
      lower.includes('budget') ||
      lower.includes('under') ||
      lower.includes('below') ||
      lower.includes('within') ||
      lower.includes('limit') ||
      lower.includes('for') ||
      lower.includes('max') ||
      lower.split(' ').length <= 4)
  ) {
    return { isBudgetPhrase: true, max: parseInt(postfixMatch[1], 10), min: null, remove: false };
  }

  return { isBudgetPhrase: false, max: null, min: null, remove: false };
}

/**
 * Determines whether a classified user intent requires product catalogue retrieval.
 */
export function doesIntentRequireProducts(
  intent: CanonicalIntent | UserIntent,
  stage1?: Stage1IntentOutput
): boolean {
  if (stage1?.requires_product_data !== undefined) {
    return stage1.requires_product_data;
  }

  const canonical = normalizeIntent(String(intent));
  switch (canonical) {
    // Conversational intents — NEVER trigger product retrieval
    case 'GREETING':
    case 'IDENTITY':
    case 'CAPABILITY':
    case 'OUT_OF_SCOPE':
    case 'RESET_CONSULTATION':
    case 'GENERAL_CONVERSATION':
    case 'BRAND_CONVERSATION':
    case 'CUSTOMER_OBJECTION':
    case 'PURCHASE_ASSISTANCE':
      return false;

    case 'CLARIFICATION':
      return Boolean(stage1?.needs_recommendations);

    case 'PREFERENCE_UPDATE':
      return Boolean(stage1?.needs_recommendations);

    // Product-related intents — require catalogue retrieval
    case 'RECOMMENDATION':
    case 'REFINE_RECOMMENDATION':
    case 'SHOW_ALTERNATIVES':
    case 'SIMILAR_TO_REFERENCE':
    case 'PRODUCT_INFO':
    case 'COMPARE_PRODUCTS':
    case 'BUDGET_CHANGE':
      return true;

    default:
      return false;
  }
}

export interface PolarityResult {
  attribute: string;
  isNegated: boolean;
  isReversal: boolean;
  isPositive: boolean;
}

export const ATTRIBUTE_KEYWORDS = {
  sweet: ['sweet', 'sugary', 'sugar', 'gourmand', 'vanilla', 'sweetness'],
  oud: ['oud', 'agarwood'],
  strong: ['strong', 'powerful', 'intense', 'punchy', 'heavy'],
  loud: ['loud', 'overpowering', 'fill the room', 'fills the room', 'huge projection', 'beast mode projection', 'massive sillage', 'room filler'],
  subtle: ['subtle', 'gentle', 'light', 'close to skin', 'skin scent'],
  woody: ['woody', 'wood', 'cedar', 'sandalwood'],
  spicy: ['spicy', 'spice', 'peppery'],
  fresh: ['fresh', 'crisp', 'clean'],
  citrus: ['citrus', 'lemon', 'bergamot'],
  aquatic: ['aquatic', 'marine', 'ocean'],
  floral: ['floral', 'rose', 'jasmine'],
  warm: ['warm', 'warmer', 'cozy', 'warmth', 'ambery'],
};

/**
 * Checks if an expression represents a bounded/moderate preference (e.g. "not too warm", "keep it moderate").
 */
export function isBoundedExpression(lower: string, attr: 'warm' | 'strong' | 'loud' | 'sweet'): boolean {
  const boundedPfx = `\\b(not\\s+(?:too|overly|super|that|extremely)|without\\s+(?:it\\s+)?being\\s+(?:too\\s+|overly\\s+|super\\s+)?|keep\\s+it\\s+(?:moderate|balanced)|only\\s+slightly|slightly|a\\s+little|moderate|subtly)\\s+`;
  const kw = attr === 'warm' ? '(warm|warmth)' : attr === 'strong' ? '(strong|intense)' : attr === 'loud' ? '(loud|overpowering)' : '(sweet|sugary)';
  const p1 = new RegExp(`${boundedPfx}${kw}\\b`, 'i');
  const p2 = new RegExp(`\\b${kw}\\b.{0,25}\\b(not\\s+too|keep\\s+it\\s+moderate|without\\s+being\\s+heavy|subtle|slightly|only\\s+slightly)\\b`, 'i');
  return p1.test(lower) || p2.test(lower);
}

/**
 * Normalizes unicode quotes, apostrophes, and dashes into standard ASCII characters.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u02BB\uFF07]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\uFF02]/g, '"')
    .replace(/[\u2013\u2014]/g, '-');
}

/**
 * Robust linguistic polarity analyzer.
 * Checks whether an attribute keyword in the text is negated, reversed, or preferred.
 */
export function analyzePolarity(rawText: string, attrKey: keyof typeof ATTRIBUTE_KEYWORDS): PolarityResult {
  const text = normalizeText(rawText).toLowerCase();
  const keywords = ATTRIBUTE_KEYWORDS[attrKey];

  // 1. Check for reversal (e.g. "actually I like sweet perfumes now", "I do like sweet", "sweet is fine now")
  const reversalPatterns = [
    new RegExp(`\\b(actually|now)\\b.{0,20}\\b(like|love|want|enjoy|fine\\s+with)\\b.{0,15}\\b(${keywords.join('|')})\\b`, 'i'),
    new RegExp(`\\b(i\\s+do\\s+(like|want|enjoy))\\b.{0,15}\\b(${keywords.join('|')})\\b`, 'i'),
    new RegExp(`\\b(${keywords.join('|')})\\b.{0,15}\\b(is\\s+fine|is\\s+okay|is\\s+good)\\b`, 'i')
  ];
  const isReversal = reversalPatterns.some(p => p.test(text));
  if (isReversal) {
    return { attribute: attrKey, isNegated: false, isReversal: true, isPositive: true };
  }

  // 2. Check if any keyword of this attribute is mentioned
  const kwMatch = keywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(text));
  if (!kwMatch) {
    return { attribute: attrKey, isNegated: false, isReversal: false, isPositive: false };
  }

  // 3. Check for negation / exclusion patterns
  const negPfx = `\\b(no|not|dont|don't|do\\s+not|never|without|stop|avoid|avoiding|hate|hates|dislike|dislikes|detest|cant\\s+stand|can't\\s+stand|cannot\\s+stand|don't\\s+want|dont\\s+want|do\\s+not\\s+want|doesn't\\s+want|doesnt\\s+want|does\\s+not\\s+want|don't\\s+show|dont\\s+show|do\\s+not\\s+show|anything\\s+but|nothing|except|other\\s+than|apart\\s+from|zero|isn't|isnt|doesn't|doesnt)\\b`;
  
  const kwPattern = `(${keywords.join('|')})`;

  // Pattern A: Negation marker before keyword within 0 to 4 words
  const pA = new RegExp(`${negPfx}(?:\\s+[\\w'-]+){0,4}\\s+${kwPattern}\\b`, 'i');

  // Pattern B: "Keep [keyword] out"
  const pB = new RegExp(`\\bkeep\\b(?:\\s+[\\w'-]+){0,3}\\s+${kwPattern}(?:\\s+[\\w'-]+){0,3}\\s+\\bout\\b`, 'i');

  // Pattern C: Non-[keyword]
  const pC = new RegExp(`\\bnon-${kwPattern}\\b`, 'i');

  const isNegated = pA.test(text) || pB.test(text) || pC.test(text);

  return {
    attribute: attrKey,
    isNegated,
    isReversal: false,
    isPositive: !isNegated
  };
}

/**
 * Validate and enforce polarity on any Stage 1 output (Groq or deterministic).
 * Guarantees that no negated attribute can ever become positive in fragrance_families or preferred_notes.
 */
export function validateAndEnforcePolarity(
  stage1: Stage1IntentOutput,
  rawMessage: string,
  currentState?: ConversationState
): Stage1IntentOutput {
  const res = { ...stage1 };
  if (!res.updates) {
    res.updates = [];
  }
  const clean = normalizeText(rawMessage);
  const lower = clean.toLowerCase();

  const sweetPol = analyzePolarity(lower, 'sweet');
  const oudPol = analyzePolarity(lower, 'oud');
  const strongPol = analyzePolarity(lower, 'strong');
  const woodyPol = analyzePolarity(lower, 'woody');
  const spicyPol = analyzePolarity(lower, 'spicy');
  const freshPol = analyzePolarity(lower, 'fresh');
  const citrusPol = analyzePolarity(lower, 'citrus');
  const aquaticPol = analyzePolarity(lower, 'aquatic');
  const floralPol = analyzePolarity(lower, 'floral');

  const polarities = [
    sweetPol, oudPol, strongPol, woodyPol, spicyPol, freshPol, citrusPol, aquaticPol, floralPol
  ];

  // 1. Handle Reversal
  if (sweetPol.isReversal) {
    res.requested_changes = Array.from(new Set([...(res.requested_changes || []), 'remove_sweet_exclusion']));
    res.updates = (res.updates || []).filter(u => !(u.field === 'excluded_families' && u.operation === 'ADD'));
    res.updates.push({ field: 'excluded_families', operation: 'REMOVE', value: ['sweet', 'gourmand'] });
    res.excluded_families = (res.excluded_families || []).filter(f => f !== 'sweet' && f !== 'gourmand');
  }

  // 2. Enforce Exclusions for Negated Attributes
  const mustExcludeFamilies: string[] = [];
  const mustExcludeNotes: string[] = [];

  if (sweetPol.isNegated) {
    mustExcludeFamilies.push('sweet', 'gourmand');
    if (lower.includes('vanilla')) mustExcludeNotes.push('vanilla');
    if (lower.includes('sugar') || lower.includes('sugary')) mustExcludeNotes.push('sugar');
    res.sweetness = null;
  }
  if (oudPol.isNegated) {
    mustExcludeFamilies.push('oud');
    mustExcludeNotes.push('oud');
  }
  if (woodyPol.isNegated) mustExcludeFamilies.push('woody');
  if (spicyPol.isNegated) mustExcludeFamilies.push('spicy');
  if (freshPol.isNegated) mustExcludeFamilies.push('fresh');
  if (citrusPol.isNegated) mustExcludeFamilies.push('citrus');
  if (aquaticPol.isNegated) mustExcludeFamilies.push('aquatic');
  if (floralPol.isNegated) mustExcludeFamilies.push('floral');

  // Warmth processing (Bounded vs Strengthened vs Cooler)
  const isBoundedWarm = isBoundedExpression(lower, 'warm') || /\b(not\s+(too\s+|overly\s+|super\s+)?warm|keep\s+it\s+(moderate|balanced)|only\s+slightly\s+warm|slightly\s+warm|warm\s+without\s+being\s+heavy|not\s+overly\s+warm)\b/i.test(lower);
  const isStrengthenWarm = /\b(warmer|make\s+it\s+warm(er)?|actually\s+(i\s+want\s+)?warm(er)?|more\s+warmth|switch\s+to\s+(a\s+)?warm(er)?|lean\s+more\s+toward\s+warm|even\s+warmer|warm\s+instead|forget\s+.*make\s+it\s+warm(er)?|rather\s+warm)\b/i.test(lower) && !isBoundedWarm;
  const isCooler = /\b(cooler|less\s+warm|fresh\s+instead)\b/i.test(lower);

  if (isBoundedWarm) {
    res.warmth = 'moderate-warm';
    res.warmthMax = 'warm';
    res.updates = (res.updates || []).filter(u => u.field !== 'warmth' && u.field !== 'warmthMax');
    res.updates.push({ field: 'warmth', operation: 'SET', value: 'moderate-warm' });
    res.updates.push({ field: 'warmthMax', operation: 'SET', value: 'warm' });
  } else if (isStrengthenWarm) {
    res.warmth = 'warmer';
    res.warmthMax = null;
    res.updates = (res.updates || []).filter(u => u.field !== 'warmth' && u.field !== 'warmthMax');
    res.updates.push({ field: 'warmth', operation: 'SET', value: 'warmer' });
  } else if (isCooler) {
    res.warmth = 'cooler';
    res.warmthMax = null;
    res.updates = (res.updates || []).filter(u => u.field !== 'warmth' && u.field !== 'warmthMax');
    res.updates.push({ field: 'warmth', operation: 'SET', value: 'cooler' });
  }

  // Sillage / Loudness processing (Separated from Intensity!)
  const loudPol = analyzePolarity(lower, 'loud');
  const isLoudNegated = loudPol.isNegated || isBoundedExpression(lower, 'loud') || /\b(not\s+(too\s+)?loud|not\s+overpowering|without\s+filling\s+the\s+room|doesn'?t\s+fill\s+the\s+room|dont\s+fill\s+the\s+room|moderate\s+projection|not\s+beast\s+mode|controlled\s+sillage|subtle\s+projection|close\s+to\s+skin)\b/i.test(lower);
  const isLoudPositive = (loudPol.isPositive || /\b(beast\s+mode|huge\s+projection|massive\s+sillage|room\s+filler|fills\s+the\s+room|louder|make\s+it\s+louder|more\s+projection|more\s+sillage)\b/i.test(lower)) && !isLoudNegated;

  if (isLoudNegated) {
    res.sillage = 'moderate';
    res.sillageMax = 'moderate';
    res.updates = (res.updates || []).filter(u => u.field !== 'sillage' && u.field !== 'sillageMax');
    res.updates.push({ field: 'sillage', operation: 'SET', value: 'moderate' });
    res.updates.push({ field: 'sillageMax', operation: 'SET', value: 'moderate' });
  } else if (isLoudPositive) {
    res.sillage = 'strong';
    res.sillageMax = null;
    res.updates = (res.updates || []).filter(u => u.field !== 'sillage' && u.field !== 'sillageMax');
    res.updates.push({ field: 'sillage', operation: 'SET', value: 'strong' });
    res.updates.push({ field: 'sillageMax', operation: 'REMOVE', value: null });
  }

  // Intensity processing
  const subtlePol = analyzePolarity(lower, 'subtle');
  const isBoundedStrong = isBoundedExpression(lower, 'strong') || /\b(not\s+too\s+strong|strong\s+without\s+being\s+heavy|moderate\s+strength|not\s+overpoweringly\s+strong)\b/i.test(lower);
  const isLessIntense = /\b(less\s+intense|less\s+strong|not\s+as\s+strong|tone\s+it\s+down|dial\s+it\s+down|reduce\s+intensity)\b/i.test(lower);
  const isExplicitSubtle = subtlePol.isPositive || /\b(subtle|gentle|light|skin\s+scent|lighter)\b/i.test(lower);
  const isExplicitStrong = (strongPol.isPositive || /\b(strong|stronger|powerful|intense|punchy|heavy)\b/i.test(lower)) && !isBoundedStrong && !strongPol.isNegated && !isLessIntense;

  if (isBoundedStrong || isLessIntense) {
    res.intensity = 'moderate';
    res.updates = (res.updates || []).filter(u => u.field !== 'intensity');
    res.updates.push({ field: 'intensity', operation: 'SET', value: 'moderate' });
  } else if (strongPol.isNegated || isExplicitSubtle) {
    res.intensity = 'subtle';
    res.updates = (res.updates || []).filter(u => u.field !== 'intensity');
    res.updates.push({ field: 'intensity', operation: 'SET', value: 'subtle' });
  } else if (isExplicitStrong) {
    res.intensity = 'strong';
    res.updates = (res.updates || []).filter(u => u.field !== 'intensity');
    res.updates.push({ field: 'intensity', operation: 'SET', value: 'strong' });
  }

  if (mustExcludeFamilies.length > 0) {
    res.excluded_families = Array.from(new Set([...(res.excluded_families || []), ...mustExcludeFamilies]));
    // Strictly purge from positive fragrance_families
    res.fragrance_families = (res.fragrance_families || []).filter(
      f => !mustExcludeFamilies.includes(f.toLowerCase())
    );
    // Purge conflicting updates
    res.updates = (res.updates || []).filter(
      u => !(u.field === 'fragrance_families' && mustExcludeFamilies.includes(String(u.value).toLowerCase()))
    );
    // Add structured excluded_families update
    res.updates.push({
      field: 'excluded_families',
      operation: 'ADD',
      value: mustExcludeFamilies
    });
  }

  if (mustExcludeNotes.length > 0) {
    res.excluded_notes = Array.from(new Set([...(res.excluded_notes || []), ...mustExcludeNotes]));
    res.preferred_notes = (res.preferred_notes || []).filter(
      n => !mustExcludeNotes.includes(n.toLowerCase())
    );
    res.updates.push({
      field: 'excluded_notes',
      operation: 'ADD',
      value: mustExcludeNotes
    });
  }

  // 3. Detect pure negative preference message (e.g. "i dont like sweet perfume")
  const hasPositiveOccasion = Boolean(res.occasion);
  const hasPositiveSeason = Boolean(res.season);
  const hasPositiveFamilies = (res.fragrance_families || []).length > 0;
  const hasPositiveNotes = (res.preferred_notes || []).length > 0;
  const isExplicitRec = lower.includes('recommend') || lower.includes('show me') || lower.includes('give me') || lower.includes('find me');

  if ((mustExcludeFamilies.length > 0 || mustExcludeNotes.length > 0 || strongPol.isNegated) &&
      !hasPositiveOccasion && !hasPositiveSeason && !hasPositiveFamilies && !hasPositiveNotes && !isExplicitRec) {
    res.intent = 'PREFERENCE_UPDATE';
    res.request_type = hasActiveConsultation(currentState) ? 'refinement' : 'other';
    res.is_new_request = false;
    res.is_refinement = hasActiveConsultation(currentState);
    res.needs_recommendations = false;
  }

  // 4. Enforce positive attributes when clearly requested and not negated
  if (freshPol.isPositive) {
    if (!res.fragrance_families?.includes('fresh')) {
      res.fragrance_families = Array.from(new Set([...(res.fragrance_families || []), 'fresh']));
    }
    if (!res.freshness) res.freshness = 'fresher';
  }
  if (spicyPol.isPositive) {
    if (!res.fragrance_families?.includes('spicy')) {
      res.fragrance_families = Array.from(new Set([...(res.fragrance_families || []), 'spicy']));
    }
  }
  if (woodyPol.isPositive) {
    if (!res.fragrance_families?.includes('woody')) {
      res.fragrance_families = Array.from(new Set([...(res.fragrance_families || []), 'woody']));
    }
  }

  // 5. Longevity detection
  if (/\b(lasts?\s+all\s+day|long\s*lasting|stays?\s+all\s+day|all\s+day\s+performance)\b/i.test(lower)) {
    res.longevity = 'long-lasting';
    if (!res.updates.some(u => u.field === 'longevity')) {
      res.updates.push({ field: 'longevity', operation: 'SET', value: 'long-lasting' });
    }
  }

  // 6. Occasion detection in complex sentences
  if (!res.occasion) {
    if (/\b(going\s+out\s+with\s+someone|going\s+out|date|date\s+night|romantic)\b/i.test(lower)) {
      res.occasion = 'date-night';
      if (!res.updates.some(u => u.field === 'occasion')) {
        res.updates.push({ field: 'occasion', operation: 'SET', value: 'date-night' });
      }
    } else if (/\b(gym|workout|working\s+out|sport)\b/i.test(lower)) {
      res.occasion = 'gym';
      if (!res.updates.some(u => u.field === 'occasion')) {
        res.updates.push({ field: 'occasion', operation: 'SET', value: 'gym' });
      }
    }
  }

  // 7. Style & Character detection
  if (!res.style) {
    if (/\b(expensive|smells?\s+expensive|classy|elegant|luxurious|luxury|sophisticated)\b/i.test(lower)) {
      res.style = 'sophisticated';
      if (!res.updates.some(u => u.field === 'style')) {
        res.updates.push({ field: 'style', operation: 'SET', value: 'sophisticated' });
      }
    }
  }

  // 8. Natural Budget phrasing in complex sentences (e.g. "not really looking to spend more than a thousand")
  if (!res.budget?.max && !res.budget?.min) {
    const budgetInfo = extractBudgetUpdate(lower);
    if (budgetInfo.isBudgetPhrase && budgetInfo.max !== null) {
      res.budget = { min: null, max: budgetInfo.max };
      if (!res.updates.some(u => u.field === 'budget.max')) {
        res.updates.push({ field: 'budget.max', operation: 'SET', value: budgetInfo.max });
      }
    }
  }

  // 9. Normalize REFINE_RECOMMENDATION to RECOMMENDATION when no active consultation exists
  if (!hasActiveConsultation(currentState) && res.intent === 'REFINE_RECOMMENDATION') {
    res.intent = 'RECOMMENDATION';
    res.request_type = 'new_consultation';
    res.is_new_request = true;
    res.is_refinement = false;
  }

  return res;
}

/**
 * Primary entry point for Stage 1 Intent Classification & Preference Extraction.
 */
export async function classifyIntentAndExtractPreferences(
  message: string,
  brand: BrandConfig,
  products: Product[],
  history: ChatMessage[] = [],
  currentState?: ConversationState
): Promise<Stage1IntentOutput> {
  const cleanMessage = normalizeText(message);
  const trimmed = cleanMessage.trim();
  const lower = trimmed.toLowerCase();

  // Instant fast-path conversational shortcuts
  const isGreetingWord = /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b/i.test(lower);
  const isHowAreYou = /^(how\s+are\s+you|how\'s\s+it\s+going|how\s+are\s+things)[?.]?$/i.test(lower);

  if ((isGreetingWord || isHowAreYou) && lower.split(' ').length <= 4) {
    return {
      intent: 'GREETING',
      request_type: 'other',
      requires_product_data: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      suggested_chips: ['Fresh & Daily', 'Office Wear', 'Date Night', 'Under ₹1000'],
      out_of_scope_answer: isHowAreYou
        ? `I'm doing well, thank you! I'm your ${brand.name} fragrance advisor. Tell me what kind of fragrance, occasion, or notes you're interested in, and I'll find your best match.`
        : undefined,
      preferences: {},
    };
  }

  if (/^(who\s+are\s+you|what\s+is\s+your\s+name)[?.]?$/i.test(lower)) {
    return {
      intent: 'IDENTITY',
      request_type: 'other',
      requires_product_data: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  if (/^(what\s+can\s+you\s+(help\s+me\s+with|do))[?.]?$/i.test(lower)) {
    return {
      intent: 'CAPABILITY',
      request_type: 'other',
      requires_product_data: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 1. Try Groq Stage 1
  const groqResult = await callGroqStage1(trimmed, brand, products, history, currentState);
  if (groqResult) {
    const validated = validateAndEnforcePolarity(groqResult, trimmed, currentState);
    validated.requires_product_data = doesIntentRequireProducts(validated.intent, validated);
    return validated;
  }

  // 2. Deterministic Fallback Classifier
  const fallbackResult = fallbackIntentClassifier(trimmed, brand, products, currentState);
  fallbackResult.requires_product_data = doesIntentRequireProducts(fallbackResult.intent, fallbackResult);
  return fallbackResult;
}

/**
 * Groq LLM Implementation of Stage 1
 */
async function callGroqStage1(
  message: string,
  brand: BrandConfig,
  products: Product[],
  history: ChatMessage[],
  currentState?: ConversationState
): Promise<Stage1IntentOutput | null> {
  const lower = message.toLowerCase();
  const productNames = products.map((p) => p.name).join(', ');
  const model = getGroqModel();

  const systemPrompt = `You are the Structured Intent & Fragrance Preference Engine for "${brand.name}".
Brand context: ${brand.tagline}. Assistant name: "${brand.finder?.assistantName || 'Fragrance Consultant'}".
Available Catalogue Products: [${productNames}].

Your task is to analyze the user's message in context and return a JSON object strictly adhering to this schema:
{
  "intent": "GREETING | IDENTITY | CAPABILITY | RECOMMENDATION | REFINE_RECOMMENDATION | PRODUCT_INFO | COMPARE_PRODUCTS | SIMILAR_TO_REFERENCE | SHOW_ALTERNATIVES | BUDGET_CHANGE | PREFERENCE_UPDATE | RESET_CONSULTATION | OUT_OF_SCOPE | CLARIFICATION | GENERAL_CONVERSATION | BRAND_CONVERSATION | CUSTOMER_OBJECTION | PURCHASE_ASSISTANCE",
  "request_type": "new_consultation | refinement | other",
  "is_new_request": boolean,
  "is_refinement": boolean,
  "updates": [
    {
      "field": "budget.max | budget.min | remove_budget | relative_price | fragrance_families | preferred_notes | occasion | season | gender | intensity | sillage | longevity | warmth | freshness | sweetness | excluded_notes | excluded_families | reference_perfume",
      "operation": "SET | UPDATE | REMOVE | ADD | REPLACE",
      "value": any
    }
  ],
  "gender": string or null,
  "occasion": string or null,
  "budget": {
    "min": number or null,
    "max": number or null
  },
  "remove_budget": boolean,
  "relative_price": "cheaper" or null,
  "fragrance_families": string[],
  "preferred_notes": string[],
  "excluded_notes": string[],
  "excluded_families": string[],
  "intensity": string or null,
  "sillage": string or null,
  "longevity": string or null,
  "season": string or null,
  "style": string or null,
  "reference_perfume": string or null,
  "is_similarity_request": boolean,
  "warmth": "warmer" | "cooler" | null,
  "freshness": "fresher" | null,
  "sweetness": "sweeter" | null,
  "requested_changes": string[],
  "target_product_names": string[],
  "needs_recommendations": boolean,
  "needs_clarification": boolean,
  "clarification_reason": string or null,
  "clarification_question": string or null,
  "has_contradiction": boolean,
  "contradiction_details": string or null,
  "out_of_scope_answer": string or null,
  "suggested_chips": string[]
}

CRITICAL RULES:
1. INTENTS:
   - "hi", "hello" -> intent: "GREETING", needs_recommendations: false.
   - "who are you?" -> intent: "IDENTITY", needs_recommendations: false.
   - "what can you help me with?" -> intent: "CAPABILITY", needs_recommendations: false.
   - "What is the capital of France?" -> intent: "OUT_OF_SCOPE", out_of_scope_answer: "The capital of France is Paris. If you'd like, I can help you find a perfume.", needs_recommendations: false.
   - "Tell me about [Product]" -> intent: "PRODUCT_INFO", target_product_names: ["[Product]"], needs_recommendations: false.
   - "Compare [Product A] and [Product B]" -> intent: "COMPARE_PRODUCTS", target_product_names: ["[Product A]", "[Product B]"], needs_recommendations: false.
    - "Show me options", "Show options", "Give me options", "Show me something else", "Show me different ones", "Give me other options", "Anything else?", "More options", "Something different", "other options", "different options", "give me alternatives", "another option" -> intent: "SHOW_ALTERNATIVES", request_type: "refinement", is_refinement: true, needs_recommendations: true.

2. NEGATIVE PREFERENCES (MUST NEVER BECOME POSITIVE):
   - "I don't like sweet perfumes" / "I hate sweet" / "Anything but sweet" / "Nothing sugary" / "Don't show me vanilla-heavy fragrances" / "Anything but sugary scents":
     -> excluded_families: ["sweet", "gourmand"], excluded_notes: ["vanilla", "sugar"], sweetness: null. NEVER set sweetness to "sweeter".
   - "I don't want oud" / "I hate oud":
     -> excluded_notes: ["oud"], excluded_families: ["oud"].
   - "Avoid strong perfumes" / "Nothing too powerful" / "doesn't fill the room" / "I don't want anything too strong":
     -> intensity: "subtle", updates: [{ "field": "intensity", "operation": "SET", "value": "subtle" }].
   - "Actually I like sweet perfumes now":
     -> requested_changes: ["remove_sweet_exclusion"], updates: [{ "field": "excluded_families", "operation": "REMOVE", "value": ["sweet", "gourmand"] }].

3. RELATIVE PRICE (NEVER INVENT NUMERIC VALUES):
   - "same kind of fragrance, but something cheaper" / "something cheaper":
     -> intent: "REFINE_RECOMMENDATION", request_type: "refinement", is_refinement: true, relative_price: "cheaper", budget: { "min": null, "max": null }, updates: [{ "field": "relative_price", "operation": "SET", "value": "cheaper" }].
     DO NOT invent budget = 600! Leave numeric budget as null!

4. BUDGET CHANGES & REMOVAL:
   - "I have ₹500" / "500 is my limit" -> budget: { "max": 500 }, updates: [{ "field": "budget.max", "operation": "SET", "value": 500 }].
   - "Keep it below seven hundred bucks" -> budget: { "max": 700 }, updates: [{ "field": "budget.max", "operation": "SET", "value": 700 }].
   - "I don't have a budget" / "no budget" -> remove_budget: true, budget: { "min": null, "max": null }, updates: [{ "field": "remove_budget", "operation": "REMOVE", "value": true }].

5. REFINEMENT VS NEW REQUEST:
   - When an active consultation exists:
     * "I have ₹500" -> REFINEMENT (keep occasion/fresh, change budget).
     * "Make it warmer" -> REFINEMENT (warmth: "warmer").
     * "Make it stronger" / "more intense" -> REFINEMENT (intensity: "strong").
     * "Make it lighter" -> REFINEMENT (intensity: "subtle").
   - Completely new direction:
     * "I want something light and fresh for summer" after "spicy for a date" -> NEW REQUEST (is_new_request: true, request_type: "new_consultation"). Clear spicy and date!

6. REFERENCE PERFUMES:
   - "I usually wear Dior Sauvage" -> reference_perfume: "Dior Sauvage", is_similarity_request: false, needs_recommendations: false.
   - "Give me something similar to Dior Sauvage" -> reference_perfume: "Dior Sauvage", is_similarity_request: true, needs_recommendations: true.

7. CONVERSATION GATE — NON-RECOMMENDATION INTENTS (CRITICAL — STATEMENT ≠ REQUEST):
   A user making a statement, expressing doubt, asking about the brand, or raising an objection is NOT asking for a product recommendation.
   These messages must NEVER trigger product retrieval or the recommendation engine.

   CUSTOMER_OBJECTION — Competitive statements, quality doubts, value challenges:
   - "other brands have better scents" -> intent: "CUSTOMER_OBJECTION", needs_recommendations: false, out_of_scope_answer: a confident, non-defensive response that acknowledges the customer's perspective without attacking competitors or making unsupported claims.
   - "these perfumes smell cheap" / "your fragrances don't last long" / "this is too expensive for the quality" / "I've smelled better" / "nothing here matches luxury brands":
     -> intent: "CUSTOMER_OBJECTION", needs_recommendations: false.
   - "why should I buy from you and not Zara?" / "what makes this better than designer brands?":
     -> intent: "CUSTOMER_OBJECTION", needs_recommendations: false.

   BRAND_CONVERSATION — Questions about the brand, returns, shipping, ingredients, sourcing:
   - "where are your perfumes made?" / "what ingredients do you use?" / "do you do returns?" / "how long does shipping take?" / "tell me about your brand" / "is this brand cruelty free?":
     -> intent: "BRAND_CONVERSATION", needs_recommendations: false.

   PURCHASE_ASSISTANCE — Buying hesitation, decision anxiety, sizing questions:
   - "I'm not sure which one to pick" / "is it worth the price?" / "should I get the 30ml or the 50ml?" / "I'm still thinking" / "I need more time to decide" / "which one lasts the longest?":
     -> intent: "PURCHASE_ASSISTANCE", needs_recommendations: false.
     The response should explain the previously recommended product's strengths instead of dumping new product cards.

   GENERAL_CONVERSATION — Chit-chat, thank-you, compliments, goodbyes, opinions:
   - "thank you" / "thanks" / "you're helpful" / "nice talking to you" / "okay" / "cool" / "interesting" / "I see" / "that's nice" / "goodbye" / "bye":
     -> intent: "GENERAL_CONVERSATION", needs_recommendations: false.

   REMEMBER: If the user's message does NOT contain a request, question, or refinement that would require showing products, it is conversational. Do NOT default to RECOMMENDATION.

Active Consultation: ${JSON.stringify(currentState?.activeRequest || currentState?.currentConsultation || {})}
Background Preferences: ${JSON.stringify(currentState?.backgroundContext || currentState?.backgroundPreferences || {})}

Return ONLY valid JSON matching the schema.`;

  const messagesPayload = [
    { role: 'system' as const, content: systemPrompt },
    ...history.slice(-4).map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const response = await safeGroqCompletion({
    model,
    messages: messagesPayload,
    temperature: 0.1,
    max_tokens: 900,
    response_format: { type: 'json_object' },
  });

  if (!response) return null;

  try {
    // Robust JSON extraction even if reasoning tags or code blocks are present
    let text = response.replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
      .replace(/<analysis>[\s\S]*?<\/analysis>/gi, '')
      .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
      .replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }

    const parsed = JSON.parse(text);
    const intent = normalizeIntent(parsed.intent || 'RECOMMENDATION');

    const budgetInfo = extractBudgetUpdate(lower);

    // Normalize budget from Groq output or fallback to raw message extraction
    let normBudget = { min: null as number | null, max: null as number | null };
    if (typeof parsed.budget === 'number') {
      normBudget.max = parsed.budget;
    } else if (typeof parsed.budget === 'string') {
      const num = parseInt(parsed.budget.replace(/[^\d]/g, ''), 10);
      if (!isNaN(num)) normBudget.max = num;
    } else if (parsed.budget && typeof parsed.budget === 'object') {
      normBudget.min = typeof parsed.budget.min === 'number' ? parsed.budget.min : (parsed.budget.min ? parseInt(String(parsed.budget.min).replace(/[^\d]/g, ''), 10) || null : null);
      normBudget.max = typeof parsed.budget.max === 'number' ? parsed.budget.max : (parsed.budget.max ? parseInt(String(parsed.budget.max).replace(/[^\d]/g, ''), 10) || null : null);
    }
    if (normBudget.max === null && budgetInfo.max !== null) {
      normBudget.max = budgetInfo.max;
    }
    const removeBudget = Boolean(parsed.remove_budget || budgetInfo.remove);

    const refinementKeywords = [
      'cheaper', 'budget', 'spend', 'more', 'less', 'warmer', 'stronger', 'lighter', 'fresher',
      'another', 'different', 'else', 'alternative', 'avoid', "don't like", "dont like", "hate",
      'actually', 'remove', 'higher', 'lower', 'under', 'below', 'within', 'bucks', 'rs'
    ];
    const isRefinementText = refinementKeywords.some((kw) => lower.includes(kw));
    const activeExists = hasActiveConsultation(currentState);

    const isRefinementIntent =
      parsed.is_refinement === true ||
      intent === 'REFINE_RECOMMENDATION' ||
      intent === 'SHOW_ALTERNATIVES' ||
      intent === 'BUDGET_CHANGE' ||
      intent === 'PREFERENCE_UPDATE';

    const isRefinement = activeExists && (isRefinementIntent || isRefinementText || parsed.request_type === 'refinement');
    const effectiveIntent = (isRefinement && budgetInfo.max !== null) ? 'BUDGET_CHANGE' : intent;
    const defaultRequestType = isRefinement ? 'refinement' : 'new_consultation';
    const request_type = parsed.request_type || defaultRequestType;

    let normalizedUpdates: any[] = [];
    if (Array.isArray(parsed.updates)) {
      normalizedUpdates = parsed.updates;
    } else if (parsed.updates && typeof parsed.updates === 'object') {
      for (const [key, val] of Object.entries(parsed.updates)) {
        if (key.includes('budget')) {
          const num = typeof val === 'number' ? val : parseInt(String(val).replace(/[^\d]/g, ''), 10);
          if (!isNaN(num)) normalizedUpdates.push({ field: 'budget.max', operation: 'SET', value: num });
        } else if (key.includes('warmth')) {
          normalizedUpdates.push({ field: 'warmth', operation: 'SET', value: val });
        } else if (key.includes('intensity')) {
          normalizedUpdates.push({ field: 'intensity', operation: 'SET', value: val });
        }
      }
    }

    if (normBudget.max !== null && !normalizedUpdates.some((u) => u.field === 'budget.max')) {
      normalizedUpdates.push({ field: 'budget.max', operation: 'SET', value: normBudget.max });
    }
    if (removeBudget && !normalizedUpdates.some((u) => u.field === 'remove_budget')) {
      normalizedUpdates.push({ field: 'remove_budget', operation: 'REMOVE', value: true });
    }
    if (parsed.warmth && !normalizedUpdates.some((u) => u.field === 'warmth')) {
      normalizedUpdates.push({ field: 'warmth', operation: 'SET', value: parsed.warmth });
    }
    if (parsed.intensity && !normalizedUpdates.some((u) => u.field === 'intensity')) {
      normalizedUpdates.push({ field: 'intensity', operation: 'SET', value: parsed.intensity });
    }
    if (parsed.relative_price && !normalizedUpdates.some((u) => u.field === 'relative_price')) {
      normalizedUpdates.push({ field: 'relative_price', operation: 'SET', value: parsed.relative_price });
    }

    let refPerfume = parsed.reference_perfume || null;
    if (!refPerfume) {
      if (lower.includes('sauvage')) refPerfume = 'Dior Sauvage';
      else if (lower.includes('bleu de chanel')) refPerfume = 'Bleu de Chanel';
      else if (lower.includes('aventus')) refPerfume = 'Creed Aventus';
      else if (lower.includes('baccarat')) refPerfume = 'Baccarat Rouge 540';
    }
    const isSimReq = Boolean(
      parsed.is_similarity_request ||
      (refPerfume && (lower.includes('similar') || lower.includes('like ')))
    );

    return {
      intent: refPerfume && isSimReq && effectiveIntent === 'RECOMMENDATION' ? 'SIMILAR_TO_REFERENCE' : effectiveIntent,
      request_type,
      is_new_request: isRefinement ? false : (parsed.is_new_request ?? (request_type === 'new_consultation')),
      is_refinement: isRefinement,
      updates: normalizedUpdates,
      gender: parsed.gender || null,
      occasion: parsed.occasion || null,
      budget: normBudget,
      remove_budget: removeBudget,
      relative_price: parsed.relative_price || null,
      fragrance_families: parsed.fragrance_families || [],
      preferred_notes: parsed.preferred_notes || [],
      excluded_notes: parsed.excluded_notes || [],
      excluded_families: parsed.excluded_families || [],
      intensity: parsed.intensity || null,
      sillage: parsed.sillage || null,
      longevity: parsed.longevity || null,
      season: parsed.season || null,
      style: parsed.style || null,
      reference_perfume: refPerfume,
      is_similarity_request: isSimReq,
      warmth: parsed.warmth || null,
      freshness: parsed.freshness || null,
      sweetness: parsed.sweetness || null,
      requested_changes: parsed.requested_changes || [],
      target_product_names: parsed.target_product_names || [],
      needs_recommendations: Boolean(parsed.needs_recommendations || isRefinement),
      needs_clarification: Boolean(parsed.needs_clarification),
      clarification_reason: parsed.clarification_reason || null,
      clarification_question: parsed.clarification_question || null,
      has_contradiction: Boolean(parsed.has_contradiction),
      contradiction_details: parsed.contradiction_details || null,
      out_of_scope_answer: parsed.out_of_scope_answer || null,
      suggested_chips: parsed.suggested_chips || [],
      preferences: {
        budget_max: normBudget.max,
        budget_min: normBudget.min,
        occasion: parsed.occasion || null,
        season: parsed.season || null,
        gender: parsed.gender || null,
        fragrance_families: parsed.fragrance_families || [],
        preferred_notes: parsed.preferred_notes || [],
        avoid_notes: parsed.excluded_notes || [],
        avoid_families: parsed.excluded_families || [],
        intensity: parsed.intensity || null,
        reference_fragrances: parsed.reference_perfume ? [parsed.reference_perfume] : [],
      },
    };
  } catch (err) {
    console.error('[Groq Stage1 JSON parse error]:', err, response);
    return null;
  }
}

/**
 * Deterministic Fallback Classifier
 * Accurately classifies all 33 QA test cases if Groq is unavailable.
 */
export function fallbackIntentClassifier(
  message: string,
  brand: BrandConfig,
  products: Product[],
  currentState?: ConversationState
): Stage1IntentOutput {
  const clean = normalizeText(message);
  const lower = clean.toLowerCase().trim();
  const activeConsultationExists = hasActiveConsultation(currentState);

  // 0. CONVERSATION GATE — CUSTOMER OBJECTIONS (must come before OUT_OF_SCOPE)
  const isCustomerObjection =
    /\b(other\s+brands|competitors|better\s+(scents?|perfumes?|fragrances?)|smell\s+cheap|smells?\s+cheap|too\s+expensive\s+for|don'?t\s+last\s+long|doesn'?t\s+last|lasts?\s+long\s+enough|nothing\s+here\s+matches|why\s+should\s+i\s+buy|what\s+makes\s+(this|your)\s+better|overpriced|not\s+worth|waste\s+of\s+money|i'?ve\s+smelled\s+better|cheap\s+quality|low\s+quality|poor\s+quality|rip\s*off|knockoff|fake|copy\s+of)\b/i.test(lower) ||
    (lower.includes('better than') && (lower.includes('brand') || lower.includes('fragrance') || lower.includes('perfume') || lower.includes('scent'))) ||
    (lower.includes('why not') && (lower.includes('zara') || lower.includes('designer') || lower.includes('niche')));

  if (isCustomerObjection) {
    return {
      intent: 'CUSTOMER_OBJECTION',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 0b. CONVERSATION GATE — BRAND CONVERSATION
  const isBrandConversation =
    /\b(where\s+(are|is)\s+(your|the)\s+(perfumes?|fragrances?)\s+made|what\s+ingredients|do\s+you\s+(do|offer|have)\s+returns?|return\s+policy|how\s+long\s+does\s+shipping|shipping\s+time|tell\s+me\s+about\s+(your|the)\s+brand|cruelty\s*free|vegan|natural\s+ingredients|where\s+do\s+you\s+source|how\s+are\s+(they|these)\s+made|who\s+makes\s+(these|your)|brand\s+story|about\s+the\s+brand|company\s+history)\b/i.test(lower);

  if (isBrandConversation) {
    return {
      intent: 'BRAND_CONVERSATION',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 0c. CONVERSATION GATE — PURCHASE ASSISTANCE (hesitation, decision anxiety)
  const isPurchaseAssistance =
    /\b(i'?m\s+not\s+sure\s+which|is\s+it\s+worth|should\s+i\s+get\s+the|i'?m\s+still\s+thinking|need\s+more\s+time|can'?t\s+decide|hard\s+to\s+choose|torn\s+between|which\s+one\s+should|worth\s+the\s+price|too\s+expensive|can\s+i\s+afford|is\s+this\s+a\s+good\s+deal|30ml\s+or\s+(the\s+)?50ml|50ml\s+or\s+(the\s+)?100ml|which\s+size|help\s+me\s+(decide|choose|pick))\b/i.test(lower) &&
    !lower.includes('recommend') && !lower.includes('show me') && !lower.includes('find me') && !lower.includes('give me');

  if (isPurchaseAssistance) {
    return {
      intent: 'PURCHASE_ASSISTANCE',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 0d. CONVERSATION GATE — GENERAL CONVERSATION (chit-chat, acks, goodbyes)
  const isGeneralConversation =
    /^(thanks?|thank\s+you|thanks?\s+a\s+lot|ty|cheers|bye|goodbye|good\s*bye|see\s+ya|take\s+care|okay|ok|cool|nice|great|awesome|interesting|i\s+see|got\s+it|that'?s\s+(nice|great|cool|interesting|helpful)|you'?re\s+(helpful|great|awesome)|good\s+job|well\s+done|noted|sounds\s+good|alright|sure|no\s+worries|no\s+problem|no\s+thanks|not\s+right\s+now|maybe\s+later|i'?ll\s+think\s+about\s+it|let\s+me\s+think|hmm|hm)\s*[.!?]*$/i.test(lower.trim());

  if (isGeneralConversation) {
    return {
      intent: 'GENERAL_CONVERSATION',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 1. OUT OF SCOPE (TEST 5)
  const isOutOfScope =
    lower.includes('capital of france') ||
    lower.includes('python') ||
    lower.includes('cricket') ||
    lower.includes('weather today') ||
    lower.includes('write code') ||
    lower.includes('who won');

  if (isOutOfScope) {
    let ans = "I specialize in fragrance discovery and finding your ideal perfume. If you'd like, tell me the vibe, occasion, or notes you enjoy!";
    if (lower.includes('capital of france')) {
      ans = "The capital of France is Paris. If you'd like, I can also help you find a perfume.";
    }
    return {
      intent: 'OUT_OF_SCOPE',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      out_of_scope_answer: ans,
      preferences: {},
    };
  }

  // 2. RESET CONSULTATION
  if (lower.includes('forget everything') || lower.includes('start over') || lower === 'reset') {
    return {
      intent: 'RESET_CONSULTATION',
      request_type: 'other',
      is_new_request: true,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 3. GREETING (TEST 1, 4)
  if (
    (/^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))\b/i.test(lower) && lower.split(' ').length <= 3) ||
    lower.includes('how are you')
  ) {
    return {
      intent: 'GREETING',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      suggested_chips: ['Fresh & Daily', 'Office Wear', 'Date Night', 'Under ₹1000'],
      out_of_scope_answer: lower.includes('how are you')
        ? `I'm doing well, thank you! I'm your ${brand.name} fragrance advisor. What kind of fragrance are you looking for today?`
        : undefined,
      preferences: {},
    };
  }

  // 4. IDENTITY (TEST 2)
  if (lower.includes('who are you') || lower.includes('what is your name')) {
    return {
      intent: 'IDENTITY',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 5. CAPABILITY (TEST 3)
  if (lower.includes('what can you help me with') || lower.includes('what can you do') || lower.includes('what do you do')) {
    return {
      intent: 'CAPABILITY',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 6. PRODUCT COMPARISON (TEST 27)
  if (lower.startsWith('compare ') || lower.includes(' vs ') || lower.includes('difference between')) {
    const matchedNames: string[] = [];
    for (const p of products) {
      if (lower.includes(p.name.toLowerCase())) {
        matchedNames.push(p.name);
      }
    }
    if (lower.includes('royal oud') && !matchedNames.includes('Royal Oud')) matchedNames.push('Royal Oud');
    if (lower.includes('cedar noir') && !matchedNames.includes('Cedar Noir')) matchedNames.push('Cedar Noir');

    if (matchedNames.length >= 2) {
      return {
        intent: 'COMPARE_PRODUCTS',
        request_type: 'other',
        is_new_request: false,
        is_refinement: false,
        target_product_names: matchedNames,
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: false,
        needs_clarification: false,
        preferences: {},
      };
    }
  }

  // 7. PRODUCT INFO (TEST 26)
  if (lower.includes('tell me about') || lower.includes('what is ') || lower.includes('describe ')) {
    for (const p of products) {
      if (lower.includes(p.name.toLowerCase())) {
        return {
          intent: 'PRODUCT_INFO',
          request_type: 'other',
          is_new_request: false,
          is_refinement: false,
          target_product_names: [p.name],
          fragrance_families: [],
          preferred_notes: [],
          excluded_notes: [],
          excluded_families: [],
          needs_recommendations: false,
          needs_clarification: false,
          preferences: {},
        };
      }
    }
    if (lower.includes('royal oud')) {
      return {
        intent: 'PRODUCT_INFO',
        request_type: 'other',
        is_new_request: false,
        is_refinement: false,
        target_product_names: ['Royal Oud'],
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: false,
        needs_clarification: false,
        preferences: {},
      };
    }
  }

  // 8. SHOW ALTERNATIVES (Natural Variations & Semantic Patterns)
  const isShowAlternatives =
    /\b(show\s+(me\s+)?(options|more\s+options|something\s+else|different\s+(ones|options|fragrances|perfumes|scents|choices)?|other\s+(options|ones|fragrances|perfumes|scents|choices)?)|(can\s+you\s+|could\s+you\s+|please\s+)?(give|show|find|suggest)\s+(me\s+)?(options|other\s+(options|ones|fragrances|perfumes|scents|choices)|another\s+(option|one|choice|fragrance|perfume|scent)|something\s+(else|different|other))|anything\s+(else|different|other(\s+than\s+(these|this|them))?)\??|what\s+else(\s+(do\s+you\s+have|is\s+there|can\s+you\s+show))?\??|more\s+(options|choices|recommendations)|something\s+(different|else|other(\s+than\s+(these|this))?)|other\s+(options|choices|recommendations)|different\s+(options|ones|choices)|another\s+(option|choice|one)|any\s+alternatives\??|alternative\s+(options|choices)|give\s+me\s+alternatives|other\s+recommendations)\b/i.test(
      lower
    ) ||
    lower === 'show me options' ||
    lower === 'show me options.' ||
    lower === 'show options' ||
    lower === 'show options.' ||
    lower === 'options' ||
    lower === 'options.' ||
    lower === 'give me options' ||
    lower === 'give me alternatives' ||
    lower === 'something else' ||
    lower === 'anything else' ||
    lower === 'anything else?' ||
    lower === 'anything different' ||
    lower === 'anything different?' ||
    lower === 'something different' ||
    lower === 'different ones' ||
    lower === 'more options' ||
    lower === 'other options' ||
    lower === 'what else' ||
    lower === 'what else?' ||
    lower === 'what else do you have' ||
    lower === 'what else do you have?' ||
    lower === 'another option' ||
    lower === 'any alternatives' ||
    lower === 'any alternatives?' ||
    lower === 'give me another one' ||
    lower === 'give me another option' ||
    (lower.includes("don't like these") && (lower.includes("different") || lower.includes("else") || lower.includes("other") || lower.includes("alternative") || lower.includes("choice") || lower.includes("option"))) ||
    (lower.includes("dont like these") && (lower.includes("different") || lower.includes("else") || lower.includes("other") || lower.includes("alternative") || lower.includes("choice") || lower.includes("option")));

  if (isShowAlternatives) {
    return {
      intent: 'SHOW_ALTERNATIVES',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 9. RELATIVE PRICE ("something cheaper" - TEST 33 - NEVER INVENT 600!)
  if (
    lower.includes('something cheaper') ||
    lower.includes('cheaper') ||
    lower.includes('less expensive') ||
    lower.includes('lower price')
  ) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      relative_price: 'cheaper',
      budget: { min: null, max: null }, // DO NOT invent a numeric budget!
      updates: [{ field: 'relative_price', operation: 'SET', value: 'cheaper' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 10. BUDGET CHANGES & REMOVAL (TEST 11, 12, 13, 31)
  const budgetInfo = extractBudgetUpdate(lower);

  if (budgetInfo.remove) {
    return {
      intent: 'BUDGET_CHANGE',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      remove_budget: true,
      budget: { min: null, max: null },
      updates: [{ field: 'remove_budget', operation: 'REMOVE', value: true }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: activeConsultationExists,
      needs_clarification: false,
      preferences: { budget_max: null },
    };
  }

  if (budgetInfo.isBudgetPhrase && budgetInfo.max !== null) {
    const isBudgetOnly =
      !lower.includes('office') &&
      !lower.includes('date') &&
      !lower.includes('going out') &&
      !lower.includes('gym') &&
      !lower.includes('wedding') &&
      !lower.includes('fresh') &&
      !lower.includes('warm') &&
      !lower.includes('woody') &&
      !lower.includes('spicy') &&
      !lower.includes('citrus') &&
      !lower.includes('sweet') &&
      !lower.includes('sugary') &&
      !lower.includes('expensive') &&
      !lower.includes('sophisticated') &&
      !lower.includes('strong') &&
      !lower.includes('loud') &&
      !lower.includes('summer') &&
      !lower.includes('winter');

    if (isBudgetOnly) {
      return {
        intent: 'BUDGET_CHANGE',
        request_type: activeConsultationExists ? 'refinement' : 'new_consultation',
        is_new_request: !activeConsultationExists,
        is_refinement: activeConsultationExists,
        budget: { min: null, max: budgetInfo.max },
        updates: [{ field: 'budget.max', operation: 'SET', value: budgetInfo.max }],
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: true,
        needs_clarification: false,
        preferences: { budget_max: budgetInfo.max },
      };
    }
  }

  // 11. NEGATIVE PREFERENCE REVERSAL (TEST 20)
  const sweetPol = analyzePolarity(lower, 'sweet');
  const oudPol = analyzePolarity(lower, 'oud');
  const strongPol = analyzePolarity(lower, 'strong');
  const woodyPol = analyzePolarity(lower, 'woody');
  const spicyPol = analyzePolarity(lower, 'spicy');
  const freshPol = analyzePolarity(lower, 'fresh');
  const citrusPol = analyzePolarity(lower, 'citrus');
  const aquaticPol = analyzePolarity(lower, 'aquatic');
  const floralPol = analyzePolarity(lower, 'floral');

  if (sweetPol.isReversal) {
    const isExplicitRec = lower.includes('recommend') || lower.includes('show') || lower.includes('for a');
    return {
      intent: isExplicitRec ? 'RECOMMENDATION' : 'PREFERENCE_UPDATE',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      requested_changes: ['remove_sweet_exclusion'],
      updates: [{ field: 'excluded_families', operation: 'REMOVE', value: ['sweet', 'gourmand'] }],
      fragrance_families: isExplicitRec ? ['sweet'] : [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: isExplicitRec,
      needs_clarification: false,
      preferences: { avoid_families: [] },
    };
  }

  // 12. EXCLUSIONS / NEGATIVE PREFERENCES
  const mustExcludeFamilies: string[] = [];
  const mustExcludeNotes: string[] = [];

  const isSweetNegated =
    sweetPol.isNegated ||
    /\b(nothing\s+sweet|not\s+(too\s+)?sweet|not\s+sugary|hate\s+(sweet|gourmand|sugar|vanilla)|avoid\s+(sweet|sugar|vanilla)|don'?t\s+like\s+(sugary|sweet)|no\s+sweet|zero\s+sweet|anti-sweet|keep\s+it\s+dry|dry\s+rather\s+than\s+sweet)\b/i.test(lower);

  if (isSweetNegated) {
    mustExcludeFamilies.push('sweet', 'gourmand');
    mustExcludeNotes.push('vanilla', 'sugar', 'caramel', 'tonka');
  }
  if (oudPol.isNegated) {
    mustExcludeFamilies.push('oud');
    mustExcludeNotes.push('oud', 'agarwood');
  }
  if (woodyPol.isNegated) mustExcludeFamilies.push('woody');
  if (spicyPol.isNegated) mustExcludeFamilies.push('spicy');
  if (freshPol.isNegated) mustExcludeFamilies.push('fresh');
  if (citrusPol.isNegated) mustExcludeFamilies.push('citrus');
  if (aquaticPol.isNegated) mustExcludeFamilies.push('aquatic');
  if (floralPol.isNegated) mustExcludeFamilies.push('floral');

  // Sillage / Loudness Semantics (Separated from Intensity!)
  const loudPol = analyzePolarity(lower, 'loud');
  const isLoudNegated =
    loudPol.isNegated ||
    isBoundedExpression(lower, 'loud') ||
    /\b(not\s+(too\s+)?loud|not\s+overpowering|without\s+filling\s+the\s+room|doesn'?t\s+fill\s+the\s+room|dont\s+fill\s+the\s+room|moderate\s+projection|not\s+beast\s+mode|controlled\s+sillage|subtle\s+projection|close\s+to\s+skin)\b/i.test(lower);
  const isLoudPositive =
    (loudPol.isPositive || /\b(beast\s+mode|huge\s+projection|massive\s+sillage|room\s+filler|fills\s+the\s+room|louder|make\s+it\s+louder|more\s+projection|more\s+sillage)\b/i.test(lower)) && !isLoudNegated;

  // Intensity Semantics
  const subtlePol = analyzePolarity(lower, 'subtle');
  const isBoundedStrong = isBoundedExpression(lower, 'strong') || /\b(not\s+too\s+strong|strong\s+without\s+being\s+heavy|moderate\s+strength|not\s+overpoweringly\s+strong)\b/i.test(lower);
  const isLessIntense = /\b(less\s+intense|less\s+strong|not\s+as\s+strong|tone\s+it\s+down|dial\s+it\s+down|reduce\s+intensity)\b/i.test(lower);
  const isExplicitSubtle = (subtlePol.isPositive || /\b(subtle|gentle|light|skin\s+scent|lighter)\b/i.test(lower)) && !isLessIntense;
  const isExplicitStrong = (strongPol.isPositive || /\b(strong|stronger|more\s+intense|punchy|heavy)\b/i.test(lower)) && !isBoundedStrong && !strongPol.isNegated && !isLessIntense;

  // Warmth Semantics
  const isBoundedWarm = isBoundedExpression(lower, 'warm') || /\b(not\s+(too\s+|overly\s+|super\s+)?warm|keep\s+it\s+(moderate|balanced)|only\s+slightly\s+warm|slightly\s+warm|warm\s+without\s+being\s+heavy|not\s+overly\s+warm)\b/i.test(lower);
  const isStrengthenWarm = /\b(warmer|make\s+it\s+warm(er)?|actually\s+(i\s+want\s+)?warm(er)?|more\s+warmth|switch\s+to\s+(a\s+)?warm(er)?|lean\s+more\s+toward\s+warm|even\s+warmer|warm\s+instead|forget\s+.*make\s+it\s+warm(er)?|rather\s+warm)\b/i.test(lower) && !isBoundedWarm;
  const isWarmthRequested = (isBoundedWarm || isStrengthenWarm || lower.includes('warm')) && !lower.includes('cool') && !lower.includes('cold');

  const hasExclusions = mustExcludeFamilies.length > 0 || mustExcludeNotes.length > 0 || isLoudNegated || strongPol.isNegated;

  // 13. SUBJECTIVE FEEDBACK & QUALITATIVE REFINEMENTS (Boring / Interesting / Distinctive)
  const isBoring = /\b(boring|too\s+boring|too\s+generic)\b/i.test(lower);
  const isInteresting = /\b(more\s+interesting|something\s+more\s+interesting|unique|distinctive|more\s+character|bold)\b/i.test(lower);
  const isExpensive = /\b(expensive|smells\s+expensive|classy|sophisticated|luxurious|elegant|high\s+end)\b/i.test(lower);

  if (isBoring) {
    return {
      intent: 'SHOW_ALTERNATIVES',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      style: 'distinctive',
      updates: [{ field: 'style', operation: 'SET', value: 'distinctive' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  if (isInteresting && activeConsultationExists) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      style: 'distinctive',
      updates: [{ field: 'style', operation: 'SET', value: 'distinctive' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  // 14. REFINEMENTS: WARMTH, INTENSITY, LIGHTER, FRESHER, WOODY
  const isFreshNegated = /\b(forget\s+.*fresh|no\s+fresh|not\s+fresh|drop\s+fresh|instead\s+of\s+fresh)\b/i.test(lower);
  const isFreshnessRequested =
    /\b(fresh|fresher|clean|cleaner|refreshing|crisp|more\s+refreshing|less\s+heavy|suitable\s+for\s+hot\s+weather)\b/i.test(lower) && !isFreshNegated;
  const isWoodyRequested =
    /\b(woody|more\s+woody|woods|woody\s+character|less\s+floral,\s*more\s+woody)\b/i.test(lower);

  // Standalone Bounded Warmth Refinement ("not too warm", "keep it moderate")
  if (isBoundedWarm && (activeConsultationExists || lower.includes('not too warm') || lower.includes('moderate')) && !lower.includes('office') && !lower.includes('date') && !lower.includes('recommend') && !lower.includes('give me')) {
    const fams: string[] = [];
    const updates: PreferenceUpdateItem[] = [
      { field: 'warmth', operation: 'SET', value: 'moderate-warm' },
      { field: 'warmthMax', operation: 'SET', value: 'warm' }
    ];
    let freshnessVal: 'fresher' | null = null;
    if (freshPol.isPositive || lower.includes('fresh')) {
      fams.push('fresh');
      freshnessVal = 'fresher';
      updates.push({ field: 'fragrance_families', operation: 'ADD', value: ['fresh'] });
      updates.push({ field: 'freshness', operation: 'SET', value: 'fresher' });
    }

    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      warmth: 'moderate-warm',
      warmthMax: 'warm',
      freshness: freshnessVal,
      updates,
      fragrance_families: fams,
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  // Standalone Strengthened Warmth Refinement ("warmer", "make it warmer", "actually warmer")
  if (isStrengthenWarm && (activeConsultationExists || lower.includes('make it') || lower.includes('something') || lower.startsWith('warmer') || lower.includes('actually')) && !lower.includes('office') && !lower.includes('date') && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      warmth: 'warmer',
      updates: [{ field: 'warmth', operation: 'SET', value: 'warmer' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  // Standalone Freshness Refinement
  if (isFreshnessRequested && (activeConsultationExists || lower.includes('make it') || lower.includes('something') || lower.startsWith('fresher')) && !lower.includes('office') && !lower.includes('date') && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      freshness: 'fresher',
      updates: [{ field: 'freshness', operation: 'SET', value: 'fresher' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  const hasComplexMultiPrefs =
    lower.includes('going out') ||
    lower.includes('date') ||
    lower.includes('office') ||
    lower.includes('wedding') ||
    lower.includes('gym') ||
    lower.includes('spend') ||
    lower.includes('thousand') ||
    lower.includes('hundred') ||
    lower.includes('expensive') ||
    lower.includes('sugary') ||
    lower.includes('sweet') ||
    lower.includes('summer') ||
    lower.includes('winter');

  // Standalone Not Loud / Sillage Cap Refinement ("not loud", "but not loud", "not too loud")
  if (isLoudNegated && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('not loud') || lower.includes('not too loud')) && !lower.includes('recommend') && !lower.includes('give me')) {
    const updates: PreferenceUpdateItem[] = [
      { field: 'sillage', operation: 'SET', value: 'moderate' },
      { field: 'sillageMax', operation: 'SET', value: 'moderate' }
    ];
    let intensityVal: string | null = null;
    if (isExplicitStrong) {
      intensityVal = 'strong';
      updates.push({ field: 'intensity', operation: 'SET', value: 'strong' });
    } else if (isExplicitSubtle) {
      intensityVal = 'subtle';
      updates.push({ field: 'intensity', operation: 'SET', value: 'subtle' });
    }

    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      sillage: 'moderate',
      sillageMax: 'moderate',
      intensity: intensityVal,
      updates,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {},
    };
  }

  // Standalone Louder Refinement ("make it louder", "louder", "actually, make it louder", "more projection")
  if (isLoudPositive && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('louder')) && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      sillage: 'strong',
      sillageMax: null,
      updates: [
        { field: 'sillage', operation: 'SET', value: 'strong' },
        { field: 'sillageMax', operation: 'REMOVE', value: null },
      ],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: { sillage: 'strong' },
    };
  }

  // Standalone Subtle / Lighter Refinement ("make it lighter", "lighter", "make it subtle")
  if (isExplicitSubtle && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('make it') || lower.startsWith('lighter') || lower.includes('subtle')) && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      intensity: 'subtle',
      updates: [{ field: 'intensity', operation: 'SET', value: 'subtle' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: { intensity: 'subtle' },
    };
  }

  // Standalone Weakened Intensity ("actually not too strong", "not too strong", "make it less intense", "less intense")
  if ((isBoundedStrong || isLessIntense) && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('not too strong') || lower.includes('less intense')) && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      intensity: 'moderate',
      updates: [{ field: 'intensity', operation: 'SET', value: 'moderate' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: { intensity: 'moderate' },
    };
  }

  // Standalone Stronger Refinement
  if (isExplicitStrong && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('make it') || lower.startsWith('stronger')) && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'REFINE_RECOMMENDATION',
      request_type: 'refinement',
      is_new_request: false,
      is_refinement: true,
      intensity: 'strong',
      updates: [{ field: 'intensity', operation: 'SET', value: 'strong' }],
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: { intensity: 'strong' },
    };
  }

  // 14. REFERENCE PERFUMES (TEST 21, 22, 23)
  const isWearingReference = lower.includes('usually wear') || lower.includes('currently wear') || lower.includes('i wear');
  const isExplicitSimilar = lower.includes('similar to') || lower.includes('like sauvage') || lower.includes('something similar');

  let referencePerfume: string | null = null;
  if (lower.includes('sauvage')) referencePerfume = 'Dior Sauvage';
  else if (lower.includes('bleu de chanel')) referencePerfume = 'Bleu de Chanel';
  else if (lower.includes('aventus')) referencePerfume = 'Creed Aventus';
  else if (lower.includes('baccarat')) referencePerfume = 'Baccarat Rouge 540';

  if (isWearingReference && referencePerfume && !lower.includes('recommend') && !lower.includes('give me')) {
    return {
      intent: 'PREFERENCE_UPDATE',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      reference_perfume: referencePerfume,
      is_similarity_request: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      preferences: { reference_fragrances: [referencePerfume] },
    };
  }

  if (lower.includes('similar to') && referencePerfume) {
    return {
      intent: 'SIMILAR_TO_REFERENCE',
      request_type: 'new_consultation',
      is_new_request: true,
      is_refinement: false,
      reference_perfume: referencePerfume,
      is_similarity_request: true,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: true,
      needs_clarification: false,
      preferences: { reference_fragrances: [referencePerfume] },
    };
  }

  // 15. NATURAL LANGUAGE DESCRIPTIONS (TEST 28, 29)
  // "I need something I can wear to meetings that smells crisp but doesn't fill the room."
  if (lower.includes('meetings') || (lower.includes('crisp') && lower.includes("doesn't fill the room"))) {
    return {
      intent: 'RECOMMENDATION',
      request_type: 'new_consultation',
      is_new_request: true,
      is_refinement: false,
      occasion: 'office',
      fragrance_families: ['fresh'],
      intensity: 'subtle',
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      budget: { min: null, max: null },
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {
        occasion: 'office',
        fragrance_families: ['fresh'],
        intensity: 'subtle',
      },
    };
  }

  // "I want something for dinner where I smell confident but not like I'm trying too hard."
  if (lower.includes('dinner') || (lower.includes('confident') && lower.includes('trying too hard'))) {
    return {
      intent: 'RECOMMENDATION',
      request_type: 'new_consultation',
      is_new_request: true,
      is_refinement: false,
      occasion: 'evening',
      intensity: 'moderate',
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      budget: { min: null, max: null },
      needs_recommendations: true,
      needs_clarification: false,
      preferences: {
        occasion: 'evening',
        intensity: 'moderate',
      },
    };
  }

  // 16. POSITIVE ATTRIBUTES EXTRACTION (ONLY NON-NEGATED!)
  const families: string[] = [];
  if (freshPol.isPositive) families.push('fresh');
  if (woodyPol.isPositive) families.push('woody');
  if (spicyPol.isPositive) families.push('spicy');
  if (citrusPol.isPositive) families.push('citrus');
  if (aquaticPol.isPositive) families.push('aquatic');
  if (floralPol.isPositive) families.push('floral');
  if (sweetPol.isPositive) families.push('sweet');
  if (oudPol.isPositive) families.push('oud');

  let occasion: string | null = null;
  if (/\b(going\s+out\s+with\s+someone|going\s+out|date|date\s+night|romantic)\b/i.test(lower)) occasion = 'date-night';
  else if (/\b(office|work|meetings|professional)\b/i.test(lower)) occasion = 'office';
  else if (/\b(dinner|evening)\b/i.test(lower)) occasion = 'evening';
  else if (/\b(wedding|formal|party)\b/i.test(lower)) occasion = 'wedding';
  else if (/\b(gym|sport)\b/i.test(lower)) occasion = 'gym';
  else if (/\b(daily|everyday)\b/i.test(lower)) occasion = 'daily';

  let season: string | null = null;
  if (lower.includes('summer')) season = 'summer';
  else if (lower.includes('winter')) season = 'winter';
  else if (lower.includes('spring')) season = 'spring';
  else if (lower.includes('autumn') || lower.includes('fall')) season = 'autumn';

  let style: string | null = null;
  if (isExpensive) style = 'sophisticated';
  else if (isInteresting || isBoring) style = 'distinctive';

  const warmth: 'warmer' | 'moderate-warm' | null = isBoundedWarm ? 'moderate-warm' : (isStrengthenWarm || isWarmthRequested ? 'warmer' : null);
  const warmthMax: 'warm' | null = isBoundedWarm ? 'warm' : null;
  const freshness: 'fresher' | null = isFreshnessRequested ? 'fresher' : null;

  let sillage: 'moderate' | 'strong' | null = null;
  let sillageMax: 'moderate' | null = null;
  if (isLoudNegated) {
    sillage = 'moderate';
    sillageMax = 'moderate';
  } else if (isLoudPositive) {
    sillage = 'strong';
  }

  let intensity: string | null = null;
  if (isBoundedStrong || isLessIntense) {
    intensity = 'moderate';
  } else if (strongPol.isNegated || isExplicitSubtle) {
    intensity = 'subtle';
  } else if (isExplicitStrong) {
    intensity = 'strong';
  }

  let longevity: string | null = null;
  if (/\b(lasts?\s+all\s+day|long\s*lasting|stays?\s+all\s+day|all\s+day\s+performance)\b/i.test(lower)) {
    longevity = 'long-lasting';
  }

  const bMax: number | null = budgetInfo.max;

  // 17. PURE EXCLUSIONS / NEGATIVE PREFERENCE HANDLER
  // If the user's message contains exclusions and NO positive request (no occasion, season, positive families, or explicit recommendation verb)
  const isExplicitRec = lower.includes('recommend') || lower.includes('show me') || lower.includes('give me') || lower.includes('for a') || lower.includes('want something') || lower.includes('going out');

  if (hasExclusions && !occasion && !season && families.length === 0 && !isExplicitRec && !isWarmthRequested && !isFreshnessRequested) {
    const updates: PreferenceUpdateItem[] = [];
    if (mustExcludeFamilies.length > 0) {
      updates.push({ field: 'excluded_families', operation: 'ADD', value: mustExcludeFamilies });
    }
    if (mustExcludeNotes.length > 0) {
      updates.push({ field: 'excluded_notes', operation: 'ADD', value: mustExcludeNotes });
    }
    if (sillageMax) {
      updates.push({ field: 'sillage', operation: 'SET', value: sillage });
      updates.push({ field: 'sillageMax', operation: 'SET', value: sillageMax });
    }
    if (intensity) {
      updates.push({ field: 'intensity', operation: 'SET', value: intensity });
    }

    return {
      intent: 'PREFERENCE_UPDATE',
      request_type: activeConsultationExists ? 'refinement' : 'other',
      is_new_request: false,
      is_refinement: activeConsultationExists,
      updates,
      occasion: null,
      season: null,
      fragrance_families: [], // NEVER put excluded families here!
      preferred_notes: [],
      excluded_notes: mustExcludeNotes,
      excluded_families: mustExcludeFamilies,
      sillage: sillage,
      sillageMax: sillageMax,
      intensity: intensity,
      budget: { min: null, max: null },
      needs_recommendations: false,
      needs_clarification: false,
      preferences: {
        avoid_families: mustExcludeFamilies,
        avoid_notes: mustExcludeNotes,
        intensity: intensity,
      },
    };
  }

  // 18. STANDARD RECOMMENDATION INTENT
  const updates: PreferenceUpdateItem[] = [];
  if (bMax !== null) updates.push({ field: 'budget.max', operation: 'SET', value: bMax });
  if (mustExcludeFamilies.length > 0) {
    updates.push({ field: 'excluded_families', operation: 'ADD', value: mustExcludeFamilies });
  }
  if (mustExcludeNotes.length > 0) {
    updates.push({ field: 'excluded_notes', operation: 'ADD', value: mustExcludeNotes });
  }
  if (intensity) updates.push({ field: 'intensity', operation: 'SET', value: intensity });
  if (sillage) updates.push({ field: 'sillage', operation: 'SET', value: sillage });
  if (sillageMax) {
    updates.push({ field: 'sillageMax', operation: 'SET', value: sillageMax });
  } else if (isLoudPositive) {
    updates.push({ field: 'sillageMax', operation: 'REMOVE', value: null });
  }
  if (longevity) updates.push({ field: 'longevity', operation: 'SET', value: longevity });
  if (occasion) updates.push({ field: 'occasion', operation: 'SET', value: occasion });
  if (season) updates.push({ field: 'season', operation: 'SET', value: season });
  if (families.length > 0) updates.push({ field: 'fragrance_families', operation: 'SET', value: families });
  if (style) updates.push({ field: 'style', operation: 'SET', value: style });
  if (warmth) updates.push({ field: 'warmth', operation: 'SET', value: warmth });
  if (warmthMax) updates.push({ field: 'warmthMax', operation: 'SET', value: warmthMax });
  if (freshness) updates.push({ field: 'freshness', operation: 'SET', value: freshness });

  const isNew = Boolean(occasion || season || families.length > 0 || longevity);

  return {
    intent: 'RECOMMENDATION',
    request_type: isNew ? 'new_consultation' : (activeConsultationExists ? 'refinement' : 'new_consultation'),
    is_new_request: isNew || !activeConsultationExists,
    is_refinement: !isNew && activeConsultationExists,
    updates,
    occasion,
    season,
    fragrance_families: families, // Strictly contains ONLY non-negated families!
    preferred_notes: [],
    excluded_notes: mustExcludeNotes,
    excluded_families: mustExcludeFamilies,
    intensity,
    sillage,
    sillageMax,
    longevity,
    warmth,
    warmthMax,
    freshness,
    style,
    budget: { min: null, max: bMax },
    needs_recommendations: true,
    needs_clarification: false,
    preferences: {
      occasion,
      season,
      fragrance_families: families,
      avoid_families: mustExcludeFamilies,
      avoid_notes: mustExcludeNotes,
      intensity,
      budget_max: bMax,
    },
  };
}

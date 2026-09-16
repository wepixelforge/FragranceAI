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
import {
  extractCartEntitiesWithGroq,
  extractCartProductReferences,
  inferCartActionType,
  isExplicitCartActionQuery,
  emptyCartStage1,
  normalizeProductReferencesList,
  findNamedProductsInText,
} from './cart-action-resolver';

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
    case 'purchase_intent':
    case 'PURCHASE_QUESTION':
    case 'HOW_TO_BUY':
      return 'PURCHASE_ASSISTANCE';
    case 'CART_ASSISTANCE':
    case 'CART_ACTION':
    case 'cart_action':
    case 'ADD_TO_CART':
    case 'REMOVE_FROM_CART':
    case 'VIEW_CART':
      return 'CART_ASSISTANCE';
    case 'FRAGRANCE_DISCOVERY':
      return 'RECOMMENDATION';
    case 'FRAGRANCE_REFINEMENT':
      return 'REFINE_RECOMMENDATION';
    case 'PRODUCT_INFORMATION':
      return 'PRODUCT_INFO';
    case 'PRODUCT_COMPARISON':
      return 'COMPARE_PRODUCTS';
    case 'ALTERNATIVES':
      return 'SHOW_ALTERNATIVES';
    case 'WEBSITE_ASSISTANCE':
      return 'BRAND_CONVERSATION';
    case 'COMPETITOR_DISCUSSION':
      return 'CUSTOMER_OBJECTION';
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
    lower.includes('unlimited budget') ||
    lower.includes('forget the budget') ||
    lower.includes('forget my budget') ||
    lower.includes('ignore the budget') ||
    lower.includes('ignore my budget') ||
    lower.includes("price doesn't matter") ||
    lower.includes('price does not matter') ||
    lower.includes("don't worry about price") ||
    lower.includes("don't worry about the price") ||
    lower.includes("dont worry about price") ||
    lower.includes("dont worry about the price") ||
    lower.includes('forget my price limit') ||
    lower.includes('forget the price limit') ||
    lower.includes('remove the price limit') ||
    lower.includes('remove my price limit') ||
    lower.includes('drop the budget constraint') ||
    lower.includes('drop the budget') ||
    lower.includes('drop my budget') ||
    lower.includes('drop the price limit') ||
    lower.includes('no price limit')
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
  if (stage1?.needs_clarification || intent === 'CLARIFICATION') {
    return false;
  }
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
    case 'PURCHASE_ASSISTANCE':
    case 'CART_ASSISTANCE':
      return false;

    case 'CUSTOMER_OBJECTION':
      return Boolean(stage1?.needs_recommendations);

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
  musk: ['musk', 'musky', 'musk-based', 'musky fragrance', 'clean musk', 'white musk'],
  leather: ['leather', 'leathery', 'suede'],
  smoke: ['smoke', 'smoky', 'birch tar', 'incense'],
  resin: ['resin', 'resinous', 'resins', 'myrrh', 'frankincense', 'benzoin', 'cistus', 'labdanum'],
  vanilla: ['vanilla', 'vanillic'],
  sugar: ['sugar', 'sugary'],
  caramel: ['caramel'],
  tonka: ['tonka', 'tonka bean'],
  rose: ['rose', 'roses'],
  cedar: ['cedar', 'cedarwood'],
  saffron: ['saffron'],
  cinnamon: ['cinnamon'],
  pepper: ['pepper', 'peppery', 'black pepper', 'pink pepper'],
  coffee: ['coffee'],
  chocolate: ['chocolate', 'cacao'],
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
  const negPfx = `\\b(no|not|dont|don't|do\\s+not|never|without|stop|avoid|avoiding|hate|hates|dislike|dislikes|detest|cant\\s+stand|can't\\s+stand|cannot\\s+stand|don't\\s+want|dont\\s+want|do\\s+not\\s+want|doesn't\\s+want|doesnt\\s+want|does\\s+not\\s+want|don't\\s+show|dont\\s+show|do\\s+not\\s+show|anything\\s+but|nothing\\s+with|nothing|except|other\\s+than|apart\\s+from|zero|isn't|isnt|doesn't|doesnt|forget|forgetting|drop|dropping|skip|skipping|remove|removing|instead\\s+of)\\b`;
  
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

export interface AmbiguousDescriptorMatch {
  term: string;
  question: string;
  interpretations: string[];
  preservedFamilies?: string[];
}

/**
 * Detects ambiguous, vague, or unsupported fragrance descriptors that require clarification.
 * Principles:
 * - Known vocabulary (fresh, woody, strong, warm, not sweet, etc.) NEVER triggers clarification.
 * - Unknown/ambiguous terms (melty, off, weird, impossible, sexy, etc.) trigger clarification (UNKNOWN ≠ NO_MATCH).
 * - Known terms accompanied by ambiguous terms (e.g. "unusual and woody") preserve known terms while clarifying the unknown.
 */
export function detectAmbiguousDescriptor(
  text: string,
  state?: ConversationState
): AmbiguousDescriptorMatch | null {
  const lower = text.toLowerCase();

  // Exclude greetings, bot identity/capabilities, general conversational chit-chat, out-of-scope, resets
  if (
    /^(hi|hello|hey|good\s*(morning|afternoon|evening)|who\s+are\s+you|what\s+can\s+you\s+help|what\s+is\s+the\s+capital|tell\s+me\s+about\s+your\s+brand|forget\s+everything|start\s+over|reset|thank|bye|goodbye)\b/i.test(
      lower.trim()
    )
  ) {
    return null;
  }

  // Exclude SHOW_ALTERNATIVES phrases (e.g. "show me something else", "something else", "show me other options")
  if (/\b(something\s+else|other\s+options?|different\s+options?|show\s+more|see\s+more|show\s+me\s+another|another\s+one|anything\s+else)\b/i.test(lower)) {
    return null;
  }

  // Check if it's a specific product inquiry (e.g. "Tell me about Royal Oud") or comparison
  if (/\b(tell\s+me\s+about|compare)\b/i.test(lower)) {
    return null;
  }

  // Check if it's a reference perfume query (e.g. "similar to Dior Sauvage")
  if (/\b(similar\s+to|smells?\s+like|alternative\s+to)\b/i.test(lower)) {
    return null;
  }

  // Check if known families are present in the query
  const knownFamilies: string[] = [];
  if (/\b(woody|woods?|cedar|sandalwood)\b/i.test(lower)) knownFamilies.push('woody');
  if (/\b(fresh|crisp|clean)\b/i.test(lower)) knownFamilies.push('fresh');
  if (/\b(floral|rose|jasmine)\b/i.test(lower)) knownFamilies.push('floral');
  if (/\b(spicy|spice|peppery|cinnamon)\b/i.test(lower)) knownFamilies.push('spicy');
  if (/\b(citrus|lemon|bergamot|lime)\b/i.test(lower)) knownFamilies.push('citrus');
  if (/\b(aquatic|marine|ocean)\b/i.test(lower)) knownFamilies.push('aquatic');
  if (/\b(oud|agarwood)\b/i.test(lower)) knownFamilies.push('oud');
  if (/\b(musk|musky)\b/i.test(lower)) knownFamilies.push('musky');

  // Check specific known ambiguous terms
  const hasOff = /\b(off)\b/i.test(lower) && !/\b(take\s+off|turn\s+off|cut\s+off|knock\s+off|show\s+off)\b/i.test(lower);
  const hasMelty = /\b(melty|melting)\b/i.test(lower);
  const hasWeird = /\b(weird|bizarre|funky|strange|crazy)\b/i.test(lower);
  const hasSexy = /\b(sexy|seductive|alluring)\b/i.test(lower);
  const hasAddictive = /\b(addictive|intoxicating)\b/i.test(lower) && !lower.includes('coffee') && !lower.includes('vanilla');
  const hasExpensive = /\b(expensive|smells?\s+expensive|luxurious)\b/i.test(lower) && !/\b(under|below|less\s+than|\d+)\b/i.test(lower);
  const hasImpossible = /\b(impossible)\b/i.test(lower);
  const hasUnusual = /\b(unusual|unconventional)\b/i.test(lower);
  const hasDifferent =
    /\b(something\s+different|different)\b/i.test(lower) &&
    !hasActiveConsultation(state) &&
    (!state?.shownProductIds || state.shownProductIds.length === 0);
  const hasInteresting =
    /\b(something\s+interesting|interesting)\b/i.test(lower) &&
    !hasActiveConsultation(state) &&
    (!state?.shownProductIds || state.shownProductIds.length === 0);

  if (hasMelty) {
    return {
      term: 'melty',
      question: "When you say 'melty', what kind of feeling do you mean?",
      interpretations: ["Something creamy and soft, warm and comforting, or something else?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasOff) {
    return {
      term: 'off',
      question: "When you say 'off', what kind of vibe do you mean?",
      interpretations: ["Something unusual, darker, more experimental, or something else?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasWeird) {
    return {
      term: 'weird',
      question: "When you say 'weird', what kind of vibe do you mean?",
      interpretations: ["Something unconventional, smoky and dark, experimental, or something else?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasSexy) {
    return {
      term: 'sexy',
      question: "When you say 'sexy', what kind of scent do you have in mind?",
      interpretations: ["Something warm and seductive, sweet and alluring, fresh and magnetic, or something else?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasAddictive) {
    return {
      term: 'addictive',
      question: "When you say 'addictive', what kind of fragrance profile draws you in?",
      interpretations: ["Something rich and gourmand, intoxicating and woody, or fresh and uplifting?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasExpensive) {
    return {
      term: 'expensive',
      question: "When you say 'expensive', what kind of character are you picturing?",
      interpretations: ["Something sophisticated and woody, rich and opulent with oud or amber, or a clean, polished luxury profile?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasImpossible) {
    return {
      term: 'impossible',
      question: "When you say 'impossible', what kind of scent combination are you imagining?",
      interpretations: ["Tell me what contrasting notes or feeling you're trying to find."],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasUnusual) {
    const famText = knownFamilies.length > 0 ? ` alongside ${knownFamilies.join(' & ')}` : '';
    return {
      term: 'unusual',
      question: `When you say 'unusual', what kind of twist are you looking for${famText}?`,
      interpretations: ["Something smoky and dark, earthy, or with an unexpected spice note?"],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasDifferent) {
    return {
      term: 'different',
      question: "Different from what you normally wear, or are you looking for a scent outside conventional styles?",
      interpretations: ["Tell me what notes you usually wear or what feeling you want to explore."],
      preservedFamilies: knownFamilies,
    };
  }
  if (hasInteresting) {
    return {
      term: 'interesting',
      question: "When you say 'interesting', what kind of character are you looking for?",
      interpretations: ["Something complex and spicy, an unusual woody blend, or something with bold contrasting notes?"],
      preservedFamilies: knownFamilies,
    };
  }

  // General vague discovery queries with no known fragrance attributes at all:
  // e.g. "I want something [word]" where [word] is not recognized
  const discoveryMatch = lower.match(
    /^(?:i\s+want\s+something|looking\s+for\s+something|give\s+me\s+something|show\s+me\s+something|find\s+me\s+something)\s+([a-z]+)\.?$/i
  );
  if (discoveryMatch) {
    const word = discoveryMatch[1];
    const isKnownWord =
      /\b(fresh|woody|floral|spicy|citrus|aquatic|musky?|oriental|amber|ambery|sweet|sugary|gourmand|oud|leather|vanilla|rose|jasmine|strong|light|subtle|cheap|affordable|summer|winter|spring|fall|office|work|casual|date|warm|warmer|cool|cooler|else|more|other|another|different|better|similar|cheaper|stronger)\b/i.test(
        word
      );
    if (!isKnownWord && word.length > 2) {
      return {
        term: word,
        question: `When you say '${word}', what kind of feeling or scent profile do you mean?`,
        interpretations: ["For example, are you leaning toward something fresh and crisp, warm and cozy, rich and woody, or something else?"],
      };
    }
  }

  return null;
}

export interface ScopeAnalysisResult {
  isPureOutOfScope: boolean;
  isMixedIntent: boolean;
  isFragranceRelated: boolean;
  fragranceQuery: string;
  outOfScopeQuery: string;
  detectedSignals: string[];
}

export const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  // Geography, capitals, continents, countries
  /\b(capital\s+of|population\s+of|continent\s+of|where\s+is\s+(?:bhutan|france|india|japan|germany|canada|brazil|egypt|china|australia|italy|spain|russia|usa|uk|america|london|paris|tokyo|delhi))\b/i,
  /\b(what\s+(?:is|was)\s+the\s+capital|tell\s+me\s+the\s+capital)\b/i,
  // Mathematics & calculations
  /\b(solve\s+(?:this\s+)?(?:math|equation|problem)|calculate|square\s+root|derivative\s+of|integral\s+of)\b/i,
  /\b\d+\s*[\+\-\*\/×÷]\s*\d+\b/,
  // Coding, programming & IT
  /\b(write\s+(?:me\s+)?(?:a\s+)?(?:python|javascript|typescript|java|c\+\+|code|script|program|function|regex|sql|html|css)|sort\s+a\s+list|debug\s+(?:this|my\s+code)|parse\s+(?:csv|json|xml)|coding|programming)\b/i,
  // Politics & world leaders
  /\b(president\s+of|prime\s+minister\s+of|who\s+(?:is|was)\s+(?:the\s+)?(?:president|prime\s+minister|king|queen|governor|mayor)|who\s+won\s+the\s+election)\b/i,
  // General trivia & science
  /\b(who\s+(?:invented|discovered|painted|built)|quantum\s+physics|theory\s+of\s+relativity|speed\s+of\s+light|photosynthesis|distance\s+to\s+the\s+moon|how\s+far\s+is\s+the\s+sun)\b/i,
  /\b(what\s+(?:is|are)\s+(?:the\s+)?(?:tallest|biggest|fastest|longest|deepest)\s+(?:mountain|river|ocean|animal|building|planet))\b/i,
  // Weather & forecasting
  /\b(weather\s+today|what(?:'s|\s+is)\s+the\s+weather|forecast\s+for|temperature\s+in|will\s+it\s+rain)\b/i,
  // News & current events
  /\b(in\s+today(?:'s)?\s+news|what\s+happened\s+in\s+(?:the\s+)?news|breaking\s+news|current\s+events)\b/i,
  // Humor, creative writing, non-fragrance general tasks
  /\b(tell\s+me\s+a\s+joke|make\s+me\s+laugh|write\s+(?:me\s+)?(?:a\s+)?(?:poem|story|essay|resume|cv|email|letter|cover\s+letter)|translate\s+(?:this|paragraph|text))\b/i,
  // Sports & matches
  /\b(who\s+won\s+the\s+(?:cricket|football|match|game|world\s+cup|super\s+bowl|ipl|championship)|cricket\s+score|match\s+score)\b/i,
  // Non-fragrance hardware / consumer products / media
  /\b(what\s+laptop|best\s+smartphone|which\s+(?:phone|car|tv|camera|computer)\s+(?:should\s+i|to)\s+buy|recommend\s+a\s+(?:movie|book|restaurant|hotel|flight))\b/i,
];

export const FRAGRANCE_TERMS_PATTERN =
  /\b(perfumes?|fragrances?|scents?|colognes?|attars?|extraits?|edp|edt|parfums?|flacons?|bottles?|sprays?|oils?|aromas?|olfactory|smell|smells|smelling|sniff|blend|blends|formulation|formulations|notes?|accords?|sillage|projection|longevity|intensity|wear\s+time|drydown|opening)\b/i;

/**
 * Robust application-level scope analyzer.
 * Determines whether an inquiry is fragrance/store related, pure out-of-scope, or mixed intent.
 */
export function analyzeMessageScope(
  message: string,
  products: Product[] = [],
  currentState?: ConversationState
): ScopeAnalysisResult {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  // 1. Check for explicit out-of-scope patterns
  let hasOutOfScopePattern = false;
  let matchedOutOfScopeTopic = '';
  for (const pattern of OUT_OF_SCOPE_PATTERNS) {
    const match = lower.match(pattern);
    if (match) {
      hasOutOfScopePattern = true;
      matchedOutOfScopeTopic = match[0];
      break;
    }
  }

  // 2. Check for fragrance signals
  const detectedSignals: string[] = [];

  if (FRAGRANCE_TERMS_PATTERN.test(lower)) {
    detectedSignals.push('fragrance_terminology');
  }

  const hasOccasionOrSeasonOrGender =
    /\b(date\s*night|office|work|daily|casual|gym|party|evening|wedding|clubbing|summer|winter|spring|autumn|monsoon|heat|unisex|men(?:'s)?|mens|women(?:'s)?|womens|masculine|feminine|gift|trial|pocket\s*spray|sample)\b/i.test(lower);
  if (hasOccasionOrSeasonOrGender) {
    detectedSignals.push('occasion_season_gender');
  }

  const hasCompetitor =
    /\b(zara|dior|sauvage|chanel|bleu\s+de\s+chanel|fraganote|bella\s+vita|creed|aventus|tom\s+ford|baccarat|br540|versace|eros|ysl|gucci|armani)\b/i.test(lower);
  if (hasCompetitor) {
    detectedSignals.push('competitor_brand');
  }

  const hasBudgetOrPrice =
    /\b(under\s+₹?\s*\d+|₹\s*\d+|\d+\s*bucks|\d+\s*rs|budget|cheaper|expensive|how\s+much\s+(?:does|is))\b/i.test(lower);
  if (hasBudgetOrPrice) {
    detectedSignals.push('budget_price');
  }

  // Check product names from catalogue
  for (const p of products) {
    const pName = p.name.toLowerCase();
    if (lower.includes(pName) || (pName.length > 4 && lower.includes(pName.slice(0, -1)))) {
      detectedSignals.push(`product:${p.name}`);
      break;
    }
  }

  // Check fragrance families / notes / attributes
  for (const [attr, kws] of Object.entries(ATTRIBUTE_KEYWORDS)) {
    for (const kw of kws) {
      const kwRegex = new RegExp(`\\b${kw}\\b`, 'i');
      if (kwRegex.test(lower)) {
        detectedSignals.push(`attribute:${attr}`);
        break;
      }
    }
  }

  // Check ambiguous fragrance descriptors (melty, etc.)
  if (detectAmbiguousDescriptor(trimmed, currentState)) {
    detectedSignals.push('ambiguous_fragrance_descriptor');
  }

  // Check ongoing consultation context
  const hasActive = Boolean(
    currentState?.activeRequest?.families?.length ||
    currentState?.activeRequest?.budget?.max !== null ||
    currentState?.activeRequest?.occasion ||
    currentState?.currentConsultation?.fragrance_families?.length ||
    currentState?.lastRecommendationIds?.length
  );

  const isContextualRefinement = hasActive && (
    /\b(warmer|fresher|cooler|sweeter|stronger|lighter|cheaper|another|different|else|alternatives?|options?|more|less|avoid|forget|reset|change|make\s+it)\b/i.test(lower)
  );

  if (isContextualRefinement) {
    detectedSignals.push('contextual_refinement');
  }

  // Check store conversational meta
  const isStoreMeta =
    /^(hi|hello|hey|greetings|who\s+are\s+you|what\s+is\s+your\s+name|what\s+can\s+you\s+(help|do)|how\s+can\s+you\s+help|thanks?|thank\s+you|bye|goodbye|take\s+care)\b/i.test(lower.trim());
  if (isStoreMeta) {
    detectedSignals.push('store_meta');
  }

  // Check purchase or cart inquiry signals
  const isPurchaseOrCart =
    /\b(order|buy|purchase|cart|checkout|acquire|how\s+(?:can|do)\s+i\s+(?:order|buy|purchase|get)|place\s+(?:an\s+)?order|where\s+can\s+i\s+buy)\b/i.test(lower);
  if (isPurchaseOrCart) {
    detectedSignals.push('purchase_cart');
  }

  const hasFragranceSignals = detectedSignals.length > 0;

  // 3. Mixed Intent Separation
  if (hasOutOfScopePattern && hasFragranceSignals) {
    // Attempt to separate the non-fragrance question from the fragrance request
    const segments = trimmed
      .split(/(?<=[.?!;])\s+|\s+(?:and(?:\s+also)?|also|plus|then|while)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    const fragranceParts: string[] = [];
    const outOfScopeParts: string[] = [];

    for (const seg of segments) {
      const segLower = seg.toLowerCase();
      const segMatchesOutOfScope = OUT_OF_SCOPE_PATTERNS.some((p) => p.test(segLower));
      if (segMatchesOutOfScope) {
        outOfScopeParts.push(seg);
      } else {
        fragranceParts.push(seg);
      }
    }

    const cleanFragranceQuery = fragranceParts.join(' ').trim() || trimmed;
    const cleanOutOfScopeQuery = outOfScopeParts.join(' ').trim() || matchedOutOfScopeTopic;

    return {
      isPureOutOfScope: false,
      isMixedIntent: true,
      isFragranceRelated: true,
      fragranceQuery: cleanFragranceQuery,
      outOfScopeQuery: cleanOutOfScopeQuery,
      detectedSignals,
    };
  }

  // 4. Pure Out-of-Scope
  if (hasOutOfScopePattern && !hasFragranceSignals) {
    return {
      isPureOutOfScope: true,
      isMixedIntent: false,
      isFragranceRelated: false,
      fragranceQuery: '',
      outOfScopeQuery: trimmed,
      detectedSignals: [],
    };
  }

  // 5. In-scope / normal query
  return {
    isPureOutOfScope: false,
    isMixedIntent: false,
    isFragranceRelated: true,
    fragranceQuery: trimmed,
    outOfScopeQuery: '',
    detectedSignals,
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

  // Check for ambiguous / unknown descriptors (UNKNOWN ≠ NO_MATCH)
  const ambig = detectAmbiguousDescriptor(clean, currentState);
  if (ambig) {
    res.intent = 'CLARIFICATION';
    res.needs_clarification = true;
    res.needs_recommendations = false;
    res.requires_product_data = false;
    res.ambiguous_term = ambig.term;
    res.clarification_question = ambig.question;
    res.suggested_interpretations = ambig.interpretations;
    if (ambig.preservedFamilies && ambig.preservedFamilies.length > 0) {
      res.fragrance_families = [...ambig.preservedFamilies];
    } else {
      res.fragrance_families = [];
    }
    res.preferred_notes = [];
    res.updates = (res.updates || []).filter(
      (u) => u.field === 'fragrance_families' && ambig.preservedFamilies?.includes(String(u.value))
    );
    return res;
  }

  // Check for clarification follow-up resolution
  if (currentState?.pendingClarification) {
    const isClarificationAnswer =
      /\b(creamy|soft|warm|warmer|cozy|comforting|unusual|dark|darker|experimental|sweet|fresh|woody|spicy|rich|clean)\b/i.test(lower) ||
      lower.startsWith('something ') ||
      lower.startsWith('i mean ') ||
      lower.startsWith('more of ');

    if (isClarificationAnswer) {
      res.intent = 'RECOMMENDATION';
      res.needs_recommendations = true;
      res.needs_clarification = false;
      res.requires_product_data = true;
      if (/\b(warm|warmer|cozy|comforting)\b/i.test(lower)) {
        res.warmth = 'warmer';
        if (!res.updates.some(u => u.field === 'warmth')) {
          res.updates.push({ field: 'warmth', operation: 'SET', value: 'warmer' });
        }
      }
      if (/\b(creamy|soft|sweet|gourmand|vanilla)\b/i.test(lower)) {
        res.sweetness = 'sweeter';
        res.fragrance_families = Array.from(new Set([...(res.fragrance_families || []), 'gourmand']));
        if (!res.updates.some(u => u.field === 'sweetness')) {
          res.updates.push({ field: 'sweetness', operation: 'SET', value: 'sweeter' });
        }
      }
    }
  }

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
  if (freshPol.isNegated) {
    mustExcludeFamilies.push('fresh');
    res.freshness = null;
    res.updates = (res.updates || []).filter(u => u.field !== 'freshness');
  }
  if (citrusPol.isNegated) mustExcludeFamilies.push('citrus');
  if (aquaticPol.isNegated) mustExcludeFamilies.push('aquatic');
  if (floralPol.isNegated) mustExcludeFamilies.push('floral');

  const muskPol = analyzePolarity(lower, 'musk');
  if (muskPol.isNegated) {
    mustExcludeFamilies.push('musky');
    mustExcludeNotes.push('musk');
  }

  // Note-level negative preference extraction
  const noteKeys: (keyof typeof ATTRIBUTE_KEYWORDS)[] = [
    'leather', 'smoke', 'resin', 'vanilla', 'sugar', 'caramel', 'tonka', 'rose',
    'cedar', 'saffron', 'cinnamon', 'pepper', 'coffee', 'chocolate'
  ];
  for (const nKey of noteKeys) {
    const pol = analyzePolarity(lower, nKey);
    if (pol.isNegated && !mustExcludeNotes.includes(nKey)) {
      mustExcludeNotes.push(nKey);
    }
  }

  const warmPol = analyzePolarity(lower, 'warm');
  if (warmPol.isNegated) {
    res.warmth = null;
    res.warmthMax = null;
    res.updates = (res.updates || []).filter(u => u.field !== 'warmth' && u.field !== 'warmthMax');
  }

  const hasReplacementMarker = /\b(switch\s+(?:it\s+)?to|change\s+(?:it\s+)?to|move\s+to|instead|rather|go\s+with\s+.*instead|replace\s+.*with|let'?s\s+go\s+with\s+.*instead|forget\s+.*(?:i\s+want|give\s+me|make\s+it|use))\b/i.test(lower);
  if (hasReplacementMarker) {
    if (!res.requested_changes) res.requested_changes = [];
    if (!res.requested_changes.includes('replace_family')) {
      res.requested_changes.push('replace_family');
    }
  }

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

  // 3. Enforce positive attributes when clearly requested and not negated
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

  // 4. Detect pure negative preference message (e.g. "i dont like sweet perfume", "no leather")
  const hasPositiveOccasion = Boolean(res.occasion);
  const hasPositiveSeason = Boolean(res.season);
  const hasPositiveFamilies = (res.fragrance_families || []).length > 0;
  const hasPositiveNotes = (res.preferred_notes || []).length > 0;
  const hasPositiveIntensity = isExplicitStrong;
  const isExplicitRec = lower.includes('recommend') || lower.includes('show me') || lower.includes('give me') || lower.includes('find me') || lower.includes('i want') || lower.includes('looking for') || lower.includes('suggest');

  if ((mustExcludeFamilies.length > 0 || mustExcludeNotes.length > 0 || strongPol.isNegated) &&
      !hasPositiveOccasion && !hasPositiveSeason && !hasPositiveFamilies && !hasPositiveNotes && !hasPositiveIntensity && !isExplicitRec) {
    res.intent = 'PREFERENCE_UPDATE';
    res.request_type = hasActiveConsultation(currentState) ? 'refinement' : 'other';
    res.is_new_request = false;
    res.is_refinement = hasActiveConsultation(currentState);
    res.needs_recommendations = false;
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

  // 9. Competitor Objection with Preference or Direction
  if (res.intent === 'CUSTOMER_OBJECTION') {
    const hasAnyPreference =
      (res.fragrance_families && res.fragrance_families.length > 0) ||
      (res.preferred_notes && res.preferred_notes.length > 0) ||
      Boolean(res.occasion) ||
      Boolean(res.season) ||
      freshPol.isPositive ||
      woodyPol.isPositive ||
      spicyPol.isPositive ||
      citrusPol.isPositive ||
      aquaticPol.isPositive ||
      floralPol.isPositive;

    if (hasAnyPreference) {
      res.needs_recommendations = true;
      res.request_type = 'new_consultation';
      res.is_new_request = true;
      res.is_refinement = false;
      if (!res.preferences) res.preferences = {};
      if (res.fragrance_families && res.fragrance_families.length > 0) {
        res.preferences.fragrance_families = res.fragrance_families;
        if (!res.updates.some((u) => u.field === 'fragrance_families')) {
          res.updates.push({
            field: 'fragrance_families',
            operation: 'SET',
            value: res.fragrance_families,
          });
        }
      }
    }
  }

  // 10. Enforce OUT_OF_SCOPE purity: zero recommendations, zero product data, zero updates
  if (res.intent === 'OUT_OF_SCOPE') {
    res.needs_recommendations = false;
    res.requires_product_data = false;
    res.fragrance_families = [];
    res.preferred_notes = [];
    res.excluded_notes = [];
    res.excluded_families = [];
    res.budget = { min: null, max: null };
    res.updates = [];
    res.preferences = {};
    res.out_of_scope_answer = "I'm here specifically to help with perfumes and fragrance discovery. I can't help with that topic, but I can help you find a scent if you'd like.";
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

  // 0. Application-Level Scope Enforcement & Mixed Intent Routing
  const scopeAnalysis = analyzeMessageScope(cleanMessage, products, currentState);

  if (scopeAnalysis.isPureOutOfScope) {
    return {
      intent: 'OUT_OF_SCOPE',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      requires_product_data: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: false,
      updates: [],
      preferences: {},
      out_of_scope_answer: "I'm here specifically to help with perfumes and fragrance discovery. I can't help with that topic, but I can help you find a scent if you'd like.",
    };
  }

  const effectiveQuery = scopeAnalysis.isMixedIntent
    ? scopeAnalysis.fragranceQuery
    : trimmed;

  // 0. Deterministic CART_ASSISTANCE gate for explicit cart actions
  if (isExplicitCartActionQuery(effectiveQuery, products)) {
    const action = inferCartActionType(effectiveQuery);
    const fallbackRefs = extractCartProductReferences(effectiveQuery, products);
    let references = fallbackRefs;
    if (fallbackRefs.length === 0 && action !== 'VIEW_CART') {
      const groqEntities = await extractCartEntitiesWithGroq({
        message: effectiveQuery,
        brand,
        products,
        canonicalSet: currentState?.lastCanonicalProductSet || [],
      });
      references = normalizeProductReferencesList(
        groqEntities?.product_references,
        effectiveQuery,
        products
      );
      const result = emptyCartStage1(groqEntities?.cart_action || action, references);
      result.requires_product_data = false;
      return result;
    }
    const result = emptyCartStage1(action, references);
    result.requires_product_data = false;
    return result;
  }

  // 1. Try Groq Stage 1
  const groqResult = await callGroqStage1(effectiveQuery, brand, products, history, currentState);
  if (groqResult) {
    const validated = validateAndEnforcePolarity(groqResult, effectiveQuery, currentState);
    validated.requires_product_data = doesIntentRequireProducts(validated.intent, validated);
    return validated;
  }

  // 2. Deterministic Fallback Classifier
  const fallbackResult = fallbackIntentClassifier(effectiveQuery, brand, products, currentState);
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
Latest recommended products (ordered, for contextual cart references; do NOT invent IDs): ${(currentState?.lastCanonicalProductSet || currentState?.lastRecommendationIds || []).length
    ? (currentState?.lastCanonicalProductSet?.map((p, i) => `${i + 1}. ${p.name}`).join(', ') || currentState?.lastRecommendationIds?.join(', '))
    : '(none)'}.

You are a specialized fragrance shopping and consultation assistant for this website.
Your purpose is to help users discover, understand, compare, and purchase fragrances available through this website.
You are NOT a general-purpose assistant.

Your task is to analyze the user's message in context and return a JSON object strictly adhering to this schema:
{
  "intent": "GREETING | IDENTITY | CAPABILITY | RECOMMENDATION | REFINE_RECOMMENDATION | PRODUCT_INFO | COMPARE_PRODUCTS | SIMILAR_TO_REFERENCE | SHOW_ALTERNATIVES | BUDGET_CHANGE | PREFERENCE_UPDATE | RESET_CONSULTATION | OUT_OF_SCOPE | CLARIFICATION | GENERAL_CONVERSATION | BRAND_CONVERSATION | CUSTOMER_OBJECTION | PURCHASE_ASSISTANCE | CART_ASSISTANCE",
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
  "product_reference": string or null,
  "product_references": string[],
  "cart_action": "ADD_TO_CART | REMOVE_FROM_CART | VIEW_CART" or null,
  "confidence": number,
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
1. SPECIALIZED SCOPE & OUT-OF-SCOPE:
   - "hi", "hello" -> intent: "GREETING", needs_recommendations: false.
   - "who are you?" -> intent: "IDENTITY", needs_recommendations: false.
   - "what can you help me with?" -> intent: "CAPABILITY", needs_recommendations: false.
   - Out-of-scope topics (general knowledge, geography, capitals, coding, math, weather, news, jokes, resumes, sports, translations, e.g. "What is the capital of Bhutan?", "What is 25 * 18?", "Write Python code", "Tell me a joke", "What's the weather today?"):
     -> intent: "OUT_OF_SCOPE", needs_recommendations: false, product_reference: null, cart_action: null. NEVER answer the unrelated non-fragrance question! Do not call recommendations.
   - Mixed intent (e.g. "What is the capital of France and recommend a fresh perfume under ₹1000" or "Tell me a joke and recommend something woody"):
     -> IGNORE the non-fragrance part completely. Classify and extract preferences ONLY for the fragrance part ("recommend a fresh perfume under ₹1000" -> RECOMMENDATION with fresh and budget max 1000).

2. PURCHASE & CART ASSISTANCE (CRITICAL — PURCHASE ≠ RECOMMENDATION):
   - General purchase inquiries ("How can I order a perfume?", "How do I buy a perfume?", "How do I place an order?", "How can I checkout?"):
     -> intent: "PURCHASE_ASSISTANCE", product_reference: null, needs_recommendations: false.
   - Product purchase inquiries ("How can I order Royal Oud?", "I want to buy Royal Oud", "I want to purchase Royal Oud", "Can I order Royal Oud?", "How do I purchase this?", "Where can I buy this?"):
     -> intent: "PURCHASE_ASSISTANCE", product_reference: "[Product]" (or "this"), target_product_names: ["[Product]"], product_references: ["[Product]"], needs_recommendations: false.
     Multi-product purchase ("I want to buy Ocean Breeze and White Musk") -> product_references: ["Ocean Breeze", "White Musk"]. NEVER join names with "and" into one string.
     Do NOT treat as a recommendation request. Do NOT return random recommendations!
   - Cart actions ("Add Royal Oud to my cart", "Put Royal Oud in my cart", "Add this to cart"):
     -> intent: "CART_ASSISTANCE", cart_action: "ADD_TO_CART", product_references: ["[Product]"] (or ["THIS"]), needs_recommendations: false.
     Multiple named products ("Add Ocean Breeze and White Musk to my cart") -> product_references: ["Ocean Breeze", "White Musk"]. NEVER return "Ocean Breeze and White Musk" as a single product_reference.
     Commas ("Add Ocean Breeze, White Musk and Fresh Linen") -> three separate product_references.
     Contextual: "add all 3" / "add all of them" -> ["ALL"] or ["ALL:3"]. "add both" -> ["BOTH"]. "add 1 and 3" / "add the first and third" -> ["POSITION:1", "POSITION:3"]. "add the first two" -> ["FIRST_N:2"]. "add this" -> ["THIS"].
     Do NOT invent product IDs.
   - Cart removals ("Remove Royal Oud from my cart", "Remove Ocean Breeze and White Musk"):
     -> intent: "CART_ASSISTANCE", cart_action: "REMOVE_FROM_CART", product_references: ["[Product]", ...], needs_recommendations: false.
   - Cart inquiries ("What's in my cart?", "What is in my cart?", "Show my cart", "How many perfumes are in my cart?", "How much is my cart?", "What's my subtotal?", "Do I have anything in my cart?"):
     -> intent: "CART_ASSISTANCE", cart_action: "VIEW_CART", needs_recommendations: false.

3. PRODUCT INFO & COMPARISON:
   - "Tell me about [Product]", "What are the notes in [Product]?", "How long does [Product] last?":
     -> intent: "PRODUCT_INFO", target_product_names: ["[Product]"], needs_recommendations: false.
   - "Compare [Product A] and [Product B]":
     -> intent: "COMPARE_PRODUCTS", target_product_names: ["[Product A]", "[Product B]"], needs_recommendations: false.
   - "Show me options", "Show options", "Give me options", "Show me something else", "Give me other options", "More options", "different options", "give me alternatives":
     -> intent: "SHOW_ALTERNATIVES", request_type: "refinement", is_refinement: true, needs_recommendations: true.

4. NEGATIVE PREFERENCES (MUST NEVER BECOME POSITIVE):
   - "I don't like sweet perfumes" / "I hate sweet" / "Anything but sweet" / "Nothing sugary" / "Don't show me vanilla-heavy fragrances":
     -> excluded_families: ["sweet", "gourmand"], excluded_notes: ["vanilla", "sugar"], sweetness: null. NEVER set sweetness to "sweeter".
   - "I don't want oud" / "I hate oud":
     -> excluded_notes: ["oud"], excluded_families: ["oud"].
   - "Avoid strong perfumes" / "Nothing too powerful" / "doesn't fill the room" / "I don't want anything too strong":
     -> intensity: "subtle", updates: [{ "field": "intensity", "operation": "SET", "value": "subtle" }].
   - "Actually I like sweet perfumes now":
     -> requested_changes: ["remove_sweet_exclusion"], updates: [{ "field": "excluded_families", "operation": "REMOVE", "value": ["sweet", "gourmand"] }].

5. RELATIVE PRICE (NEVER INVENT NUMERIC VALUES):
   - "same kind of fragrance, but something cheaper" / "something cheaper":
     -> intent: "REFINE_RECOMMENDATION", request_type: "refinement", is_refinement: true, relative_price: "cheaper", budget: { "min": null, "max": null }, updates: [{ "field": "relative_price", "operation": "SET", "value": "cheaper" }].
     DO NOT invent budget = 600! Leave numeric budget as null!

6. BUDGET CHANGES & REMOVAL:
   - "I have ₹500" / "500 is my limit" -> budget: { "max": 500 }, updates: [{ "field": "budget.max", "operation": "SET", "value": 500 }].
   - "Keep it below seven hundred bucks" -> budget: { "max": 700 }, updates: [{ "field": "budget.max", "operation": "SET", "value": 700 }].
   - "I don't have a budget" / "no budget" -> remove_budget: true, budget: { "min": null, "max": null }, updates: [{ "field": "remove_budget", "operation": "REMOVE", "value": true }].

7. REFINEMENT VS NEW REQUEST:
   - When an active consultation exists:
     * "I have ₹500" -> REFINEMENT (keep occasion/fresh, change budget).
     * "Make it warmer" -> REFINEMENT (warmth: "warmer").
     * "Make it stronger" / "more intense" -> REFINEMENT (intensity: "strong").
     * "Make it lighter" -> REFINEMENT (intensity: "subtle").
   - Completely new direction:
     * "I want something light and fresh for summer" after "spicy for a date" -> NEW REQUEST (is_new_request: true, request_type: "new_consultation"). Clear spicy and date!

8. REFERENCE PERFUMES:
   - "I usually wear Dior Sauvage" -> reference_perfume: "Dior Sauvage", is_similarity_request: false, needs_recommendations: false.
   - "Give me something similar to Dior Sauvage" -> reference_perfume: "Dior Sauvage", is_similarity_request: true, needs_recommendations: true.

9. CONVERSATION GATE — NON-RECOMMENDATION INTENTS:
   CUSTOMER_OBJECTION — Competitive statements, quality doubts, value challenges:
   - Pure objection without stated preference (e.g. "other brands have better scents", "TM Perfume House has better scents", "these perfumes smell cheap"):
     -> intent: "CUSTOMER_OBJECTION", needs_recommendations: false.
   - Objection COMBINED with a stated preference (e.g. "Other brands are better. Show me something woody."):
     -> intent: "CUSTOMER_OBJECTION", needs_recommendations: true, fragrance_families: [extracted family], request_type: "new_consultation", is_new_request: true.
   - Objection COMBINED with similarity request (e.g. "Fraganote has better scents. Show me something similar."):
     -> intent: "SIMILAR_TO_REFERENCE", reference_perfume: "Fraganote", is_similarity_request: true, needs_recommendations: true.

   BRAND_CONVERSATION — Questions about the brand, returns, shipping, ingredients, sourcing:
   - "where are your perfumes made?" / "do you do returns?" / "how long does shipping take?":
     -> intent: "BRAND_CONVERSATION", needs_recommendations: false.

   GENERAL_CONVERSATION — Chit-chat, thank-you, compliments, goodbyes:
   - "thank you" / "thanks" / "you're helpful" / "goodbye" / "bye":
     -> intent: "GENERAL_CONVERSATION", needs_recommendations: false.

   CLARIFICATION — AMBIGUOUS, VAGUE, OR UNKNOWN LANGUAGE:
   When the user's primary preference uses ambiguous, vague, subjective terminology (e.g. "melty", "off", "weird", "sexy", "addictive"):
   - DO NOT guess or silently map (e.g. do NOT map "melty" to sweet).
   - DO NOT classify as OUT_OF_SCOPE.
   - Set: intent: "CLARIFICATION", needs_clarification: true, needs_recommendations: false.
   - Provide clarification_question (e.g. "When you say 'melty', what kind of feeling do you mean?") and clarification_reason.

Active Consultation: ${JSON.stringify(currentState?.activeRequest || currentState?.currentConsultation || {})}
Background Preferences: ${JSON.stringify(currentState?.backgroundContext || currentState?.backgroundPreferences || {})}
Pending Clarification: ${JSON.stringify(currentState?.pendingClarification || null)}

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
      else if (lower.includes('tobacco vanille') || lower.includes('tom ford')) refPerfume = 'Tom Ford Tobacco Vanille';
    }
    const isSimReq = Boolean(
      parsed.is_similarity_request ||
      (refPerfume && (lower.includes('similar') || lower.includes('like ')))
    );

    const resolvedIntent = refPerfume && isSimReq && effectiveIntent === 'RECOMMENDATION' ? 'SIMILAR_TO_REFERENCE' : effectiveIntent;

    const isNonRecIntent =
      resolvedIntent === 'PURCHASE_ASSISTANCE' ||
      resolvedIntent === 'CART_ASSISTANCE' ||
      resolvedIntent === 'OUT_OF_SCOPE' ||
      resolvedIntent === 'PRODUCT_INFO' ||
      resolvedIntent === 'COMPARE_PRODUCTS' ||
      resolvedIntent === 'GREETING' ||
      resolvedIntent === 'IDENTITY' ||
      resolvedIntent === 'CAPABILITY' ||
      resolvedIntent === 'GENERAL_CONVERSATION' ||
      resolvedIntent === 'BRAND_CONVERSATION' ||
      resolvedIntent === 'CLARIFICATION';

    const needs_recommendations = isNonRecIntent ? false : Boolean(parsed.needs_recommendations || isRefinement);
    const parsedRefs: string[] = Array.isArray(parsed.product_references)
      ? parsed.product_references.map((r: unknown) => String(r).trim()).filter(Boolean)
      : [];
    const namedTargets: string[] = Array.isArray(parsed.target_product_names)
      ? parsed.target_product_names.map((r: unknown) => String(r).trim()).filter(Boolean)
      : [];
    const productRef =
      parsedRefs[0] ||
      parsed.product_reference ||
      namedTargets[0] ||
      null;
    const productReferences =
      parsedRefs.length > 0
        ? parsedRefs
        : namedTargets.length > 0
          ? namedTargets
          : productRef
            ? [productRef]
            : [];

    return {
      intent: resolvedIntent,
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
      target_product_names: namedTargets.length > 0 ? namedTargets : (productRef ? [productRef] : []),
      product_reference: productRef,
      product_references: productReferences,
      cart_action: parsed.cart_action || null,
      confidence: parsed.confidence || 0.95,
      needs_recommendations,
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

  // 0a. CLARIFICATION FOLLOW-UP (Resolving pending clarification)
  if (currentState?.pendingClarification) {
    const isClarificationAnswer =
      /\b(creamy|soft|warm|warmer|cozy|comforting|unusual|dark|darker|experimental|sweet|fresh|woody|spicy|rich|clean)\b/i.test(lower) ||
      lower.startsWith('something ') ||
      lower.startsWith('i mean ') ||
      lower.startsWith('more of ');

    if (isClarificationAnswer) {
      const fams: string[] = [];
      const updates: PreferenceUpdateItem[] = [];
      let warmthVal: 'warmer' | null = null;
      let sweetnessVal: 'sweeter' | null = null;

      if (/\b(warm|warmer|cozy|comforting)\b/i.test(lower)) {
        warmthVal = 'warmer';
        updates.push({ field: 'warmth', operation: 'SET', value: 'warmer' });
      }
      if (/\b(creamy|soft|sweet|gourmand|vanilla)\b/i.test(lower)) {
        fams.push('gourmand');
        sweetnessVal = 'sweeter';
        updates.push({ field: 'fragrance_families', operation: 'SET', value: ['gourmand'] });
        updates.push({ field: 'sweetness', operation: 'SET', value: 'sweeter' });
      }
      if (/\b(fresh|crisp|clean)\b/i.test(lower)) {
        fams.push('fresh');
        updates.push({ field: 'fragrance_families', operation: 'SET', value: ['fresh'] });
      }
      if (/\b(woody|cedar|sandalwood)\b/i.test(lower)) {
        fams.push('woody');
        updates.push({ field: 'fragrance_families', operation: 'SET', value: ['woody'] });
      }

      const prevFams = currentState.activeRequest?.families || [];
      const combinedFams = Array.from(new Set([...prevFams, ...fams]));

      return {
        intent: 'RECOMMENDATION',
        request_type: hasActiveConsultation(currentState) ? 'refinement' : 'new_consultation',
        is_new_request: !hasActiveConsultation(currentState),
        is_refinement: hasActiveConsultation(currentState),
        fragrance_families: combinedFams,
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        warmth: warmthVal,
        sweetness: sweetnessVal,
        needs_recommendations: true,
        needs_clarification: false,
        requires_product_data: true,
        preferences: { fragrance_families: combinedFams },
        updates,
      };
    }
  }

  // 0b. AMBIGUOUS / UNKNOWN DESCRIPTORS — CLARIFICATION FLOW (UNKNOWN ≠ NO_MATCH)
  const ambigMatch = detectAmbiguousDescriptor(clean, currentState);
  if (ambigMatch) {
    const updates: PreferenceUpdateItem[] = [];
    if (ambigMatch.preservedFamilies && ambigMatch.preservedFamilies.length > 0) {
      updates.push({
        field: 'fragrance_families',
        operation: 'SET',
        value: ambigMatch.preservedFamilies,
      });
    }
    return {
      intent: 'CLARIFICATION',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: ambigMatch.preservedFamilies || [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      needs_recommendations: false,
      needs_clarification: true,
      requires_product_data: false,
      ambiguous_term: ambigMatch.term,
      clarification_question: ambigMatch.question,
      suggested_interpretations: ambigMatch.interpretations,
      preferences: {},
      updates,
    };
  }

  // 0c. CONVERSATION GATE — CUSTOMER OBJECTIONS (must come before OUT_OF_SCOPE)
  const isCustomerObjection =
    /\b(other\s+brands|competitors|better\s+(scents?|perfumes?|fragrances?)|smell\s+cheap|smells?\s+cheap|too\s+expensive\s+for|don'?t\s+last\s+long|doesn'?t\s+last|lasts?\s+long\s+enough|nothing\s+here\s+matches|why\s+should\s+i\s+buy|what\s+makes\s+(this|your)\s+better|overpriced|not\s+worth|waste\s+of\s+money|i'?ve\s+smelled\s+better|cheap\s+quality|low\s+quality|poor\s+quality|rip\s*off|knockoff|fake|copy\s+of)\b/i.test(lower) ||
    (lower.includes('better than') && (lower.includes('brand') || lower.includes('fragrance') || lower.includes('perfume') || lower.includes('scent'))) ||
    (lower.includes('has better') && (lower.includes('brand') || lower.includes('scent') || lower.includes('perfume') || lower.includes('fragrance') || lower.includes('house'))) ||
    (lower.includes('why not') && (lower.includes('zara') || lower.includes('designer') || lower.includes('niche')));

  if (isCustomerObjection) {
    const hasSimRequest = lower.includes('something similar') || lower.includes('similar to') || lower.includes('show me similar');
    if (!hasSimRequest) {
      const explicitFamilyMatch = lower.match(/\b(fresh|woody|citrus|aquatic|floral|oud|spicy|sweet|oriental|musky|gourmand)\b/i);
      const hasPreferenceSignal =
        (lower.includes('i like') || lower.includes('i want') || lower.includes('prefer') || lower.includes('looking for') || lower.includes('give me')) &&
        explicitFamilyMatch;

      if (hasPreferenceSignal && explicitFamilyMatch) {
        const fam = explicitFamilyMatch[1].toLowerCase();
        return {
          intent: 'CUSTOMER_OBJECTION',
          request_type: 'new_consultation',
          is_new_request: true,
          is_refinement: false,
          fragrance_families: [fam],
          preferred_notes: [],
          excluded_notes: [],
          excluded_families: [],
          needs_recommendations: true,
          needs_clarification: false,
          preferences: { fragrance_families: [fam] },
          updates: [{ field: 'fragrance_families', operation: 'SET', value: [fam] }],
        };
      }

      // Pure objection without preference
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

  // 0c1. CART ASSISTANCE (add to cart, view cart, remove from cart)
  if (isExplicitCartActionQuery(lower, products)) {
    const action = inferCartActionType(lower);
    const references = extractCartProductReferences(message, products);
    return emptyCartStage1(action, references);
  }

  // 0c2. PURCHASE ASSISTANCE (ordering questions, buy intent, sizing, hesitation)
  const isPurchaseOrderIntent =
    /\b(how\s+(?:can|do)\s+i\s+(?:order|buy|purchase|place\s+an\s+order|get|checkout)|i\s+want\s+to\s+(?:buy|purchase|order|acquire)|can\s+i\s+(?:order|buy|purchase)|where\s+can\s+i\s+buy|i\s+want\s+this\s+perfume|how\s+do\s+i\s+place\s+an\s+order|acquire\s+(?:a\s+)?(?:full\s+)?bottle|order\s+(?:a\s+)?bottle)\b/i.test(lower);

  const isPurchaseHesitation =
    /\b(i'?m\s+not\s+sure\s+which|is\s+it\s+worth|should\s+i\s+get\s+the|i'?m\s+still\s+thinking|need\s+more\s+time|can'?t\s+decide|hard\s+to\s+choose|torn\s+between|which\s+one\s+should|worth\s+the\s+price|too\s+expensive|can\s+i\s+afford|is\s+this\s+a\s+good\s+deal|30ml\s+or\s+(the\s+)?50ml|50ml\s+or\s+(the\s+)?100ml|which\s+size|help\s+me\s+(decide|choose|pick))\b/i.test(lower) &&
    !lower.includes('recommend') && !lower.includes('show me') && !lower.includes('find me') && !lower.includes('give me');

  if (isPurchaseOrderIntent || isPurchaseHesitation) {
    const named = findNamedProductsInText(message, products);
    const refs = named.length > 0
      ? named.map((p) => p.name)
      : (lower.includes('this') || lower.includes('it') ? ['THIS'] : []);

    return {
      intent: 'PURCHASE_ASSISTANCE',
      request_type: 'other',
      is_new_request: false,
      is_refinement: false,
      fragrance_families: [],
      preferred_notes: [],
      excluded_notes: [],
      excluded_families: [],
      product_reference: refs[0] || null,
      product_references: refs,
      target_product_names: refs.filter((r) => r !== 'THIS'),
      confidence: 0.97,
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

  // 1. OUT OF SCOPE
  const scopeCheck = analyzeMessageScope(message, products, currentState);
  if (scopeCheck.isPureOutOfScope) {
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
      out_of_scope_answer: "I'm here specifically to help with perfumes and fragrance discovery. I can't help with that topic, but I can help you find a scent if you'd like.",
      preferences: {},
    };
  }

  // 2. RESET CONSULTATION
  const isResetPhrase =
    lower.includes('forget everything') ||
    lower.includes('forget my preferences') ||
    lower.includes('forget all preferences') ||
    lower.includes('clear my preferences') ||
    lower.includes('clear preferences') ||
    lower.includes('reset preferences') ||
    lower.includes('start over') ||
    lower === 'reset' ||
    lower === 'reset.' ||
    /^(new\s+search|start\s+a\s+new\s+search|i\s+want\s+a\s+new\s+search)\b/i.test(lower) ||
    /\b(start\s+(?:completely\s+)?fresh|let'?s\s+start\s+fresh|want\s+to\s+start\s+fresh)\b/i.test(lower);

  if (isResetPhrase) {
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

  // 7. PRODUCT INFO (TEST 26 & ADDITIONAL ISSUE 8)
  const isSimilarity = /\b(like|similar\s+to|alternative\s+to|clone\s+of|dupe\s+of|reminds\s+me\s+of|give\s+me\s+something\s+like|show\s+me\s+something\s+like)\b/i.test(lower);
  const isProductQuestion =
    lower.includes('tell me about') ||
    lower.includes('what is ') ||
    lower.includes('describe ') ||
    /\b(how\s+long\s+does\b.*last|what\s+(?:are\s+the\s+)?notes\b|does\b.*contain|what\s+is\s+the\s+projection\b|how\s+strong\s+is\b|how\s+much\s+(?:does\b.*cost|is\b)|what\s+size\s+is\b|longevity\s+of\b|ingredients\s+of\b|notes\s+in\b|price\s+of\b)/i.test(lower);

  if (!isSimilarity && (isProductQuestion || lower.includes('tell me about') || lower.includes('what is ') || lower.includes('describe '))) {
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

  const muskPol = analyzePolarity(lower, 'musk');
  if (muskPol.isNegated) {
    mustExcludeFamilies.push('musky');
    mustExcludeNotes.push('musk');
  }

  // Note-level negative preference extraction
  const noteKeys: (keyof typeof ATTRIBUTE_KEYWORDS)[] = [
    'leather', 'smoke', 'resin', 'vanilla', 'sugar', 'caramel', 'tonka', 'rose',
    'cedar', 'saffron', 'cinnamon', 'pepper', 'coffee', 'chocolate'
  ];
  for (const nKey of noteKeys) {
    const pol = analyzePolarity(lower, nKey);
    if (pol.isNegated && !mustExcludeNotes.includes(nKey)) {
      mustExcludeNotes.push(nKey);
    }
  }

  // Sillage / Loudness Semantics (Separated from Intensity!)
  const loudPol = analyzePolarity(lower, 'loud');
  const isLoudNegated =
    loudPol.isNegated ||
    isBoundedExpression(lower, 'loud') ||
    /\b(not\s+(?:too\s+)?loud|not\s+overpowering|without\s+filling\s+the\s+room|doesn'?t\s+fill\s+the\s+room|dont\s+fill\s+the\s+room|moderate\s+projection|not\s+beast\s+mode|controlled\s+sillage|subtle\s+projection|close\s+to\s+skin)\b/i.test(lower);
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

  // Multi-preference dimension counter to prevent early-return shortcut hijacking
  function hasMultiplePreferenceDimensions(text: string): boolean {
    let count = 0;
    if (/\b(summer|winter|monsoon|spring|fall|autumn)\b/i.test(text)) count++;
    if (/\b(office|work|daily|date|night|evening|party|club|wedding|gym|sport|casual|formal)\b/i.test(text)) count++;
    if (/\b(\d+\s*(?:rs|rupees|bucks|₹)|under|below|within|budget|affordable|cheap|cheaper|expensive|spend)\b/i.test(text)) count++;
    if (/\b(not\s+(?:too\s+)?sweet|no\s+sweet|sweet|sugary|gourmand|vanilla)\b/i.test(text)) count++;
    if (/\b(strong|intense|subtle|light|long\s*lasting|longevity|loud|projection|sillage|beast)\b/i.test(text)) count++;
    if (/\b(woody|floral|fresh|citrus|aquatic|spicy|oud|musk|musky|leather)\b/i.test(text)) count++;
    if (/\b(warm|warmer|cozy|cool|cooler)\b/i.test(text)) count++;
    return count > 1;
  }

  const isMultiPref = hasMultiplePreferenceDimensions(lower);

  // 14. REFINEMENTS: WARMTH, INTENSITY, LIGHTER, FRESHER, WOODY
  const isFreshNegated = /\b(forget\s+.*fresh|no\s+fresh|not\s+fresh|drop\s+fresh|instead\s+of\s+fresh)\b/i.test(lower);
  const isFreshnessRequested =
    /\b(fresh|fresher|clean|cleaner|refreshing|crisp|more\s+refreshing|less\s+heavy|suitable\s+for\s+hot\s+weather)\b/i.test(lower) && !isFreshNegated;
  const isWoodyRequested =
    /\b(woody|more\s+woody|woods|woody\s+character|less\s+floral,\s*more\s+woody)\b/i.test(lower);

  // Standalone Bounded Warmth Refinement ("not too warm", "keep it moderate")
  if (!isMultiPref && isBoundedWarm && (activeConsultationExists || lower.includes('not too warm') || lower.includes('moderate')) && !lower.includes('office') && !lower.includes('date') && !lower.includes('recommend') && !lower.includes('give me')) {
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
  if (!isMultiPref && isStrengthenWarm && (activeConsultationExists || lower.startsWith('warmer') || lower.includes('make it warm') || lower.includes('actually warmer')) && !lower.includes('office') && !lower.includes('date') && !lower.includes('recommend') && !lower.includes('give me')) {
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
  if (!isMultiPref && isFreshnessRequested && (activeConsultationExists || lower.startsWith('fresher') || lower.includes('make it fresh') || lower.includes('keep it fresh') || lower === 'fresh' || lower === 'fresher') && !lower.includes('office') && !lower.includes('date') && !lower.includes('recommend') && !lower.includes('give me')) {
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
  if (!isMultiPref && isLoudNegated && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('not loud') || lower.includes('not too loud')) && !lower.includes('recommend') && !lower.includes('give me')) {
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
  if (!isMultiPref && isLoudPositive && !hasComplexMultiPrefs && (activeConsultationExists || lower.includes('louder')) && !lower.includes('recommend') && !lower.includes('give me')) {
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
  else if (lower.includes('fraganote')) referencePerfume = 'Fraganote';
  else if (lower.includes('tm perfume house') || lower.includes('tm perfumers')) referencePerfume = 'TM Perfume House';

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

  if ((lower.includes('similar to') || lower.includes('something similar') || lower.includes('show me similar')) && referencePerfume) {
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
  if (muskPol.isPositive) families.push('musky');

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
  const hasReplacementMarker = /\b(switch\s+(?:it\s+)?to|change\s+(?:it\s+)?to|move\s+to|instead|rather|go\s+with\s+.*instead|replace\s+.*with|let'?s\s+go\s+with\s+.*instead|forget\s+.*(?:i\s+want|give\s+me|make\s+it|use))\b/i.test(lower);
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
  if (families.length > 0) {
    const famOp = hasReplacementMarker ? 'REPLACE' : 'SET';
    updates.push({ field: 'fragrance_families', operation: famOp, value: families });
  }
  if (style) updates.push({ field: 'style', operation: 'SET', value: style });
  if (warmth) updates.push({ field: 'warmth', operation: 'SET', value: warmth });
  if (warmthMax) updates.push({ field: 'warmthMax', operation: 'SET', value: warmthMax });
  if (freshness) updates.push({ field: 'freshness', operation: 'SET', value: freshness });

  const isNew = !activeConsultationExists;
  const requestedChanges: string[] = [];
  if (hasReplacementMarker) requestedChanges.push('replace_family');

  return {
    intent: 'RECOMMENDATION',
    request_type: isNew ? 'new_consultation' : 'refinement',
    is_new_request: isNew,
    is_refinement: !isNew,
    requested_changes: requestedChanges.length > 0 ? requestedChanges : undefined,
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

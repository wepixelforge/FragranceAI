import { Product, RecommendationResult } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import {
  ChatMessage,
  ConversationState,
  Stage1IntentOutput,
  UserIntent,
} from '@/types/chat';
import { safeGroqCompletion, getGroqModel } from './groq-client';
import { getVerifiedBrandDifferentiator } from './message-sequencer';
import { formatPrice, STOREFRONT_CURRENCY } from './brand-utils';
import {
  buildRecommendationPresentation,
  evaluateRecommendationGrounding,
  findCatalogueNamesInText,
  ComparativeContext,
  RecommendationPresentation,
} from './response-grounding';
import { sanitizeUserFacingResponse } from './sanitize-user-text';
import {
  applyConversationCallback,
  callbackPromptSection,
  detectConversationCallback,
  extractUnusualConcept,
  shouldSkipConversationCallback,
  ConversationCallback,
} from './conversation-callback';
import { analyzeScentConcept, isUnsupportedScentConcept } from './request-match-quality';
import {
  detectFormatEducationQuestion,
  formatEducationReply,
  formatLabel,
  isHairBodyMistProduct,
  relatedFormatProducts,
} from './sampling-format';
import {
  detectScentiraFormatEducation,
  isScentiraDecant,
  isScentiraProductInfoAsk,
  scentiraAsksOriginalKhamrah,
  scentiraFormatEducationReply,
  scentiraFormatLabel,
  scentiraOriginalKhamrahReply,
  scentiraUnknownProductReply,
} from './scentira-format';
import {
  isSouqScentBrand,
  isSouqScentConcentrationQuestion,
  souqscentCompareReply,
  souqscentConcentrationReply,
  souqscentMissingReferenceReply,
  souqscentNoMatchReply,
  souqscentProductInfoReply,
  souqscentUnknownProductReply,
} from './souqscent-policy';

export { sanitizeUserFacingResponse } from './sanitize-user-text';

export interface ResponseActionContext {
  intent: string;
  product?: {
    id: string;
    name: string;
    price: number;
    size: string;
    fragranceFamily?: string[];
  } | null;
  available_actions?: string[];
  purchase_flow?: Record<string, string>;
  cart?: {
    itemCount: number;
    items?: {
      productId?: string;
      brandSlug?: string;
      name: string;
      quantity: number;
      unitPrice?: number;
      unitPriceFormatted?: string;
      price?: number;
    }[];
    subtotal?: number;
    subtotalFormatted?: string;
    isEmpty?: boolean;
    currency?: {
      code: string;
      symbol: string;
      locale: string;
    };
  };
  currency?: {
    code: string;
    symbol: string;
    locale: string;
  };
  cart_action?: {
    action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART' | 'CLEAR_CART';
    productId?: string;
    productName?: string;
    success: boolean;
    added?: string[];
    removed?: string[];
    failed?: string[];
    partial?: boolean;
    needsClarification?: boolean;
    clearedCount?: number;
    addedItems?: { productName: string; unitPrice?: number; quantity?: number }[];
  };
  response_policy?: Record<string, any>;
}

export interface ResponseGeneratorOptions {
  hardConstraintFailed?: boolean;
  status?: string;
  actionContext?: ResponseActionContext;
  recommendationPresentation?: RecommendationPresentation;
  comparativeContext?: ComparativeContext | null;
  catalogueProducts?: Product[];
}

/**
 * Robust helper to extract and parse JSON from raw LLM output,
 * even when reasoning models prepend <think>...</think> or markdown code blocks.
 */
function extractResponseFromJson(raw: string): string | null {
  if (!raw || !raw.trim()) return null;

  // First, strip complete thinking blocks
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  text = text.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  text = text.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');

  // Strip code fences if present
  text = text.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Find outer JSON object boundaries
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = text.slice(firstBrace, lastBrace + 1);
    try {
      const parsed = JSON.parse(jsonSubstring);
      if (parsed && typeof parsed.response === 'string') {
        return parsed.response;
      }
      if (parsed && typeof parsed.text === 'string') {
        return parsed.text;
      }
      if (parsed && typeof parsed.message === 'string') {
        return parsed.message;
      }
      const values = Object.values(parsed);
      const strVal = values.find((v) => typeof v === 'string') as string | undefined;
      if (strVal) return strVal;
    } catch {
      // If JSON.parse fails, try regex for response key
      const match = jsonSubstring.match(/"(?:response|text|message)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match && match[1]) {
        try {
          return JSON.parse(`"${match[1]}"`);
        } catch {
          return match[1];
        }
      }
    }
  }

  return sanitizeUserFacingResponse(text);
}

const ALTERNATIVES_FAMILY_WORDS = [
  'fresh',
  'woody',
  'floral',
  'spicy',
  'aquatic',
  'oud',
  'citrus',
  'oriental',
  'sweet',
  'musky',
  'amber',
  'gourmand',
  'aromatic',
] as const;

const ALTERNATIVES_FAMILY_COMPATIBLE: Record<string, string[]> = {
  woody: ['oud', 'spicy', 'aromatic', 'musky', 'oriental'],
  oud: ['woody', 'spicy', 'oriental'],
  fresh: ['aquatic', 'citrus', 'aromatic', 'musky'],
  aquatic: ['fresh', 'citrus'],
  citrus: ['fresh', 'aquatic'],
  floral: ['sweet', 'musky'],
  oriental: ['sweet', 'amber', 'spicy', 'woody', 'gourmand', 'oud'],
  spicy: ['woody', 'oriental', 'oud'],
  sweet: ['floral', 'gourmand', 'oriental'],
  gourmand: ['sweet', 'oriental'],
  musky: ['woody', 'floral', 'oriental'],
  aromatic: ['woody', 'fresh'],
  amber: ['oriental', 'woody', 'sweet'],
};

export interface CanonicalAlternativesDirection {
  families: string[];
  warmth: string | null;
  label: string;
}

function uniqueLower(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))];
}

function productFamilyCounts(results: RecommendationResult[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const result of results) {
    for (const family of uniqueLower(result.product.fragranceFamily || [])) {
      counts.set(family, (counts.get(family) || 0) + 1);
    }
  }
  return counts;
}

function familyCompatibleWithState(family: string, stateFamilies: string[]): boolean {
  if (stateFamilies.includes(family)) return true;
  return stateFamilies.some((stateFamily) => (ALTERNATIVES_FAMILY_COMPATIBLE[stateFamily] || []).includes(family));
}

/**
 * Descriptive direction for SHOW_ALTERNATIVES wording.
 * Source of truth: current canonical request families + families on the canonical ranked products.
 */
export function canonicalAlternativesDirection(
  currentState: ConversationState,
  results: RecommendationResult[]
): CanonicalAlternativesDirection {
  const active = currentState.activeRequest;
  const stateFamilies = uniqueLower(active?.families || currentState.currentConsultation?.fragrance_families || []);
  const excluded = new Set(uniqueLower(active?.excludedFamilies || []));
  const warmth = active?.warmth ?? currentState.currentConsultation?.warmth ?? null;
  const counts = productFamilyCounts(results);
  const majorityFloor = Math.max(1, Math.ceil(results.length / 2));
  const majorityFamilies = [...counts.entries()]
    .filter(([, count]) => count >= majorityFloor)
    .map(([family]) => family);

  let families: string[];
  if (stateFamilies.length > 0) {
    families = uniqueLower([
      ...stateFamilies,
      ...majorityFamilies.filter((family) => familyCompatibleWithState(family, stateFamilies)),
    ]);
  } else {
    families = majorityFamilies.length ? majorityFamilies : uniqueLower([...counts.keys()]);
  }

  families = families.filter((family) => !excluded.has(family));

  const coolFamilies = new Set(['fresh', 'aquatic', 'citrus']);
  const majorityIsCool = majorityFamilies.some((family) => coolFamilies.has(family));
  if ((warmth === 'warmer' || warmth === 'moderate-warm') && results.length > 0 && !majorityIsCool) {
    families = uniqueLower([
      ...families.filter((family) => !coolFamilies.has(family)),
      ...majorityFamilies,
    ]).filter((family) => !excluded.has(family));
  }

  const labelParts = families.slice(0, 3);
  if (labelParts.length === 0 && (warmth === 'warmer' || warmth === 'moderate-warm')) {
    labelParts.push('warmer');
  }

  return {
    families,
    warmth,
    label: labelParts.length ? labelParts.join('/') : 'other',
  };
}

function protectNamedSpans(text: string, names: string[]): { masked: string; restore: (value: string) => string } {
  const tokens: string[] = [];
  let masked = text;
  names
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .forEach((name, index) => {
      const token = `\u0000P${index}\u0000`;
      tokens[index] = name;
      masked = masked.replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), token);
    });
  return {
    masked,
    restore: (value) => value.replace(/\u0000P(\d+)\u0000/g, (_, index) => tokens[Number(index)] || ''),
  };
}

/**
 * Strip leftover family adjectives (e.g. "fresh alternatives") that are not in the current canonical direction.
 */
export function rewriteStaleAlternativesWording(
  text: string,
  direction: CanonicalAlternativesDirection,
  productNames: string[] = []
): string {
  const allowed = new Set(direction.families.map((family) => family.toLowerCase()));
  const familyAlt = ALTERNATIVES_FAMILY_WORDS.join('|');
  const noun = 'alternatives?|options?|picks?|choices?|scents?|fragrances?|ones|directions?';
  const { masked, restore } = protectNamedSpans(text, productNames);
  const replacementLabel = direction.label || 'other';

  let out = masked.replace(new RegExp(`\\b(${familyAlt})\\s+(${noun})\\b`, 'gi'), (full, family: string, nounPart: string) => {
    if (allowed.has(family.toLowerCase())) return full;
    return `${replacementLabel} ${nounPart}`;
  });

  out = out.replace(
    new RegExp(`\\b(here are (?:some |a few |a couple of )?(?:different |other )?)${`(${familyAlt})`}\\b`, 'gi'),
    (full, prefix: string, family: string) => {
      if (allowed.has(family.toLowerCase())) return full;
      return `${prefix}${replacementLabel}`;
    }
  );

  return restore(out);
}

/**
 * STAGE 2: GROUNDED CONSULTANT RESPONSE GENERATION
 *
 * Explains strictly the products already selected and ranked by the deterministic recommendation engine.
 * Never independently selects products, never swaps order, and never hallucinates attributes.
 */
export function shouldUseLlmConversationalReply(stage1: Stage1IntentOutput): boolean {
  return (
    stage1.intent === 'CAPABILITY' ||
    Boolean(stage1.is_discovery_start) ||
    Boolean(stage1.is_broad_recommendation) ||
    Boolean(stage1.is_surprise_me)
  );
}

export async function generateConversationalResponse(
  message: string,
  brand: BrandConfig,
  stage1: Stage1IntentOutput,
  retrievedProducts: Product[],
  results: RecommendationResult[],
  currentState: ConversationState,
  history: ChatMessage[] = [],
  options: ResponseGeneratorOptions = {}
): Promise<string> {
  if (
    brand.slug === 'scentira' &&
    stage1.intent === 'PRODUCT_INFO' &&
    retrievedProducts.length === 0 &&
    isScentiraProductInfoAsk(message) &&
    !/\b(something like|similar to)\b/i.test(message)
  ) {
    return scentiraUnknownProductReply();
  }

  if (isSouqScentBrand(brand) && isSouqScentConcentrationQuestion(message)) {
    return souqscentConcentrationReply();
  }

  if (
    isSouqScentBrand(brand) &&
    stage1.intent === 'PRODUCT_INFO' &&
    retrievedProducts.length === 0 &&
    /\b(tell me about|how much is)\b/i.test(message)
  ) {
    return souqscentUnknownProductReply();
  }

  if (isSouqScentBrand(brand) && stage1.intent === 'COMPARE_PRODUCTS' && retrievedProducts.length >= 2) {
    return souqscentCompareReply(retrievedProducts);
  }

  if (isSouqScentBrand(brand) && stage1.intent === 'PRODUCT_INFO' && retrievedProducts.length > 0) {
    return souqscentProductInfoReply(retrievedProducts[0], message);
  }

  if (
    stage1.intent === 'GREETING' ||
    stage1.intent === 'IDENTITY' ||
    stage1.intent === 'RESET_CONSULTATION' ||
    stage1.intent === 'GENERAL_CONVERSATION' ||
    stage1.intent === 'BRAND_CONVERSATION' ||
    stage1.intent === 'CUSTOMER_OBJECTION' ||
    stage1.intent === 'CART_ASSISTANCE'
  ) {
    return fallbackResponseGenerator(
      message,
      brand,
      stage1,
      retrievedProducts,
      results,
      currentState,
      options
    );
  }

  const callback = shouldSkipConversationCallback(String(stage1.intent))
    ? null
    : detectConversationCallback({
        message,
        history,
        state: currentState,
        stage1,
        status: options.status,
        resultsCount: results.length,
        brandSlug: brand.slug,
        catalogueProducts: options.catalogueProducts?.length ? options.catalogueProducts : retrievedProducts,
      });

  const alternativesDirection = canonicalAlternativesDirection(currentState, results);
  const applyAlternativesWording = (text: string): string => {
    if (stage1.intent !== 'SHOW_ALTERNATIVES') return text;
    return rewriteStaleAlternativesWording(
      text,
      alternativesDirection,
      results.map((item) => item.product.name)
    );
  };

  const finalize = (text: string) =>
    applyConversationCallback(applyAlternativesWording(text), callback, {
      resultsCount: results.length,
      status: options.status,
    });

  if (
    (stage1.intent === 'CLARIFICATION' || stage1.needs_clarification || stage1.intent === 'PRODUCT_INFO') &&
    !shouldUseLlmConversationalReply(stage1)
  ) {
    return finalize(
      fallbackResponseGenerator(
        message,
        brand,
        stage1,
        retrievedProducts,
        results,
        currentState,
        options
      )
    );
  }

  const unusualNow = analyzeScentConcept(
    message,
    options.catalogueProducts?.length ? options.catalogueProducts : retrievedProducts
  );
  if (results.length === 0 && isUnsupportedScentConcept(unusualNow)) {
    return finalize(
      fallbackResponseGenerator(
        message,
        brand,
        stage1,
        retrievedProducts,
        results,
        currentState,
        options
      )
    );
  }

  if (stage1.intent === 'PREFERENCE_UPDATE' && results.length === 0) {
    return finalize(
      fallbackResponseGenerator(
        message,
        brand,
        stage1,
        retrievedProducts,
        results,
        currentState,
        options
      )
    );
  }

  // 1. Try Groq Stage 2 Grounded Explanation
  const groqReply = await callGroqStage2(
    message,
    brand,
    stage1,
    retrievedProducts,
    results,
    currentState,
    history,
    options,
    callback
  );

  if (groqReply && groqReply.trim().length > 0) {
    const catalogue = options.catalogueProducts?.length ? options.catalogueProducts : results.map((r) => r.product);
    const recIntents = [
      'RECOMMENDATION',
      'REFINE_RECOMMENDATION',
      'SHOW_ALTERNATIVES',
      'SIMILAR_TO_REFERENCE',
      'BUDGET_CHANGE',
      'PREFERENCE_UPDATE',
    ];
    if (recIntents.includes(String(stage1.intent))) {
      const grounding = evaluateRecommendationGrounding(groqReply, results, catalogue, {
        intent: String(stage1.intent),
        status: options.status,
        contextNames: retrievedProducts.map((p) => p.name),
      });
      if (grounding.ok) {
        return finalize(groqReply.trim());
      }
    } else if (stage1.intent === 'COMPARE_PRODUCTS') {
      const required = retrievedProducts.map((p) => p.name);
      const mentioned = findCatalogueNamesInText(
        groqReply,
        catalogue.length ? catalogue : retrievedProducts
      );
      const mentionedLower = new Set(mentioned.map((n) => n.toLowerCase()));
      const missing = required.filter((n) => !mentionedLower.has(n.toLowerCase()));
      const deniesKnownFacts =
        retrievedProducts.some((p) => p.topNotes.length > 0) &&
        /\b(don'?t have|do not have|no (note|details)|not (available|listed) in my (current )?data|i don'?t have the note)\b/i.test(
          groqReply
        );
      if (required.length > 0 && missing.length === 0 && !deniesKnownFacts) {
        return finalize(groqReply.trim());
      }
    } else {
      return finalize(groqReply.trim());
    }
  }

  // 2. Deterministic Grounded Fallback
  return finalize(
    fallbackResponseGenerator(
      message,
      brand,
      stage1,
      retrievedProducts,
      results,
      currentState,
      options
    )
  );
}

/**
 * Groq LLM Implementation of Stage 2 (Explanation & Grounded Dialogue)
 */
async function callGroqStage2(
  message: string,
  brand: BrandConfig,
  stage1: Stage1IntentOutput,
  retrievedProducts: Product[],
  results: RecommendationResult[],
  currentState: ConversationState,
  history: ChatMessage[],
  options: ResponseGeneratorOptions,
  callback: ConversationCallback | null = null
): Promise<string | null> {
  const model = getGroqModel();
  const assistantName = brand.finder?.assistantName || 'Fragrance Consultant';

  // Format the pre-selected and pre-ranked results strictly
  const rankedItems = results.map((r, idx) => ({
    rank: idx + 1,
    productId: r.product.id,
    brandSlug: r.product.brandSlug,
    tier: r.matchTier,
    name: r.product.name,
    price: r.product.price,
    priceFormatted: formatPrice(r.product.price),
    currency: STOREFRONT_CURRENCY.code,
    size: r.product.size,
    fragranceFamily: r.product.fragranceFamily,
    topNotes: r.product.topNotes.slice(0, 3),
    baseNotes: r.product.baseNotes.slice(0, 3),
    intensity: r.product.intensity,
    longevity: r.product.longevity,
    occasion: r.product.occasion,
    season: r.product.season,
    matchReasons: r.matchReasons.map((m) => m.label),
    explanation: r.explanation,
  }));

  let brandVoicePrompt = '';
  switch (brand.slug) {
    case 'tmperfumehouse':
      brandVoicePrompt = `You are "${assistantName}", fragrance advisor for TM Perfume House. Tone: Knowledgeable, direct, practical, and efficient.`;
      break;
    case 'almaham':
      brandVoicePrompt = `You are "${assistantName}", private atelier sommelier for Al-Maham Fragrances. Tone: Sophisticated, luxurious, editorial, and intimate.`;
      break;
    case 'worldofperfumers':
      brandVoicePrompt = `You are "${assistantName}", fragrance exploration guide for World of Perfumers. Tone: Approachable, exploratory, curious, and welcoming.`;
      break;
    case 'thescentstories':
      brandVoicePrompt = `You are "${assistantName}", fragrance and sampling concierge for The Scent Stories. Tone: Calm, consultative, concise, premium. Guide on BOTH fragrance direction and the sensible format (sample, pocket, miniature, tester, discovery set, full size). Never push samples when the customer already knows the scent. Never invent formats or prices. Do not sound chatty or salesy.`;
      break;
    case 'scentira':
      brandVoicePrompt = `You are "${assistantName}", fragrance shopping assistant for Scentira. Tone: Helpful, commercial but not pushy, fragrance-knowledgeable, concise, practical, discovery-oriented. Recommend both the fragrance and a sensible listed format (discovery vial, 5/10/20ml decant, or full bottle). Call decants decants — never official samples, factory-sealed samples, or official minis. Never invent products, prices, formats, or availability. Never claim Scentira is better than a competitor. Do not sound luxury-editorial or use SaaS/AI wording.`;
      break;
    case 'souqscent':
      brandVoicePrompt = `You are "${assistantName}", fragrance consultant for SouqScent. Tone: Knowledgeable retail consultant, concise, natural. Never call yourself an AI chatbot, agent, or LLM. Never invent products, prices, notes, hour-based longevity, or projection. If a note pyramid or hour rating is unpublished, say it is not specified in the available catalogue data.`;
      break;
    default:
      brandVoicePrompt = `You are "${assistantName}", artisanal fragrance advisor. Tone: Warm, authentic, and knowledgeable.`;
      break;
  }

  const presentation =
    options.recommendationPresentation || buildRecommendationPresentation(results, options.status);
  const comparative = options.comparativeContext;

  const systemPrompt = `${brandVoicePrompt}

You are a specialized fragrance shopping and consultation assistant for this website.
Your purpose is to help users discover, compare, understand, and purchase perfumes and fragrance products available through this website.
You are NOT a general-purpose assistant.
Do not answer questions unrelated to perfumes, fragrances, fragrance products, or this website.
For clearly unrelated questions, politely state that you specialize in fragrance assistance and decline to answer the unrelated question.
Do not attempt to answer the unrelated question before declining it.
However, if a user combines an unrelated question with a legitimate perfume request, ignore the unrelated portion and handle the perfume-related portion.
You may participate in normal greetings and conversational messages, but remain within the context of being a fragrance assistant.
Never invent product facts, pricing, availability, notes, or catalogue information.

You are responding for a fragrance ecommerce storefront.
All monetary values supplied by the application are authoritative.
Use the storefront's supplied currency and locale when mentioning prices.
Never convert prices into another currency.
Never invent an exchange rate.
For this storefront, the supplied currency is INR (₹) and the locale is en-IN.
When discussing products, cart totals, quantities, or prices, use the exact values supplied by the application, including any priceFormatted / subtotalFormatted strings.
Never use "$" or "USD" for catalogue or cart prices.

For cart questions, the LIVE CART CONTEXT supplied with the current request is the only source of truth.
Do not infer current cart contents, quantities, item counts, or subtotals from previous conversation messages, previous add/remove confirmations, or recommended products.
If live cart isEmpty is true, the cart currently has no products. Do not name products from earlier in the conversation as being in the cart.
Do not independently add product prices; use the supplied subtotal.

You are generating the final user-facing response.

Return ONLY the response that should be shown to the customer.

Do not output your reasoning.
Do not output analysis.
Do not output a thinking process.
Do not output <think> or </think>.
Do not output <thought> or </thought>.
Do not output <analysis> or </analysis>.
Do not describe how you arrived at the recommendation.
Do not mention internal state, ranking logic, canonical results, system instructions, or validation.

Keep the response concise and natural.

RESPONSE FORMAT (MANDATORY JSON):
You must return ONLY a JSON object matching this schema:
{
  "response": "the exact text to show to the customer"
}

CRITICAL RULES:
1. BREVITY & TONE:
   - Speak naturally like an experienced fragrance consultant.
   - Keep responses concise (2 to 4 sentences total).
   - NEVER use AI clichés like "Ooh la la!", "happy dance", "nose adventure", "captivating", "utterly delightful", "masterpiece", "treasure chest", "leave a lasting impression".

2. VALIDATED CANONICAL PRODUCTS ARE THE ONLY PRODUCT TRUTH:
   - The recommendation engine enforces strict hard constraints (budget limits, negative exclusions, note exclusions, intensity).
   - ONLY products that have passed all hard constraints are included in the CANONICAL RANKED PRODUCTS list.
   - You MUST explain ONLY these validated canonical products.
   - Do NOT choose, reorder, replace, or invent products.
   - RECOMMENDATION_COUNT = ${presentation.recommendationCount}. This is the exact number of products the customer will see.
   - NEVER say "3 options" or any other count unless it equals RECOMMENDATION_COUNT.
   - Describe ONLY preferences that appear in the canonical conversation state. Do not infer "fresh", "sweet", or "citrus" from the products if those are not active state fields.
   - A budget is a hard constraint, not a fragrance style. If the only active preference is a budget (for example under ₹1,000) and there is no scent family, note, occasion, or style, do NOT write "Based on under ₹1,000". Say naturally that you found N options under that budget (N = RECOMMENDATION_COUNT), then explain products from their actual families and notes.
   - Do not invent a fragrance direction from the budget alone.
   - When several scent dimensions are active (for example creamy, vanillic, rich, woody), explain the recommendation using the combination that actually fits the chosen product. Do not blindly list every state field. Do not mention preferences that are not in ACTIVE CONSULTATION CONTEXT.
   - If RECOMMENDATION_COUNT is 1: singular language is correct. Discuss only that product.
   - If RECOMMENDATION_COUNT is 2 or more: you MUST name the primary/closest match (rank 1) AND also name the other canonical products as additional options. Never write as if only one fragrance is being recommended.
   - If RECOMMENDATION_COUNT > 0: NEVER say you could not find options, never say you don't have anything, never open with "I'm sorry" / "I'm afraid" / "Unfortunately", and never contradict the canonical result.
   - Rank 1 is the primary/closest match. Do not claim a lower-ranked product is the closest match.
   - PERFORMANCE CLAIMS MUST MATCH PRODUCT METADATA:
     * If a product's longevity is "moderate" or "light", do NOT say it lasts all day, lasts a full day, is beast-mode, or is extremely long-lasting.
     * If intensity/sillage/projection is moderate or intimate, do not call it loud, beast-mode, or room-filling.
     * Do not claim a product fits an occasion or season that is missing from its metadata.
   - If STATUS is NO_ALTERNATIVES or no alternatives remain for SHOW_ALTERNATIVES:
     * Explain politely that you don't have another option that still fits the current preferences, and offer to loosen one requirement.
     * Do NOT invent, name, or recommend any unvalidated products.
   - If CANONICAL RANKED PRODUCTS is empty (HARD_CONSTRAINT_FAILED / NO_VALID_MATCH):
      * NEVER recommend, name, or suggest unvalidated products.
      * Do NOT invent exclusions the user did not state.
      * Do NOT say "closest match", "closest option", or "best balanced composition".
      * Do not open with a long apology. Briefly say you couldn't find a meaningful match for that request.
      * If the user asked for an unusual object or food smell, do not invent a leather/woody/gourmand mapping. You may offer to explore a direction only if they name it.
      * Use this empty-result language ONLY when RECOMMENDATION_COUNT is 0.

3. INTENT BEHAVIOR & STRUCTURED POLICIES:
   - OUT_OF_SCOPE:
     Policy: must_not_answer_original_question = true, must_not_recommend_products = true, briefly_explain_specialized_scope = true, tone = brief, polite, helpful.
     * Politely explain in your own conversational words that you specialize in fragrance discovery and shopping for this website, decline to answer the unrelated question, and invite the user to explore perfumes.
     * NEVER answer the unrelated non-fragrance question (do not give the capital, calculate math, write code, tell jokes, forecast weather, etc.).
     * Do NOT present or recommend any products.
     * Do NOT use a hardcoded template — generate natural, polite, and helpful wording.
   - PURCHASE_ASSISTANCE:
     Policy: explain_actual_purchase_flow = true, do_not_invent_information = true, do_not_recommend_random_products = true.
     * If a specific product is provided in STRUCTURED APPLICATION CONTEXT (e.g. Royal Oud): naturally explain how to acquire/order it on this website (e.g. clicking 'Acquire Full Bottle' or adding to cart, opening the cart from the header, reviewing items, and proceeding to checkout). Reference the actual product name and details provided. Do NOT invent prices or shipping guarantees. Do NOT recommend random other products.
     * If no specific product is specified (general purchase question): naturally explain the site's ordering process (browse or consult, select Acquire Full Bottle / Add to Cart, open cart, and proceed to checkout). Do NOT recommend random products.
   - CART_ASSISTANCE:
     Policy: confirm_action_naturally = true, do_not_invent_information = true, must_not_print_raw_routes = true, live_cart_is_authoritative = true.
     * Confirm add/remove using ONLY the actual action result in STRUCTURED APPLICATION CONTEXT (added, failed, partial).
     * For "what's in my cart" / subtotal / item-count questions: use ONLY LIVE CART CONTEXT. If isEmpty is true, say the cart is empty. Do not mention previously added or recommended products as current cart items.
     * If confirm_clear_cart is true: list the LIVE CART items with ₹ prices and ask the customer to confirm clearing. Do not say the cart was already cleared.
     * If cart_already_empty is true: say the cart is already empty. Do not ask which product they mean.
     * If clear_cancelled is true: say you'll keep the current cart items. Do not mutate anything.
     * If cart_cleared is true: confirm using clearedCount from the action result. Do not invent a count.
     * If several products were added, mention those actual names. If some could not be found, say so naturally.
     * If ask_clarification is true, ask which products they mean. Do not claim anything was added.
     * Direct the customer to the cart icon in the header (or View Cart). NEVER print a URL or route such as /tmperfumehouse/cart.
     * Mention prices only with ₹ / INR using supplied formatted values.
   - GREETING/IDENTITY: Respond politely without presenting any products.
   - CAPABILITY:
      * The user asked what you can help with. Answer naturally from ASSISTANT CAPABILITIES CONTEXT.
      * Mention fragrance discovery, preferences, occasion, budget, notes, intensity, reference perfumes, comparisons, and sampling/formats where relevant to this brand.
      * Do NOT recommend or name specific products. Do NOT say you cannot help. Do NOT use a canned script.
      * Keep it concise (2–3 sentences). Write in your own words each time.
   - DISCOVERY_START / open-ended clarification (is_discovery_start):
      * The user asked for a personalized recommendation but has no usable preference state.
      * Do NOT search, do NOT say you couldn't find a match, do NOT present products.
      * In your own words, ask ONE useful preference question (family, occasion, or mood). Do not ask a questionnaire.
   - CLARIFICATION:
      * Ask a thoughtful, friendly fragrance clarification question.
      * E.g. "When you say '[word]', what kind of feeling do you mean? Something creamy and soft, warm and comforting, or something else?"
      * Do NOT present any products. Keep it to 1 to 2 short sentences.
   - BROAD_RECOMMENDATION / surprise_me with products present:
      * The user asked for suggestions without naming a family. Explain the canonical products from their actual metadata.
      * Do not claim bestsellers, "most popular", or "best" unless that fact is in the supplied product data.
      * Do not ask a preference question first. Name the recommended products naturally.
   - PRODUCT_INFO: Give a factual overview of the requested product. Always use the exact product name in the first sentence. Do NOT call it "Best Match".
   - COMPARE_PRODUCTS: Provide a factual side-by-side comparison of the two products. Always name both products. Follow-ups like "which is sweeter/fresher/better for office" still compare those same two products — do NOT start a new recommendation. Do NOT call either "Best Match".
   - SHOW_ALTERNATIVES: Present the alternative products provided in CANONICAL RANKED PRODUCTS. Describe this set using ONLY CURRENT ALTERNATIVES DIRECTION (from the current canonical consultation state and the families of the canonical ranked products). Keep the wording natural. Do not reuse leftover family words from earlier turns unless they appear in CURRENT ALTERNATIVES DIRECTION. Never call them fresh/woody/floral alternatives unless that word is in CURRENT ALTERNATIVES DIRECTION. If no alternatives exist (STATUS: NO_ALTERNATIVES), explain gracefully.
   - REFERENCE + REFINEMENT: If referencePerfume is set and isSimilarityRequest is true, naturally acknowledge that named reference when presenting recommendations, including when a refinement such as warmer is also requested. Do NOT claim a canonical product is a dupe or clone of the reference unless that product's similarTo or matchReasons already says so.
   - SIMILAR_TO_REFERENCE: Recommend different scents that share the profile. Never present the named fragrance, another bottle size, or another concentration of the same juice as the match.
   - PARTIAL_MATCH:
      * Use "closest match" ONLY when STATUS is PARTIAL_MATCH and MATCHED CRITERIA is non-empty.
      * Lead with the canonical product and state the actual matched attributes and the trade-off from UNMET CRITERIA.
      * NEVER say "best balanced composition" or invent why a product matches.
      * NEVER open with "I'm sorry", "I'm afraid", "Unfortunately", "I don't have", or "I couldn't find".
      * Never call it "Best Match". Never claim characteristics the product lacks.
      * If more than one canonical product is listed, name the primary and acknowledge the others as alternatives.
   - HARD_CONSTRAINT_FAILED / NO_VALID_MATCH: Use this ONLY when RECOMMENDATION_COUNT is 0. Briefly say you couldn't find a close fit and offer a useful next adjustment. Never present invalid products. Avoid robotic "relax one of your preferences" phrasing. Do not invent exclusions.
   - COMPARATIVE REFINEMENT (stronger / lighter / warmer / louder / fresher):
     * Compare against the previous recommendation/request, not against the globally strongest product in the catalogue.
     * If COMPARATIVE CONTEXT says improved=true and products are present: explain that these options step in that direction. Do NOT say you don't have anything stronger/warmer/etc.
     * If alreadyAtBound=true: explain that the current options are already at the strongest/warmest available level. Do not invent additional stronger products.

4. EXPLANATION MUST STRICTLY MATCH ACTIVE CONSULTATION STATE:
   - If warmth is "moderate-warm" or warmthMax is "warm": do NOT claim "leaning into a warmer profile" or "deep warmth". Describe it as subtle, balanced, or moderate warmth.
   - If sillage is "moderate" or sillageMax is "moderate": do NOT describe any product as "loud", "huge projection", "beast mode", or "room filling". Describe it as controlled, refined, or moderate projection.
   - If sweet is excluded: do NOT describe any selected product using sweet, dessert-like, or gourmand terms.

CANONICAL RANKED PRODUCTS (ALREADY VERIFIED & CHOSEN IN THIS EXACT ORDER):
${JSON.stringify(rankedItems, null, 2)}

CANONICAL PRESENTATION (AUTHORITATIVE PRODUCT SET FOR BOTH UI AND THIS RESPONSE):
${JSON.stringify(presentation, null, 2)}

MATCHED CRITERIA:
${JSON.stringify(presentation.matchedPreferences || [], null, 2)}

UNMET CRITERIA / TRADE-OFF:
${JSON.stringify({ unmetPreferences: presentation.unmetPreferences || [], tradeOff: presentation.tradeOff || null, isPartialMatch: Boolean(presentation.isPartialMatch) }, null, 2)}

COMPARATIVE CONTEXT:
${JSON.stringify(comparative || null, null, 2)}

ACTIVE CONSULTATION CONTEXT:
${JSON.stringify({
  ...(currentState.activeRequest || currentState.currentConsultation || {}),
  referencePerfume: currentState.backgroundContext?.referencePerfume ?? currentState.currentConsultation?.active_reference_perfume ?? null,
  isSimilarityRequest: Boolean(currentState.activeRequest?.isSimilarityRequest || stage1.is_similarity_request),
}, null, 2)}

CURRENT ALTERNATIVES DIRECTION (AUTHORITATIVE FOR SHOW_ALTERNATIVES WORDING — ignore leftover family language from prior turns):
${JSON.stringify(canonicalAlternativesDirection(currentState, results))}

STATUS: "${options.status || (options.hardConstraintFailed ? 'HARD_CONSTRAINT_FAILED' : 'SUCCESS')}"
HARD CONSTRAINT FAILED: ${Boolean(options.hardConstraintFailed)}
USER INTENT: "${stage1.intent}"
DISCOVERY FLAGS: ${JSON.stringify({
  is_discovery_start: Boolean(stage1.is_discovery_start),
  is_broad_recommendation: Boolean(stage1.is_broad_recommendation),
  is_surprise_me: Boolean(stage1.is_surprise_me),
  needs_recommendations: Boolean(stage1.needs_recommendations),
  needs_clarification: Boolean(stage1.needs_clarification),
})}
ASSISTANT CAPABILITIES CONTEXT: ${JSON.stringify({
  brand: brand.name,
  assistantName,
  purpose: `Help customers discover, compare, understand, and purchase fragrances from ${brand.name}.`,
  specialty: brand.specialty || brand.finder?.assistantName || null,
  can_help_with: [
    'preference-based fragrance discovery',
    'occasion and season',
    'budget in INR',
    'notes and intensity',
    'reference-perfume similarity',
    'product information and comparisons',
    'samples, pocket sizes, and other formats',
  ],
})}
STOREFRONT CURRENCY: ${JSON.stringify(options.actionContext?.currency || STOREFRONT_CURRENCY)}
LIVE CART CONTEXT (AUTHORITATIVE — IGNORE CART CONTENTS FROM PREVIOUS MESSAGES):
${JSON.stringify(options.actionContext?.cart || { isEmpty: true, itemCount: 0, items: [], subtotal: 0, subtotalFormatted: formatPrice(0), currency: STOREFRONT_CURRENCY }, null, 2)}
${options.actionContext ? `\nSTRUCTURED APPLICATION CONTEXT & POLICIES:\n${JSON.stringify(options.actionContext, null, 2)}\n` : ''}${callbackPromptSection(callback)}`;

  const messagesPayload = [
    { role: 'system' as const, content: systemPrompt },
    ...history.map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user' as const, content: message },
  ];

  const rawResponse = await safeGroqCompletion({
    model,
    messages: messagesPayload,
    temperature: 0.1,
    max_tokens: 1000,
    response_format: { type: 'json_object' },
  });

  if (!rawResponse) return null;

  const extracted = extractResponseFromJson(rawResponse);
  if (!extracted) return null;

  // Defensive sanitization: strip any accidental reasoning or think tags
  const sanitized = sanitizeUserFacingResponse(extracted);
  return sanitized.length > 0 ? sanitized : null;
}

function optionCountPhrase(n: number): string {
  if (n === 1) return 'one option';
  if (n === 2) return 'two options';
  if (n === 3) return 'three options';
  return `${n} options`;
}

function hasActiveScentDirection(activeReq: {
  families?: string[];
  style?: string | null;
  preferredNotes?: string[];
  occasion?: string | null;
  season?: string | null;
  intensity?: string | null;
  freshness?: string | null;
  warmth?: string | null;
  isSimilarityRequest?: boolean;
}): boolean {
  return Boolean(
    (activeReq.families && activeReq.families.length > 0) ||
      activeReq.style ||
      (activeReq.preferredNotes && activeReq.preferredNotes.length > 0) ||
      activeReq.occasion ||
      activeReq.season ||
      activeReq.intensity ||
      activeReq.freshness ||
      activeReq.warmth ||
      activeReq.isSimilarityRequest
  );
}

function budgetOnlyIntro(count: number, max: number): string {
  const phrase = optionCountPhrase(count);
  return count === 1
    ? `Here is an option under ₹${max}`
    : `Here are ${phrase} under ₹${max}`;
}

function creamyDirectionIntro(
  activeReq: { families?: string[]; style?: string | null; preferredNotes?: string[] },
  primaryName: string,
  product: Product
): string | null {
  const notes = (activeReq.preferredNotes || []).map((n) => n.toLowerCase());
  const hasCreamy = notes.includes('creamy') || (activeReq.style || '').toLowerCase() === 'creamy';
  const hasVanilla = notes.includes('vanilla') || notes.includes('vanillic');
  const hasWoody = (activeReq.families || []).some((f) => f.toLowerCase() === 'woody');
  const hasRich = (activeReq.style || '').toLowerCase() === 'rich';
  if (!hasCreamy && !hasVanilla) return null;

  const hay = [
    ...(product.topNotes || []),
    ...(product.heartNotes || []),
    ...(product.baseNotes || []),
  ]
    .join(' ')
    .toLowerCase();
  const productHasVanilla = /vanilla/.test(hay);

  if (hasRich && hasWoody && hasVanilla && productHasVanilla) {
    return `${primaryName} fits the rich, woody direction while keeping the soft vanilla character you mentioned`;
  }
  if (hasRich && hasWoody && hasVanilla) {
    return `Looking at a rich, woody direction that keeps the creamy vanillic character you asked for, I recommend ${primaryName}`;
  }
  if (hasRich && hasWoody && hasCreamy) {
    return `Looking at a rich, creamy-woody direction, I recommend ${primaryName}`;
  }
  if (hasWoody && hasVanilla) {
    return `${primaryName} keeps the creamy vanillic character in a woody direction`;
  }
  if (hasCreamy && hasVanilla && !hasWoody) {
    return `Looking at a soft, creamy vanillic direction, I recommend ${primaryName}`;
  }
  return null;
}

/**
 * Deterministic Grounded Fallback Response Generator
 */
export function fallbackResponseGenerator(
  message: string,
  brand: BrandConfig,
  stage1: Stage1IntentOutput,
  retrievedProducts: Product[],
  results: RecommendationResult[],
  currentState: ConversationState,
  options: ResponseGeneratorOptions = {}
): string {
  const presentation =
    options.recommendationPresentation || buildRecommendationPresentation(results, options.status);
  const activeReq = currentState.activeRequest || {
    occasion: currentState.currentConsultation?.occasion,
    families: currentState.currentConsultation?.fragrance_families || [],
    budget: { max: currentState.currentConsultation?.budget_max },
    warmth: currentState.currentConsultation?.warmth,
    intensity: currentState.currentConsultation?.intensity,
  };
  const referenceName =
    currentState.backgroundContext?.referencePerfume ||
    currentState.currentConsultation?.active_reference_perfume ||
    stage1.reference_perfume ||
    null;
  const isSimilarity =
    Boolean(currentState.activeRequest?.isSimilarityRequest || stage1.is_similarity_request) &&
    Boolean(referenceName);

  function alternativesIntro(primaryName: string): string {
    const direction = canonicalAlternativesDirection(currentState, results);
    if (direction.label === 'other') {
      return `Here are some other options. My top recommendation is ${primaryName}`;
    }
    return `Here are some different ${direction.label} options. My top recommendation is ${primaryName}`;
  }

  if (brand.slug === 'thescentstories' && detectFormatEducationQuestion(message)) {
    return formatEducationReply(message);
  }

  if (brand.slug === 'scentira' && detectScentiraFormatEducation(message)) {
    return scentiraFormatEducationReply(message);
  }

  if (brand.slug === 'scentira' && scentiraAsksOriginalKhamrah(message)) {
    return scentiraOriginalKhamrahReply(options.catalogueProducts || retrievedProducts);
  }

  if (isSouqScentBrand(brand) && isSouqScentConcentrationQuestion(message)) {
    return souqscentConcentrationReply();
  }

  if (
    isSouqScentBrand(brand) &&
    stage1.intent === 'PRODUCT_INFO' &&
    retrievedProducts.length === 0 &&
    /\b(tell me about|how much is)\b/i.test(message)
  ) {
    return souqscentUnknownProductReply();
  }

  if (isSouqScentBrand(brand) && stage1.intent === 'COMPARE_PRODUCTS' && retrievedProducts.length >= 2) {
    return souqscentCompareReply(retrievedProducts);
  }

  if (isSouqScentBrand(brand) && stage1.intent === 'PRODUCT_INFO' && retrievedProducts.length > 0) {
    return souqscentProductInfoReply(retrievedProducts[0], message);
  }

  // 1. OUT OF SCOPE
  if (stage1.intent === 'OUT_OF_SCOPE') {
    return (
      stage1.out_of_scope_answer ||
      `I'm here to help you discover fragrances and choose products. If you're looking for a scent, tell me the kind of smell, occasion, budget, or fragrance you have in mind.`
    );
  }

  // 1b. CART ASSISTANCE
  if (stage1.intent === 'CART_ASSISTANCE') {
    const action = options.actionContext?.cart_action?.action;
    const added = options.actionContext?.cart_action?.added;
    const removed = options.actionContext?.cart_action?.removed;
    const failed = options.actionContext?.cart_action?.failed;
    const prodName = options.actionContext?.cart_action?.productName || options.actionContext?.product?.name;
    const names =
      (action === 'REMOVE_FROM_CART'
        ? removed && removed.length > 0
          ? removed.join(', ')
          : prodName
        : added && added.length > 0
          ? added.join(', ')
          : prodName) || '';
    const nameList =
      action === 'REMOVE_FROM_CART'
        ? removed && removed.length > 0
          ? removed
          : names
            ? names.split(/,\s*/)
            : []
        : added && added.length > 0
          ? added
          : names
            ? names.split(/,\s*/)
            : [];
    if (options.actionContext?.response_policy?.delegated_no_match) {
      return `I couldn’t find enough fragrances in this collection that fit that request, so I haven’t added anything to your cart.`;
    }
    if (options.actionContext?.response_policy?.delegated_partial) {
      const available = Number(options.actionContext.response_policy.available_quantity || nameList.length || 0);
      const requested = Number(options.actionContext.response_policy.requested_quantity || 0);
      return `I found ${available} fragrance${available === 1 ? '' : 's'} that fit your request${requested ? ` (you asked for ${requested})` : ''}. Would you like me to add ${available === 1 ? 'it' : 'them'}?`;
    }
    if (options.actionContext?.response_policy?.ask_clarification) {
      return (
        String(options.actionContext.response_policy.clarification_question || '') ||
        'Which fragrances would you like me to add? I can use the latest recommendations or a product name from this collection.'
      );
    }
    if (options.actionContext?.response_policy?.cart_already_empty) {
      return `Your cart is already empty.`;
    }
    if (options.actionContext?.response_policy?.clear_cancelled) {
      return `No problem — I’ll leave your cart as it is.`;
    }
    if (options.actionContext?.response_policy?.confirm_clear_cart) {
      const lines = options.actionContext?.cart?.items || [];
      const listed = lines
        .map((i) => `• ${i.name} — ${i.unitPriceFormatted || formatPrice(i.unitPrice || i.price || 0)}`)
        .join('\n');
      const total = options.actionContext?.cart?.subtotalFormatted || formatPrice(options.actionContext?.cart?.subtotal || 0);
      if (!listed) {
        return `Your cart is already empty.`;
      }
      return `Sure — you want to remove everything from your cart:\n\n${listed}\n\nYour cart total is ${total}.\n\nWould you like me to clear the cart?`;
    }
    if (action === 'CLEAR_CART' || options.actionContext?.response_policy?.cart_cleared) {
      const cleared = options.actionContext?.cart_action?.clearedCount ?? options.actionContext?.cart?.itemCount ?? 0;
      return `Done — I've removed all ${cleared} item${cleared === 1 ? '' : 's'} from your cart. Your cart is now empty.`;
    }
    if (action === 'ADD_TO_CART') {
      const addSucceeded = options.actionContext?.cart_action?.success === true && nameList.length > 0;
      if (addSucceeded) {
        const listed =
          nameList.length === 1
            ? nameList[0]
            : `${nameList.slice(0, -1).join(', ')} and ${nameList[nameList.length - 1]}`;
        return `Added ${listed} to your cart.`;
      }
      if (failed?.length) {
        return `I couldn’t find ${failed.join(', ')} in this collection, so nothing was added. You can browse the current brand’s fragrances or tell me another name.`;
      }
      return `I can add them, but which fragrances did you mean?`;
    }
    if (action === 'REMOVE_FROM_CART') {
      if (failed?.length && nameList.length === 0) {
        return `I couldn’t find ${failed.join(', ')} in your cart, so nothing was removed.`;
      }
      if (nameList.length === 1) {
        return `${nameList[0]} has been removed from your cart.`;
      }
      if (nameList.length > 1) {
        const head = nameList.slice(0, -1).join(', ');
        const last = nameList[nameList.length - 1];
        return `Done — I've removed ${head} and ${last} from your cart.`;
      }
      return `I've updated your cart and removed the selected fragrance.`;
    }
    const count = options.actionContext?.cart?.itemCount ?? 0;
    const isEmpty = options.actionContext?.cart?.isEmpty ?? count === 0;
    if (isEmpty) {
      return `Your cart is currently empty. Tell me what fragrance profiles, notes, or occasions you enjoy, and I'll find something tailored for you!`;
    }
    const cartNames = options.actionContext?.cart?.items
      ?.map((i) => `${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''} (${i.unitPriceFormatted || formatPrice(i.unitPrice || i.price || 0)})`)
      .join(', ');
    const subtotalText =
      options.actionContext?.cart?.subtotalFormatted ||
      formatPrice(options.actionContext?.cart?.subtotal || 0);
    return `You currently have ${count} fragrance${count > 1 ? 's' : ''} in your cart${cartNames ? ` (${cartNames})` : ''}. Subtotal: ${subtotalText}. Open the cart from the header to proceed to checkout.`;
  }

  // 2. GREETING (TEST 1, 4)
  if (stage1.intent === 'GREETING') {
    return (
      stage1.out_of_scope_answer ||
      `Hi! I'm your ${brand.name} fragrance consultant. Tell me what occasion, scent family, or budget you're looking for, and I'll find your best match.`
    );
  }

  // 3. IDENTITY (TEST 2)
  if (stage1.intent === 'IDENTITY') {
    return `I'm your fragrance consultant for ${brand.name}. I help you discover perfumes based on your preferred scent profile, occasion, budget, and favorite notes without forcing you through complicated filters.`;
  }

  // 4. CAPABILITY — last-resort only when the LLM reply is unavailable
  if (stage1.intent === 'CAPABILITY') {
    return `I'm your ${brand.name} fragrance consultant. I can help you explore this collection by preference, occasion, budget, notes, intensity, a perfume you already wear, or a side-by-side comparison. What would you like to start with?`;
  }

  // 5. RESET
  if (stage1.intent === 'RESET_CONSULTATION') {
    return `Absolutely — we're starting fresh. What kind of fragrance are you looking for?`;
  }

  if (stage1.requested_changes?.includes('forget_last')) {
    const tagged = stage1.requested_changes.find((c) => c.startsWith('forget_last:') && c !== 'forget_last');
    const dropped = tagged?.split(':')[2];
    return dropped
      ? `I've dropped the ${dropped} preference. What would you like instead?`
      : `I've dropped the last preference. What would you like instead?`;
  }

  // 5c. CUSTOMER OBJECTION — Acknowledge non-defensively with verified brand differentiator
  if (stage1.intent === 'CUSTOMER_OBJECTION') {
    const diff = getVerifiedBrandDifferentiator(brand);
    // If the objection was accompanied by a preference and recommendations were retrieved
    if (results.length > 0) {
      return `That's fair — fragrance is personal. Since you shared what you're looking for, I can certainly work with that. Here are a couple of creations I'd start with:`;
    }

    const lower = message.toLowerCase();
    if (
      lower.includes('other brands') ||
      lower.includes('better scents') ||
      lower.includes('better than') ||
      lower.includes('has better')
    ) {
      return `That's fair — fragrance is personal. Another house may simply align with your current preferences. Our strength is ${diff}. If you're open to exploring, tell me what you enjoy most about their scents.`;
    }
    if (lower.includes('smell cheap') || lower.includes('cheap quality') || lower.includes('low quality')) {
      return `I understand that concern. Our formulations focus on quality ingredients with carefully layered note structures. Which scent profile appeals to you most?`;
    }
    if (lower.includes('expensive') || lower.includes('overpriced') || lower.includes('not worth') || lower.includes('waste of money')) {
      return `Price is definitely an important factor. Our range spans accessible price points, each formulated for lasting wear. Would you like me to find options within a specific budget?`;
    }
    if (lower.includes('don\'t last') || lower.includes('doesnt last') || lower.includes('doesn\'t last')) {
      return `Longevity can vary based on skin type and environment. Several of our fragrances are formulated for extended wear with noticeable sillage. Would you like me to highlight those?`;
    }
    return (
      stage1.out_of_scope_answer ||
      `That's fair — fragrance is personal. Every perfume journey is unique, and our strength is ${diff}. What notes or occasions matter most to you?`
    );
  }

  // 5d. BRAND CONVERSATION — Answer brand questions using available brand context
  if (stage1.intent === 'BRAND_CONVERSATION') {
    return (
      stage1.out_of_scope_answer ||
      `Great question about ${brand.name}! While I'm best equipped to help you discover fragrances, for specific brand information like returns, shipping, or ingredients, I'd recommend checking our website or reaching out to our support team. In the meantime, would you like me to help you find a fragrance?`
    );
  }

  // 5e. PURCHASE ASSISTANCE — Ordering instructions and purchase hesitation
  if (stage1.intent === 'PURCHASE_ASSISTANCE') {
    if (options.actionContext?.product) {
      const p = options.actionContext.product;
      return `To order ${p.name} (${p.size}, ₹${p.price}), select "Acquire Full Bottle" on its page or ask me to add it to your cart, then open your cart in the header to review and checkout.`;
    }
    const lower = message.toLowerCase();
    const isOrderingQuestion =
      /\b(how\s+(?:can|do)\s+i\s+(?:order|buy|purchase|place\s+an\s+order|get|checkout)|where\s+can\s+i\s+buy)\b/i.test(lower);
    if (isOrderingQuestion) {
      return `To order a perfume, simply select "Acquire Full Bottle" on any fragrance page to add it to your cart, then click the cart icon in the header to review your order and checkout.`;
    }
    const lastRecs = currentState.lastRecommendationIds || [];
    if (lower.includes('size') || lower.includes('30ml') || lower.includes('50ml') || lower.includes('100ml')) {
      return `If you're trying a new scent for the first time, a smaller size lets you wear it for a few weeks before committing. Once you know you love it, the larger size gives better value per ml. Would you like more details on any specific product?`;
    }
    if (lower.includes('worth') || lower.includes('expensive') || lower.includes('afford')) {
      return `Value depends on what matters to you — longevity, projection, and how often you'll wear it all factor in. If budget is a concern, I can find excellent options at different price points. Just tell me your range.`;
    }
    if (lastRecs.length > 0) {
      return `Take your time — there's no rush. If you'd like, I can walk you through the differences between the options we discussed, or I can narrow things down based on what matters most to you.`;
    }
    return `To order any fragrance, you can add it to your cart and proceed to checkout anytime from the cart icon in the header.`;
  }

  // 5f. GENERAL CONVERSATION — Polite acknowledgements, chit-chat, goodbyes
  if (stage1.intent === 'GENERAL_CONVERSATION') {
    const lower = message.toLowerCase();
    if (lower.includes('thank') || lower.includes('ty') || lower.includes('cheers')) {
      return `You're welcome! Let me know anytime you'd like to explore more fragrances.`;
    }
    if (lower.includes('bye') || lower.includes('goodbye') || lower.includes('see ya') || lower.includes('take care')) {
      return `Goodbye! It was great helping you. Come back anytime you're in the mood to discover something new.`;
    }
    return `Got it! If you'd like to explore fragrances, just tell me what occasion, scent family, or budget you have in mind.`;
  }

  // 5a. CLARIFICATION (Ambiguous or unknown language)
  if (stage1.intent === 'CLARIFICATION' || stage1.needs_clarification) {
    if (stage1.is_discovery_start && !stage1.ambiguous_term) {
      return `I can help you find a fragrance. What family, occasion, or budget do you usually enjoy?`;
    }
    const question =
      stage1.clarification_question ||
      (stage1.ambiguous_term
        ? `When you say '${stage1.ambiguous_term}', what kind of feeling do you mean?`
        : "Could you tell me a little more about what kind of scent profile you have in mind?");
    if (stage1.clarification_question && (!stage1.suggested_interpretations || stage1.suggested_interpretations.length === 0)) {
      return question;
    }
    const interpretation =
      stage1.suggested_interpretations && stage1.suggested_interpretations.length > 0
        ? stage1.suggested_interpretations[0]
        : (stage1.ambiguous_term === 'off'
          ? "Something unusual, darker, more experimental, or something else?"
          : stage1.ambiguous_term === 'melty'
          ? "Something creamy and soft, warm and comforting, or something else?"
          : "For example, are you leaning toward something fresh and crisp, warm and cozy, or rich and woody?");
    return `${question} ${interpretation}`.trim();
  }

  // 5b. NO_ALTERNATIVES (Graceful exhaustion of alternatives)
  if (
    options.status === 'NO_ALTERNATIVES' ||
    (stage1.intent === 'SHOW_ALTERNATIVES' && results.length === 0)
  ) {
    return "I couldn't find another suitable option matching those exact preferences from our remaining catalogue.";
  }

  // 6. PARTIAL MATCH — only when the application classified a grounded partial
  if (options.status === 'PARTIAL_MATCH' && results.length > 0 && (presentation.matchedPreferences || []).length > 0) {
    const closest = results[0];
    const tradeOff =
      presentation.tradeOff ||
      closest.detailedReasons?.find((d) => d.category === 'Profile')?.text ||
      '';
    const matched = (presentation.matchedPreferences || []).slice(0, 2).join(' and ');
    const missing = (presentation.unmetPreferences || [])[0];
    const grounded =
      tradeOff ||
      (missing
        ? `It matches ${matched}, although it differs on ${missing}.`
        : `It matches ${matched}.`);
    if (results.length >= 2) {
      const others = results.slice(1).map((r) => r.product.name).join(' and ');
      return `The closest match I found is ${closest.product.name} because it shares ${matched}. ${grounded} I've also included ${others}.`;
    }
    return `The closest match I found is ${closest.product.name} because it shares ${matched}. ${grounded}`;
  }

  if (
    brand.slug === 'scentira' &&
    stage1.intent === 'PRODUCT_INFO' &&
    retrievedProducts.length === 0 &&
    isScentiraProductInfoAsk(message)
  ) {
    return scentiraUnknownProductReply();
  }

  if (
    isSouqScentBrand(brand) &&
    stage1.intent === 'PRODUCT_INFO' &&
    retrievedProducts.length === 0
  ) {
    return souqscentUnknownProductReply();
  }

  // PRODUCT INFO - No "Best Match" language; never treat as a recommendation set
  if (stage1.intent === 'PRODUCT_INFO' && retrievedProducts.length > 0) {
    if (isSouqScentBrand(brand)) {
      return souqscentProductInfoReply(retrievedProducts[0], message);
    }
    const p = retrievedProducts[0];
    const q = message.toLowerCase();
    const joinNotes = (notes: string[]) => {
      const values = notes.map((note) => note.toLowerCase());
      if (values.length === 0) return '';
      if (values.length === 1) return values[0];
      if (values.length === 2) return `${values[0]} and ${values[1]}`;
      return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
    };
    if (/\bnotes?\b/.test(q)) {
      return `${p.name} has ${joinNotes(p.topNotes)} as its top notes, with ${joinNotes(p.heartNotes)} in the heart, followed by ${joinNotes(p.baseNotes)}.`;
    }
    if (/\b(how much|price|cost|₹)\b/.test(q)) {
      return `${p.name} is priced at ₹${p.price} for ${p.size}.`;
    }
    if (/\b(edp|edt|extrait|concentration)\b/.test(q)) {
      if (isHairBodyMistProduct(p)) {
        return `${p.name} is a hair & body mist, not an ${q.includes('edt') ? 'EDT' : 'EDP'} perfume. It is listed as ${p.size} at ₹${p.price}.`;
      }
      return p.concentration
        ? `${p.name} is listed as ${p.concentration} (${p.size}) at ₹${p.price}.`
        : `${p.name} does not list a concentration in this catalogue. It is ${p.size} at ₹${p.price}.`;
    }
    if (/\bis\b.+\b(a\s+)?perfume\b/.test(q) || /\bperfume\b/.test(q)) {
      if (isHairBodyMistProduct(p)) {
        return `${p.name} is a hair & body mist, not a conventional perfume. It is ${p.size} at ₹${p.price}.`;
      }
    }
    if (brand.slug === 'scentira' && /\b(format|decant|full bottle|sample|size|vial)\b/.test(q)) {
      const siblings = relatedFormatProducts(p, options.catalogueProducts || retrievedProducts);
      const formats = [p, ...siblings]
        .filter((item) => item.format || item.size)
        .map((item) => `${scentiraFormatLabel(item)} (${item.size}, ${formatPrice(item.price)})`);
      if (/\bdecant\b/.test(q)) {
        return isScentiraDecant(p)
          ? `${p.name} is a ${scentiraFormatLabel(p)} at ${formatPrice(p.price)}.`
          : `${p.name} is listed as ${scentiraFormatLabel(p)} — ${p.size} at ${formatPrice(p.price)}. It is not a decant.`;
      }
      if (formats.length > 0) {
        return `${p.name} is listed as ${scentiraFormatLabel(p)} — ${p.size} at ${formatPrice(p.price)}. Related listed formats: ${formats.join('; ')}.`;
      }
      return `${p.name} is listed as ${scentiraFormatLabel(p)} — ${p.size} at ${formatPrice(p.price)}.`;
    }
    if (brand.slug === 'thescentstories' && /\b(format|sample|full bottle|tester|miniature|pocket|vial|size)\b/.test(q)) {
      const siblings = relatedFormatProducts(p, options.catalogueProducts || retrievedProducts);
      const formats = [p, ...siblings]
        .filter((item) => item.format)
        .map((item) => `${formatLabel(item.format)} (${item.size}, ${formatPrice(item.price)})`);
      if (/\bnotes?\b/.test(q)) {
        return `${p.name} has ${joinNotes(p.topNotes)} as its top notes, with ${joinNotes(p.heartNotes)} in the heart, followed by ${joinNotes(p.baseNotes)}.`;
      }
      if (formats.length > 0) {
        return `${p.name} is listed as ${formatLabel(p.format)} — ${p.size} at ${formatPrice(p.price)}. Available related formats in this catalogue: ${formats.join('; ')}.`;
      }
      return `${p.name} is listed as ${formatLabel(p.format)} — ${p.size} at ${formatPrice(p.price)}. The catalogue does not list additional formats for this fragrance.`;
    }
    if (/\boffice|workplace|workwear|daily wear\b/.test(q)) {
      const officeOk = p.occasion.some((o) => /office|daily|casual|travel/i.test(o));
      return officeOk
        ? `${p.name} can work for office and daily wear: ${p.intensity} intensity with ${p.longevity.replace('-', ' ')} longevity.`
        : `${p.name} is closer to ${p.occasion.slice(0, 2).map((o) => o.replace('-', ' ')).join(' and ')} than a typical office scent — ${p.intensity} intensity and ${p.fragranceFamily.join('/')} character.`;
    }
    if (/\bstrong|intensity|projection|sillage\b/.test(q)) {
      return `${p.name} is ${p.intensity} in intensity/projection, with ${p.longevity.replace('-', ' ')} longevity.`;
    }
    if (/\blast|longevity\b/.test(q)) {
      return `${p.name} is formulated for ${p.longevity.replace('-', ' ')} wear.`;
    }
    if (/\binspired|inspiration\b/.test(q)) {
      const inspired = p.similarTo?.filter(Boolean) || [];
      return inspired.length > 0
        ? `${p.name} is inspired by ${inspired.slice(0, 2).join(' and ')}.`
        : `${p.name} is part of the ${p.fragranceFamily.join('/')} collection at ₹${p.price}; no designer inspiration is listed.`;
    }
    if (isHairBodyMistProduct(p)) {
      return `${p.name} is a ${p.size} hair & body mist priced at ₹${p.price}. It is not a conventional EDP/EDT perfume. Key notes: ${p.topNotes.slice(0, 3).join(', ')}.`;
    }
    return `${p.name} is a ${p.size} ${p.fragranceFamily.join('/')} fragrance priced at ₹${p.price}. Key top notes: ${p.topNotes.slice(0, 3).join(', ')}, heart: ${p.heartNotes.slice(0, 2).join(', ')}, base: ${p.baseNotes.slice(0, 2).join(', ')}. Performance is ${p.intensity} intensity with ${p.longevity.replace('-', ' ')} longevity, well suited for ${p.occasion.slice(0, 2).map((o) => o.replace('-', ' ')).join(' and ')}.`;
  }

  // COMPARE PRODUCTS - No "Best Match" language!
  if (stage1.intent === 'COMPARE_PRODUCTS' && retrievedProducts.length >= 2) {
    if (isSouqScentBrand(brand)) {
      return souqscentCompareReply(retrievedProducts);
    }
    const [p1, p2] = retrievedProducts;
    const q = message.toLowerCase();
    if (/\bfresher\b/.test(q)) {
      const score = (p: Product) =>
        (p.fragranceFamily.some((f) => ['fresh', 'citrus', 'aquatic'].includes(f)) ? 2 : 0) +
        (p.freshness === 'very-fresh' ? 2 : p.freshness === 'fresh' ? 1 : 0);
      const winner = score(p1) >= score(p2) ? p1 : p2;
      return `Between ${p1.name} and ${p2.name}, ${winner.name} is the fresher option (${winner.fragranceFamily.join('/')}; freshness ${winner.freshness || 'unspecified'}).`;
    }
    if (/\bsweeter\b/.test(q)) {
      const score = (p: Product) =>
        (p.fragranceFamily.some((f) => ['sweet', 'gourmand', 'floral'].includes(f)) ? 2 : 0) +
        (p.sweetness === 'very-sweet' ? 2 : p.sweetness === 'sweet' ? 1 : 0);
      const winner = score(p1) >= score(p2) ? p1 : p2;
      return `Between ${p1.name} and ${p2.name}, ${winner.name} is sweeter (${winner.fragranceFamily.join('/')}; sweetness ${winner.sweetness || 'unspecified'}).`;
    }
    if (/\boffice|suited\b/.test(q)) {
      const officeScore = (p: Product) => (p.occasion.includes('office') ? 2 : p.occasion.includes('daily') ? 1 : 0);
      const winner = officeScore(p1) >= officeScore(p2) ? p1 : p2;
      return `For office wear, ${winner.name} is the better suited of ${p1.name} and ${p2.name} (${winner.occasion.map((o) => o.replace('-', ' ')).join(', ')}; ${winner.intensity} intensity).`;
    }
    return `Here is a factual comparison between ${p1.name} and ${p2.name}:
• ${p1.name} (₹${p1.price}, ${p1.size}): ${p1.fragranceFamily.join('/')} profile with ${p1.topNotes.slice(0, 2).join(', ')} opening and ${p1.baseNotes.slice(0, 2).join(', ')} base. Sillage: ${p1.intensity}, longevity: ${p1.longevity.replace('-', ' ')}.
• ${p2.name} (₹${p2.price}, ${p2.size}): ${p2.fragranceFamily.join('/')} profile with ${p2.topNotes.slice(0, 2).join(', ')} opening and ${p2.baseNotes.slice(0, 2).join(', ')} base. Sillage: ${p2.intensity}, longevity: ${p2.longevity.replace('-', ' ')}.`;
  }

  // HARD CONSTRAINT FAILURE / NO_VALID_MATCH
  if (options.hardConstraintFailed || (results.length === 0 && stage1.needs_recommendations)) {
    if (isSouqScentBrand(brand) && stage1.is_similarity_request && !stage1.reference_perfume) {
      return souqscentMissingReferenceReply(stage1.product_reference || 'that fragrance');
    }
    if (isSouqScentBrand(brand)) {
      return souqscentNoMatchReply();
    }
    if (
      brand.slug === 'scentira' &&
      (stage1.is_similarity_request || currentState.activeRequest?.isSimilarityRequest)
    ) {
      const ref =
        stage1.reference_perfume ||
        currentState.backgroundContext?.referencePerfume ||
        'that fragrance';
      return `I don't have enough catalogue evidence to recommend a close match for ${ref}. If you tell me a direction — fresh, woody, citrus, aquatic, office, or date night — I can suggest listed Scentira products from that.`;
    }
    const isStrongControlledSillage =
      (activeReq.intensity === 'strong' || currentState.activeRequest?.intensity === 'strong') &&
      (activeReq.sillageMax === 'moderate' || currentState.activeRequest?.sillageMax === 'moderate' || activeReq.sillage === 'moderate');

    if (isStrongControlledSillage) {
      return `Nothing in this collection combines strong intensity with controlled projection. I can show you the closest moderate-intensity options or stronger options with more projection.`;
    }

    const failedList: string[] = [];
    const excludedFams = activeReq.excludedFamilies || currentState.activeRequest?.excludedFamilies || [];
    const excludedNotes = activeReq.excludedNotes || currentState.activeRequest?.excludedNotes || [];
    if (excludedFams.length > 0) {
      failedList.push(`avoiding ${excludedFams.join('/')} scents`);
    }
    if (excludedNotes.length > 0) {
      failedList.push(`excluding ${excludedNotes.join(', ')}`);
    }
    if (activeReq.intensity === 'strong' || currentState.activeRequest?.intensity === 'strong') {
      failedList.push('higher intensity projection');
    }
    const budget = activeReq.budget?.max || currentState.activeRequest?.budget?.max;
    if (budget) {
      failedList.push(`under ₹${budget}`);
    }

    const families = activeReq.families || currentState.activeRequest?.families || [];
    const longevity = activeReq.longevity || currentState.activeRequest?.longevity;
    if (families.length >= 2 && budget && (longevity === 'long-lasting' || longevity === 'beast-mode')) {
      return `I couldn't find a ${families.join(', ')} fragrance under ₹${budget} that offers all-day longevity in our current selection. Would you like to explore options with moderate longevity, or perhaps adjust the budget or scent family?`;
    }

    if (failedList.length > 0) {
      const limiter = failedList[0];
      return `I couldn't find a close fit for that combination (${limiter}). If you'd like, we can loosen that preference and I'll find something closer.`;
    }
    const unusual = extractUnusualConcept(message, (options.catalogueProducts || retrievedProducts).map((p) => p.name));
    const concept = analyzeScentConcept(message, options.catalogueProducts || retrievedProducts);
    if (unusual && isUnsupportedScentConcept(concept)) {
      return `I don't have a fragrance that meaningfully recreates that ${unusual} scent. I can explore spicy, savory, herbal, smoky, or gourmand directions if those aspects of it appeal to you.`;
    }
    if (unusual) {
      return `I couldn't find a meaningful match for a ${unusual}-scented perfume in this collection. If you want to name a material, atmosphere, or note, I can search in that direction.`;
    }
    return `I couldn't find a close fit for that combination. If you'd like, we can loosen one preference — budget, intensity, or fragrance style — and I can find something closer.`;
  }

  // GROUNDED RECOMMENDATIONS & REFINEMENT EXPLANATIONS
  if (results.length > 0) {
    const primary = results[0];
    const alts = results.slice(1);

    const isRefinement =
      stage1.request_type === 'refinement' ||
      stage1.is_refinement === true ||
      stage1.intent === 'PREFERENCE_UPDATE' ||
      stage1.intent === 'BUDGET_CHANGE' ||
      stage1.intent === 'REFINE_RECOMMENDATION' ||
      stage1.intent === 'SHOW_ALTERNATIVES';

    const fams = activeReq.families?.length > 0 ? activeReq.families.join('/') : '';
    const occ = activeReq.occasion ? activeReq.occasion.replace('-', ' ') : '';
    const dir = [fams, occ].filter(Boolean).join(' ');
    const budgetOnly = Boolean(activeReq.budget?.max) && !hasActiveScentDirection(activeReq);

    let intro = `Based on your request`;

    if (stage1.intent === 'SHOW_ALTERNATIVES') {
      intro = alternativesIntro(primary.product.name);
    } else if (budgetOnly) {
      intro = budgetOnlyIntro(results.length, activeReq.budget!.max!);
    } else if (isRefinement && stage1.remove_budget) {
      intro = `Understood — I've removed the budget constraint while keeping your ${dir || 'current'} preferences. My best match is ${primary.product.name}`;
    } else if (isRefinement && stage1.relative_price === 'cheaper') {
      intro = `Looking at more accessible options with the same scent profile. My best match is ${primary.product.name} at ₹${primary.product.price}`;
    } else if (isRefinement && dir && activeReq.budget?.max && (stage1.budget?.max || stage1.updates?.some((u) => u.field === 'budget.max') || message.toLowerCase().includes('500') || message.toLowerCase().includes('1000') || message.toLowerCase().includes('700') || message.toLowerCase().includes('budget') || message.toLowerCase().includes('have'))) {
      intro = `Got it — I'll keep the ${dir || 'current'} direction and bring the budget limit to ₹${activeReq.budget.max}. My best match is ${primary.product.name}`;
    } else if (isRefinement && (stage1.warmth === 'moderate-warm' || activeReq.warmth === 'moderate-warm')) {
      intro = `Adjusted — keeping a balanced, moderate warmth without being overly heavy for the ${occ || 'current'} direction. My best match is ${primary.product.name}`;
    } else if (isRefinement && (stage1.warmth === 'warmer' || activeReq.warmth === 'warmer')) {
      intro = `Adjusted — leaning into a warmer profile while keeping the ${occ || 'current'} direction. My best match is ${primary.product.name}`;
    } else if (isRefinement && (stage1.sillageMax === 'moderate' || activeReq.sillageMax === 'moderate')) {
      const intVal = activeReq.intensity ? `${activeReq.intensity} profile` : 'scent';
      intro = `Adjusted — focusing on a ${intVal} with controlled, moderate projection (not too loud). My best match is ${primary.product.name}`;
    } else if (isRefinement && (stage1.intensity || activeReq.intensity)) {
      const intVal = stage1.intensity || activeReq.intensity;
      intro = `Adjusted — focusing on a ${intVal} profile while keeping your ${occ || 'current'} direction. My best match is ${primary.product.name}`;
    } else if (isSimilarity && referenceName) {
      intro = `Since you like ${referenceName}, I recommend ${primary.product.name}`;
    } else {
      const comboIntro = creamyDirectionIntro(activeReq, primary.product.name, primary.product);
      if (comboIntro) {
        intro = comboIntro;
      } else {
        const criteria: string[] = [];
        if (activeReq.families?.length > 0) criteria.push(activeReq.families.join(' + '));
        if (activeReq.style && !criteria.some((c) => c.toLowerCase().includes(activeReq.style!.toLowerCase()))) {
          criteria.push(activeReq.style);
        }
        if (activeReq.preferredNotes?.some((n) => n.toLowerCase() === 'creamy') && !criteria.some((c) => /creamy/i.test(c))) {
          criteria.push('creamy');
        }
        if (activeReq.preferredNotes?.some((n) => /vanilla/i.test(n)) && !criteria.some((c) => /vanilla/i.test(c))) {
          criteria.push('vanillic');
        }
        if (activeReq.freshness && !activeReq.families?.some((f) => f.toLowerCase() === 'fresh')) {
          criteria.push('fresh');
        }
        if (activeReq.occasion) criteria.push(activeReq.occasion.replace('-', ' '));
        if (activeReq.season) criteria.push(activeReq.season);
        if (activeReq.budget?.max) criteria.push(`under ₹${activeReq.budget.max}`);
        if (activeReq.intensity) criteria.push(`${activeReq.intensity} intensity`);

        const excludedDesc = activeReq.excludedFamilies?.length > 0 ? `excluding ${activeReq.excludedFamilies.join('/')}` : '';

        if (criteria.length > 0) {
          intro = excludedDesc
            ? `Based on ${criteria.join(' + ')} (${excludedDesc}), I recommend ${primary.product.name}`
            : `Based on ${criteria.join(' + ')}, I recommend ${primary.product.name}`;
        } else if (excludedDesc) {
          intro = `Looking at options ${excludedDesc}, I recommend ${primary.product.name}`;
        } else {
          intro = `From our catalogue, I recommend ${primary.product.name}`;
        }
      }
    }

    const whyPrimary = `Why: its ${primary.product.fragranceFamily.join('/')} profile with ${primary.product.topNotes.slice(0, 2).join(', ')} opening and ${primary.product.baseNotes.slice(0, 2).join(', ')} base fits the direction at ₹${primary.product.price}.`;
    const comparative = options.comparativeContext;
    if (comparative?.type === 'stronger' && comparative.alreadyAtBound) {
      intro = `You're already at the strongest intensity available in this collection. ${primary.product.name} remains the most pronounced option`;
    } else if (comparative?.type === 'stronger' && comparative.improved) {
      const from = comparative.previousProductNames[0] || 'the previous recommendation';
      intro =
        alts.length > 0
          ? `If you want more intensity, these options step up from ${from}. ${primary.product.name} is the closest stronger match`
          : `If you want more intensity, this option steps up from ${from}. ${primary.product.name} is the closest stronger match`;
    } else if (comparative?.type === 'warmer' && (comparative.improved || results.length > 0)) {
      intro =
        isSimilarity
          ? `Since you like ${referenceName} but want something warmer, ${primary.product.name} is the closest match`
          : alts.length > 0
            ? `Here are warmer options that keep your current direction. ${primary.product.name} is the closest match`
            : `${primary.product.name} is the warmer option that keeps your current direction`;
    } else if (comparative?.type === 'louder') {
      intro =
        alts.length > 0
          ? `If you want more projection, these options step up. ${primary.product.name} is the closest match`
          : `If you want more projection, ${primary.product.name} steps up from the previous recommendation`;
    } else if (alts.length > 0 && results.length >= 2 && !intro.toLowerCase().includes('here are')) {
      const countWord = results.length === 2 ? 'two' : results.length === 3 ? 'three' : String(results.length);
      intro = `${intro}. I found ${countWord} options`;
    }

    let formatWhy = '';
    if (brand.slug === 'scentira') {
      const label = scentiraFormatLabel(primary.product);
      const exploration = currentState.activeRequest?.explorationIntent;
      const experience = currentState.activeRequest?.experienceLevel;
      if (isScentiraDecant(primary.product) && (experience === 'beginner' || exploration === 'sampling')) {
        formatWhy = ` ${label} is the safer listed way to try it first.`;
      } else if (primary.product.format === 'discovery-set') {
        formatWhy = ` This is a listed discovery set, so you can explore a few scents before committing.`;
      } else if (isScentiraDecant(primary.product)) {
        formatWhy = ` This is the listed ${label}.`;
      } else if (primary.product.format === 'full-size') {
        formatWhy =
          exploration === 'full-bottle-confidence'
            ? ` This is the full bottle listed for that fragrance.`
            : ` This is the full-size option listed in the catalogue.`;
      }
    } else if (brand.slug === 'thescentstories' && primary.product.format) {
      const format = primary.product.format;
      const exploration = currentState.activeRequest?.explorationIntent;
      const experience = currentState.activeRequest?.experienceLevel;
      if (format === 'sample' || format === 'vial') {
        formatWhy =
          experience === 'experienced'
            ? ` This is the official sample SKU listed for that direction.`
            : ` If you have not tried it before, this sample is the lower-commitment way to start.`;
      } else if (format === 'discovery-set') {
        formatWhy = ` This is a discovery set, so you can try several fragrances rather than committing to one bottle.`;
      } else if (format === 'pocket' || format === 'miniature') {
        formatWhy = ` This is a smaller ${formatLabel(format).toLowerCase()} — useful if you want something compact.`;
      } else if (format === 'full-size' || format === 'tester') {
        formatWhy =
          exploration === 'full-bottle-confidence'
            ? ` Since you already know the scent, this is the full-size option listed in the catalogue.`
            : ` This is the larger format listed for that fragrance.`;
      }
    }

    if (isSouqScentBrand(brand)) {
      const lines = results.slice(0, 4).map((result, index) => {
        const why = (result.explanation || '').replace(/^Why this matches:\s*/i, '') ||
          `${result.product.fragranceFamily.slice(0, 2).join(' / ')} profile at ${formatPrice(result.product.price)}.`;
        return `${index + 1}. ${result.product.name} — ${formatPrice(result.product.price)}\nWhy it matches:\n${why}`;
      });
      const followUp =
        stage1.is_broad_recommendation || stage1.is_surprise_me
          ? '\n\nIf you tell me the occasion, budget or scent style you prefer, I can narrow these down.'
          : '';
      return `${intro}.\n\n${lines.join('\n\n')}${followUp}`;
    }

    if (alts.length > 0) {
      const altNames = alts.map((a) => `${a.product.name} (₹${a.product.price})`).join(' and ');
      return `${intro}.\n\n${whyPrimary}${formatWhy}\n\nAlso included: ${altNames}.`;
    }

    return `${intro}.\n\n${whyPrimary}${formatWhy}`;
  }

  // 10. PURE PREFERENCE UPDATES WITHOUT IMMEDIATE PRODUCTS
  if (stage1.intent === 'PREFERENCE_UPDATE') {
    if (stage1.excluded_families.includes('sweet')) {
      return `Noted — sweet and sugary profiles are excluded. What kind of notes or occasions do you prefer instead (such as fresh, woody, or spicy)?`;
    }
    if (stage1.excluded_notes.includes('oud')) {
      return `Understood — oud is excluded. What vibe or occasion are you shopping for?`;
    }
    if (stage1.intensity === 'subtle') {
      return `Got it — focusing on subtle and moderate projection scents rather than heavy performers. What notes or occasions do you like?`;
    }
    if (stage1.reference_perfume) {
      return `I've noted that you wear ${stage1.reference_perfume}. Would you like me to recommend something similar, or explore a new direction?`;
    }
    return `I've updated your preferences. Tell me what kind of perfume you'd like to look at next.`;
  }

  // 11. BUDGET REMOVAL (Pure)
  if (stage1.intent === 'BUDGET_CHANGE' && stage1.remove_budget) {
    return `Budget limit removed. Tell me what scent direction or occasion you'd like to see!`;
  }

  return `Tell me what occasion, scent family, or budget you're looking for, and I'll find the best match from our catalogue.`;
}

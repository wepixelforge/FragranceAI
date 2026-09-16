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
  ComparativeContext,
  RecommendationPresentation,
} from './response-grounding';

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
    action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART';
    productId?: string;
    productName?: string;
    success: boolean;
    added?: string[];
    failed?: string[];
    partial?: boolean;
    needsClarification?: boolean;
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
 * Defensive sanitizer to ensure no internal reasoning, <think>, or <analysis> tags
 * can ever leak into visible customer-facing content.
 */
export function sanitizeUserFacingResponse(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText;

  // 1. Remove complete <think>...</think>, <thought>...</thought>, <analysis>...</analysis>, <reasoning>...</reasoning>
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  cleaned = cleaned.replace(/<system>[\s\S]*?<\/system>/gi, '');

  // 2. Remove unclosed opening tags at the start of response (e.g. truncated thinking)
  cleaned = cleaned.replace(/^[\s\S]*?<\/(think|thought|analysis|reasoning|system)>/i, '');

  // 3. Remove any orphaned opening or closing tags
  cleaned = cleaned.replace(/<\/?(think|thought|analysis|reasoning|system)>/gi, '');

  // 4. Remove accidental internal reasoning headers if any leaked without tags
  cleaned = cleaned.replace(/^(Here'?s\s+(a\s+)?thinking\s+process:?|Thinking\s+Process:?|Internal\s+Reasoning:?|Chain\s+of\s+Thought:?)[\s\S]*?\n\n/i, '');
  cleaned = cleaned.replace(/\/[a-z0-9-]+\/cart\b/gi, 'the cart');

  // 5. If output is wrapped in a JSON envelope string like `{"response": "..."}` or ````json ... ````
  cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed.response === 'string') {
        cleaned = parsed.response;
      } else if (parsed && typeof parsed.text === 'string') {
        cleaned = parsed.text;
      } else if (parsed && typeof parsed.message === 'string') {
        cleaned = parsed.message;
      }
    } catch {
      // If JSON parse fails, attempt regex extraction of response field
      const match = cleaned.match(/"(?:response|text|message)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match && match[1]) {
        try {
          cleaned = JSON.parse(`"${match[1]}"`);
        } catch {
          cleaned = match[1];
        }
      }
    }
  }

  // Final clean up of any residual think tags
  cleaned = cleaned.replace(/<\/?(think|thought|analysis|reasoning|system)>/gi, '').trim();

  return cleaned;
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

/**
 * STAGE 2: GROUNDED CONSULTANT RESPONSE GENERATION
 *
 * Explains strictly the products already selected and ranked by the deterministic recommendation engine.
 * Never independently selects products, never swaps order, and never hallucinates attributes.
 */
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
  // Fast path for simple conversational metadata and objections without recommendations
  if (
    stage1.intent === 'GREETING' ||
    stage1.intent === 'IDENTITY' ||
    stage1.intent === 'CAPABILITY' ||
    stage1.intent === 'RESET_CONSULTATION' ||
    stage1.intent === 'GENERAL_CONVERSATION' ||
    stage1.intent === 'BRAND_CONVERSATION' ||
    stage1.intent === 'CUSTOMER_OBJECTION' ||
    (stage1.intent === 'PREFERENCE_UPDATE' && results.length === 0)
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

  // 1. Try Groq Stage 2 Grounded Explanation
  const groqReply = await callGroqStage2(
    message,
    brand,
    stage1,
    retrievedProducts,
    results,
    currentState,
    history,
    options
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
        return groqReply.trim();
      }
    } else {
      return groqReply.trim();
    }
  }

  // 2. Deterministic Grounded Fallback
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
  options: ResponseGeneratorOptions
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
   - If RECOMMENDATION_COUNT is 1: singular language is correct. Discuss only that product.
   - If RECOMMENDATION_COUNT is 2 or more: you MUST name the primary/closest match (rank 1) AND also name the other canonical products as additional options. Never write as if only one fragrance is being recommended.
   - If RECOMMENDATION_COUNT > 0: NEVER say you could not find options, never say you don't have anything, and never contradict the canonical result.
   - Rank 1 is the primary/closest match. Do not claim a lower-ranked product is the closest match.
   - If STATUS is NO_ALTERNATIVES or no alternatives remain for SHOW_ALTERNATIVES:
     * Explain politely: "I don't have another option that fits all your current preferences. I can relax one of your requirements if you'd like."
     * Do NOT invent, name, or recommend any unvalidated products.
   - If CANONICAL RANKED PRODUCTS is empty (HARD_CONSTRAINT_FAILED / NO_VALID_MATCH):
      * NEVER recommend, name, or suggest unvalidated products.
      * If user combined fresh with strong intensity: explain "I don't currently have a fragrance that combines a fresh profile with strong intensity. I can either keep it fresh and choose the strongest available option, or show you my strongest fragrances."
      * If user combined strong intensity with controlled projection/not loud: explain "Nothing in this collection combines strong intensity with controlled projection. I can show you the closest moderate-intensity options or stronger options with more projection."
      * Otherwise, explain politely that no product in our catalogue satisfies all constraints (e.g. avoiding sweet fragrances, budget limit, or requested intensity), and suggest relaxing one constraint.

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
     * If several products were added, mention those actual names. If some could not be found, say so naturally.
     * If ask_clarification is true, ask which products they mean. Do not claim anything was added.
     * Direct the customer to the cart icon in the header (or View Cart). NEVER print a URL or route such as /tmperfumehouse/cart.
     * Mention prices only with ₹ / INR using supplied formatted values.
   - GREETING/IDENTITY/CAPABILITY: Respond politely without presenting any products.
   - CLARIFICATION:
      * Ask a thoughtful, friendly fragrance clarification question.
      * E.g. "When you say '[word]', what kind of feeling do you mean? Something creamy and soft, warm and comforting, or something else?"
      * Do NOT present any products. Keep it to 1 to 2 short sentences.
   - PRODUCT_INFO: Give a factual overview of the requested product. Do NOT call it "Best Match".
   - COMPARE_PRODUCTS: Provide a factual side-by-side comparison of the two products. Do NOT call either "Best Match".
   - SHOW_ALTERNATIVES: Present the fresh alternatives provided in CANONICAL RANKED PRODUCTS. If no alternatives exist (STATUS: NO_ALTERNATIVES), explain gracefully.
   - PARTIAL_MATCH:
      * Lead directly with the closest option (e.g. "The closest option is [Product].").
      * This is a nearest-neighbour match when the exact family/category is not in the catalogue. Say that honestly in one clause, then why this scent is the closest (woody/resinous, masculine, etc.).
      * NEVER start with a negative database statement like "I couldn't find a fragrance that matches both..." or "I don't have...".
      * Ground your explanation in the trade-off provided: explain what it keeps/satisfies and what differs (e.g. "It keeps the refreshing character but offers moderate intensity rather than strong.").
      * Never call it "Best Match". Never claim characteristics the product lacks.
   - HARD_CONSTRAINT_FAILED / NO_VALID_MATCH: State honestly and politely that no suitable option was found within those constraints, briefly explaining the limiting factor (e.g. budget ceiling or excluded notes). Never present invalid products. Avoid robotic "relax one of your preferences" phrases. Use this language ONLY when RECOMMENDATION_COUNT is 0.
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

COMPARATIVE CONTEXT:
${JSON.stringify(comparative || null, null, 2)}

ACTIVE CONSULTATION CONTEXT:
${JSON.stringify(currentState.activeRequest || currentState.currentConsultation || {})}

STATUS: "${options.status || (options.hardConstraintFailed ? 'HARD_CONSTRAINT_FAILED' : 'SUCCESS')}"
HARD CONSTRAINT FAILED: ${Boolean(options.hardConstraintFailed)}
USER INTENT: "${stage1.intent}"
STOREFRONT CURRENCY: ${JSON.stringify(options.actionContext?.currency || STOREFRONT_CURRENCY)}
LIVE CART CONTEXT (AUTHORITATIVE — IGNORE CART CONTENTS FROM PREVIOUS MESSAGES):
${JSON.stringify(options.actionContext?.cart || { isEmpty: true, itemCount: 0, items: [], subtotal: 0, subtotalFormatted: formatPrice(0), currency: STOREFRONT_CURRENCY }, null, 2)}
${options.actionContext ? `\nSTRUCTURED APPLICATION CONTEXT & POLICIES:\n${JSON.stringify(options.actionContext, null, 2)}\n` : ''}`;

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

  // 1. OUT OF SCOPE
  if (stage1.intent === 'OUT_OF_SCOPE') {
    return (
      stage1.out_of_scope_answer ||
      `I specialize exclusively in fragrance shopping and consultation for ${brand.name}. While I can't assist with unrelated topics, I'd be glad to help you find your next fragrance.`
    );
  }

  // 1b. CART ASSISTANCE
  if (stage1.intent === 'CART_ASSISTANCE') {
    const action = options.actionContext?.cart_action?.action;
    const added = options.actionContext?.cart_action?.added;
    const failed = options.actionContext?.cart_action?.failed;
    const prodName = options.actionContext?.cart_action?.productName || options.actionContext?.product?.name;
    const names = added && added.length > 0 ? added.join(', ') : prodName;
    if (options.actionContext?.response_policy?.ask_clarification) {
      return (
        options.actionContext.response_policy.clarification_question ||
        'Which fragrances would you like me to add? I can use the latest recommendations or a product name from this collection.'
      );
    }
    if (action === 'ADD_TO_CART') {
      if (!options.actionContext?.cart_action?.success && failed?.length && !added?.length) {
        return `I couldn’t find ${failed.join(', ')} in this collection, so nothing was added. You can browse the current brand’s fragrances or tell me another name.`;
      }
      if (names && failed?.length) {
        return `I’ve added ${names} to your cart. I couldn’t find ${failed.join(', ')} in this collection. You can review everything from the cart icon in the header.`;
      }
      return names
        ? `I have added ${names} to your cart. You can review your items anytime from the cart icon in the header.`
        : `I've added the fragrance to your cart. You can review your items anytime by opening the cart.`;
    }
    if (action === 'REMOVE_FROM_CART') {
      return names
        ? `I've removed ${names} from your cart.`
        : `I've updated your cart and removed the selected fragrance.`;
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

  // 4. CAPABILITY (TEST 3)
  if (stage1.intent === 'CAPABILITY') {
    return `I can help you with:
• Fragrance recommendations based on notes, family, or mood
• Finding alternatives or similar scents to perfumes you already wear
• Budget-based and occasion-based discovery (office, date night, weddings)
• Factual product notes and side-by-side comparisons
• Fine-tuning scents (making suggestions warmer, lighter, stronger, or cheaper)`;
  }

  // 5. RESET
  if (stage1.intent === 'RESET_CONSULTATION') {
    return `I've cleared your previous consultation preferences. What direction would you like to explore now?`;
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
    const question =
      stage1.clarification_question ||
      (stage1.ambiguous_term
        ? `When you say '${stage1.ambiguous_term}', what kind of feeling do you mean?`
        : "Could you tell me a little more about what kind of scent profile you have in mind?");
    const interpretation =
      stage1.suggested_interpretations && stage1.suggested_interpretations.length > 0
        ? stage1.suggested_interpretations[0]
        : (stage1.ambiguous_term === 'off'
          ? "Something unusual, darker, more experimental, or something else?"
          : stage1.ambiguous_term === 'melty'
          ? "Something creamy and soft, warm and comforting, or something else?"
          : "For example, are you leaning toward something fresh and crisp, warm and cozy, or rich and woody?");
    return `${question} ${interpretation}`;
  }

  // 5b. NO_ALTERNATIVES (Graceful exhaustion of alternatives)
  if (
    options.status === 'NO_ALTERNATIVES' ||
    (stage1.intent === 'SHOW_ALTERNATIVES' && results.length === 0)
  ) {
    return "I couldn't find another suitable option matching those exact preferences from our remaining catalogue.";
  }

  // 6. PARTIAL MATCH (Closest legitimate candidate with grounded trade-off — lead directly with closest option)
  if (
    options.status === 'PARTIAL_MATCH' ||
    (results.length === 1 && (results[0].matchTier === 'Closest Match' || results[0].explanation.includes('closest match')))
  ) {
    const closest = results[0];
    const tradeOff =
      closest.detailedReasons?.find((d) => d.category === 'Profile')?.text ||
      closest.explanation;
    if (results.length >= 2) {
      const others = results.slice(1).map((r) => r.product.name).join(' and ');
      return `The closest option is ${closest.product.name}. ${tradeOff} I've also included ${others}.`;
    }
    return `The closest option is ${closest.product.name}. ${tradeOff}`;
  }

  // PRODUCT INFO - No "Best Match" language; never treat as a recommendation set
  if (stage1.intent === 'PRODUCT_INFO' && retrievedProducts.length > 0) {
    const p = retrievedProducts[0];
    return `${p.name} is a ${p.size} ${p.fragranceFamily.join('/')} fragrance priced at ₹${p.price}. Key top notes: ${p.topNotes.slice(0, 3).join(', ')}, heart: ${p.heartNotes.slice(0, 2).join(', ')}, base: ${p.baseNotes.slice(0, 2).join(', ')}. Performance is ${p.intensity} intensity with ${p.longevity.replace('-', ' ')} longevity, well suited for ${p.occasion.slice(0, 2).map((o) => o.replace('-', ' ')).join(' and ')}.`;
  }

  // COMPARE PRODUCTS - No "Best Match" language!
  if (stage1.intent === 'COMPARE_PRODUCTS' && retrievedProducts.length >= 2) {
    const [p1, p2] = retrievedProducts;
    return `Here is a factual comparison between ${p1.name} and ${p2.name}:
• ${p1.name} (₹${p1.price}, ${p1.size}): ${p1.fragranceFamily.join('/')} profile with ${p1.topNotes.slice(0, 2).join(', ')} opening and ${p1.baseNotes.slice(0, 2).join(', ')} base. Sillage: ${p1.intensity}, longevity: ${p1.longevity.replace('-', ' ')}.
• ${p2.name} (₹${p2.price}, ${p2.size}): ${p2.fragranceFamily.join('/')} profile with ${p2.topNotes.slice(0, 2).join(', ')} opening and ${p2.baseNotes.slice(0, 2).join(', ')} base. Sillage: ${p2.intensity}, longevity: ${p2.longevity.replace('-', ' ')}.`;
  }

  // HARD CONSTRAINT FAILURE / NO_VALID_MATCH
  if (options.hardConstraintFailed || (results.length === 0 && stage1.needs_recommendations)) {
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

    if (failedList.length > 0) {
      return `I couldn't find a suitable option within those constraints (${failedList.join(' while ')}).`;
    }
    return `I couldn't find a suitable option within those constraints.`;
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

    let intro = `Based on your request`;

    if (isRefinement && stage1.remove_budget) {
      intro = `Understood — I've removed the budget constraint while keeping your ${dir || 'current'} preferences. My best match is ${primary.product.name}`;
    } else if (isRefinement && stage1.relative_price === 'cheaper') {
      intro = `Looking at more accessible options with the same scent profile. My best match is ${primary.product.name} at ₹${primary.product.price}`;
    } else if (isRefinement && activeReq.budget?.max && (stage1.budget?.max || stage1.updates?.some((u) => u.field === 'budget.max') || message.toLowerCase().includes('500') || message.toLowerCase().includes('1000') || message.toLowerCase().includes('700') || message.toLowerCase().includes('budget') || message.toLowerCase().includes('have'))) {
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
    } else if (isRefinement && stage1.intent === 'SHOW_ALTERNATIVES') {
      intro = `Here are fresh alternatives fitting your ${dir || 'current'} preferences. My top recommendation is ${primary.product.name}`;
    } else {
      const criteria: string[] = [];
      if (activeReq.families?.length > 0) criteria.push(activeReq.families.join(' + '));
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
        alts.length > 0
          ? `Here are warmer options that keep your current direction. ${primary.product.name} is the closest match`
          : `${primary.product.name} is the warmer option that keeps your current direction`;
    } else if (comparative?.type === 'louder') {
      intro =
        alts.length > 0
          ? `If you want more projection, these options step up. ${primary.product.name} is the closest match`
          : `If you want more projection, ${primary.product.name} steps up from the previous recommendation`;
    } else if (alts.length > 0 && presentation.recommendationCount >= 2 && !intro.toLowerCase().includes('here are')) {
      intro = `${intro}, and I've included ${presentation.recommendationCount} options`;
    }

    if (alts.length > 0) {
      const altNames = alts.map((a) => `${a.product.name} (₹${a.product.price})`).join(' and ');
      return `${intro}.\n\n${whyPrimary}\n\nAlso included: ${altNames}.`;
    }

    return `${intro}.\n\n${whyPrimary}`;
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

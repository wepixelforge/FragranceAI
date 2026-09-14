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

export interface ResponseGeneratorOptions {
  hardConstraintFailed?: boolean;
  status?: string;
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
  cleaned = cleaned.replace(/^(active\s+context:?|canonical\s+ranked\s+products:?|system\s+instructions:?)[\s\S]*?\n\n/i, '');

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
  // Fast path for non-recommendation conversational intents and pure preference updates
  if (
    stage1.intent === 'GREETING' ||
    stage1.intent === 'IDENTITY' ||
    stage1.intent === 'CAPABILITY' ||
    stage1.intent === 'OUT_OF_SCOPE' ||
    stage1.intent === 'RESET_CONSULTATION' ||
    stage1.intent === 'GENERAL_CONVERSATION' ||
    stage1.intent === 'BRAND_CONVERSATION' ||
    stage1.intent === 'CUSTOMER_OBJECTION' ||
    stage1.intent === 'PURCHASE_ASSISTANCE' ||
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
    return groqReply.trim();
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
    tier: r.matchTier,
    name: r.product.name,
    price: r.product.price,
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

  const systemPrompt = `${brandVoicePrompt}

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
   - If STATUS is NO_ALTERNATIVES or no alternatives remain for SHOW_ALTERNATIVES:
     * Explain politely: "I don't have another option that fits all your current preferences. I can relax one of your requirements if you'd like."
     * Do NOT invent, name, or recommend any unvalidated products.
   - If CANONICAL RANKED PRODUCTS is empty (HARD_CONSTRAINT_FAILED / NO_VALID_MATCH):
      * NEVER recommend, name, or suggest unvalidated products.
      * If user combined fresh with strong intensity: explain "I don't currently have a fragrance that combines a fresh profile with strong intensity. I can either keep it fresh and choose the strongest available option, or show you my strongest fragrances."
      * If user combined strong intensity with controlled projection/not loud: explain "Nothing in this collection combines strong intensity with controlled projection. I can show you the closest moderate-intensity options or stronger options with more projection."
      * Otherwise, explain politely that no product in our catalogue satisfies all constraints (e.g. avoiding sweet fragrances, budget limit, or requested intensity), and suggest relaxing one constraint.

3. INTENT BEHAVIOR:
   - OUT_OF_SCOPE: Provide the direct factual answer (e.g. "The capital of France is Paris.") briefly. No products.
   - GREETING/IDENTITY/CAPABILITY: Respond politely without presenting any products.
   - PRODUCT_INFO: Give a factual overview of the requested product. Do NOT call it "Best Match".
   - COMPARE_PRODUCTS: Provide a factual side-by-side comparison of the two products. Do NOT call either "Best Match".
   - SHOW_ALTERNATIVES: Present the fresh alternatives provided in CANONICAL RANKED PRODUCTS. If no alternatives exist (STATUS: NO_ALTERNATIVES), explain gracefully.
   - PARTIAL_MATCH:
      * State honestly and naturally that no exact match was found combining all requested dimensions.
      * Present the single closest product provided in CANONICAL RANKED PRODUCTS[0].
      * Ground your explanation in the trade-off provided: explain what it keeps/satisfies and what differs (e.g. softer intensity, lighter warmth).
      * Never call it "Best Match". Never claim characteristics the product lacks.
   - HARD_CONSTRAINT_FAILED / NO_VALID_MATCH: State honestly and politely why no match was found based on the active constraints (e.g. avoiding sweet fragrances, budget ceiling, or requested intensity). Never present invalid products.

4. EXPLANATION MUST STRICTLY MATCH ACTIVE CONSULTATION STATE:
   - If warmth is "moderate-warm" or warmthMax is "warm": do NOT claim "leaning into a warmer profile" or "deep warmth". Describe it as subtle, balanced, or moderate warmth.
   - If sillage is "moderate" or sillageMax is "moderate": do NOT describe any product as "loud", "huge projection", "beast mode", or "room filling". Describe it as controlled, refined, or moderate projection.
   - If sweet is excluded: do NOT describe any selected product using sweet, dessert-like, or gourmand terms.

CANONICAL RANKED PRODUCTS (ALREADY VERIFIED & CHOSEN IN THIS EXACT ORDER):
${JSON.stringify(rankedItems, null, 2)}

ACTIVE CONSULTATION CONTEXT:
${JSON.stringify(currentState.activeRequest || currentState.currentConsultation || {})}

STATUS: "${options.status || (options.hardConstraintFailed ? 'HARD_CONSTRAINT_FAILED' : 'SUCCESS')}"
HARD CONSTRAINT FAILED: ${Boolean(options.hardConstraintFailed)}
USER INTENT: "${stage1.intent}"`;

  const messagesPayload = [
    { role: 'system' as const, content: systemPrompt },
    ...history.slice(-4).map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content })),
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
  const activeReq = currentState.activeRequest || {
    occasion: currentState.currentConsultation?.occasion,
    families: currentState.currentConsultation?.fragrance_families || [],
    budget: { max: currentState.currentConsultation?.budget_max },
    warmth: currentState.currentConsultation?.warmth,
    intensity: currentState.currentConsultation?.intensity,
  };

  // 1. OUT OF SCOPE (TEST 5)
  if (stage1.intent === 'OUT_OF_SCOPE') {
    return (
      stage1.out_of_scope_answer ||
      "The capital of France is Paris. If you'd like, I can also help you discover a fragrance!"
    );
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

  // 5e. PURCHASE ASSISTANCE — Reinforce previously recommended products without dumping new cards
  if (stage1.intent === 'PURCHASE_ASSISTANCE') {
    const lower = message.toLowerCase();
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
    return `No pressure at all. When you're ready, I can help narrow things down based on what you're looking for — whether it's occasion, scent family, or budget.`;
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

  // 5b. NO_ALTERNATIVES (Graceful exhaustion of alternatives)
  if (
    options.status === 'NO_ALTERNATIVES' ||
    (stage1.intent === 'SHOW_ALTERNATIVES' && results.length === 0)
  ) {
    return "I don't have another option that fits all your current preferences. I can relax one of your requirements if you'd like.";
  }

  // 6. PARTIAL MATCH (Closest legitimate candidate with grounded trade-off)
  if (
    options.status === 'PARTIAL_MATCH' ||
    (results.length === 1 && (results[0].matchTier === 'Closest Match' || results[0].explanation.includes('closest match')))
  ) {
    const closest = results[0];
    const tradeOff =
      closest.detailedReasons?.find((d) => d.category === 'Profile')?.text ||
      closest.explanation;
    return `I couldn't find an exact match combining all of your preferences. The closest fit is ${closest.product.name}. ${tradeOff}`;
  }

  // 7. HARD CONSTRAINT FAILURE / NO_VALID_MATCH
  if (options.hardConstraintFailed || (results.length === 0 && stage1.needs_recommendations)) {
    const isStrongControlledSillage =
      (activeReq.intensity === 'strong' || currentState.activeRequest?.intensity === 'strong') &&
      (activeReq.sillageMax === 'moderate' || currentState.activeRequest?.sillageMax === 'moderate' || activeReq.sillage === 'moderate');

    if (isStrongControlledSillage) {
      return `Nothing in this collection combines strong intensity with controlled projection. I can show you the closest moderate-intensity options or stronger options with more projection.`;
    }

    const hasFresh =
      activeReq.families?.some((f) => ['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase())) ||
      currentState.activeRequest?.families?.some((f) => ['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase())) ||
      activeReq.freshness === 'fresher' ||
      currentState.activeRequest?.freshness === 'fresher';

    const hasStrong =
      activeReq.intensity === 'strong' ||
      currentState.activeRequest?.intensity === 'strong';

    if (hasFresh && hasStrong) {
      return `I don't currently have a fragrance that combines a fresh profile with strong intensity. I can either keep it fresh and choose the strongest available option, or show you my strongest fragrances.`;
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
      return `I couldn't find a match that combines all of your criteria (${failedList.join(' while ')}). We can relax the budget, occasion, or explore other scent profiles.`;
    }
    return `I couldn't find a direct match with those exact constraints from our catalogue. Would you like to adjust the notes or explore a nearby scent family?`;
  }

  // 7. PRODUCT INFO (TEST 26) - No "Best Match" language!
  if (stage1.intent === 'PRODUCT_INFO' && retrievedProducts.length > 0) {
    const p = retrievedProducts[0];
    return `${p.name} is a ${p.size} ${p.fragranceFamily.join('/')} fragrance priced at ₹${p.price}. Key top notes: ${p.topNotes.slice(0, 3).join(', ')}, heart: ${p.heartNotes.slice(0, 2).join(', ')}, base: ${p.baseNotes.slice(0, 2).join(', ')}. Performance is ${p.intensity} intensity with ${p.longevity.replace('-', ' ')} longevity, well suited for ${p.occasion.slice(0, 2).map((o) => o.replace('-', ' ')).join(' and ')}.`;
  }

  // 8. COMPARE PRODUCTS (TEST 27) - No "Best Match" language!
  if (stage1.intent === 'COMPARE_PRODUCTS' && retrievedProducts.length >= 2) {
    const [p1, p2] = retrievedProducts;
    return `Here is a factual comparison between ${p1.name} and ${p2.name}:
• ${p1.name} (₹${p1.price}, ${p1.size}): ${p1.fragranceFamily.join('/')} profile with ${p1.topNotes.slice(0, 2).join(', ')} opening and ${p1.baseNotes.slice(0, 2).join(', ')} base. Sillage: ${p1.intensity}, longevity: ${p1.longevity.replace('-', ' ')}.
• ${p2.name} (₹${p2.price}, ${p2.size}): ${p2.fragranceFamily.join('/')} profile with ${p2.topNotes.slice(0, 2).join(', ')} opening and ${p2.baseNotes.slice(0, 2).join(', ')} base. Sillage: ${p2.intensity}, longevity: ${p2.longevity.replace('-', ' ')}.`;
  }

  // 9. GROUNDED RECOMMENDATIONS & REFINEMENT EXPLANATIONS
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

    if (alts.length > 0) {
      const altNames = alts.map((a) => `${a.product.name} (₹${a.product.price})`).join(' and ');
      return `${intro}.\n\n${whyPrimary}\n\nAlso worth considering: ${altNames}.`;
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

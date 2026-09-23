import { BrandConfig } from '@/types/brand';
import { UserIntent } from '@/types/chat';

/**
 * Returns verified, authentic brand differentiator based on existing brand config.
 * Never invents claims, awards, customer counts, or performance records.
 */
export function getVerifiedBrandDifferentiator(brand?: BrandConfig): string {
  if (!brand) return 'helping you discover fragrances suited to your personal style';

  switch (brand.slug) {
    case 'worldofperfumers':
      return 'helping you explore inspired fragrances with accessible 10ml pocket trials before committing to a full bottle';
    case 'tmperfumehouse':
      return 'an extensive catalogue of 380+ bespoke extrait formulations crafted for lasting sillage';
    case 'almaham':
      return '100% pure, alcohol-free concentrated perfume oils and artisanal distillations';
    case 'arabianaroma':
      return 'artisanal oriental blends and concentrated roll-on attars crafted for intimate, long-lasting performance';
    default:
      if (brand.specialty) {
        return brand.specialty.toLowerCase();
      }
      return 'crafting distinctive fragrance formulations that stand on their own';
  }
}

/**
 * Splits raw text into complete, grammatically sound sentences.
 */
function splitIntoSentences(text: string): string[] {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^["']|["']$/g, '')
    .trim();

  if (!cleaned) return [];

  // Match sentence terminators followed by whitespace and a capital letter or quote
  const rawSentences = cleaned
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (rawSentences.length === 0 && cleaned.length > 0) {
    return [cleaned];
  }

  return rawSentences;
}

/**
 * Groups and balances sentences into 2–4 natural conversational thoughts.
 * Target: ~5–18 words per message.
 */
function balanceThoughts(sentences: string[], maxMessages = 4): string[] {
  if (sentences.length <= 1) {
    const single = sentences[0] || '';
    const words = single.split(/\s+/);
    // If a single sentence is long (>22 words) and contains a natural conjunction or dash, split it
    if (words.length > 22) {
      const match = single.match(/^(.+?[,;—]\s*(?:and|but|while|so)?)\s+([A-Z0-9].+)$/i);
      if (match && match[1] && match[2]) {
        return [match[1].trim(), match[2].trim()];
      }
    }
    return [single];
  }

  // If we already have 2-4 balanced sentences, return them directly
  if (sentences.length >= 2 && sentences.length <= maxMessages) {
    return sentences;
  }

  // If we have more than maxMessages, combine shorter adjacent sentences
  const result: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const wordCount = (currentChunk + ' ' + sentence).trim().split(/\s+/).length;
    if (!currentChunk) {
      currentChunk = sentence;
    } else if (result.length + 1 >= maxMessages || wordCount <= 16) {
      currentChunk = `${currentChunk} ${sentence}`;
    } else {
      result.push(currentChunk);
      currentChunk = sentence;
    }
  }

  if (currentChunk) {
    if (result.length >= maxMessages && result.length > 0) {
      result[result.length - 1] = `${result[result.length - 1]} ${currentChunk}`;
    } else {
      result.push(currentChunk);
    }
  }

  return result.slice(0, maxMessages);
}

/**
 * Transforms an assistant reply into a small sequence of 2-4 conversational messages.
 * Respects intent-specific conversational rhythms:
 * - GREETING: 2 short welcoming thoughts
 * - RESET: 2 crisp reset thoughts
 * - NO_MATCH: 2 concise constraint guidance thoughts
 * - CUSTOMER_OBJECTION (no pref): 3-4 respectful, differentiated conversational steps
 * - CUSTOMER_OBJECTION (with pref): 2-3 acknowledgement + preference validation thoughts
 * - RECOMMENDATION: 2-3 contextual priming thoughts before flacons appear
 */
export function normalizeAssistantMessages(
  reply: string,
  brand?: BrandConfig,
  intent?: UserIntent,
  context?: {
    resultsCount?: number;
    hasPreference?: boolean;
    referencePerfume?: string | null;
    isPartialMatch?: boolean;
    tradeOff?: string;
    productName?: string;
    needsClarification?: boolean;
    limitingFactor?: string;
  }
): string[] {
  const sanitized = reply
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();

  if (intent === 'CAPABILITY') {
    const sentences = splitIntoSentences(sanitized);
    return sentences.length > 0 ? sentences.slice(0, 3) : [sanitized];
  }

  // 1. GREETING Archetype: 2 concise thoughts
  if (intent === 'GREETING' || intent === 'greeting') {
    const brandName = brand ? brand.name : 'our atelier';
    return [
      `Welcome to ${brandName}.`,
      "What kind of fragrance presence are you looking for today?",
    ];
  }

  // 1b. OUT_OF_SCOPE Archetype: 2 crisp polite refusal thoughts
  if (intent === 'OUT_OF_SCOPE') {
    return [
      "I'm here specifically to help with perfumes and fragrance discovery.",
      "I can't help with that topic, but I can help you find a scent if you'd like.",
    ];
  }

  if (intent === 'CART_ASSISTANCE') {
    return [sanitized];
  }

  // 2. RESET Archetype: 2 crisp thoughts
  if (intent === 'RESET_CONSULTATION') {
    return [
      "Absolutely — we're starting fresh.",
      "What kind of fragrance are you looking for?",
    ];
  }

  // 2b. CLARIFICATION Archetype: 1-2 thoughtful consultant messages
  if (intent === 'CLARIFICATION' || context?.needsClarification) {
    const sentences = splitIntoSentences(sanitized);
    if (sentences.length >= 1 && sentences.length <= 2) {
      return sentences;
    }
    if (sentences.length > 2) {
      return balanceThoughts(sentences, 2);
    }
    return [sanitized];
  }

  // 3. NO_MATCH Archetype: 2 clear thoughts
  if (context?.resultsCount === 0 && (intent === 'RECOMMENDATION' || intent === 'REFINE_RECOMMENDATION')) {
    const sentences = splitIntoSentences(sanitized);
    if (sentences.length >= 2) {
      return balanceThoughts(sentences, 2);
    }
    return [
      "I couldn't find a suitable option within those constraints.",
      context?.limitingFactor ? `The ${context.limitingFactor} is the limiting factor here.` : "Adjusting the notes or expanding the budget will reveal several close alternatives.",
    ];
  }

  // 3b. PARTIAL_MATCH Archetype: 2 natural thoughts (Lead directly with closest candidate, grounded trade-off)
  if (context?.isPartialMatch) {
    const rawSentences = splitIntoSentences(sanitized);
    // Strip any negative database-style statements ("I couldn't find...", "I don't have...", "We don't currently have...")
    const cleanSentences = rawSentences.filter(
      (s) => !/^(i\s+(couldn'?t|cannot|can't)\s+find|i\s+don'?t\s+have|we\s+don'?t\s+(currently\s+)?have|there\s+(is|are)\s+no\s+(direct|exact))/i.test(s.trim())
    );

    if (cleanSentences.length >= 2 && cleanSentences.length <= 3) {
      return cleanSentences;
    }
    const closestName = context?.productName;
    const thought1 = cleanSentences[0] && /closest/i.test(cleanSentences[0])
      ? cleanSentences[0]
      : (closestName ? `The closest option is ${closestName}.` : "The closest option is featured below.");
    const thought2 = context?.tradeOff || cleanSentences[1] || "It keeps the character you're after with a slightly different intensity profile.";
    return [thought1, thought2];
  }

  // 4. CUSTOMER_OBJECTION Archetype
  if (intent === 'CUSTOMER_OBJECTION') {
    // If the customer provided a preference in the objection
    if (context?.hasPreference && (context?.resultsCount ?? 0) > 0) {
      return [
        "That's fair — fragrance is personal.",
        "Since you shared what you like, I can certainly work with that.",
        "Here are a couple of creations I'd start with:",
      ];
    }

    // Pure objection without preference: acknowledge, state real differentiator, ask what they like
    const differentiator = getVerifiedBrandDifferentiator(brand);
    return [
      "That's fair — fragrance is personal.",
      "Another house may simply align with your current preferences.",
      `Our strength is ${differentiator}.`,
      "If you're open to exploring, tell me what you enjoy most about their scents.",
    ];
  }

  // 5. GENERAL CONVERSATION Archetype
  if (intent === 'GENERAL_CONVERSATION') {
    const lower = sanitized.toLowerCase();
    if (lower.includes('welcome') || lower.includes('anytime')) {
      return [
        "You're welcome.",
        "Let me know whenever you'd like to explore more creations.",
      ];
    }
    if (lower.includes('goodbye') || lower.includes('take care') || lower.includes('bye')) {
      return [
        "Take care.",
        "Come back anytime you're in the mood to discover something new.",
      ];
    }
  }

  // 6. DEFAULT / RECOMMENDATION / PRODUCT INFO:
  // Parse reply into natural thought chunks, ensuring 1–4 messages (target 2–3)
  const paragraphs = sanitized
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let allSentences: string[] = [];
  for (const para of paragraphs) {
    const sentences = splitIntoSentences(para);
    allSentences.push(...sentences);
  }

  if (allSentences.length === 0) {
    return [sanitized || 'How may I assist your fragrance discovery?'];
  }

  // Cap at 4 messages max
  const balanced = balanceThoughts(allSentences, 4);

  return balanced.length > 0 ? balanced : [sanitized];
}

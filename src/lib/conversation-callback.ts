import { ChatMessage, ConversationState, Stage1IntentOutput } from '@/types/chat';
import { Product } from '@/types/product';
import { extractCanonicalFamilies, normalizeFragranceLanguage } from './fragrance-vocabulary';

export type ConversationCallbackKind =
  | 'unusual_repeat'
  | 'explicit_return'
  | 'family_return'
  | 'reference_return'
  | 'product_return';

export interface ConversationCallback {
  kind: ConversationCallbackKind;
  topicLabel: string;
  text: string;
  require: boolean;
}

export interface DetectConversationCallbackArgs {
  message: string;
  history: ChatMessage[];
  state: ConversationState;
  stage1: Stage1IntentOutput;
  status?: string;
  resultsCount?: number;
  brandSlug: string;
  catalogueProducts?: Product[];
}

const SKIP_INTENTS = new Set([
  'GREETING',
  'IDENTITY',
  'CAPABILITY',
  'RESET_CONSULTATION',
  'CART_ASSISTANCE',
  'OUT_OF_SCOPE',
  'PURCHASE_ASSISTANCE',
  'GENERAL_CONVERSATION',
  'BRAND_CONVERSATION',
  'CUSTOMER_OBJECTION',
  'COMPARE_PRODUCTS',
  'PRODUCT_COMPARISON',
]);

const FAMILY_TOKENS = [
  'fresh',
  'woody',
  'floral',
  'oriental',
  'spicy',
  'citrus',
  'gourmand',
  'aquatic',
  'oud',
  'amber',
  'musky',
  'musk',
  'sweet',
  'aromatic',
  'green',
  'leather',
  'smoky',
  'powdery',
  'vanilla',
  'fruity',
  'frooty',
  'fruitier',
] as const;

const STOPWORDS = new Set([
  'i',
  'want',
  'wanted',
  'wanna',
  'a',
  'an',
  'the',
  'something',
  'some',
  'like',
  'perfume',
  'perfumes',
  'fragrance',
  'fragrances',
  'scent',
  'scents',
  'scented',
  'smells',
  'smell',
  'that',
  'this',
  'these',
  'those',
  'again',
  'back',
  'to',
  'go',
  'going',
  'actually',
  'please',
  'me',
  'for',
  'my',
  'and',
  'or',
  'of',
  'it',
  'is',
  'are',
  'was',
  'be',
  'can',
  'could',
  'would',
  'should',
  'just',
  'still',
  'same',
  'before',
  'one',
  'you',
  'mentioned',
  'show',
  'find',
  'looking',
  'look',
  'need',
  'get',
  'give',
  'make',
  'made',
  'more',
  'less',
  'very',
  'really',
  'direction',
  'profile',
  'style',
  'idea',
  'inspired',
  'similar',
  'close',
  'match',
  'exact',
  'collection',
  'with',
  'from',
  'into',
  'about',
  'tell',
  'which',
  'sweeter',
  'fresher',
  'warmer',
  'cooler',
]);

const RETURN_CUE =
  /\b(again|back to|go back|going back|same as before|like (?:the|that) one you mentioned|still (?:want|looking|chasing|on)|return to|revisit|let'?s (?:go )?back)\b/i;

const CALLBACK_OPENER =
  /^(back to|still (?:chasing|exploring|looking)|going back|we(?:'|’)re back|returning to|looking at|that .{0,48} (?:is still|still on))/i;

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function stripComparativeNoise(text: string): string {
  return text
    .toLowerCase()
    .replace(/\bfresher\b/g, ' ')
    .replace(/\bsweeter\b/g, ' ')
    .replace(/\bwarmer\b/g, ' ')
    .replace(/\bcooler\b/g, ' ');
}

export function extractFamiliesFromText(text: string): string[] {
  const haystack = normalizeFragranceLanguage(stripComparativeNoise(text));
  const fromTokens = FAMILY_TOKENS.filter((family) => new RegExp(`\\b${family}\\b`, 'i').test(haystack))
    .map((family) => (family === 'frooty' || family === 'fruitier' ? 'fruity' : family));
  return Array.from(new Set([...fromTokens, ...extractCanonicalFamilies(haystack)]));
}

function significantTokens(text: string): string[] {
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function conceptsOverlap(a: string, b: string): boolean {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const leftTokens = new Set(significantTokens(left));
  const rightTokens = significantTokens(right);
  return rightTokens.some((token) => leftTokens.has(token));
}

function topicMentioned(text: string, topic: string): boolean {
  const haystack = normalizeText(text);
  return significantTokens(topic).some((token) => haystack.includes(token)) || haystack.includes(normalizeText(topic));
}

function priorUserMessages(history: ChatMessage[]): string[] {
  return history.filter((turn) => turn.role === 'user').map((turn) => turn.content);
}

function priorAssistantMessages(history: ChatMessage[]): string[] {
  return history.filter((turn) => turn.role === 'assistant').map((turn) => turn.content);
}

function inBrandNames(args: {
  state: ConversationState;
  brandSlug: string;
  catalogueProducts?: Product[];
}): string[] {
  const fromState = [
    ...(args.state.lastDiscussedProductSet || []),
    ...(args.state.lastCanonicalProductSet || []),
  ]
    .filter((ref) => ref.brandSlug === args.brandSlug)
    .map((ref) => ref.name);

  const fromCatalogue = (args.catalogueProducts || [])
    .filter((product) => product.brandSlug === args.brandSlug)
    .map((product) => product.name);

  return [...new Set([...fromState, ...fromCatalogue])].sort((a, b) => b.length - a.length);
}

function mentionedProducts(message: string, names: string[]): string[] {
  const lower = message.toLowerCase();
  return names.filter((name) => name && lower.includes(name.toLowerCase()));
}

function storedReference(state: ConversationState, stage1: Stage1IntentOutput): string | null {
  return (
    stage1.reference_perfume ||
    state.currentConsultation?.active_reference_perfume ||
    state.backgroundContext?.referencePerfume ||
    state.preferences?.reference_fragrances?.[0] ||
    null
  );
}

function extractQuotedReference(message: string): string | null {
  const similar = message.match(
    /\b(?:like|similar to)\s+([A-Z][A-Za-z0-9'’.-]+(?:\s+[A-Z][A-Za-z0-9'’.-]+){0,3})/
  );
  if (similar?.[1]) return similar[1].trim();

  const direction = message.match(
    /\b(?:back to|go back to|going back to)\s+(?:the\s+)?([A-Za-z][A-Za-z0-9'’.-]*(?:\s+[A-Za-z][A-Za-z0-9'’.-]*){0,3}?)(?:\s+(?:direction|profile|style|idea))?\s*[.!?]?$/i
  );
  if (direction?.[1] && !FAMILY_TOKENS.includes(normalizeText(direction[1]) as (typeof FAMILY_TOKENS)[number])) {
    return direction[1].trim();
  }
  return null;
}

export function extractUnusualConcept(message: string, knownNames: string[] = []): string | null {
  const lower = message.toLowerCase();
  if (/\blike (?:the|that) one you mentioned\b/.test(lower)) return null;

  const match = message.match(
    /\b(?:smells?\s+like|scented\s+like|scent\s+of|perfume\s+that\s+smells?\s+like|fragrance\s+that\s+smells?\s+like|something\s+(?:that\s+)?(?:smells?\s+like|like)|like)\s+(?:a\s+|an\s+|the\s+)?([^,.!?]+)/i
  );
  if (!match?.[1]) return null;

  const cleaned = normalizeText(
    match[1].replace(/\b(again|please|perfume|fragrance|scent|this time|for me|direction|profile|style)\b/gi, ' ')
  );
  const words = cleaned.split(' ').filter((word) => word.length > 1 && !STOPWORDS.has(word));
  if (words.length === 0) return null;

  const concept = words.slice(0, 4).join(' ');
  if (extractFamiliesFromText(concept).length > 0 && words.length <= 2) return null;
  if (mentionedProducts(concept, knownNames).length > 0) return null;
  if (/^[A-Z]/.test(match[1].trim()) && match[1].trim().split(/\s+/).length >= 2) return null;
  return concept;
}

function extractPriorUnusualConcepts(history: ChatMessage[], knownNames: string[]): string[] {
  return priorUserMessages(history)
    .map((turn) => extractUnusualConcept(turn, knownNames))
    .filter((concept): concept is string => Boolean(concept));
}

function extractPriorFamilies(history: ChatMessage[], state: ConversationState): string[] {
  const fromHistory = priorUserMessages(history).flatMap((turn) => extractFamiliesFromText(turn));
  const fromState = [
    ...(state.activeRequest?.families || []),
    ...(state.currentConsultation?.fragrance_families || []),
  ].map((family) => normalizeText(family));
  return [...new Set([...fromHistory, ...fromState])];
}

function extractPriorReferences(history: ChatMessage[], state: ConversationState, stage1: Stage1IntentOutput): string[] {
  const stored = storedReference(state, stage1);
  const fromHistory = priorUserMessages(history)
    .map((turn) => extractQuotedReference(turn))
    .filter((value): value is string => Boolean(value));
  return [...new Set([stored, ...fromHistory].filter((value): value is string => Boolean(value)))];
}

function hasInterveningDetour(history: ChatMessage[], topic: string): boolean {
  const users = priorUserMessages(history);
  if (users.length < 2) return false;

  const topicTurns = users
    .map((turn, index) => ({ turn, index }))
    .filter(({ turn }) => topicMentioned(turn, topic) || extractFamiliesFromText(turn).includes(normalizeText(topic)));
  if (topicTurns.length === 0) return false;

  const firstTopicIndex = topicTurns[0].index;
  const after = users.slice(firstTopicIndex + 1);
  return after.some((turn) => {
    if (topicMentioned(turn, topic)) return false;
    const otherFamily = extractFamiliesFromText(turn).some((family) => family !== normalizeText(topic));
    const pivot = /\b(warmer|cooler|sweeter|fresher|stronger|lighter|louder|softer|make it|more woody|more floral|something else)\b/i.test(
      turn
    );
    return otherFamily || pivot;
  });
}

export function isConstraintOnlyRefinement(message: string, stage1: Stage1IntentOutput): boolean {
  if (RETURN_CUE.test(message)) return false;

  const intent = String(stage1.intent);
  if (intent === 'BUDGET_CHANGE') return true;

  const lower = message.toLowerCase();
  const hasFamily = extractFamiliesFromText(message).length > 0;
  const hasUnusual = Boolean(extractUnusualConcept(message));
  const hasReference = Boolean(stage1.reference_perfume);
  const hasProduct = (stage1.target_product_names?.length || 0) > 0 || Boolean(stage1.product_reference);
  if (hasFamily || hasUnusual || hasReference || hasProduct) return false;

  const budgetCue =
    /\b(under|below|less than|upto|up to|budget|₹|rs\.?|rupees?|cheaper|affordable|\d{3,6})\b/i.test(lower);
  const comparativeCue =
    /\b(warmer|cooler|sweeter|fresher|stronger|lighter|louder|softer|more projection|less sweet|make it)\b/i.test(
      lower
    );
  const similarContinue = /\b(similar|something like that|in that direction)\b/i.test(lower);

  if (intent === 'SIMILAR_TO_REFERENCE' && !RETURN_CUE.test(message)) return true;
  if (intent === 'REFINE_RECOMMENDATION' || intent === 'PREFERENCE_UPDATE' || stage1.is_refinement) {
    return budgetCue || comparativeCue || similarContinue;
  }
  return budgetCue || comparativeCue;
}

function pickUnused(variants: string[], history: ChatMessage[]): string {
  const used = priorAssistantMessages(history).map((text) => text.slice(0, 80).toLowerCase());
  const unused = variants.find((variant) => !used.some((text) => text.includes(variant.slice(0, 18).toLowerCase())));
  const chosen = unused || variants[priorAssistantMessages(history).length % variants.length];
  return wordCount(chosen) >= 5 ? chosen : chosen;
}

function buildOpener(kind: ConversationCallbackKind, topicLabel: string, history: ChatMessage[]): string {
  const topic = topicLabel.trim();
  if (kind === 'unusual_repeat') {
    return pickUnused(
      [
        `Back to the ${topic} idea?`,
        `Still chasing that ${topic} scent?`,
        `We're back to ${topic} again.`,
        `That ${topic} direction is still on your mind?`,
      ],
      history
    );
  }
  if (kind === 'reference_return') {
    return pickUnused(
      [
        `Going back to the ${topic} profile?`,
        `Back to that ${topic} direction?`,
        `Still exploring the ${topic} profile?`,
      ],
      history
    );
  }
  if (kind === 'product_return') {
    return pickUnused(
      [`Looking at ${topic} again.`, `Returning to ${topic} now.`, `Back to ${topic} from earlier.`],
      history
    );
  }
  return pickUnused(
    [
      `Back to something ${topic}?`,
      `Still exploring that ${topic} direction?`,
      `Going back to something ${topic}?`,
      `You're still looking for that ${topic} character.`,
    ],
    history
  );
}

function displayReferenceLabel(reference: string): string {
  const cleaned = reference.replace(/\s+(direction|profile|style)$/i, '').trim();
  return /style/i.test(cleaned) ? cleaned : `${cleaned}-style`;
}

export function detectConversationCallback(args: DetectConversationCallbackArgs): ConversationCallback | null {
  const { message, history, state, stage1, brandSlug, catalogueProducts } = args;
  if (!message.trim() || history.length === 0) return null;
  if (SKIP_INTENTS.has(String(stage1.intent))) return null;
  if (isConstraintOnlyRefinement(message, stage1)) return null;
  if (priorUserMessages(history).length === 0) return null;

  const knownNames = inBrandNames({ state, brandSlug, catalogueProducts });
  const currentUnusual = extractUnusualConcept(message, knownNames);
  const priorUnusual = extractPriorUnusualConcepts(history, knownNames);
  const messageTokens = significantTokens(message);
  const repeatedUnusual = currentUnusual
    ? priorUnusual.find((concept) => conceptsOverlap(concept, currentUnusual))
    : priorUnusual.find((concept) =>
        significantTokens(concept).some((token) => messageTokens.includes(token) || message.toLowerCase().includes(token))
      );

  const hasReturnCue = RETURN_CUE.test(message);
  const currentFamilies = [
    ...extractFamiliesFromText(message),
    ...(stage1.fragrance_families || []).map((family) => normalizeText(family)),
  ];
  const priorFamilies = extractPriorFamilies(history, state);
  const returningFamily = currentFamilies.find((family) => priorFamilies.includes(family));

  const priorReferences = extractPriorReferences(history, state, stage1);
  const currentReference = stage1.reference_perfume || extractQuotedReference(message);
  const returningReference = priorReferences.find((reference) =>
    currentReference
      ? conceptsOverlap(reference, currentReference)
      : topicMentioned(message, reference)
  );

  const currentProducts = [
    ...mentionedProducts(message, knownNames),
    ...(stage1.target_product_names || []),
  ].filter(Boolean);
  const priorProductNames = mentionedProducts(priorUserMessages(history).join(' '), knownNames);
  const returningProduct = currentProducts.find((name) =>
    priorProductNames.some((prior) => conceptsOverlap(prior, name))
  );

  if (repeatedUnusual) {
    const topicLabel = currentUnusual || repeatedUnusual;
    return {
      kind: 'unusual_repeat',
      topicLabel,
      text: buildOpener('unusual_repeat', topicLabel, history),
      require: true,
    };
  }

  if (returningReference && (hasReturnCue || topicMentioned(message, returningReference))) {
    if (!hasReturnCue && String(stage1.intent) === 'SIMILAR_TO_REFERENCE') return null;
    if (!hasReturnCue && !topicMentioned(message, returningReference)) return null;
    if (hasReturnCue || (topicMentioned(message, returningReference) && hasInterveningDetour(history, returningReference))) {
      const topicLabel = displayReferenceLabel(returningReference);
      return {
        kind: 'reference_return',
        topicLabel,
        text: buildOpener('reference_return', topicLabel, history),
        require: true,
      };
    }
  }

  if (returningProduct && hasReturnCue && String(stage1.intent) !== 'COMPARE_PRODUCTS') {
    return {
      kind: 'product_return',
      topicLabel: returningProduct,
      text: buildOpener('product_return', returningProduct, history),
      require: true,
    };
  }

  if (returningFamily) {
    const detour = hasInterveningDetour(history, returningFamily);
    if (hasReturnCue || detour) {
      return {
        kind: detour || hasReturnCue ? 'family_return' : 'explicit_return',
        topicLabel: returningFamily,
        text: buildOpener('family_return', returningFamily, history),
        require: true,
      };
    }
  }

  if (hasReturnCue) {
    const lastUser = priorUserMessages(history).slice(-1)[0];
    const fallbackTopic =
      extractUnusualConcept(lastUser || '', knownNames) ||
      extractFamiliesFromText(lastUser || '')[0] ||
      extractQuotedReference(lastUser || '') ||
      mentionedProducts(lastUser || '', knownNames)[0];
    if (fallbackTopic) {
      const kind: ConversationCallbackKind = extractUnusualConcept(lastUser || '', knownNames)
        ? 'unusual_repeat'
        : extractFamiliesFromText(lastUser || '')[0]
          ? 'family_return'
          : mentionedProducts(lastUser || '', knownNames)[0]
            ? 'product_return'
            : extractQuotedReference(lastUser || '')
              ? 'reference_return'
              : 'explicit_return';
      const label = kind === 'reference_return'
        ? displayReferenceLabel(fallbackTopic)
        : fallbackTopic;
      return {
        kind,
        topicLabel: label,
        text: buildOpener(kind, label, history),
        require: true,
      };
    }
  }

  return null;
}

export function hasNaturalCallback(reply: string, topicLabel: string): boolean {
  const trimmed = reply.trim();
  if (!CALLBACK_OPENER.test(trimmed)) return false;
  return topicMentioned(trimmed.slice(0, 140), topicLabel);
}

export function callbackPromptSection(callback: ConversationCallback | null): string {
  if (!callback) return '';
  return `
CONVERSATIONAL CALLBACK (CURRENT SESSION ONLY — DO NOT CHANGE THE CANONICAL RESULT):
A short callback is appropriate because the customer is revisiting "${callback.topicLabel}" (${callback.kind}).
Open with one natural 5–15 word acknowledgement, then continue with the useful answer.
Do not announce that you have memory. Do not invent product facts or notes.
Do not recommend products when RECOMMENDATION_COUNT is 0.
Do not start a new consultation. Do not mention products from another storefront.
Vary the opener if a previous assistant reply already used a similar callback.
Suggested opener (you may paraphrase, keep the same meaning): "${callback.text}"
`;
}

export function applyConversationCallback(
  reply: string,
  callback: ConversationCallback | null,
  ctx: { resultsCount?: number; status?: string } = {}
): string {
  if (!callback) return reply.trim();

  let body = reply.trim();
  if (!body) return callback.text;

  const noMatch =
    ctx.resultsCount === 0 || /NO_VALID_MATCH|HARD_CONSTRAINT|CLARIFY/.test(ctx.status || '');

  if (noMatch && callback.kind === 'unusual_repeat') {
    body = `I still don't have an exact ${callback.topicLabel}-scented match, but we can explore spicy, herbal, savory, or warm gourmand directions.`;
  }

  if (hasNaturalCallback(body, callback.topicLabel)) {
    return body;
  }

  if (!callback.require) return body;
  return `${callback.text} ${body}`.trim();
}

export function shouldSkipConversationCallback(intent: string): boolean {
  return SKIP_INTENTS.has(intent);
}

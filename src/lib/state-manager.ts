import {
  ConversationState,
  ConversationPreferences,
  ActiveConsultation,
  ActiveRequest,
  BackgroundContext,
  BackgroundPreferences,
  Stage1IntentOutput,
  UserIntent,
  CanonicalIntent,
  CanonicalProductRef,
} from '@/types/chat';
import {
  StructuredPreferences,
  FragranceFamily,
  Occasion,
  Gender,
  Longevity,
  Season,
} from '@/types/product';
import { isReferenceDropRequest, isComparativePreferenceRefinement } from './query-parser';
import { parseSamplingContext } from './sampling-format';
import { isFreshConsultationQuery } from './fragrance-vocabulary';
import { detectResetIntent } from './intent-classifier';

export function normalizeOccasion(raw?: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim().replace(/[\s_]+/g, '-');
  if (lower === 'date' || lower === 'datenight' || lower === 'romantic') return 'date-night';
  if (lower === 'work' || lower === 'meeting' || lower === 'meetings' || lower === 'official' || lower === 'official-use' || lower === 'professional') return 'office';
  if (lower === 'everyday') return 'daily';
  return lower;
}

export function hasActiveConsultation(state?: ConversationState): boolean {
  if (!state) return false;
  if (state.activeRequest) {
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
  if (!state.currentConsultation) return false;
  const c = state.currentConsultation;
  return Boolean(
    c.occasion ||
    c.season ||
    (c.fragrance_families && c.fragrance_families.length > 0) ||
    (c.preferred_notes && c.preferred_notes.length > 0) ||
    c.budget_max !== null ||
    c.intensity
  );
}

export function createInitialActiveRequest(): ActiveRequest {
  return {
    gender: null,
    occasion: null,
    season: null,
    families: [],
    preferredNotes: [],
    excludedNotes: [],
    excludedFamilies: [],
    budget: { min: null, max: null },
    intensity: null,
    sillage: null,
    sillageMax: null,
    freshness: null,
    warmth: null,
    warmthMax: null,
    sweetness: null,
    longevity: null,
    style: null,
    relativePrice: null,
    isSimilarityRequest: false,
    formatPreference: null,
    explorationIntent: null,
    experienceLevel: null,
    travelIntent: false,
    giftingIntent: false,
    scentiraDecantOnly: false,
    requestedSizeMl: null,
  };
}

export function createInitialBackgroundContext(): BackgroundContext {
  return {
    referencePerfume: null,
    usualFragrances: [],
    persistentExclusions: {
      notes: [],
      families: [],
      intensity_cap: null,
    },
  };
}

export function createInitialActiveConsultation(): ActiveConsultation {
  return {
    occasion: null,
    season: null,
    gender: null,
    fragrance_families: [],
    preferred_notes: [],
    intensity: null,
    sillage: null,
    longevity: null,
    budget_max: null,
    budget_min: null,
    warmth: null,
    freshness: null,
    sweetness: null,
    active_reference_perfume: null,
  };
}

export function createInitialBackgroundPreferences(): BackgroundPreferences {
  return {
    usual_fragrances: [],
    persistent_exclusions: {
      notes: [],
      families: [],
      intensity_cap: null,
    },
  };
}

export function createInitialConversationState(): ConversationState {
  const activeRequest = createInitialActiveRequest();
  const backgroundContext = createInitialBackgroundContext();
  const currentConsultation = createInitialActiveConsultation();
  const backgroundPreferences = createInitialBackgroundPreferences();

  return {
    activeRequest,
    backgroundContext,
    shownProductIds: [],
    lastRecommendationIds: [],
    lastCanonicalProductSet: [],
    lastDiscussedProductSet: [],
    lastSelectedProductSet: [],
    currentConsultation,
    backgroundPreferences,
    preferences: buildUnifiedPreferences(currentConsultation, backgroundPreferences),
    previously_discussed_products: [],
    turnCount: 0,
    pendingClarification: null,
    pendingCartAction: null,
    lastTurnWasGreeting: false,
    lastPreferenceChange: null,
  };
}

/**
 * Builds backward-compatible ConversationPreferences combining
 * active consultation criteria and background persistent exclusions.
 */
function buildUnifiedPreferences(
  active: ActiveConsultation,
  bg: BackgroundPreferences,
  targetProducts?: string[]
): ConversationPreferences {
  return {
    ...active,
    avoid_notes: bg.persistent_exclusions.notes,
    avoid_families: bg.persistent_exclusions.families,
    projection: active.sillage,
    reference_fragrances: active.active_reference_perfume
      ? [active.active_reference_perfume]
      : bg.usual_fragrances,
    target_products: targetProducts,
  };
}

/**
 * Core Session State Management:
 * Separates Active Request from Background Context.
 * Executes atomic operations (SET, UPDATE, REMOVE, KEEP, RESET).
 * Guarantees that new requests do NOT inherit stale occasion/budget/families.
 */
export function updateConversationState(
  currentState: ConversationState | undefined,
  stage1: Stage1IntentOutput,
  discussedProductIdsOrMessage: string[] | string = [],
  userMessage?: string
): ConversationState {
  let base = currentState || createInitialConversationState();
  const discussedProductIds = Array.isArray(discussedProductIdsOrMessage)
    ? discussedProductIdsOrMessage
    : [];

  // 1. RESET INTENT ("Forget everything. Start over.")
  if (stage1.intent === 'RESET_CONSULTATION') {
    return createInitialConversationState();
  }

  const rawMsgEarly = typeof discussedProductIdsOrMessage === 'string'
    ? discussedProductIdsOrMessage
    : (userMessage || '');

  if (
    detectResetIntent(rawMsgEarly) &&
    stage1.intent !== 'CART_ASSISTANCE'
  ) {
    base = createInitialConversationState();
  }

  // 1a. FORGET LAST PREFERENCE ("forget that") — not a full reset
  if (stage1.requested_changes?.includes('forget_last')) {
    const last = base.lastPreferenceChange;
    const activeRequest: ActiveRequest = {
      ...(base.activeRequest || createInitialActiveRequest()),
      families: [...(base.activeRequest?.families || [])],
      preferredNotes: [...(base.activeRequest?.preferredNotes || [])],
      excludedNotes: [...(base.activeRequest?.excludedNotes || [])],
      excludedFamilies: [...(base.activeRequest?.excludedFamilies || [])],
      budget: { ...(base.activeRequest?.budget || { min: null, max: null }) },
    };
    const backgroundContext = {
      ...(base.backgroundContext || createInitialBackgroundContext()),
      usualFragrances: [...(base.backgroundContext?.usualFragrances || [])],
      persistentExclusions: {
        notes: [...(base.backgroundContext?.persistentExclusions?.notes || [])],
        families: [...(base.backgroundContext?.persistentExclusions?.families || [])],
        intensity_cap: base.backgroundContext?.persistentExclusions?.intensity_cap ?? null,
      },
    };

    if (last?.kind === 'family') {
      activeRequest.families = activeRequest.families.filter((f) => f.toLowerCase() !== last.value.toLowerCase());
    } else if (last?.kind === 'budget') {
      activeRequest.budget = { min: null, max: null };
      activeRequest.relativePrice = null;
    } else if (last?.kind === 'occasion') {
      activeRequest.occasion = null;
    } else if (last?.kind === 'reference') {
      activeRequest.isSimilarityRequest = false;
      backgroundContext.referencePerfume = null;
    } else if (last?.kind === 'freshness') {
      activeRequest.freshness = null;
    } else if (last?.kind === 'note') {
      activeRequest.preferredNotes = activeRequest.preferredNotes.filter((n) => n.toLowerCase() !== last.value.toLowerCase());
    } else if (last?.kind === 'format') {
      activeRequest.formatPreference = null;
    }

    const currentConsultation: ActiveConsultation = {
      occasion: activeRequest.occasion,
      season: activeRequest.season,
      gender: activeRequest.gender,
      fragrance_families: [...activeRequest.families],
      preferred_notes: [...activeRequest.preferredNotes],
      intensity: activeRequest.intensity,
      sillage: activeRequest.sillage,
      longevity: activeRequest.longevity,
      budget_max: activeRequest.budget.max,
      budget_min: activeRequest.budget.min,
      warmth: activeRequest.warmth,
      freshness: activeRequest.freshness,
      sweetness: activeRequest.sweetness,
      active_reference_perfume: activeRequest.isSimilarityRequest ? backgroundContext.referencePerfume : null,
    };

    return {
      ...base,
      intent: 'PREFERENCE_UPDATE' as CanonicalIntent,
      activeRequest,
      backgroundContext,
      currentConsultation,
      preferences: buildUnifiedPreferences(currentConsultation, base.backgroundPreferences || createInitialBackgroundPreferences()),
      lastPreferenceChange: null,
      lastRecommendationIds: [],
      lastCanonicalProductSet: [],
      lastDiscussedProductSet: [],
      lastSelectedProductSet: [],
      turnCount: (base.turnCount || 0) + 1,
      pendingClarification: null,
      lastTurnWasGreeting: false,
    };
  }

  // 1b. CLARIFICATION INTENT — PRESERVE STATE UNTOUCHED & RECORD PENDING CLARIFICATION
  if (stage1.intent === 'CLARIFICATION' || stage1.needs_clarification) {
    const rawMsg = rawMsgEarly;
    const isNewBrief = stage1.is_new_request === true;
    const activeReq: ActiveRequest = isNewBrief
      ? createInitialActiveRequest()
      : base.activeRequest
        ? { ...base.activeRequest, families: [...(base.activeRequest.families || [])] }
        : createInitialActiveRequest();
    if (stage1.fragrance_families && stage1.fragrance_families.length > 0 && !isNewBrief) {
      activeReq.families = Array.from(new Set([...(activeReq.families || []), ...stage1.fragrance_families]));
    }
    if (stage1.ambiguous_term === 'creamy' || /\bcreamy\b/i.test(rawMsg)) {
      if (!activeReq.preferredNotes.includes('creamy')) {
        activeReq.preferredNotes = [...activeReq.preferredNotes, 'creamy'];
      }
      if (!activeReq.style) activeReq.style = 'creamy';
    }

    return {
      ...(isNewBrief
        ? {
            ...base,
            lastRecommendationIds: [],
            lastCanonicalProductSet: [],
            lastDiscussedProductSet: [],
            lastSelectedProductSet: [],
            backgroundContext: {
              ...createInitialBackgroundContext(),
              persistentExclusions: base.backgroundContext?.persistentExclusions || createInitialBackgroundContext().persistentExclusions,
            },
          }
        : base),
      intent: 'CLARIFICATION' as CanonicalIntent,
      activeRequest: activeReq,
      turnCount: (base.turnCount || 0) + 1,
      lastPreferenceChange: isNewBrief
        ? { kind: 'note' as const, value: 'creamy' }
        : base.lastPreferenceChange,
      lastTurnWasGreeting: false,
      pendingClarification: {
        originalQuery: rawMsg,
        ambiguousTerm: stage1.ambiguous_term || undefined,
        question: stage1.clarification_question || undefined,
      },
    };
  }

  // 1b2. GREETING — do not create preferences or recommendations.
  // Mid-consultation "hi" keeps the thread; the next discovery query starts fresh.
  if (stage1.intent === 'GREETING' || stage1.intent === 'IDENTITY' || stage1.intent === 'CAPABILITY') {
    return {
      ...base,
      intent: stage1.intent as CanonicalIntent,
      lastIntent: stage1.intent,
      lastTurnWasGreeting: stage1.intent === 'GREETING',
      turnCount: (base.turnCount || 0) + 1,
      pendingClarification: null,
    };
  }

  // 1c. OUT OF SCOPE, PURCHASE ASSISTANCE & CART ASSISTANCE — PRESERVE ACTIVE CONSULTATION UNTOUCHED
  if (
    stage1.intent === 'OUT_OF_SCOPE' ||
    stage1.intent === 'PURCHASE_ASSISTANCE' ||
    stage1.intent === 'CART_ASSISTANCE'
  ) {
    return {
      ...base,
      turnCount: (base.turnCount || 0) + 1,
      pendingCartAction: base.pendingCartAction || null,
    };
  }

  // Deep clone current active request & background context
  let activeRequest: ActiveRequest = {
    gender: base.activeRequest?.gender ?? null,
    occasion: base.activeRequest?.occasion ?? null,
    season: base.activeRequest?.season ?? null,
    families: [...(base.activeRequest?.families || base.currentConsultation?.fragrance_families || [])],
    preferredNotes: [...(base.activeRequest?.preferredNotes || base.currentConsultation?.preferred_notes || [])],
    excludedNotes: [...(base.activeRequest?.excludedNotes || [])],
    excludedFamilies: [...(base.activeRequest?.excludedFamilies || [])],
    budget: {
      min: base.activeRequest?.budget?.min ?? base.currentConsultation?.budget_min ?? null,
      max: base.activeRequest?.budget?.max ?? base.currentConsultation?.budget_max ?? null,
    },
    intensity: (base.activeRequest?.intensity ?? base.currentConsultation?.intensity ?? null) as any,
    sillage: (base.activeRequest?.sillage ?? base.currentConsultation?.sillage ?? null) as any,
    sillageMax: base.activeRequest?.sillageMax ?? null,
    freshness: base.activeRequest?.freshness ?? base.currentConsultation?.freshness ?? null,
    warmth: base.activeRequest?.warmth ?? base.currentConsultation?.warmth ?? null,
    warmthMax: base.activeRequest?.warmthMax ?? null,
    sweetness: base.activeRequest?.sweetness ?? base.currentConsultation?.sweetness ?? null,
    longevity: base.activeRequest?.longevity ?? base.currentConsultation?.longevity ?? null,
    style: base.activeRequest?.style ?? null,
    relativePrice: base.activeRequest?.relativePrice ?? null,
    isSimilarityRequest: base.activeRequest?.isSimilarityRequest ?? false,
    formatPreference: base.activeRequest?.formatPreference ?? null,
    explorationIntent: base.activeRequest?.explorationIntent ?? null,
    experienceLevel: base.activeRequest?.experienceLevel ?? null,
    travelIntent: Boolean(base.activeRequest?.travelIntent),
    giftingIntent: Boolean(base.activeRequest?.giftingIntent),
  };

  const backgroundContext: BackgroundContext = {
    referencePerfume: base.backgroundContext?.referencePerfume ?? base.currentConsultation?.active_reference_perfume ?? null,
    usualFragrances: [...(base.backgroundContext?.usualFragrances || base.backgroundPreferences?.usual_fragrances || [])],
    persistentExclusions: {
      notes: [...(base.backgroundContext?.persistentExclusions?.notes || base.backgroundPreferences?.persistent_exclusions?.notes || [])],
      families: [...(base.backgroundContext?.persistentExclusions?.families || base.backgroundPreferences?.persistent_exclusions?.families || [])],
      intensity_cap: base.backgroundContext?.persistentExclusions?.intensity_cap || base.backgroundPreferences?.persistent_exclusions?.intensity_cap || null,
      warmth_cap: base.backgroundContext?.persistentExclusions?.warmth_cap || null,
      sillage_cap: base.backgroundContext?.persistentExclusions?.sillage_cap || null,
    },
  };

  const rawUserTextEarly = (
    typeof discussedProductIdsOrMessage === 'string' ? discussedProductIdsOrMessage : userMessage || ''
  ).toLowerCase();
  const messageMentionsSimilarity = /\b(like|similar\s+to|alternative\s+to|inspired\s+by|clone\s+of|dupe\s+of|reminds\s+me|usually\s+wear|i\s+wear|compared\s+to|than)\b/.test(rawUserTextEarly);
  const isReferenceDroppedEarly = isReferenceDropRequest(
    rawUserTextEarly,
    base.backgroundContext?.referencePerfume
  );

  // 2. BACKGROUND CONTEXT UPDATES (e.g. "I usually wear Dior Sauvage")
  if (
    stage1.reference_perfume &&
    messageMentionsSimilarity &&
    !isReferenceDroppedEarly &&
    rawUserTextEarly.includes(stage1.reference_perfume.toLowerCase())
  ) {
    const ref = stage1.reference_perfume.trim();
    if (ref) {
      backgroundContext.referencePerfume = ref;
      if (!backgroundContext.usualFragrances.includes(ref)) {
        backgroundContext.usualFragrances.push(ref);
      }
    }
  }

  // 3. PERSISTENT EXCLUSIONS (Negative Preferences)
  if (stage1.excluded_notes && stage1.excluded_notes.length > 0) {
    for (const note of stage1.excluded_notes) {
      const lower = note.toLowerCase().trim();
      if (lower) {
        if (!backgroundContext.persistentExclusions.notes.includes(lower)) {
          backgroundContext.persistentExclusions.notes.push(lower);
        }
        if (!activeRequest.excludedNotes.includes(lower)) {
          activeRequest.excludedNotes.push(lower);
        }
      }
    }
  }

  if (stage1.excluded_families && stage1.excluded_families.length > 0) {
    for (const fam of stage1.excluded_families) {
      const lower = fam.toLowerCase().trim();
      if (lower) {
        if (!backgroundContext.persistentExclusions.families.includes(lower)) {
          backgroundContext.persistentExclusions.families.push(lower);
        }
        if (!activeRequest.excludedFamilies.includes(lower)) {
          activeRequest.excludedFamilies.push(lower);
        }
        // Remove from active requested families if previously present
        activeRequest.families = activeRequest.families.filter((f) => f.toLowerCase() !== lower);
      }
    }
  }

  // Handle negative preference reversal (e.g. "Actually I like sweet perfumes now")
  const isReversingSweetExclusion =
    stage1.requested_changes?.includes('remove_sweet_exclusion') ||
    stage1.updates?.some((u) => u.field === 'excluded_families' && u.operation === 'REMOVE');

  if (isReversingSweetExclusion) {
    backgroundContext.persistentExclusions.families =
      backgroundContext.persistentExclusions.families.filter((f) => f !== 'sweet' && f !== 'gourmand');
    activeRequest.excludedFamilies =
      activeRequest.excludedFamilies.filter((f) => f !== 'sweet' && f !== 'gourmand');
  }

  // Handle intensity cap (e.g. "not too strong", "isn't too strong", "avoid strong")
  if (stage1.intensity && (stage1.intensity.includes('not too strong') || stage1.intensity.includes('subtle') || stage1.intensity.includes('moderate'))) {
    if (stage1.intensity.includes('not too strong') || stage1.intensity.includes('subtle')) {
      backgroundContext.persistentExclusions.intensity_cap = 'moderate';
    }
  }

  // 4. ROUTING: NEW REQUEST VS REFINEMENT
  const rawUserText = (typeof discussedProductIdsOrMessage === 'string' ? discussedProductIdsOrMessage : userMessage || '').toLowerCase();
  const refinementKeywords = [
    'cheaper', 'budget', 'spend', 'more', 'less', 'warmer', 'stronger', 'lighter', 'fresher',
    'another', 'different', 'else', 'alternative', 'avoid', "don't like", "dont like", "hate",
    'remove', 'higher', 'lower', 'under', 'below', 'within', 'bucks', 'rs',
    'option', 'options', 'alternatives', 'choices', 'instead', 'rather', 'forget', 'switch', 'change',
    'make it', 'how about', 'what about', 'prefer'
  ];
  const hasRefinementKeyword = refinementKeywords.some((kw) => rawUserText.includes(kw));
  const hasActive = hasActiveConsultation(base);

  const isProductFactualIntent =
    stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'COMPARE_PRODUCTS';

  const isComparativeRefinement = isComparativePreferenceRefinement(rawUserText);

  const isDirectedNewRequest =
    stage1.is_new_request === true &&
    !isComparativeRefinement &&
    !isProductFactualIntent &&
    stage1.intent !== 'BUDGET_CHANGE' &&
    stage1.intent !== 'SHOW_ALTERNATIVES' &&
    stage1.intent !== 'REFINE_RECOMMENDATION' &&
    stage1.intent !== 'PREFERENCE_UPDATE';

  const isExplicitRefinement =
    !isDirectedNewRequest &&
    (isComparativeRefinement ||
      stage1.is_refinement === true ||
      stage1.request_type === 'refinement' ||
      stage1.intent === 'PREFERENCE_UPDATE' ||
      stage1.intent === 'BUDGET_CHANGE' ||
      stage1.intent === 'REFINE_RECOMMENDATION' ||
      stage1.intent === 'SHOW_ALTERNATIVES' ||
      (hasActive && hasRefinementKeyword && !stage1.requested_changes?.includes('replace_family')));

  const isExplicitReset =
    /\b(forg[eo]t\s+(?:everything|all(\s+(?:of\s+)?(?:this|that))?|my\s+preferences|all\s+preferences)|clear\s+everything|ignore\s+everything|start\s+over|reset|new\s+search|start\s+(?:a\s+)?new\s+search|start\s+fresh|let'?s\s+start\s+fresh)\b/i.test(rawUserText);

  const afterGreetingNewQuery =
    Boolean(base.lastTurnWasGreeting) &&
    !isProductFactualIntent &&
    stage1.intent !== 'SHOW_ALTERNATIVES' &&
    stage1.intent !== 'BUDGET_CHANGE' &&
    stage1.intent !== 'REFINE_RECOMMENDATION' &&
    isFreshConsultationQuery(rawUserText);

  const isNewConsultation =
    isExplicitReset ||
    afterGreetingNewQuery ||
    (!isProductFactualIntent &&
      (isDirectedNewRequest || (!isExplicitRefinement && !hasActive)));

  if (isNewConsultation) {
    // ── NEW REQUEST: WIPE OLD ACTIVE SHOPPING REQUEST ──────────────────────────
    // Does NOT carry forward stale occasion (e.g. date), stale families (e.g. spicy), or stale budget
    activeRequest = {
      gender: stage1.gender || null,
      occasion: normalizeOccasion(stage1.occasion),
      season: stage1.season || null,
      families: stage1.fragrance_families ? [...stage1.fragrance_families] : [],
      preferredNotes: stage1.preferred_notes ? [...stage1.preferred_notes] : [],
      excludedNotes: [...backgroundContext.persistentExclusions.notes],
      excludedFamilies: [...backgroundContext.persistentExclusions.families],
      budget: {
        min: stage1.budget?.min ?? null,
        max: stage1.budget?.max ?? null,
      },
      intensity: (stage1.intensity || null) as any,
      sillage: (stage1.sillage || null) as any,
      freshness: stage1.freshness || null,
      warmth: stage1.warmth || null,
      sweetness: stage1.sweetness || null,
      longevity: stage1.longevity || null,
      style: stage1.style || null,
      relativePrice: stage1.relative_price ?? null,
      isSimilarityRequest: Boolean(stage1.is_similarity_request),
      formatPreference: stage1.format_preference ?? null,
      explorationIntent: stage1.exploration_intent ?? null,
      experienceLevel: stage1.experience_level ?? null,
      travelIntent: Boolean(stage1.travel_intent),
      giftingIntent: Boolean(stage1.gifting_intent),
    };

    if (stage1.is_similarity_request && stage1.reference_perfume) {
      backgroundContext.referencePerfume = stage1.reference_perfume;
    } else if (!stage1.is_similarity_request && !messageMentionsSimilarity) {
      backgroundContext.referencePerfume = null;
    }
  } else {
    // ── REFINEMENT / FOLLOW-UP: PRESERVE CONSTRAINTS & APPLY ATOMIC UPDATES ───
    // Check if user language indicates replacement vs combination:
    const hasCombinationMarker = /\b(keep|still|remain|stay|both|while|fresh\s+but|warm\s+but|fresh\s+and|warm\s+and|and\s+also|too|also)\b/i.test(rawUserText);
    const hasReplacementMarker = /\b(actually|instead|rather|forget|ignore|nevermind|scratch\s+that|switch\s+(?:it\s+)?to|change\s+(?:it\s+)?to|swap\s+(?:it\s+)?to|prefer\s+.*instead|make\s+it\s+.*instead|make\s+it|switch\s+to|change\s+to|move\s+to|replace\s+.*with|go\s+with|no,\s*|no\s+i\s+want)\b/i.test(rawUserText);
    const isReplacement = hasReplacementMarker && !hasCombinationMarker;

    // Reference cleanup on explicit reference drop or new direction
    const isReferenceDropped = isReferenceDropRequest(
      rawUserText,
      backgroundContext.referencePerfume
    );
    if (isReferenceDropped) {
      activeRequest.isSimilarityRequest = false;
      activeRequest.relativePrice = null;
      backgroundContext.referencePerfume = null;
    } else if (stage1.reference_perfume && (stage1.is_similarity_request || messageMentionsSimilarity)) {
      activeRequest.isSimilarityRequest = true;
      backgroundContext.referencePerfume = stage1.reference_perfume;
    } else if (
      !isComparativeRefinement &&
      stage1.fragrance_families &&
      stage1.fragrance_families.length > 0 &&
      !/\b(reference|like|similar|clone|dupe|cheaper|alternative)\b/i.test(rawUserText)
    ) {
      if (activeRequest.isSimilarityRequest) {
        activeRequest.isSimilarityRequest = false;
        activeRequest.relativePrice = null;
        backgroundContext.referencePerfume = null;
      }
    }

    // Explicit "forget X" removals
    if (/\bforg[eo]t\s+(?:the\s+)?fresh\b/i.test(rawUserText)) {
      activeRequest.families = activeRequest.families.filter((f) => f.toLowerCase() !== 'fresh');
      activeRequest.freshness = null;
    }
    if (/\bforg[eo]t\s+(?:the\s+)?warm\b/i.test(rawUserText)) {
      activeRequest.families = activeRequest.families.filter((f) => f.toLowerCase() !== 'warm');
      activeRequest.warmth = null;
      activeRequest.warmthMax = null;
    }
    if (/\bforg[eo]t\s+(?:the\s+)?woody\b/i.test(rawUserText)) {
      activeRequest.families = activeRequest.families.filter((f) => f.toLowerCase() !== 'woody');
    }
    if (/\bforg[eo]t\s+(?:the\s+)?sweet\b/i.test(rawUserText)) {
      activeRequest.families = activeRequest.families.filter((f) => !['sweet', 'gourmand'].includes(f.toLowerCase()));
      activeRequest.sweetness = null;
    }
    if (/\bforg[eo]t\s+(?:the\s+)?fruity\b/i.test(rawUserText)) {
      activeRequest.families = activeRequest.families.filter((f) => f.toLowerCase() !== 'fruity');
    }

    // Direct field deltas ensure state updates succeed even if stage1.updates array was omitted:
    if (stage1.budget?.max !== null && stage1.budget?.max !== undefined) {
      activeRequest.budget.max = stage1.budget.max;
      activeRequest.relativePrice = null;
    }
    if (stage1.budget?.min !== null && stage1.budget?.min !== undefined) {
      activeRequest.budget.min = stage1.budget.min;
    }
    if (stage1.remove_budget) {
      activeRequest.budget.max = null;
      activeRequest.budget.min = null;
      activeRequest.relativePrice = null;
    }
    if (stage1.relative_price) {
      activeRequest.relativePrice = stage1.relative_price;
    }
    if (stage1.warmth) {
      activeRequest.warmth = stage1.warmth;
      if (isReplacement && (stage1.warmth === 'warmer' || stage1.warmth === 'moderate-warm')) {
        // Natural language replacement: fresh -> warm
        activeRequest.families = activeRequest.families.filter(
          (f) => !['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase())
        );
        activeRequest.freshness = null;
      }
    }
    if (stage1.freshness) {
      activeRequest.freshness = stage1.freshness;
      if (isReplacement && stage1.freshness === 'fresher') {
        // Natural language replacement: warm -> fresh
        activeRequest.families = activeRequest.families.filter(
          (f) => !['warm', 'oriental', 'amber'].includes(f.toLowerCase())
        );
        activeRequest.warmth = null;
        activeRequest.warmthMax = null;
      }
    }
    if (stage1.sweetness) {
      activeRequest.sweetness = stage1.sweetness;
    }
    if (stage1.intensity) {
      activeRequest.intensity = stage1.intensity as any;
    }
    if (stage1.sillage) {
      activeRequest.sillage = stage1.sillage as any;
    }
    if (stage1.longevity) {
      activeRequest.longevity = stage1.longevity;
    }

    if (stage1.updates && Array.isArray(stage1.updates) && stage1.updates.length > 0) {
      for (const update of stage1.updates) {
        switch (update.field) {
          case 'budget.max':
            activeRequest.budget.max = update.value ?? null;
            activeRequest.relativePrice = null; // Numeric budget overrides relative price
            break;
          case 'budget.min':
            activeRequest.budget.min = update.value ?? null;
            break;
          case 'remove_budget':
            activeRequest.budget.max = null;
            activeRequest.budget.min = null;
            activeRequest.relativePrice = null;
            break;
          case 'relative_price':
            activeRequest.relativePrice = update.value || 'cheaper';
            break;
          case 'fragrance_families':
            if (update.operation === 'REPLACE' || update.operation === 'SET') {
              activeRequest.families = Array.isArray(update.value) ? update.value : [update.value];
            } else if (update.operation === 'ADD') {
              const toAdd = Array.isArray(update.value) ? update.value : [update.value];
              activeRequest.families = Array.from(new Set([...activeRequest.families, ...toAdd]));
            } else if (update.operation === 'REMOVE') {
              const toRem = Array.isArray(update.value) ? update.value : [update.value];
              activeRequest.families = activeRequest.families.filter((f) => !toRem.includes(f));
            }
            break;
          case 'preferred_notes':
            if (update.operation === 'REPLACE' || update.operation === 'SET') {
              activeRequest.preferredNotes = Array.isArray(update.value) ? update.value : [update.value];
            } else if (update.operation === 'ADD') {
              const toAdd = Array.isArray(update.value) ? update.value : [update.value];
              activeRequest.preferredNotes = Array.from(new Set([...activeRequest.preferredNotes, ...toAdd]));
            } else if (update.operation === 'REMOVE') {
              const toRem = (Array.isArray(update.value) ? update.value : [update.value]).map((n) =>
                String(n).toLowerCase()
              );
              const expanded = toRem.flatMap((n) =>
                n === 'vanilla' || n === 'vanillic' ? ['vanilla', 'vanillic'] : [n]
              );
              activeRequest.preferredNotes = activeRequest.preferredNotes.filter(
                (n) => !expanded.includes(n.toLowerCase())
              );
            }
            break;
          case 'occasion':
            activeRequest.occasion = update.operation === 'REMOVE' ? null : normalizeOccasion(update.value);
            break;
          case 'season':
            activeRequest.season = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'intensity':
            activeRequest.intensity = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'longevity':
            activeRequest.longevity = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'warmth':
            activeRequest.warmth = update.operation === 'REMOVE' ? null : update.value;
            if (isReplacement && (update.value === 'warmer' || update.value === 'moderate-warm')) {
              activeRequest.families = activeRequest.families.filter(
                (f) => !['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase())
              );
              activeRequest.freshness = null;
            }
            break;
          case 'warmthMax':
            activeRequest.warmthMax = update.operation === 'REMOVE' ? null : update.value;
            backgroundContext.persistentExclusions.warmth_cap = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'sillage':
            activeRequest.sillage = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'sillageMax':
            activeRequest.sillageMax = update.operation === 'REMOVE' ? null : update.value;
            backgroundContext.persistentExclusions.sillage_cap = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'freshness':
            activeRequest.freshness = update.operation === 'REMOVE' ? null : update.value;
            if (isReplacement && update.value === 'fresher') {
              activeRequest.families = activeRequest.families.filter(
                (f) => !['warm', 'oriental', 'amber'].includes(f.toLowerCase())
              );
              activeRequest.warmth = null;
              activeRequest.warmthMax = null;
            }
            break;
          case 'sweetness':
            activeRequest.sweetness = update.operation === 'REMOVE' ? null : update.value;
            break;
          case 'excluded_notes': {
            const notes = Array.isArray(update.value) ? update.value : [update.value];
            if (update.operation === 'REMOVE') {
              for (const n of notes) {
                const clean = String(n).toLowerCase().trim();
                backgroundContext.persistentExclusions.notes = backgroundContext.persistentExclusions.notes.filter((note) => note !== clean);
                activeRequest.excludedNotes = activeRequest.excludedNotes.filter((note) => note !== clean);
              }
            } else {
              for (const n of notes) {
                const clean = String(n).toLowerCase().trim();
                if (clean && !backgroundContext.persistentExclusions.notes.includes(clean)) {
                  backgroundContext.persistentExclusions.notes.push(clean);
                }
                if (clean && !activeRequest.excludedNotes.includes(clean)) {
                  activeRequest.excludedNotes.push(clean);
                }
              }
            }
            break;
          }
          case 'excluded_families': {
            const fams = Array.isArray(update.value) ? update.value : [update.value];
            if (update.operation === 'REMOVE') {
              for (const f of fams) {
                const clean = String(f).toLowerCase().trim();
                backgroundContext.persistentExclusions.families = backgroundContext.persistentExclusions.families.filter((fam) => fam !== clean);
                activeRequest.excludedFamilies = activeRequest.excludedFamilies.filter((fam) => fam !== clean);
              }
            } else {
              for (const f of fams) {
                const clean = String(f).toLowerCase().trim();
                if (clean && !backgroundContext.persistentExclusions.families.includes(clean)) {
                  backgroundContext.persistentExclusions.families.push(clean);
                }
                if (clean && !activeRequest.excludedFamilies.includes(clean)) {
                  activeRequest.excludedFamilies.push(clean);
                }
                activeRequest.families = activeRequest.families.filter((fam) => fam.toLowerCase() !== clean);
              }
            }
            break;
          }
        }
      }
    }

    // Direct attribute fallbacks if not handled by updates array
    if (stage1.occasion) activeRequest.occasion = normalizeOccasion(stage1.occasion);
    if (stage1.season) activeRequest.season = stage1.season;
    if (stage1.gender) activeRequest.gender = stage1.gender;
    if (stage1.style) activeRequest.style = stage1.style;

    // Handle Warmth vs Freshness transitions (Replacement vs Composition)
    if (stage1.warmth === 'moderate-warm') {
      activeRequest.warmth = 'moderate-warm';
      activeRequest.warmthMax = 'warm';
      backgroundContext.persistentExclusions.warmth_cap = 'warm';
    } else if (stage1.warmth === 'warmer') {
      activeRequest.warmth = 'warmer';
      activeRequest.warmthMax = null;
      backgroundContext.persistentExclusions.warmth_cap = null;
      // Only clear fresh family if user didn't request a combined fresh+warm profile
      const isCombinedFreshWarm =
        (rawUserText.includes('fresh') && rawUserText.includes('warm')) ||
        rawUserText.includes('fresh but warm') ||
        rawUserText.includes('keep it fresh');
      if (!isCombinedFreshWarm) {
        activeRequest.freshness = null;
        activeRequest.families = activeRequest.families.filter(
          (f) => f.toLowerCase() !== 'fresh' && f.toLowerCase() !== 'aquatic'
        );
      }
    } else if (stage1.warmth === 'cooler') {
      activeRequest.warmth = 'cooler';
      activeRequest.warmthMax = null;
      backgroundContext.persistentExclusions.warmth_cap = null;
    }

    if (stage1.warmthMax !== undefined) {
      activeRequest.warmthMax = stage1.warmthMax;
      backgroundContext.persistentExclusions.warmth_cap = stage1.warmthMax;
    }

    if (stage1.freshness === 'fresher') {
      activeRequest.freshness = 'fresher';
      const isCombined = rawUserText.includes('warm') || stage1.warmth === 'moderate-warm';
      if (!isCombined) {
        activeRequest.warmth = null;
        activeRequest.warmthMax = null;
      }
    }

    if (stage1.sweetness) activeRequest.sweetness = stage1.sweetness;

    // Sillage & Intensity separation
    if (stage1.sillageMax) {
      activeRequest.sillageMax = stage1.sillageMax;
      activeRequest.sillage = 'moderate';
      backgroundContext.persistentExclusions.sillage_cap = stage1.sillageMax;
    } else if (stage1.sillage) {
      activeRequest.sillage = stage1.sillage as any;
      if (stage1.sillage === 'strong') {
        activeRequest.sillageMax = null;
        backgroundContext.persistentExclusions.sillage_cap = null;
      }
    }

    if (stage1.intensity) {
      activeRequest.intensity = stage1.intensity as any;
      if (stage1.intensity === 'subtle') {
        backgroundContext.persistentExclusions.intensity_cap = 'moderate';
      } else if (stage1.intensity === 'strong') {
        backgroundContext.persistentExclusions.intensity_cap = null;
      } else if (stage1.intensity === 'moderate') {
        backgroundContext.persistentExclusions.intensity_cap = 'moderate';
      }
    }
    if (stage1.longevity) activeRequest.longevity = stage1.longevity;

    if (stage1.remove_budget) {
      activeRequest.budget.max = null;
      activeRequest.budget.min = null;
      activeRequest.relativePrice = null;
    } else if (stage1.budget?.max !== undefined && stage1.budget?.max !== null) {
      activeRequest.budget.max = stage1.budget.max;
      activeRequest.relativePrice = null;
    }

    if (stage1.relative_price) {
      activeRequest.relativePrice = stage1.relative_price;
    }

    if (isReferenceDropped) {
      activeRequest.isSimilarityRequest = false;
      activeRequest.relativePrice = null;
      backgroundContext.referencePerfume = null;
    } else if (stage1.is_similarity_request && (messageMentionsSimilarity || stage1.reference_perfume)) {
      activeRequest.isSimilarityRequest = true;
      if (stage1.reference_perfume) {
        backgroundContext.referencePerfume = stage1.reference_perfume;
      }
    } else if (
      isComparativeRefinement &&
      (backgroundContext.referencePerfume || activeRequest.isSimilarityRequest)
    ) {
      activeRequest.isSimilarityRequest = true;
      if (stage1.reference_perfume) {
        backgroundContext.referencePerfume = stage1.reference_perfume;
      }
    } else if (!messageMentionsSimilarity && !stage1.is_similarity_request) {
      activeRequest.isSimilarityRequest = false;
    }

    if (stage1.fragrance_families && stage1.fragrance_families.length > 0) {
      const isReplacement =
        stage1.requested_changes?.includes('replace_family') ||
        (!hasCombinationMarker && (
          hasReplacementMarker ||
          stage1.updates?.some((u) => u.field === 'fragrance_families' && (u.operation === 'SET' || u.operation === 'REPLACE'))
        ));
      if (isReplacement) {
        activeRequest.families = [...stage1.fragrance_families];
      } else {
        activeRequest.families = Array.from(new Set([...activeRequest.families, ...stage1.fragrance_families]));
      }
    }

    if (stage1.preferred_notes && stage1.preferred_notes.length > 0) {
      activeRequest.preferredNotes = Array.from(new Set([...activeRequest.preferredNotes, ...stage1.preferred_notes]));
    }

    if (stage1.format_preference) {
      activeRequest.formatPreference = stage1.format_preference;
    }
    if (stage1.exploration_intent) {
      activeRequest.explorationIntent = stage1.exploration_intent;
    }
    if (stage1.experience_level) {
      activeRequest.experienceLevel = stage1.experience_level;
    }
    if (stage1.travel_intent !== undefined) {
      activeRequest.travelIntent = Boolean(stage1.travel_intent);
    }
    if (stage1.gifting_intent !== undefined) {
      activeRequest.giftingIntent = Boolean(stage1.gifting_intent);
    }
  }

  const sampled = parseSamplingContext(rawUserText);
  if (stage1.format_preference || sampled.formatPreference) {
    activeRequest.formatPreference = stage1.format_preference ?? sampled.formatPreference;
  }
  if (stage1.exploration_intent || sampled.explorationIntent) {
    activeRequest.explorationIntent = stage1.exploration_intent ?? sampled.explorationIntent;
  }
  if (stage1.experience_level || sampled.experienceLevel) {
    activeRequest.experienceLevel = stage1.experience_level ?? sampled.experienceLevel;
  }
  if (stage1.travel_intent || sampled.travelIntent) {
    activeRequest.travelIntent = true;
  }
  if (stage1.gifting_intent || sampled.giftingIntent) {
    activeRequest.giftingIntent = true;
  }
  if (stage1.scentira_decant_only) {
    activeRequest.scentiraDecantOnly = true;
  }
  if (stage1.requested_size_ml) {
    activeRequest.requestedSizeMl = stage1.requested_size_ml;
  }
  if (/\bforget\s+the\s+format\b/.test(rawUserText) || /\bno\s+format\s+preference\b/.test(rawUserText)) {
    activeRequest.formatPreference = 'NO_FORMAT_PREFERENCE';
    activeRequest.scentiraDecantOnly = false;
    activeRequest.requestedSizeMl = null;
  }

  // Strict Contradiction Resolution (Section 14)
  activeRequest.families = activeRequest.families.filter(
    (f) =>
      !backgroundContext.persistentExclusions.families.includes(f.toLowerCase()) &&
      !activeRequest.excludedFamilies.includes(f.toLowerCase())
  );
  activeRequest.preferredNotes = activeRequest.preferredNotes.filter(
    (n) =>
      !backgroundContext.persistentExclusions.notes.includes(n.toLowerCase()) &&
      !activeRequest.excludedNotes.includes(n.toLowerCase())
  );

  // Sync to backward-compatible structures
  const currentConsultation: ActiveConsultation = {
    occasion: activeRequest.occasion,
    season: activeRequest.season,
    gender: activeRequest.gender,
    fragrance_families: [...activeRequest.families],
    preferred_notes: [...activeRequest.preferredNotes],
    intensity: activeRequest.intensity,
    sillage: activeRequest.sillage,
    longevity: activeRequest.longevity,
    budget_max: activeRequest.budget.max,
    budget_min: activeRequest.budget.min,
    warmth: activeRequest.warmth,
    freshness: activeRequest.freshness,
    sweetness: activeRequest.sweetness,
    active_reference_perfume: activeRequest.isSimilarityRequest ? backgroundContext.referencePerfume : null,
  };

  const backgroundPreferences: BackgroundPreferences = {
    usual_fragrances: [...backgroundContext.usualFragrances],
    persistent_exclusions: {
      notes: [...backgroundContext.persistentExclusions.notes],
      families: [...backgroundContext.persistentExclusions.families],
      intensity_cap: backgroundContext.persistentExclusions.intensity_cap,
    },
  };

  // Update shown & discussed product history
  // Scoped list for the current recommendation thread: reset when user starts a clearly new request
  const baseShown = isNewConsultation ? [] : (base.shownProductIds || []);
  const updatedShown = Array.from(
    new Set([...baseShown, ...discussedProductIds])
  );

  const factualProductSet: CanonicalProductRef[] | null =
    isProductFactualIntent && (stage1.target_product_names?.length || 0) > 0
      ? stage1.target_product_names!.map((name) => ({
          productId: '',
          brandSlug: '',
          name,
        }))
      : null;

  return {
    intent: stage1.intent as CanonicalIntent,
    activeRequest,
    backgroundContext,
    shownProductIds: updatedShown,
    lastRecommendationIds: isNewConsultation ? [] : (base.lastRecommendationIds || []),
    lastCanonicalProductSet: isNewConsultation ? [] : (base.lastCanonicalProductSet || []),
    lastDiscussedProductSet: factualProductSet
      ? factualProductSet
      : isNewConsultation
        ? []
        : (base.lastDiscussedProductSet || []),
    lastSelectedProductSet: isNewConsultation ? [] : (base.lastSelectedProductSet || []),
    currentConsultation,
    backgroundPreferences,
    preferences: buildUnifiedPreferences(currentConsultation, backgroundPreferences, stage1.target_product_names),
    previously_discussed_products: updatedShown,
    lastIntent: stage1.intent,
    turnCount: base.turnCount + 1,
    pendingClarification: null,
    pendingCartAction: isNewConsultation ? null : (base.pendingCartAction || null),
    lastTurnWasGreeting: false,
    lastPreferenceChange: (() => {
      if (isNewConsultation) {
        if (activeRequest.families.length > 0) {
          return { kind: 'family' as const, value: activeRequest.families[activeRequest.families.length - 1] };
        }
        if (activeRequest.budget.max != null) return { kind: 'budget' as const, value: String(activeRequest.budget.max) };
        if (activeRequest.occasion) return { kind: 'occasion' as const, value: activeRequest.occasion };
        if (activeRequest.preferredNotes.length > 0) {
          return { kind: 'note' as const, value: activeRequest.preferredNotes[activeRequest.preferredNotes.length - 1] };
        }
        return null;
      }
      if (stage1.fragrance_families && stage1.fragrance_families.length > 0) {
        return { kind: 'family' as const, value: stage1.fragrance_families[stage1.fragrance_families.length - 1] };
      }
      if (stage1.budget?.max != null) return { kind: 'budget' as const, value: String(stage1.budget.max) };
      if (stage1.occasion) return { kind: 'occasion' as const, value: stage1.occasion };
      if (stage1.preferred_notes && stage1.preferred_notes.length > 0) {
        return { kind: 'note' as const, value: stage1.preferred_notes[stage1.preferred_notes.length - 1] };
      }
      if (stage1.is_similarity_request && stage1.reference_perfume) {
        return { kind: 'reference' as const, value: stage1.reference_perfume };
      }
      return base.lastPreferenceChange || null;
    })(),
  };
}

/**
 * Converts the canonical state into StructuredPreferences for deterministic recommendation.
 */
export function toStructuredPreferences(
  stateOrPrefs: ConversationState | ConversationPreferences,
  rawQueryOrShownIds?: string | string[],
  explicitQueryOrPrices?: string | number[],
  maybePrices?: number[]
): StructuredPreferences {
  let activeReq: ActiveRequest;
  let bgCtx: BackgroundContext;
  let shownIds: string[] = [];
  let queryText = '';
  let prices: number[] | undefined = undefined;

  if (Array.isArray(rawQueryOrShownIds)) {
    shownIds = rawQueryOrShownIds;
    queryText = typeof explicitQueryOrPrices === 'string' ? explicitQueryOrPrices : '';
    prices = Array.isArray(explicitQueryOrPrices) ? explicitQueryOrPrices : maybePrices;
  } else if (typeof rawQueryOrShownIds === 'string') {
    queryText = rawQueryOrShownIds;
    prices = Array.isArray(explicitQueryOrPrices) ? explicitQueryOrPrices : maybePrices;
  }

  if ('activeRequest' in stateOrPrefs && stateOrPrefs.activeRequest) {
    activeReq = stateOrPrefs.activeRequest;
    bgCtx = stateOrPrefs.backgroundContext;
    if (shownIds.length === 0) shownIds = stateOrPrefs.shownProductIds || [];
  } else if ('budget' in stateOrPrefs && typeof (stateOrPrefs as any).budget === 'object') {
    // stateOrPrefs is ALREADY an ActiveRequest object
    activeReq = stateOrPrefs as unknown as ActiveRequest;
    bgCtx = {
      referencePerfume: null,
      usualFragrances: [],
      persistentExclusions: {
        notes: activeReq.excludedNotes || [],
        families: activeReq.excludedFamilies || [],
        warmth_cap: activeReq.warmthMax || null,
        sillage_cap: activeReq.sillageMax || null,
      },
    };
  } else if ('currentConsultation' in stateOrPrefs) {
    const c = stateOrPrefs.currentConsultation;
    const bg = stateOrPrefs.backgroundPreferences;
    activeReq = {
      gender: c.gender,
      occasion: c.occasion,
      season: c.season,
      families: c.fragrance_families || [],
      preferredNotes: c.preferred_notes || [],
      excludedNotes: bg?.persistent_exclusions?.notes || [],
      excludedFamilies: bg?.persistent_exclusions?.families || [],
      budget: { min: c.budget_min, max: c.budget_max },
      intensity: c.intensity as any,
      sillage: c.sillage as any,
      freshness: c.freshness,
      warmth: c.warmth,
      sweetness: c.sweetness,
      longevity: c.longevity,
      style: null,
      relativePrice: null,
      isSimilarityRequest: Boolean(c.active_reference_perfume),
    };
    bgCtx = {
      referencePerfume: c.active_reference_perfume,
      usualFragrances: bg?.usual_fragrances || [],
      persistentExclusions: bg?.persistent_exclusions || { notes: [], families: [] },
    };
  } else {
    activeReq = {
      gender: stateOrPrefs.gender,
      occasion: stateOrPrefs.occasion,
      season: stateOrPrefs.season,
      families: stateOrPrefs.fragrance_families || [],
      preferredNotes: stateOrPrefs.preferred_notes || [],
      excludedNotes: stateOrPrefs.avoid_notes || [],
      excludedFamilies: stateOrPrefs.avoid_families || [],
      budget: { min: stateOrPrefs.budget_min, max: stateOrPrefs.budget_max },
      intensity: stateOrPrefs.intensity as any,
      sillage: (stateOrPrefs.projection || stateOrPrefs.sillage) as any,
      freshness: stateOrPrefs.freshness,
      warmth: stateOrPrefs.warmth,
      sweetness: stateOrPrefs.sweetness,
      longevity: stateOrPrefs.longevity,
      style: null,
      relativePrice: null,
      isSimilarityRequest: Boolean(stateOrPrefs.active_reference_perfume),
    };
    bgCtx = {
      referencePerfume: stateOrPrefs.active_reference_perfume,
      usualFragrances: stateOrPrefs.reference_fragrances || [],
      persistentExclusions: {
        notes: stateOrPrefs.avoid_notes || [],
        families: stateOrPrefs.avoid_families || [],
      },
    };
  }

  const allExcludedFamilies = Array.from(
    new Set([
      ...(bgCtx.persistentExclusions.families || []),
      ...(activeReq.excludedFamilies || []),
    ])
  );
  const allExcludedNotes = Array.from(
    new Set([
      ...(bgCtx.persistentExclusions.notes || []),
      ...(activeReq.excludedNotes || []),
    ])
  );

  const isAlternativeIntent =
    ('intent' in stateOrPrefs && stateOrPrefs.intent === 'SHOW_ALTERNATIVES') ||
    ('lastIntent' in stateOrPrefs && stateOrPrefs.lastIntent === 'SHOW_ALTERNATIVES') ||
    queryText.toLowerCase().includes('boring') ||
    queryText.toLowerCase().includes('more interesting');

  const lastRecIds =
    ('lastRecommendationIds' in stateOrPrefs && Array.isArray(stateOrPrefs.lastRecommendationIds)
      ? stateOrPrefs.lastRecommendationIds
      : shownIds.slice(-3));

  const structured: StructuredPreferences = {
    rawQuery: queryText || '',
    exclusions: {
      fragranceFamilies: allExcludedFamilies as FragranceFamily[],
      notes: allExcludedNotes,
    },
    vibes: activeReq.style ? [activeReq.style] : [],
    relativePrice: activeReq.relativePrice,
    lastRecommendedPrices: prices,
    excludedProductIds: isAlternativeIntent ? lastRecIds : [],
  };

  // Hard Budget Constraint
  if (activeReq.budget.max !== null && activeReq.budget.max !== undefined) {
    structured.budget = {
      min: activeReq.budget.min || undefined,
      max: activeReq.budget.max,
    };
  }

  // Occasion
  if (activeReq.occasion) {
    const occ = activeReq.occasion.toLowerCase().replace(/\s+/g, '-') as Occasion;
    structured.occasion = [occ];
  }

  // Season
  if (activeReq.season) {
    structured.season = [activeReq.season.toLowerCase() as Season];
  }

  // Gender
  if (activeReq.gender) {
    structured.gender = activeReq.gender.toLowerCase() as Gender;
    structured.category = structured.gender;
  }

  // Fragrance Families
  if (activeReq.families && activeReq.families.length > 0) {
    structured.fragranceFamilies = activeReq.families.map((f) => f.toLowerCase() as FragranceFamily);
  }

  // Notes
  if (activeReq.preferredNotes && activeReq.preferredNotes.length > 0) {
    structured.notes = activeReq.preferredNotes;
  }

  // Nuances
  if (activeReq.warmth) {
    structured.warmth = activeReq.warmth;
  }
  if (activeReq.warmthMax || bgCtx.persistentExclusions.warmth_cap) {
    structured.warmthMax = activeReq.warmthMax || bgCtx.persistentExclusions.warmth_cap;
  }
  if (activeReq.freshness) {
    structured.freshness = activeReq.freshness;
  }
  if (activeReq.sweetness) {
    structured.sweetness = activeReq.sweetness;
  }

  // Sillage / Loudness & Cap
  const sMax = activeReq.sillageMax || bgCtx.persistentExclusions.sillage_cap;
  if (sMax) {
    structured.sillageMax = sMax;
    structured.exclusions = {
      ...structured.exclusions,
      sillage: ['enormous', 'strong'],
    };
  }
  if (activeReq.sillage) {
    structured.sillagePreference = activeReq.sillage as any;
  }

  // Intensity & Cap
  if (bgCtx.persistentExclusions.intensity_cap) {
    structured.intensityMax = bgCtx.persistentExclusions.intensity_cap;
    structured.exclusions = {
      ...structured.exclusions,
      intensity: ['strong', 'beast-mode'],
    };
  }

  if (activeReq.intensity) {
    const int = activeReq.intensity.toLowerCase();
    if (int.includes('strong') || int.includes('beast') || int.includes('powerful')) {
      structured.intensity = 'strong';
      structured.intensityPreference = 'strong';
    } else if (int.includes('subtle') || int.includes('light')) {
      structured.intensity = 'subtle';
      structured.intensityPreference = 'subtle';
      structured.intensityMax = 'moderate';
      structured.exclusions = {
        ...structured.exclusions,
        intensity: ['strong', 'beast-mode'],
      };
    } else {
      structured.intensity = 'moderate';
      structured.intensityPreference = 'moderate';
    }
  }

  // Longevity
  if (activeReq.longevity) {
    structured.longevity = activeReq.longevity as any;
    structured.longevityPreference = activeReq.longevity as any;
  }

  // Reference similarity (ONLY activated when similarity is requested)
  const isSimReq = Boolean(
    activeReq.isSimilarityRequest ||
    ('intent' in stateOrPrefs && stateOrPrefs.intent === 'SIMILAR_TO_REFERENCE') ||
    ('lastIntent' in stateOrPrefs && stateOrPrefs.lastIntent === 'SIMILAR_TO_REFERENCE') ||
    /\b(similar(\s+to)?|something\s+like|dupe|clone|alternative\s+to)\b/i.test(queryText)
  );

  if (isSimReq) {
    structured.isSimilarityRequest = true;
  }
  if (isSimReq && bgCtx.referencePerfume) {
    structured.referencePerfumes = [bgCtx.referencePerfume];
    structured.similarTo = [bgCtx.referencePerfume];
  }

  if (activeReq.formatPreference) {
    structured.formatPreference = activeReq.formatPreference;
  }
  if (activeReq.explorationIntent) {
    structured.explorationIntent = activeReq.explorationIntent;
  }
  if (activeReq.experienceLevel) {
    structured.experienceLevel = activeReq.experienceLevel;
  }
  structured.travelIntent = Boolean(activeReq.travelIntent);
  structured.giftingIntent = Boolean(activeReq.giftingIntent);
  structured.scentiraDecantOnly = Boolean(activeReq.scentiraDecantOnly);
  structured.requestedSizeMl = activeReq.requestedSizeMl ?? null;

  return structured;
}

import { Product, RecommendationResult, FragranceFamily, Occasion, Season, Gender, Longevity, Intensity, StructuredPreferences } from './product';

export type CanonicalIntent =
  | 'GREETING'
  | 'IDENTITY'
  | 'CAPABILITY'
  | 'RECOMMENDATION'
  | 'REFINE_RECOMMENDATION'
  | 'PRODUCT_INFO'
  | 'COMPARE_PRODUCTS'
  | 'SIMILAR_TO_REFERENCE'
  | 'SHOW_ALTERNATIVES'
  | 'BUDGET_CHANGE'
  | 'PREFERENCE_UPDATE'
  | 'RESET_CONSULTATION'
  | 'OUT_OF_SCOPE'
  | 'CLARIFICATION'
  | 'GENERAL_CONVERSATION'
  | 'BRAND_CONVERSATION'
  | 'CUSTOMER_OBJECTION'
  | 'PURCHASE_ASSISTANCE';

export type UserIntent =
  | CanonicalIntent
  | 'greeting'
  | 'assistant_identity'
  | 'capabilities'
  | 'recommendation'
  | 'surprise_me'
  | 'product_search'
  | 'product_question'
  | 'product_comparison'
  | 'similar_fragrance'
  | 'preference_update'
  | 'follow_up'
  | 'clarification_needed'
  | 'goodbye'
  | 'unsupported_request';

export interface ActiveRequest {
  gender: string | null;
  occasion: string | null;
  season: string | null;
  families: string[];
  preferredNotes: string[];
  excludedNotes: string[];
  excludedFamilies: string[];
  budget: {
    min: number | null;
    max: number | null;
  };
  intensity: 'subtle' | 'moderate' | 'strong' | null;
  sillage: 'intimate' | 'moderate' | 'strong' | null;
  sillageMax?: 'intimate' | 'moderate' | null;
  freshness: 'fresher' | null;
  warmth: 'cooler' | 'warmer' | 'moderate-warm' | null;
  warmthMax?: 'neutral' | 'warm' | null;
  sweetness: 'sweeter' | null;
  longevity: string | null;
  style: string | null;
  relativePrice: 'cheaper' | null;
  isSimilarityRequest?: boolean;
}

export interface BackgroundContext {
  referencePerfume: string | null;
  usualFragrances: string[];
  persistentExclusions: {
    notes: string[];
    families: string[];
    intensity_cap?: 'subtle' | 'moderate' | null;
    sillage_cap?: 'intimate' | 'moderate' | null;
    warmth_cap?: 'neutral' | 'warm' | null;
  };
}

export interface ActiveConsultation {
  occasion: string | null;
  season: string | null;
  gender: string | null;
  fragrance_families: string[];
  preferred_notes: string[];
  intensity: string | null; // e.g. 'subtle', 'moderate', 'strong'
  sillage: string | null;
  longevity: string | null;
  budget_max: number | null;
  budget_min: number | null;
  warmth: 'cooler' | 'warmer' | 'moderate-warm' | null;
  freshness: 'fresher' | null;
  sweetness: 'sweeter' | null;
  active_reference_perfume: string | null;
}

export interface BackgroundPreferences {
  usual_fragrances: string[];
  persistent_exclusions: {
    notes: string[];
    families: string[];
    intensity_cap?: 'subtle' | 'moderate' | null;
  };
}

export interface ConversationPreferences extends ActiveConsultation {
  avoid_notes: string[];
  avoid_families: string[];
  projection: string | null;
  reference_fragrances: string[];
  target_products?: string[];
}

export interface ConversationState {
  intent?: CanonicalIntent;
  activeRequest: ActiveRequest;
  backgroundContext: BackgroundContext;
  shownProductIds: string[];
  lastRecommendationIds: string[];
  currentConsultation: ActiveConsultation;
  backgroundPreferences: BackgroundPreferences;
  preferences: ConversationPreferences;
  previously_discussed_products: string[];
  lastIntent?: UserIntent;
  turnCount: number;
  pendingClarification?: {
    originalQuery: string;
    ambiguousTerm?: string;
    question?: string;
  } | null;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatApiRequest {
  message: string;
  brandSlug: string;
  conversationState?: ConversationState;
  history?: ChatMessage[];
  contextProductSlug?: string;
  isAlternativeRequest?: boolean;
}

export interface PreferenceUpdateItem {
  field:
    | 'budget.max'
    | 'budget.min'
    | 'remove_budget'
    | 'fragrance_families'
    | 'preferred_notes'
    | 'occasion'
    | 'season'
    | 'gender'
    | 'intensity'
    | 'sillage'
    | 'longevity'
    | 'warmth'
    | 'warmthMax'
    | 'freshness'
    | 'sweetness'
    | 'excluded_notes'
    | 'excluded_families'
    | 'reference_perfume'
    | 'relative_price'
    | 'style'
    | 'sillageMax';
  operation: 'SET' | 'UPDATE' | 'REMOVE' | 'ADD' | 'REPLACE';
  value?: any;
}

export interface ConsultationDebugInfo {
  userMessage?: string;
  intent: UserIntent;
  isNewRequest: boolean;
  isRefinement: boolean;
  stateBefore?: any;
  stateDelta?: any;
  parsedUpdates?: PreferenceUpdateItem[];
  stateAfter?: any;
  hardConstraints: {
    budget_max: number | null;
    excluded_notes: string[];
    excluded_families: string[];
    intensity_cap?: string | null;
    excluded_products: string[];
    relative_price?: string | null;
  };
  exclusions: {
    notes: string[];
    families: string[];
    intensity_cap?: string | null;
  };
  referencePerfume: string | null;
  productRetrievalCalled: boolean;
  filteredProductCount: number;
  candidatesBeforeFilter?: string[];
  candidatesRemoved?: { id: string; name: string; reason: string }[];
  validCandidates?: string[];
  finalRanking?: { id: string; name: string; score: number; rank?: number }[];
  canonicalProductIds?: string[];
  llmProductIds?: string[];
  uiProductIds?: string[];
  previousProductIds?: string[];
  temporaryExcludedProductIds?: string[];
  candidatesAfterHardFilter?: string[];
  status?: string;
  rankedProductIds: string[];
  matchReasons: string[];
  finalProductIdsSentToLLM: string[];
  finalProductIdsSentToUI: string[];

  // Compatibility fields
  request_type?: 'new_consultation' | 'refinement' | 'other';
  requiresProductData?: boolean;
  productRetrievalStatus?: 'CALLED' | 'SKIPPED' | 'FAILED';
  recommendationEngineStatus?: 'CALLED' | 'SKIPPED';
  updates?: PreferenceUpdateItem[];
  currentConsultation?: ActiveConsultation;
  backgroundPreferences?: BackgroundPreferences;
  positivePreferences?: {
    families: string[];
    notes: string[];
    occasion: string | null;
    season: string | null;
    intensity: string | null;
    reference: string | null;
  };
  totalCatalogueCount?: number;
  filteredCount?: number;
  rankedCount?: number;
  topScore?: number | null;
  topProduct?: {
    name: string;
    score: number;
    price: number;
    whySelected: string;
  };
  hasContradiction?: boolean;
  hardConstraintFailed?: boolean;
  notes?: string;
}

export interface ChatApiResponse {
  reply: string;
  messages?: string[];
  intent: UserIntent;
  results: RecommendationResult[];
  updatedState: ConversationState;
  needsRecommendations: boolean;
  suggestedFollowUps?: string[];
  suggestedChips?: string[];
  debugInfo?: ConsultationDebugInfo;
  isPartialMatch?: boolean;
  unmetPreferences?: string[];
  matchedPreferences?: string[];
  tradeOff?: string;
}

export interface Stage1IntentOutput {
  intent: UserIntent;
  request_type: 'new_consultation' | 'refinement' | 'other';
  is_new_request?: boolean;
  is_refinement?: boolean;
  updates?: PreferenceUpdateItem[];
  requires_product_data?: boolean;
  gender?: string | null;
  occasion?: string | null;
  budget?: { min: number | null; max: number | null };
  remove_budget?: boolean;
  relative_price?: 'cheaper' | null;
  fragrance_families: string[];
  preferred_notes: string[];
  excluded_notes: string[];
  excluded_families: string[];
  intensity?: string | null;
  sillage?: string | null;
  sillageMax?: 'intimate' | 'moderate' | null;
  longevity?: string | null;
  season?: string | null;
  style?: string | null;
  reference_perfume?: string | null;
  is_similarity_request?: boolean;
  warmth?: 'cooler' | 'warmer' | 'moderate-warm' | null;
  warmthMax?: 'neutral' | 'warm' | null;
  freshness?: 'fresher' | null;
  sweetness?: 'sweeter' | null;
  requested_changes?: string[];
  target_product_names?: string[];
  needs_recommendations: boolean;
  needs_clarification: boolean;
  clarification_reason?: string | null;
  clarification_question?: string | null;
  ambiguous_term?: string | null;
  suggested_interpretations?: string[];
  has_contradiction?: boolean;
  contradiction_details?: string | null;
  out_of_scope_answer?: string | null;
  suggested_chips?: string[];
  preferences: Partial<ConversationPreferences>;
  is_surprise_me?: boolean;
}

export interface GroundedProductContext {
  id: string;
  name: string;
  price: number;
  size: string;
  gender: string;
  fragrance_family: string[];
  notes: {
    top: string[];
    heart: string[];
    base: string[];
    all: string[];
  };
  occasion: string[];
  season: string[];
  intensity: string | null;
  projection: string | null;
  longevity: string | null;
  character: string | null;
  inspired_by: string[];
  description: string;
  tags: string[];
}


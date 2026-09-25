import { Product, RecommendationResult, FragranceFamily, Occasion, Season, Gender, Longevity, Intensity, StructuredPreferences, FormatIntent, ExplorationIntent, ExperienceLevel } from './product';

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
  | 'PURCHASE_ASSISTANCE'
  | 'CART_ASSISTANCE'
  | 'FRAGRANCE_DISCOVERY'
  | 'FRAGRANCE_REFINEMENT'
  | 'PRODUCT_INFORMATION'
  | 'PRODUCT_COMPARISON'
  | 'ALTERNATIVES'
  | 'WEBSITE_ASSISTANCE'
  | 'COMPETITOR_DISCUSSION';

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
  | 'unsupported_request'
  | 'cart_action'
  | 'purchase_intent';

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
  formatPreference?: FormatIntent | null;
  explorationIntent?: ExplorationIntent;
  experienceLevel?: ExperienceLevel;
  travelIntent?: boolean;
  giftingIntent?: boolean;
  scentiraDecantOnly?: boolean;
  requestedSizeMl?: 5 | 10 | 20 | null;
  scentiraExcludedFormats?: Array<'full-size' | 'decant'>;
  scentiraExcludedSizeMl?: number[];
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

export interface CanonicalProductRef {
  productId: string;
  brandSlug: string;
  name: string;
}

export interface PendingCartAction {
  type: 'CLEAR_CART';
  brandSlug: string;
  items: {
    productId: string;
    brandSlug: string;
    name: string;
    unitPrice: number;
    quantity: number;
  }[];
  itemCount: number;
  subtotal: number;
  subtotalFormatted: string;
}

export interface ConversationState {
  intent?: CanonicalIntent;
  activeRequest: ActiveRequest;
  backgroundContext: BackgroundContext;
  shownProductIds: string[];
  lastRecommendationIds: string[];
  lastCanonicalProductSet?: CanonicalProductRef[];
  lastDiscussedProductSet?: CanonicalProductRef[];
  lastSelectedProductSet?: CanonicalProductRef[];
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
  pendingCartAction?: PendingCartAction | null;
  /** True only after a GREETING turn. The next discovery query starts a new consultation. */
  lastTurnWasGreeting?: boolean;
  /** Most recently introduced preference, used by "forget that". */
  lastPreferenceChange?: {
    kind: 'family' | 'budget' | 'occasion' | 'reference' | 'freshness' | 'note' | 'format';
    value: string;
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
  sessionId?: string;
  resetSession?: boolean;
  contextProductSlug?: string;
  isAlternativeRequest?: boolean;
  cart?: {
    items: { productId: string; brandSlug?: string; quantity: number }[];
    itemCount: number;
    subtotal?: number;
  };
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
    | 'sillageMax'
    | 'format_preference'
    | 'exploration_intent';
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

export interface CartActionItem {
  productId: string;
  brandSlug: string;
  productName: string;
  quantity?: number;
  unitPrice?: number;
}

export interface CartActionFailure {
  reference: string;
  reason: string;
}

export interface CartActionPayload {
  action: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART' | 'CLEAR_CART';
  productId?: string;
  brandSlug?: string;
  productName?: string;
  quantity?: number;
  success: boolean;
  message?: string;
  items?: CartActionItem[];
  added?: CartActionItem[];
  removed?: CartActionItem[];
  failed?: CartActionFailure[];
  needsClarification?: boolean;
  clearedCount?: number;
  awaitingConfirmation?: boolean;
  actionId?: string;
  requestedQuantity?: number;
  availableQuantity?: number;
}

export interface ChatApiResponse {
  reply: string;
  messages?: string[];
  intent: UserIntent;
  results: RecommendationResult[];
  updatedState: ConversationState;
  sessionId?: string;
  needsRecommendations: boolean;
  suggestedFollowUps?: string[];
  suggestedChips?: string[];
  debugInfo?: ConsultationDebugInfo;
  isPartialMatch?: boolean;
  unmetPreferences?: string[];
  matchedPreferences?: string[];
  tradeOff?: string;
  cartAction?: CartActionPayload;
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
  product_reference?: string | null;
  product_references?: string[];
  cart_action?: 'ADD_TO_CART' | 'REMOVE_FROM_CART' | 'VIEW_CART' | 'CLEAR_CART' | null;
  cart_confirmation?: 'CONFIRM' | 'CANCEL' | null;
  confidence?: number;
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
  is_discovery_start?: boolean;
  is_broad_recommendation?: boolean;
  format_preference?: FormatIntent | null;
  exploration_intent?: ExplorationIntent;
  experience_level?: ExperienceLevel;
  travel_intent?: boolean;
  gifting_intent?: boolean;
  scentira_decant_only?: boolean;
  requested_size_ml?: 5 | 10 | 20 | null;
  scentira_excluded_formats?: Array<'full-size' | 'decant'>;
  scentira_excluded_size_ml?: number[];
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
  format?: string | null;
  house_brand?: string | null;
  original_price?: number | null;
  concentration?: string | null;
}


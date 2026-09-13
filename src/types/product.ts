export type FragranceFamily = 
  | 'fresh' 
  | 'sweet' 
  | 'woody' 
  | 'oud' 
  | 'floral' 
  | 'citrus' 
  | 'spicy' 
  | 'aquatic' 
  | 'musky' 
  | 'oriental'
  | 'aromatic'
  | 'gourmand';

export type Occasion = 
  | 'date-night' 
  | 'office' 
  | 'casual' 
  | 'party' 
  | 'wedding' 
  | 'daily' 
  | 'evening' 
  | 'formal'
  | 'travel'
  | 'gym';

export type Season = 'summer' | 'winter' | 'spring' | 'autumn' | 'all-season';
export type Gender = 'men' | 'women' | 'unisex';
export type Longevity = 'light' | 'moderate' | 'long-lasting' | 'beast-mode';
export type Intensity = 'subtle' | 'moderate' | 'strong' | 'projection-beast';

export type MatchTier = 'Best Match' | 'Great Match' | 'Good Option' | 'Alternative' | 'Spotlight' | 'Comparison Candidate';

export interface Product {
  id: string;
  slug: string;
  brandSlug: string;
  name: string;
  price: number;
  size: string;
  fragranceFamily: FragranceFamily[];
  topNotes: string[];
  heartNotes: string[];
  baseNotes: string[];
  occasion: Occasion[];
  season: Season[];
  gender: Gender;
  longevity: Longevity;
  intensity: Intensity;
  sillage?: 'intimate' | 'moderate' | 'strong' | 'enormous' | null;
  projection?: 'intimate' | 'moderate' | 'strong' | 'enormous' | null;
  sweetness?: 'none' | 'subtle' | 'moderate' | 'sweet' | 'very-sweet';
  freshness?: 'none' | 'subtle' | 'moderate' | 'fresh' | 'very-fresh';
  warmth?: 'cool' | 'neutral' | 'warm' | 'very-warm';
  oudLevel?: 'none' | 'trace' | 'moderate' | 'dominant';
  woodyLevel?: 'none' | 'subtle' | 'moderate' | 'dominant';
  spicyLevel?: 'none' | 'subtle' | 'moderate' | 'dominant';
  availability?: 'in-stock' | 'low-stock' | 'out-of-stock';
  character?: string | null;
  tags: string[];
  description: string;
  bestFor: string[];
  similarTo: string[];
  featured?: boolean;
}

export interface Exclusions {
  fragranceFamilies?: FragranceFamily[];
  notes?: string[];
  intensity?: ('strong' | 'subtle' | 'beast-mode')[];
  sillage?: ('intimate' | 'moderate' | 'strong' | 'enormous')[];
  gender?: Gender[];
  tags?: string[];
}

export interface StructuredPreferences {
  budget?: { min?: number; max?: number };
  occasion?: Occasion[];
  category?: Gender;
  gender?: Gender;
  fragranceFamilies?: FragranceFamily[];
  fragranceFamily?: FragranceFamily[];
  notes?: string[];
  seasons?: Season[];
  season?: Season[];
  longevityPreference?: Longevity;
  longevity?: Longevity;
  intensityPreference?: 'subtle' | 'moderate' | 'strong';
  intensity?: 'subtle' | 'moderate' | 'strong';
  intensityMax?: 'subtle' | 'moderate' | null;
  sillagePreference?: 'intimate' | 'moderate' | 'strong';
  sillageMax?: 'intimate' | 'moderate' | null;
  referencePerfumes?: string[];
  similarTo?: string[];
  isSimilarityRequest?: boolean;
  warmth?: 'cooler' | 'warmer' | 'moderate-warm' | null;
  warmthMax?: 'neutral' | 'warm' | null;
  freshness?: 'fresher' | null;
  sweetness?: 'sweeter' | null;
  relativePrice?: 'cheaper' | null;
  lastRecommendedPrices?: number[];
  excludedProductIds?: string[];
  exclusions?: Exclusions;
  vibes?: string[];
  rawQuery?: string;
}

export interface MatchReasonDetail {
  category: 'Occasion' | 'Budget' | 'Profile' | 'Performance' | 'Inspiration';
  text: string;
}

export interface MatchReason {
  type: 'budget' | 'occasion' | 'fragrance-family' | 'notes' | 'season' | 'similar' | 'gender' | 'longevity' | 'intensity' | 'tag' | 'exclusion-penalty';
  label: string;
  score: number;
}

export interface RecommendationResult {
  product: Product;
  score: number;
  matchTier: MatchTier;
  matchReasons: MatchReason[];
  detailedReasons: MatchReasonDetail[];
  explanation: string;
}

export interface RankedProductResult {
  productId: string;
  product: Product;
  rank: number;
  score: number;
  matchTier: MatchTier;
  matchReasons: MatchReason[];
  detailedReasons: MatchReasonDetail[];
  explanation: string;
}

export interface CanonicalRecommendationResult {
  recommendation_id?: string;
  intent?: string;
  status?: 'SUCCESS' | 'NO_VALID_MATCH' | 'NO_ALTERNATIVES';
  reason?: string;
  failed_constraints?: string[];
  type: 'recommendation' | 'product_info' | 'compare_products' | 'none';
  products: RankedProductResult[];
  appliedConstraints: string[];
  excludedConstraints: string[];
  compromises: string[];
  hardConstraintFailed: boolean;
  active_state?: any;
  hard_constraints?: any;
}

export interface ParsedQuery extends StructuredPreferences {
  rawQuery: string;
}



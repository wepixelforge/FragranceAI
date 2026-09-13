import {
  Product,
  StructuredPreferences,
  RecommendationResult,
  RankedProductResult,
  CanonicalRecommendationResult,
  MatchReason,
  MatchReasonDetail,
  MatchTier,
} from '@/types/product';
import { parseQuery } from './query-parser';
import { enrichProduct } from './product-enricher';

/**
 * Score weights for deterministic soft ranking.
 */
const WEIGHTS = {
  referencePerfume: 60,
  fragranceFamily: 35,
  multiFamilyBonus: 20,
  occasion: 25,
  notes: 20,
  season: 15,
  gender: 15,
  intensity: 30,
  longevity: 15,
  warmth: 35,
  freshness: 25,
  sweetness: 20,
  budgetComfortBonus: 10,
  relativeCheaperBonus: 25,
};

export interface RemovedCandidateDetail {
  id: string;
  name: string;
  reason: string;
}

export interface RecommendationEngineResponse {
  results: RecommendationResult[];
  canonicalResult: CanonicalRecommendationResult;
  parsed: StructuredPreferences;
  hardConstraintFailed: boolean;
  failedConstraints?: string[];
  candidatesBeforeFilter: string[];
  candidatesRemoved: RemovedCandidateDetail[];
  validCandidates: string[];
  filteredCount: number;
  totalCatalogueCount: number;
  topScore: number | null;
}

/**
 * Product Validation Function (Section 5)
 * Verifies that a product satisfies all hard constraints before it can enter canonical_products:
 * - Explicitly excluded products (e.g. from "show me something else")
 * - Budget (min and max)
 * - Relative price (strictly cheaper than previous prices)
 * - Excluded notes (oud, agarwood, etc.)
 * - Excluded families (sweet, gourmand, etc.)
 * - Intensity cap (when subtle / not strong requested)
 * - Minimum intensity (when user requested strong / stronger)
 * - Excluded gender
 */
export function isValidCandidate(
  product: Product,
  preferences: StructuredPreferences,
  options?: {
    excludeProductIds?: string[];
    relativePriceCap?: number | null;
    ignoreExcludedProductIds?: boolean;
  }
): { valid: boolean; reason?: string } {
  const exclusions = preferences.exclusions || {};

  // 1. Explicitly Excluded Product IDs (e.g. from "Show me something else")
  if (!options?.ignoreExcludedProductIds) {
    if (
      options?.excludeProductIds?.includes(product.id) ||
      (preferences.excludedProductIds && preferences.excludedProductIds.includes(product.id))
    ) {
      return { valid: false, reason: 'Previously shown or explicitly excluded' };
    }
  }

  // 2. Hard Budget Constraint (Every recommended product MUST be <= budget_max)
  if (preferences.budget?.max !== undefined && preferences.budget.max !== null) {
    if (product.price > preferences.budget.max) {
      return { valid: false, reason: `Price ₹${product.price} exceeds budget ₹${preferences.budget.max}` };
    }
  }
  if (preferences.budget?.min !== undefined && preferences.budget.min !== null) {
    if (product.price < preferences.budget.min) {
      return { valid: false, reason: `Price ₹${product.price} below min budget ₹${preferences.budget.min}` };
    }
  }

  // 3. Relative Price Hard Constraint (If strictly cheaper options exist)
  if (options?.relativePriceCap !== null && options?.relativePriceCap !== undefined) {
    if (product.price >= options.relativePriceCap) {
      return { valid: false, reason: `Price ₹${product.price} is not strictly cheaper than previous ₹${options.relativePriceCap}` };
    }
  }

  // 4. Hard Excluded Notes Constraint (e.g. "I hate oud", "no vanilla")
  if (exclusions.notes && exclusions.notes.length > 0) {
    const allProductNoteTokens = [
      ...product.topNotes,
      ...product.heartNotes,
      ...product.baseNotes,
      product.name,
      product.description,
      ...product.tags,
    ].map((n) => n.toLowerCase());

    for (const excluded of exclusions.notes) {
      const target = excluded.toLowerCase().trim();
      if (!target) continue;
      if (target === 'oud' && (product.oudLevel !== 'none' || product.fragranceFamily.includes('oud'))) {
        return { valid: false, reason: `Contains excluded note: oud (level: ${product.oudLevel})` };
      }
      if (allProductNoteTokens.some((token) => token.includes(target))) {
        return { valid: false, reason: `Contains excluded note: ${target}` };
      }
    }
  }

  // 5. Hard Excluded Families Constraint (e.g. "I don't like sweet perfumes")
  if (exclusions.fragranceFamilies && exclusions.fragranceFamilies.length > 0) {
    for (const fam of exclusions.fragranceFamilies) {
      const target = fam.toLowerCase().trim();
      if (!target) continue;

      // Direct family match
      if (product.fragranceFamily.some((f) => f.toLowerCase() === target)) {
        return { valid: false, reason: `Belongs to excluded family: ${target}` };
      }

      // Special handling for sweet/gourmand exclusions
      if (target === 'sweet' || target === 'gourmand') {
        if (product.sweetness === 'sweet' || product.sweetness === 'very-sweet') {
          return { valid: false, reason: `Excluded sweet profile (sweetness: ${product.sweetness})` };
        }
        if (product.fragranceFamily.includes('sweet') || product.fragranceFamily.includes('gourmand')) {
          return { valid: false, reason: `Excluded fragrance family: ${target}` };
        }
        const lowerTags = product.tags.map((t) => t.toLowerCase());
        if (
          lowerTags.includes('sweet') ||
          lowerTags.includes('gourmand') ||
          lowerTags.includes('sugar') ||
          lowerTags.includes('sugary')
        ) {
          return { valid: false, reason: `Tagged with excluded sweet profile` };
        }
      }

      // Special handling for oud family exclusion
      if (target === 'oud') {
        if (product.oudLevel !== 'none' || product.fragranceFamily.includes('oud')) {
          return { valid: false, reason: `Excluded oud family profile` };
        }
      }
    }
  }

  // 6. Hard Intensity Cap (e.g. "not too strong", "subtle")
  if (
    preferences.intensityMax === 'moderate' ||
    preferences.intensity === 'subtle' ||
    exclusions.intensity?.includes('strong')
  ) {
    if (
      product.intensity === 'strong' ||
      product.intensity === 'projection-beast' ||
      product.longevity === 'beast-mode'
    ) {
      return { valid: false, reason: `Exceeds max intensity cap (${product.intensity})` };
    }
  }

  // 7. Hard Sillage Cap (e.g. "not loud", "controlled projection", "doesn't fill the room")
  if (
    preferences.sillageMax === 'moderate' ||
    preferences.sillageMax === 'intimate' ||
    exclusions.sillage?.includes('enormous') ||
    exclusions.sillage?.includes('strong')
  ) {
    const beastProxy =
      (product.intensity === 'projection-beast')
        ? 'enormous'
        : (product.intensity === 'strong' && product.longevity === 'beast-mode')
        ? 'strong'
        : 'moderate';
    const effectiveSillage = product.sillage || product.projection || beastProxy;
    const effectiveProjection = product.projection || product.sillage || beastProxy;

    if (
      preferences.sillageMax === 'moderate' ||
      exclusions.sillage?.includes('strong')
    ) {
      if (
        effectiveSillage === 'strong' ||
        effectiveSillage === 'enormous' ||
        effectiveProjection === 'strong' ||
        effectiveProjection === 'enormous'
      ) {
        return {
          valid: false,
          reason: `Exceeds max sillage / projection cap (${effectiveSillage} / ${effectiveProjection} exceeds moderate)`,
        };
      }
    } else if (preferences.sillageMax === 'intimate') {
      if (effectiveSillage !== 'intimate' || effectiveProjection !== 'intimate') {
        return {
          valid: false,
          reason: `Exceeds intimate sillage / projection cap (${effectiveSillage} / ${effectiveProjection})`,
        };
      }
    }
  }

  // 8. Hard Warmth Cap (e.g. "not too warm")
  if (preferences.warmthMax === 'warm') {
    if (product.warmth === 'very-warm') {
      return { valid: false, reason: `Exceeds max warmth cap (${product.warmth} exceeds warm)` };
    }
  } else if (preferences.warmthMax === 'neutral') {
    if (product.warmth === 'warm' || product.warmth === 'very-warm') {
      return { valid: false, reason: `Exceeds neutral warmth cap (${product.warmth})` };
    }
  }

  // 9. Excluded Gender
  if (exclusions.gender && exclusions.gender.length > 0) {
    if (exclusions.gender.includes(product.gender)) {
      return { valid: false, reason: `Excluded gender: ${product.gender}` };
    }
  }

  // 10. Required Strong Intensity
  if (preferences.intensity === 'strong') {
    if (product.intensity !== 'strong' && product.intensity !== 'projection-beast') {
      return { valid: false, reason: `Does not meet requested strong intensity requirement (is ${product.intensity})` };
    }
  }

  // 11. Required Fresh Profile
  const requiresFresh =
    preferences.freshness === 'fresher' ||
    preferences.fragranceFamilies?.some((f) => ['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase()));

  if (requiresFresh) {
    const isFreshProduct =
      product.fragranceFamily.some((f) => ['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase())) ||
      product.freshness === 'very-fresh' ||
      product.freshness === 'fresh' ||
      product.tags.some((t) => ['fresh', 'aquatic', 'citrus', 'marine', 'clean'].includes(t.toLowerCase()));

    if (!isFreshProduct) {
      return { valid: false, reason: `Does not meet requested fresh profile` };
    }
  }

  return { valid: true };
}

/**
 * Core Deterministic Recommendation Engine.
 * 
 * Pipeline:
 * 1. Hard Constraints Filter (Budget, Relative Cheaper, Negative notes, Negative families, Intensity cap, Excluded products).
 * 2. If 0 products pass hard constraints: Return empty with hardConstraintFailed = true. Never violate constraints.
 * 3. Deterministic Soft Ranking: Multi-dimensional scoring on remaining eligible candidates.
 * 4. Grounded Product Explanations: Factual sentences strictly derived from structured match reasons.
 * 5. Canonical Result Object: Single source of truth consumed identically by Groq and the UI.
 */
export function getRecommendations(
  input: string | StructuredPreferences,
  rawProducts: Product[],
  topN: number = 3,
  excludeProductIds: string[] = [],
  isSurpriseMe: boolean = false
): RecommendationEngineResponse {
  const preferences: StructuredPreferences =
    typeof input === 'string' ? parseQuery(input) : input || {};

  // Ensure all products have enriched nuance attributes
  const products = rawProducts.map(enrichProduct);
  const totalCatalogueCount = products.length;

  // ── SURPRISE ME DIVERSE SELECTION ──────────────────────────────────────────
  if (isSurpriseMe) {
    const candidateProducts = products.filter((p) => !excludeProductIds.includes(p.id));
    const freshPick = candidateProducts.find((p) =>
      p.fragranceFamily.includes('fresh') || p.fragranceFamily.includes('aquatic') || p.fragranceFamily.includes('citrus')
    );
    const woodyPick = candidateProducts.find((p) =>
      (p.fragranceFamily.includes('woody') || p.fragranceFamily.includes('spicy') || p.fragranceFamily.includes('oud')) &&
      p.id !== freshPick?.id
    );
    const sweetPick = candidateProducts.find((p) =>
      (p.fragranceFamily.includes('sweet') || p.fragranceFamily.includes('oriental') || p.fragranceFamily.includes('floral')) &&
      p.id !== freshPick?.id &&
      p.id !== woodyPick?.id
    );

    const surprisePicks = [freshPick, woodyPick, sweetPick].filter(Boolean) as Product[];
    const directions = ['Fresh Direction', 'Woody Direction', 'Sweet / Oriental Direction'];

    const surpriseResults: RecommendationResult[] = surprisePicks.map((product, idx) => {
      const dir = directions[idx] || 'Diverse Direction';
      return {
        product,
        score: 85 - idx * 5,
        matchTier: idx === 0 ? 'Best Match' : 'Good Option',
        matchReasons: [
          {
            type: 'tag',
            label: dir,
            score: 85 - idx * 5,
          },
        ],
        detailedReasons: [
          {
            category: 'Profile',
            text: `${dir}: ${product.fragranceFamily.join(' & ')} profile with ${product.topNotes.slice(0, 2).join(', ')}.`,
          },
          {
            category: 'Performance',
            text: `${product.intensity} intensity, ${product.longevity.replace('-', ' ')} longevity.`,
          },
          {
            category: 'Budget',
            text: `₹${product.price} (${product.size}).`,
          },
        ],
        explanation: `${product.name} represents our ${dir.toLowerCase()} (${product.fragranceFamily.join('/')}).`,
      };
    });

    const rankedProducts: RankedProductResult[] = surpriseResults.map((r, idx) => ({
      productId: r.product.id,
      product: r.product,
      rank: idx + 1,
      score: r.score,
      matchTier: r.matchTier,
      matchReasons: r.matchReasons,
      detailedReasons: r.detailedReasons,
      explanation: r.explanation,
    }));

    const canonicalResult: CanonicalRecommendationResult = {
      type: 'recommendation',
      products: rankedProducts,
      appliedConstraints: ['Diverse Discovery'],
      excludedConstraints: [],
      compromises: [],
      hardConstraintFailed: false,
    };

    return {
      results: surpriseResults,
      canonicalResult,
      parsed: preferences,
      hardConstraintFailed: false,
      candidatesBeforeFilter: products.map((p) => p.id),
      candidatesRemoved: [],
      validCandidates: surpriseResults.map((r) => r.product.id),
      filteredCount: surpriseResults.length,
      totalCatalogueCount,
      topScore: surpriseResults[0]?.score || null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 1: HARD CONSTRAINTS FILTER (APPLIED BEFORE RANKING)
  // ══════════════════════════════════════════════════════════════════════════
  const exclusions = preferences.exclusions || {};
  const appliedConstraints: string[] = [];
  const excludedConstraints: string[] = [];

  // Track applied constraints for canonical object
  if (preferences.budget?.max) {
    appliedConstraints.push(`Budget <= ₹${preferences.budget.max}`);
  }
  if (preferences.relativePrice === 'cheaper') {
    appliedConstraints.push('Relative price: cheaper');
  }
  if (exclusions.fragranceFamilies && exclusions.fragranceFamilies.length > 0) {
    excludedConstraints.push(...exclusions.fragranceFamilies.map((f) => `No ${f}`));
  }
  if (exclusions.notes && exclusions.notes.length > 0) {
    excludedConstraints.push(...exclusions.notes.map((n) => `No ${n}`));
  }
  if (preferences.intensityMax) {
    appliedConstraints.push(`Max intensity: ${preferences.intensityMax}`);
  }
  if (preferences.sillageMax) {
    appliedConstraints.push(`Max projection/sillage: ${preferences.sillageMax}`);
  }
  if (preferences.warmthMax) {
    appliedConstraints.push(`Max warmth: ${preferences.warmthMax}`);
  }
  if (preferences.intensity === 'strong') {
    appliedConstraints.push('Min intensity: strong');
  }

  // Calculate relative cheaper threshold if requested
  let relativePriceCap: number | null = null;
  if (preferences.relativePrice === 'cheaper' && preferences.lastRecommendedPrices && preferences.lastRecommendedPrices.length > 0) {
    // Strictly cheaper than the primary/lowest last recommended price
    relativePriceCap = Math.min(...preferences.lastRecommendedPrices);
    appliedConstraints.push(`Strictly cheaper (< ₹${relativePriceCap})`);
  }

  const candidatesBeforeFilter = products.map((p) => p.id);
  const candidatesRemoved: RemovedCandidateDetail[] = [];
  const validProducts: Product[] = [];

  for (const product of products) {
    const check = isValidCandidate(product, preferences, { excludeProductIds, relativePriceCap });
    if (check.valid) {
      validProducts.push(product);
    } else {
      candidatesRemoved.push({
        id: product.id,
        name: product.name,
        reason: check.reason || 'Failed hard constraints',
      });
    }
  }

  const validCandidates = validProducts.map((p) => p.id);
  const filteredCount = validProducts.length;

  // Check if failure is solely because all eligible options were already shown in this thread
  const totalExcludedIds = Array.from(
    new Set([...excludeProductIds, ...(preferences.excludedProductIds || [])])
  );

  const isAlternativesExhausted =
    totalExcludedIds.length > 0 &&
    products.some((product) => {
      const checkWithoutExclude = isValidCandidate(product, preferences, {
        excludeProductIds: [],
        ignoreExcludedProductIds: true,
        relativePriceCap,
      });
      return checkWithoutExclude.valid;
    });

  // Zero valid candidates handling:
  if (filteredCount === 0) {
    const failedConstraints = [...excludedConstraints, ...appliedConstraints];
    const status: 'NO_VALID_MATCH' | 'NO_ALTERNATIVES' = isAlternativesExhausted
      ? 'NO_ALTERNATIVES'
      : 'NO_VALID_MATCH';
    const reason = isAlternativesExhausted
      ? 'No additional products satisfy the current constraints.'
      : 'hard_constraints';

    const emptyCanonical: CanonicalRecommendationResult = {
      recommendation_id: `rec-${Date.now()}`,
      intent: isAlternativesExhausted ? 'SHOW_ALTERNATIVES' : 'RECOMMENDATION',
      status,
      reason,
      failed_constraints: isAlternativesExhausted
        ? ['No additional products satisfy the current constraints.']
        : failedConstraints,
      type: 'recommendation',
      products: [],
      appliedConstraints,
      excludedConstraints,
      compromises: [],
      hardConstraintFailed: true,
      hard_constraints: {
        budget_max: preferences.budget?.max ?? null,
        excluded_families: exclusions.fragranceFamilies || [],
        excluded_notes: exclusions.notes || [],
        intensity_cap: preferences.intensityMax || null,
        intensity_min: preferences.intensity === 'strong' ? 'strong' : null,
      },
    };

    return {
      results: [],
      canonicalResult: emptyCanonical,
      parsed: preferences,
      hardConstraintFailed: true,
      failedConstraints: emptyCanonical.failed_constraints || failedConstraints,
      candidatesBeforeFilter,
      candidatesRemoved,
      validCandidates: [],
      filteredCount: 0,
      totalCatalogueCount,
      topScore: null,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 2: DETERMINISTIC SOFT RANKING ON VALID CANDIDATES
  // ══════════════════════════════════════════════════════════════════════════
  const scored = validProducts.map((product) => scoreProduct(product, preferences));

  // Sort descending by score; tie-break on lower price if relative price is cheaper
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (preferences.relativePrice === 'cheaper') {
      return a.product.price - b.product.price;
    }
    return 0;
  });

  // Genuine relevance filter: If fragrance families are requested, the candidate MUST match family, occasion, or notes
  const hasFamilyFilter = preferences.fragranceFamilies && preferences.fragranceFamilies.length > 0;
  
  // Composition: If user positively requested strong intensity AND capped sillage/projection at moderate,
  // candidates must satisfy both the positive intensity and the negative sillage cap.
  // If zero candidates satisfy strong intensity + controlled sillage, trigger genuine NO_VALID_MATCH.
  const requiresStrongWithControlledSillage =
    preferences.intensity === 'strong' &&
    (preferences.sillageMax === 'moderate' || preferences.sillageMax === 'intimate');

  const eligibleScored = scored.filter((r) => {
    if (r.score < 10) return false;
    if (hasFamilyFilter) {
      const matchesFam = preferences.fragranceFamilies!.some((f) => r.product.fragranceFamily.includes(f));
      const matchesOcc = preferences.occasion && preferences.occasion.length > 0 && preferences.occasion.some((occ) => r.product.occasion.includes(occ));
      const matchesNote = preferences.notes && preferences.notes.length > 0 && r.matchReasons.some((m) => m.type === 'notes');
      if (!matchesFam && !matchesOcc && !matchesNote) {
        return false;
      }
    }
    if (requiresStrongWithControlledSillage) {
      const isStrong = r.product.intensity === 'strong' || r.product.intensity === 'projection-beast';
      if (!isStrong) return false;
    }
    return true;
  });

  if (eligibleScored.length === 0) {
    const failedConstraints = [...excludedConstraints, ...appliedConstraints];
    if (requiresStrongWithControlledSillage) {
      failedConstraints.push('Strong intensity with controlled projection (not loud)');
    }
    const status: 'NO_VALID_MATCH' | 'NO_ALTERNATIVES' = isAlternativesExhausted
      ? 'NO_ALTERNATIVES'
      : 'NO_VALID_MATCH';
    const reason = isAlternativesExhausted
      ? 'No additional products satisfy the current constraints.'
      : 'relevance_threshold';

    const emptyCanonical: CanonicalRecommendationResult = {
      recommendation_id: `rec-${Date.now()}`,
      intent: isAlternativesExhausted ? 'SHOW_ALTERNATIVES' : 'RECOMMENDATION',
      status,
      reason,
      failed_constraints: isAlternativesExhausted
        ? ['No additional products satisfy the current constraints.']
        : failedConstraints,
      type: 'recommendation',
      products: [],
      appliedConstraints,
      excludedConstraints,
      compromises: [],
      hardConstraintFailed: true,
      hard_constraints: {
        budget_max: preferences.budget?.max ?? null,
        excluded_families: exclusions.fragranceFamilies || [],
        excluded_notes: exclusions.notes || [],
      },
    };

    return {
      results: [],
      canonicalResult: emptyCanonical,
      parsed: preferences,
      hardConstraintFailed: true,
      failedConstraints: emptyCanonical.failed_constraints || failedConstraints,
      candidatesBeforeFilter,
      candidatesRemoved,
      validCandidates,
      filteredCount: 0,
      totalCatalogueCount,
      topScore: null,
    };
  }

  // Select 1 Best Match + up to 2 Alternatives (1-3 max)
  const effectiveTopN = Math.min(topN, 3);
  const topResults = eligibleScored.slice(0, effectiveTopN);

  // Assign match tiers
  topResults.forEach((result, idx) => {
    if (idx === 0) {
      result.matchTier = result.score >= 65 ? 'Best Match' : 'Great Match';
    } else if (idx === 1) {
      result.matchTier = result.score >= 55 ? 'Great Match' : 'Good Option';
    } else {
      result.matchTier = 'Alternative';
    }

    result.explanation = generateNaturalExplanation(result, preferences);
    result.detailedReasons = generateDetailedReasons(result, preferences);
  });

  const rankedProducts: RankedProductResult[] = topResults.map((r, idx) => ({
    productId: r.product.id,
    product: r.product,
    rank: idx + 1,
    score: r.score,
    matchTier: r.matchTier,
    matchReasons: r.matchReasons,
    detailedReasons: r.detailedReasons,
    explanation: r.explanation,
  }));

  const canonicalResult: CanonicalRecommendationResult = {
    recommendation_id: `rec-${Date.now()}`,
    intent: 'RECOMMENDATION',
    status: 'SUCCESS',
    type: 'recommendation',
    products: rankedProducts,
    appliedConstraints,
    excludedConstraints,
    compromises: [],
    hardConstraintFailed: false,
    hard_constraints: {
      budget_max: preferences.budget?.max ?? null,
      excluded_families: exclusions.fragranceFamilies || [],
      excluded_notes: exclusions.notes || [],
      intensity_cap: preferences.intensityMax || null,
    },
  };

  return {
    results: topResults,
    canonicalResult,
    parsed: preferences,
    hardConstraintFailed: false,
    candidatesBeforeFilter,
    candidatesRemoved,
    validCandidates,
    filteredCount,
    totalCatalogueCount,
    topScore: topResults[0]?.score || null,
  };
}

/**
 * Multi-dimensional scoring function for products that passed hard filtering.
 */
function scoreProduct(product: Product, prefs: StructuredPreferences): RecommendationResult {
  const matchReasons: MatchReason[] = [];
  let score = 0;

  // 1. Fragrance Family Matching
  if (prefs.fragranceFamilies && prefs.fragranceFamilies.length > 0) {
    const matchedFamilies = prefs.fragranceFamilies.filter((f) =>
      product.fragranceFamily.includes(f)
    );
    if (matchedFamilies.length > 0) {
      const familyScore = WEIGHTS.fragranceFamily * (matchedFamilies.length / prefs.fragranceFamilies.length);
      score += familyScore;
      matchReasons.push({
        type: 'fragrance-family',
        label: `${matchedFamilies.join(', ')} accord`,
        score: familyScore,
      });

      // Bonus if product spans multiple requested families (e.g. fresh + woody)
      if (matchedFamilies.length > 1) {
        score += WEIGHTS.multiFamilyBonus;
        matchReasons.push({
          type: 'fragrance-family',
          label: 'Combines multiple requested scent profiles',
          score: WEIGHTS.multiFamilyBonus,
        });
      }
    }
  }

  // 2. Occasion Matching
  if (prefs.occasion && prefs.occasion.length > 0) {
    const matchedOccasions = prefs.occasion.filter((occ) => product.occasion.includes(occ));
    if (matchedOccasions.length > 0) {
      const occScore = WEIGHTS.occasion * (matchedOccasions.length / prefs.occasion.length);
      score += occScore;
      matchReasons.push({
        type: 'occasion',
        label: `Ideal for ${matchedOccasions.map((o) => o.replace('-', ' ')).join(', ')}`,
        score: occScore,
      });
    }
  }

  // 3. Preferred Notes Matching
  if (prefs.notes && prefs.notes.length > 0) {
    const allNotes = [...product.topNotes, ...product.heartNotes, ...product.baseNotes].map((n) =>
      n.toLowerCase()
    );
    const matchedNotes = prefs.notes.filter((note) =>
      allNotes.some((n) => n.includes(note.toLowerCase()))
    );
    if (matchedNotes.length > 0) {
      const notesScore = WEIGHTS.notes * (matchedNotes.length / prefs.notes.length);
      score += notesScore;
      matchReasons.push({
        type: 'notes',
        label: `Features ${matchedNotes.join(', ')}`,
        score: notesScore,
      });
    }
  }

  // 4. Season Matching
  if (prefs.season && prefs.season.length > 0) {
    const matchedSeason = prefs.season.some(
      (s) => product.season.includes(s) || product.season.includes('all-season')
    );
    if (matchedSeason) {
      score += WEIGHTS.season;
      matchReasons.push({
        type: 'season',
        label: `Suited for ${prefs.season.join(', ')}`,
        score: WEIGHTS.season,
      });
    }
  }

  // 5. Gender Category Matching
  if (prefs.gender) {
    if (product.gender === prefs.gender || product.gender === 'unisex') {
      score += WEIGHTS.gender;
      matchReasons.push({
        type: 'gender',
        label: `${product.gender === 'unisex' ? 'Versatile unisex' : product.gender} profile`,
        score: WEIGHTS.gender,
      });
    }
  }

  // 6. Intensity / Performance Matching (Section 4 & 5)
  if (prefs.intensityPreference || prefs.intensity) {
    const targetIntensity = prefs.intensityPreference || prefs.intensity;
    if (targetIntensity === 'strong') {
      if (product.intensity === 'strong' || product.intensity === 'projection-beast') {
        score += 45;
        matchReasons.push({
          type: 'intensity',
          label: 'Strong projection & long-lasting intensity',
          score: 45,
        });
      } else if (product.intensity === 'moderate') {
        score += 10;
      } else if (product.intensity === 'subtle') {
        score -= 25; // Penalize subtle when stronger requested
      }
    } else if (targetIntensity === 'subtle') {
      if (product.intensity === 'subtle') {
        score += 40;
        matchReasons.push({
          type: 'intensity',
          label: 'Subtle, close-to-skin projection',
          score: 40,
        });
      } else if (product.intensity === 'moderate') {
        score += 10;
      } else if (product.intensity === 'strong' || product.intensity === 'projection-beast') {
        score -= 30; // Penalize strong when lighter requested
      }
    } else if (product.intensity === targetIntensity) {
      score += WEIGHTS.intensity;
      matchReasons.push({
        type: 'intensity',
        label: `${targetIntensity} intensity matching preference`,
        score: WEIGHTS.intensity,
      });
    }
  }

  // 6.2. Longevity Preference Matching
  if (prefs.longevityPreference || prefs.longevity) {
    const targetLongevity = prefs.longevityPreference || prefs.longevity;
    if (targetLongevity === 'long-lasting' || targetLongevity === 'beast-mode') {
      if (product.longevity === 'beast-mode' || product.longevity === 'long-lasting') {
        score += 35;
        matchReasons.push({
          type: 'longevity',
          label: 'Long-lasting all-day performance (8+ hours)',
          score: 35,
        });
      }
    }
  }

  // 6.5. Spicy Profile & Depth Matching (Section 7)
  const isSpicyRequested =
    prefs.fragranceFamilies?.includes('spicy') ||
    prefs.notes?.some((n) => n.toLowerCase().includes('spic'));
  if (isSpicyRequested) {
    if (product.fragranceFamily.includes('spicy')) {
      score += 40;
      matchReasons.push({
        type: 'fragrance-family',
        label: 'Genuinely spicy fragrance family profile',
        score: 40,
      });
    } else if (product.spicyLevel === 'dominant') {
      score += 35;
      matchReasons.push({
        type: 'fragrance-family',
        label: 'Dominant natural spice heart notes',
        score: 35,
      });
    } else if (product.spicyLevel === 'moderate') {
      score += 20;
      matchReasons.push({
        type: 'fragrance-family',
        label: 'Balanced warm spice character',
        score: 20,
      });
    } else if (product.spicyLevel === 'subtle') {
      // Incidental top note spice (e.g. pink pepper in sweet perfume)
      score += 5;
      matchReasons.push({
        type: 'tag',
        label: 'Subtle hint of spice in top notes',
        score: 5,
      });
    }
  }

  // 6.3. Sillage Preference & Controlled Projection Matching
  if (prefs.sillageMax === 'moderate' || prefs.sillagePreference === 'moderate') {
    if (product.sillage === 'moderate' || product.projection === 'moderate') {
      score += 30;
      matchReasons.push({
        type: 'intensity',
        label: 'Controlled moderate projection (not loud)',
        score: 30,
      });
    } else if (product.sillage === 'intimate' || product.projection === 'intimate') {
      score += 25;
      matchReasons.push({
        type: 'intensity',
        label: 'Subtle, close-to-skin projection',
        score: 25,
      });
    } else if (product.sillage === 'strong' || product.projection === 'strong') {
      score -= 15;
    }
  } else if (prefs.sillagePreference === 'intimate') {
    if (product.sillage === 'intimate' || product.projection === 'intimate') {
      score += 35;
      matchReasons.push({
        type: 'intensity',
        label: 'Intimate skin-scent projection',
        score: 35,
      });
    }
  }

  // 7. Nuance Adjustments: WARMTH (Section 3)
  if (prefs.warmth === 'moderate-warm') {
    if (product.warmth === 'warm') {
      score += 35;
      matchReasons.push({
        type: 'tag',
        label: 'Balanced warmth without being overly heavy',
        score: 35,
      });

      // Nuance differentiation to reduce score ties using genuine product attributes:
      // 1. Soft comforting warm notes (vanilla, tonka, benzoin, sandalwood, soft amber)
      const hasComfortNotes = product.baseNotes.some((n) => /vanilla|tonka|benzoin|sandalwood/i.test(n)) ||
                              product.heartNotes.some((n) => /vanilla|tonka/i.test(n));
      if (hasComfortNotes) {
        score += 10;
        matchReasons.push({
          type: 'notes',
          label: 'Comforting warm notes (vanilla, sandalwood, benzoin)',
          score: 10,
        });
      }

      // 2. Controlled performance alignment (moderate/subtle projection aligns with "not too warm")
      if (product.sillage === 'moderate' || product.sillage === 'intimate') {
        score += 5;
      }
    } else if (product.warmth === 'neutral') {
      score += 20;
      matchReasons.push({
        type: 'tag',
        label: 'Smooth, balanced temperature',
        score: 20,
      });
    } else if (product.warmth === 'very-warm') {
      score += 5; // De-prioritize very-warm when moderate warmth is requested
    } else if (product.warmth === 'cool') {
      score -= 15;
    }
  } else if (prefs.warmth === 'warmer') {
    const isVeryWarm = product.warmth === 'very-warm';
    const isWarm = product.warmth === 'warm' || isVeryWarm;
    if (isWarm) {
      let warmBonus = isVeryWarm ? 45 : 35;
      if (product.fragranceFamily.includes('musky') || product.baseNotes.some((n) => /musk|cashmeran|ambrette|amber/i.test(n))) {
        warmBonus += 10;
      }
      if (product.baseNotes.some((n) => /cashmeran|ambrette/i.test(n))) {
        warmBonus += 10;
      }
      score += warmBonus;
      matchReasons.push({
        type: 'tag',
        label: 'Warm amber, woody & musky base',
        score: warmBonus,
      });
    } else if (product.warmth === 'cool') {
      score -= 20; // Penalize cool/aquatic when warmth was explicitly requested
    }
  }

  // 8. Nuance Adjustments: FRESHNESS
  if (prefs.freshness === 'fresher') {
    const isVeryFresh = product.freshness === 'very-fresh';
    const isFresh = product.freshness === 'fresh' || isVeryFresh;
    if (isFresh) {
      const freshBonus = isVeryFresh ? WEIGHTS.freshness + 10 : WEIGHTS.freshness;
      score += freshBonus;
      matchReasons.push({
        type: 'tag',
        label: 'Crisp citrus & fresh opening',
        score: freshBonus,
      });
    }
  }

  // 9. Relative Cheaper Bonus (Section 8)
  if (prefs.relativePrice === 'cheaper') {
    const bonus = WEIGHTS.relativeCheaperBonus + Math.max(0, Math.round((800 - product.price) / 25));
    score += bonus;
    matchReasons.push({
      type: 'budget',
      label: `Cheaper alternative at ₹${product.price}`,
      score: bonus,
    });
  }

  // 10. Reference Perfume Similarity (ONLY when user explicitly requested similarity!)
  if (prefs.isSimilarityRequest && prefs.referencePerfumes && prefs.referencePerfumes.length > 0) {
    const productSimilar = product.similarTo.map((s) => s.toLowerCase());
    const brandStopwords = new Set([
      'dior', 'chanel', 'creed', 'tom', 'ford', 'ysl', 'armani', 'versace',
      'parfums', 'parfum', 'house', 'la', 'nuit', 'de', 'bleu', 'eau'
    ]);

    for (const ref of prefs.referencePerfumes) {
      const refLower = ref.toLowerCase();
      const isDirectMatch = productSimilar.some((sim) => {
        if (sim.includes(refLower) || refLower.includes(sim)) {
          return true;
        }
        // Extract model-specific tokens (e.g. "sauvage", "aventus", "baccarat")
        const refTokens = refLower.split(/\s+/).filter((w) => w.length >= 4 && !brandStopwords.has(w));
        const simTokens = sim.split(/\s+/).filter((w) => w.length >= 4 && !brandStopwords.has(w));
        return refTokens.some((rt) => simTokens.some((st) => st.includes(rt) || rt.includes(st)));
      });

      if (isDirectMatch) {
        score += WEIGHTS.referencePerfume;
        matchReasons.push({
          type: 'similar',
          label: `Shares scent DNA with ${ref}`,
          score: WEIGHTS.referencePerfume,
        });
        break;
      }
    }
  }

  // 11. Budget Comfort Bonus
  if (prefs.budget?.max) {
    if (product.price <= prefs.budget.max * 0.8) {
      score += WEIGHTS.budgetComfortBonus;
      matchReasons.push({
        type: 'budget',
        label: `Comfortably under ₹${prefs.budget.max} (₹${product.price})`,
        score: WEIGHTS.budgetComfortBonus,
      });
    } else {
      matchReasons.push({
        type: 'budget',
        label: `Within budget (₹${product.price})`,
        score: 5,
      });
    }
  }

  // 12. Style & Character (Sophisticated, Luxury, Distinctive)
  if (prefs.vibes && prefs.vibes.length > 0) {
    const hasSophisticated = prefs.vibes.some((v) => /sophisticated|expensive|luxury|classy|elegant/i.test(v));
    const hasDistinctive = prefs.vibes.some((v) => /distinctive|interesting|unique|bold|character/i.test(v));

    if (hasSophisticated) {
      const isLuxury = product.tags.some((t) => /luxury|statement|sophisticated|formal/i.test(t)) ||
        product.price >= 900 ||
        product.baseNotes.some((n) => /oud|amber|leather|saffron|sandalwood/i.test(n));
      if (isLuxury) {
        score += 25;
        matchReasons.push({
          type: 'tag',
          label: 'Sophisticated & luxurious character',
          score: 25,
        });
      }
    }

    if (hasDistinctive) {
      const isDistinctive = product.tags.some((t) => /statement|bold|luxury|unique/i.test(t)) ||
        product.oudLevel === 'dominant' || product.spicyLevel === 'dominant' ||
        product.fragranceFamily.includes('oud') || product.fragranceFamily.includes('spicy');
      if (isDistinctive) {
        score += 25;
        matchReasons.push({
          type: 'tag',
          label: 'Distinctive, character-rich profile',
          score: 25,
        });
      }
    }
  }

  // Ensure products with zero matching criteria stay at 0
  const finalScore = Math.max(0, Math.round(score));

  return {
    product,
    score: finalScore,
    matchTier: 'Good Option',
    matchReasons,
    detailedReasons: [],
    explanation: '',
  };
}

/**
 * Grounded natural explanation generator (strictly grounded in metadata & match reasons).
 */
function generateNaturalExplanation(result: RecommendationResult, prefs: StructuredPreferences): string {
  const p = result.product;
  const topNotes = p.topNotes.slice(0, 2).join(' and ');
  const baseNotes = p.baseNotes.slice(0, 2).join(' and ');
  const families = p.fragranceFamily.join(' & ');

  if (prefs.isSimilarityRequest && prefs.referencePerfumes && prefs.referencePerfumes.length > 0) {
    const ref = prefs.referencePerfumes[0];
    const isDirectMatch = p.similarTo.some((s) => s.toLowerCase().includes(ref.toLowerCase()));
    if (isDirectMatch) {
      return `${p.name} shares the vibrant ${families} profile inspired by ${ref}, opening with ${topNotes} and drying down to ${baseNotes}. Priced at ₹${p.price}.`;
    }
  }

  const occasionMention = prefs.occasion?.[0] ? `for ${prefs.occasion[0].replace('-', ' ')} wear` : 'everyday';
  return `${p.name} fits ${occasionMention} with its ${families} profile, combining a fresh ${topNotes} opening with a ${baseNotes} base at ₹${p.price}.`;
}

/**
 * Factual reason breakdown for product cards.
 */
function generateDetailedReasons(result: RecommendationResult, prefs: StructuredPreferences): MatchReasonDetail[] {
  const p = result.product;
  const details: MatchReasonDetail[] = [];

  details.push({
    category: 'Profile',
    text: `${p.fragranceFamily.join(' · ')} accord with ${p.topNotes.slice(0, 2).join(', ')} opening and ${p.baseNotes.slice(0, 2).join(', ')} base.`,
  });

  details.push({
    category: 'Performance',
    text: `${p.intensity} intensity with ${p.longevity.replace('-', ' ')} longevity.`,
  });

  if (prefs.budget?.max) {
    details.push({
      category: 'Budget',
      text: `₹${p.price} (${p.size}) — within ₹${prefs.budget.max} limit.`,
    });
  } else {
    details.push({
      category: 'Budget',
      text: `₹${p.price} (${p.size}).`,
    });
  }

  if (prefs.isSimilarityRequest && prefs.referencePerfumes && prefs.referencePerfumes.length > 0) {
    details.push({
      category: 'Inspiration',
      text: `Inspired by ${p.similarTo.slice(0, 2).join(', ')} style.`,
    });
  }

  return details;
}

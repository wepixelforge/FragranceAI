import { NextRequest, NextResponse } from 'next/server';
import { getBrand, getProducts } from '@/data';
import { Product, RecommendationResult, CanonicalRecommendationResult } from '@/types/product';
import {
  ChatApiRequest,
  ChatApiResponse,
  UserIntent,
  ConsultationDebugInfo,
} from '@/types/chat';
import {
  classifyIntentAndExtractPreferences,
  findProductByNameOrFuzzy,
  doesIntentRequireProducts,
  normalizeText,
} from '@/lib/intent-classifier';
import {
  updateConversationState,
  toStructuredPreferences,
  createInitialConversationState,
} from '@/lib/state-manager';
import { getRecommendations } from '@/lib/recommendation-engine';
import { generateConversationalResponse } from '@/lib/response-generator';

export async function POST(req: NextRequest) {
  try {
    const body: ChatApiRequest = await req.json();
    const {
      message,
      brandSlug,
      conversationState,
      history = [],
      contextProductSlug,
      isAlternativeRequest = false,
    } = body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'Message cannot be empty.' },
        { status: 400 }
      );
    }

    const brand = getBrand(brandSlug);
    if (!brand) {
      return NextResponse.json(
        { error: `Brand "${brandSlug}" not found.` },
        { status: 404 }
      );
    }

    const startTime = Date.now();
    const activeState = conversationState || createInitialConversationState();

    // Context product seeding
    if (contextProductSlug && !activeState.shownProductIds?.includes(contextProductSlug)) {
      activeState.shownProductIds = [...(activeState.shownProductIds || []), contextProductSlug];
    }

    // Preload brand catalogue for Stage 1 entity matching
    const brandProducts = getProducts(brandSlug);

    const cleanMessage = normalizeText(message);

    // ── STAGE 1: INTENT & PREFERENCE UNDERSTANDING ───────────────────────────
    const stage1 = await classifyIntentAndExtractPreferences(
      cleanMessage,
      brand,
      brandProducts,
      history,
      activeState
    );

    // ── STAGE 2: SESSION STATE UPDATE (SET, UPDATE, REMOVE, RESET) ───────────
    let updatedState = updateConversationState(activeState, stage1, cleanMessage);

    // ── STAGE 3: INTENT ROUTER & CONDITIONAL PRODUCT RETRIEVAL ───────────────
    const requiresProducts = doesIntentRequireProducts(stage1.intent, stage1);

    let productRetrievalStatus: 'CALLED' | 'SKIPPED' | 'FAILED' = 'SKIPPED';
    let recommendationEngineStatus: 'CALLED' | 'SKIPPED' = 'SKIPPED';
    let products: Product[] = [];
    let retrievedProducts: Product[] = [];
    let recommendationResults: RecommendationResult[] = [];
    let discussedProductIds: string[] = [];
    let candidatesBeforeFilter: string[] = [];
    let candidatesRemoved: { id: string; name: string; reason: string }[] = [];
    let validCandidates: string[] = [];
    let hardConstraintFailed = false;
    let filteredCount = 0;
    let topScore: number | null = null;
    let previousProductIds: string[] = [];
    let excludeIds: string[] = [];
    let canonicalResult: CanonicalRecommendationResult = {
      type: 'none',
      products: [],
      appliedConstraints: [],
      excludedConstraints: [],
      compromises: [],
      hardConstraintFailed: false,
    };

    if (requiresProducts) {
      productRetrievalStatus = 'CALLED';
      try {
        products = getProducts(brandSlug);
        filteredCount = products.length;
      } catch (err) {
        console.error(`[Product Catalogue Error]: Failed loading catalogue for brand "${brandSlug}":`, err);
        productRetrievalStatus = 'FAILED';
        return NextResponse.json({
          reply: "I'm having trouble accessing the fragrance catalogue right now. I can still help you describe what you're looking for, and we can try the recommendations again.",
          intent: stage1.intent,
          results: [],
          updatedState,
          needsRecommendations: false,
          debugInfo: {
            userMessage: message,
            intent: stage1.intent,
            isNewRequest: Boolean(stage1.is_new_request),
            isRefinement: Boolean(stage1.is_refinement),
            stateBefore: activeState.activeRequest,
            parsedUpdates: stage1.updates || [],
            stateAfter: updatedState.activeRequest,
            hardConstraints: {
              budget_max: updatedState.activeRequest?.budget?.max ?? null,
              excluded_notes: updatedState.activeRequest?.excludedNotes ?? [],
              excluded_families: updatedState.activeRequest?.excludedFamilies ?? [],
              intensity_cap: updatedState.backgroundContext?.persistentExclusions?.intensity_cap ?? null,
              excluded_products: updatedState.shownProductIds ?? [],
              relative_price: updatedState.activeRequest?.relativePrice ?? null,
            },
            exclusions: updatedState.backgroundContext?.persistentExclusions ?? { notes: [], families: [] },
            referencePerfume: updatedState.backgroundContext?.referencePerfume ?? null,
            productRetrievalCalled: true,
            filteredProductCount: 0,
            rankedProductIds: [],
            matchReasons: [],
            finalProductIdsSentToLLM: [],
            finalProductIdsSentToUI: [],
          },
        });
      }

      // 1. SPECIFIC PRODUCT QUESTION (e.g. "tell me about Royal Oud")
      if (stage1.intent === 'PRODUCT_INFO' && stage1.target_product_names && stage1.target_product_names.length > 0) {
        const targetName = stage1.target_product_names[0];
        const targetProduct = findProductByNameOrFuzzy(targetName, products);
        if (targetProduct) {
          retrievedProducts = [targetProduct];
          discussedProductIds = [targetProduct.id];
          recommendationResults = [
            {
              product: targetProduct,
              score: 95,
              matchTier: 'Spotlight', // Never "Best Match"!
              matchReasons: [
                {
                  type: 'tag',
                  label: 'Direct catalogue inquiry',
                  score: 95,
                },
              ],
              detailedReasons: [
                {
                  category: 'Profile',
                  text: `${targetProduct.fragranceFamily.join(' · ')} accord with ${targetProduct.topNotes.slice(0, 2).join(', ')}.`,
                },
                {
                  category: 'Performance',
                  text: `${targetProduct.longevity.replace('-', ' ')} wear with ${targetProduct.intensity} projection.`,
                },
              ],
              explanation: `${targetProduct.name} is featured in our ${brand.name} collection at ₹${targetProduct.price}.`,
            },
          ];
          canonicalResult = {
            type: 'product_info',
            products: recommendationResults.map((r) => ({
              productId: r.product.id,
              product: r.product,
              rank: 1,
              score: r.score,
              matchTier: r.matchTier,
              matchReasons: r.matchReasons,
              detailedReasons: r.detailedReasons,
              explanation: r.explanation,
            })),
            appliedConstraints: ['Product Inquiry'],
            excludedConstraints: [],
            compromises: [],
            hardConstraintFailed: false,
          };
        }
      }

      // 2. SPECIFIC PRODUCT COMPARISON (e.g. "compare Royal Oud and Cedar Noir")
      else if (stage1.intent === 'COMPARE_PRODUCTS' && stage1.target_product_names && stage1.target_product_names.length >= 2) {
        const [name1, name2] = stage1.target_product_names;
        const p1 = findProductByNameOrFuzzy(name1, products);
        const p2 = findProductByNameOrFuzzy(name2, products);
        const matched = [p1, p2].filter(Boolean) as Product[];
        if (matched.length > 0) {
          retrievedProducts = matched;
          discussedProductIds = matched.map((p) => p.id);
          recommendationResults = matched.map((p, idx) => ({
            product: p,
            score: 90 - idx * 5,
            matchTier: 'Comparison Candidate', // Never "Best Match" or "Great Match"!
            matchReasons: [
              {
                type: 'tag',
                label: 'Comparison candidate',
                score: 90 - idx * 5,
              },
            ],
            detailedReasons: [
              {
                category: 'Profile',
                text: `${p.fragranceFamily.join(' · ')} formulation at ₹${p.price}.`,
              },
            ],
            explanation: `${p.name} evaluated for comparison.`,
          }));
          canonicalResult = {
            type: 'compare_products',
            products: recommendationResults.map((r, idx) => ({
              productId: r.product.id,
              product: r.product,
              rank: idx + 1,
              score: r.score,
              matchTier: r.matchTier,
              matchReasons: r.matchReasons,
              detailedReasons: r.detailedReasons,
              explanation: r.explanation,
            })),
            appliedConstraints: ['Side-by-side comparison'],
            excludedConstraints: [],
            compromises: [],
            hardConstraintFailed: false,
          };
        }
      }

      // 3. RECOMMENDATIONS & SEARCH FLOWS
      else if (stage1.needs_recommendations && !stage1.needs_clarification && !stage1.has_contradiction) {
        recommendationEngineStatus = 'CALLED';
        const structuredPrefs = toStructuredPreferences(updatedState, cleanMessage);

        // Feed last recommended prices for relative cheaper requests
        if (updatedState.lastRecommendationIds && updatedState.lastRecommendationIds.length > 0) {
          structuredPrefs.lastRecommendedPrices = updatedState.lastRecommendationIds
            .map((id) => products.find((p) => p.id === id)?.price)
            .filter(Boolean) as number[];
        }

        previousProductIds = Array.from(
          new Set([
            ...(activeState.lastRecommendationIds || []),
            ...(activeState.shownProductIds || []),
            ...(activeState.previously_discussed_products || []),
          ])
        );

        const isShowAlternatives =
          stage1.intent === 'SHOW_ALTERNATIVES' ||
          Boolean(isAlternativeRequest);

        if (isShowAlternatives) {
          excludeIds = Array.from(
            new Set([
              ...(activeState.lastRecommendationIds || []),
              ...(activeState.shownProductIds || []),
            ])
          );
        } else {
          excludeIds = [];
        }

        const isSurpriseMe = Boolean(stage1.is_surprise_me || stage1.intent === 'surprise_me');

        const recResponse = getRecommendations(
          structuredPrefs,
          products,
          3,
          excludeIds,
          isSurpriseMe
        );

        candidatesBeforeFilter = recResponse.candidatesBeforeFilter || [];
        candidatesRemoved = recResponse.candidatesRemoved || [];
        validCandidates = recResponse.validCandidates || [];
        canonicalResult = recResponse.canonicalResult;

        if (canonicalResult.status === 'NO_ALTERNATIVES' || recResponse.hardConstraintFailed) {
          hardConstraintFailed = true;
        }

        if (canonicalResult.status === 'NO_ALTERNATIVES') {
          recommendationResults = [];
          retrievedProducts = [];
          discussedProductIds = [];
        } else {
          recommendationResults = recResponse.results;
          retrievedProducts = recResponse.results.map((r) => r.product);
          discussedProductIds = retrievedProducts.map((p) => p.id);
        }

        filteredCount = recResponse.filteredCount;
        topScore = recResponse.topScore;

        if (discussedProductIds.length > 0) {
          updatedState.lastRecommendationIds = [...discussedProductIds];
        }
      }

      if (discussedProductIds.length > 0) {
        updatedState.shownProductIds = Array.from(
          new Set([...(updatedState.shownProductIds || []), ...discussedProductIds])
        );
        updatedState.previously_discussed_products = [...updatedState.shownProductIds];
      }
    }

    // ── STAGE 4: CONVERSATIONAL RESPONSE GENERATION (GROQ EXPLAINS CANONICAL RESULT) ──
    const reply = await generateConversationalResponse(
      cleanMessage,
      brand,
      stage1,
      retrievedProducts,
      recommendationResults,
      updatedState,
      history,
      { hardConstraintFailed, status: canonicalResult.status }
    );

    const isConversationalOnly =
      stage1.intent === 'GREETING' ||
      stage1.intent === 'IDENTITY' ||
      stage1.intent === 'CAPABILITY' ||
      stage1.intent === 'OUT_OF_SCOPE' ||
      stage1.intent === 'RESET_CONSULTATION' ||
      stage1.intent === 'GENERAL_CONVERSATION' ||
      stage1.intent === 'BRAND_CONVERSATION' ||
      stage1.intent === 'CUSTOMER_OBJECTION' ||
      stage1.intent === 'PURCHASE_ASSISTANCE';

    const hasValidRecommendations = Boolean(
      !isConversationalOnly &&
      requiresProducts &&
      !stage1.needs_clarification &&
      !stage1.has_contradiction &&
      !hardConstraintFailed &&
      canonicalResult.status !== 'NO_ALTERNATIVES' &&
      canonicalResult.status !== 'NO_VALID_MATCH' &&
      recommendationResults.length > 0
    );

    // Development Debug Info Payload (All 17 Audit Points & Section 10 requirements)
    const rankedIds = hasValidRecommendations ? recommendationResults.map((r) => r.product.id) : [];
    const canonicalIds = [...rankedIds];
    const llmIds = [...rankedIds];
    const uiIds = [...rankedIds];

    const activePrevIds = Array.from(
      new Set([
        ...(activeState.lastRecommendationIds || []),
        ...(activeState.shownProductIds || []),
      ])
    );

    // Defensive validation for recommendation outputs
    if (stage1.intent === 'SHOW_ALTERNATIVES' && canonicalIds.length > 0) {
      const intersection = canonicalIds.filter((id) => activePrevIds.includes(id));
      if (intersection.length > 0) {
        console.error('[DEFENSIVE VALIDATION FAILED]: SHOW_ALTERNATIVES repeated products:', intersection);
      }
    }

    const debugInfo: ConsultationDebugInfo = {
      userMessage: cleanMessage,
      intent: stage1.intent,
      isNewRequest: Boolean(stage1.is_new_request),
      isRefinement: Boolean(stage1.is_refinement),
      stateBefore: activeState.activeRequest,
      stateDelta: stage1.updates || [],
      parsedUpdates: stage1.updates || [],
      stateAfter: updatedState.activeRequest,
      hardConstraints: {
        budget_max: updatedState.activeRequest?.budget?.max ?? null,
        excluded_notes: updatedState.activeRequest?.excludedNotes ?? [],
        excluded_families: updatedState.activeRequest?.excludedFamilies ?? [],
        intensity_cap: updatedState.backgroundContext?.persistentExclusions?.intensity_cap ?? null,
        excluded_products: updatedState.shownProductIds ?? [],
        relative_price: updatedState.activeRequest?.relativePrice ?? null,
      },
      exclusions: updatedState.backgroundContext?.persistentExclusions ?? { notes: [], families: [] },
      referencePerfume: updatedState.backgroundContext?.referencePerfume ?? null,
      productRetrievalCalled: requiresProducts,
      filteredProductCount: filteredCount,
      candidatesBeforeFilter,
      candidatesRemoved,
      validCandidates,
      candidatesAfterHardFilter: validCandidates,
      finalRanking: recommendationResults.map((r, idx) => ({ id: r.product.id, name: r.product.name, score: r.score, rank: idx + 1 })),
      canonicalProductIds: canonicalIds,
      llmProductIds: llmIds,
      uiProductIds: uiIds,
      previousProductIds: activePrevIds,
      temporaryExcludedProductIds: excludeIds,
      status: canonicalResult.status,
      rankedProductIds: rankedIds,
      matchReasons: recommendationResults.flatMap((r) => r.matchReasons.map((m) => m.label)),
      finalProductIdsSentToLLM: llmIds,
      finalProductIdsSentToUI: uiIds,

      // Backward compatibility fields
      request_type: stage1.request_type,
      requiresProductData: requiresProducts,
      productRetrievalStatus,
      recommendationEngineStatus,
      updates: stage1.updates,
      currentConsultation: updatedState.currentConsultation,
      backgroundPreferences: updatedState.backgroundPreferences,
      positivePreferences: {
        families: updatedState.activeRequest?.families ?? [],
        notes: updatedState.activeRequest?.preferredNotes ?? [],
        occasion: updatedState.activeRequest?.occasion ?? null,
        season: updatedState.activeRequest?.season ?? null,
        intensity: updatedState.activeRequest?.intensity ?? null,
        reference: updatedState.backgroundContext?.referencePerfume ?? null,
      },
      totalCatalogueCount: products.length,
      filteredCount,
      rankedCount: recommendationResults.length,
      topScore,
      topProduct: recommendationResults[0]
        ? {
            name: recommendationResults[0].product.name,
            score: recommendationResults[0].score,
            price: recommendationResults[0].product.price,
            whySelected: recommendationResults[0].explanation,
          }
        : undefined,
      hasContradiction: stage1.has_contradiction,
      hardConstraintFailed,
    };

    if (process.env.NODE_ENV !== 'production' || stage1.intent === 'SHOW_ALTERNATIVES') {
      console.log('\n================== TM SCENT FINDER DIAGNOSTICS ==================');
      console.log('USER MESSAGE:            ', cleanMessage);
      console.log('STATE BEFORE:            ', JSON.stringify(activeState.activeRequest));
      console.log('STATE DELTA:             ', JSON.stringify(stage1.updates || []));
      console.log('STATE AFTER:             ', JSON.stringify(updatedState.activeRequest));
      console.log('INTENT:                  ', stage1.intent);
      if (stage1.intent === 'SHOW_ALTERNATIVES') {
        console.log('PREVIOUS PRODUCT IDS:    ', activePrevIds);
        console.log('TEMPORARY EXCLUDED PRODUCT IDS:', excludeIds);
      }
      console.log('HARD CONSTRAINTS:        ', JSON.stringify(debugInfo.hardConstraints));
      console.log('CANDIDATES BEFORE FILTER:', debugInfo.candidatesBeforeFilter);
      console.log('CANDIDATES REMOVED:      ', JSON.stringify(debugInfo.candidatesRemoved, null, 2));
      console.log('CANDIDATES AFTER HARD FILTER:', debugInfo.candidatesAfterHardFilter);
      console.log('NEW RANKING:             ', JSON.stringify(debugInfo.finalRanking, null, 2));
      console.log('NEW CANONICAL PRODUCT IDS:', canonicalIds);
      console.log('LLM PRODUCT IDS:         ', llmIds);
      console.log('UI PRODUCT IDS:          ', uiIds);
      console.log('CANONICAL == LLM == UI:  ', (JSON.stringify(canonicalIds) === JSON.stringify(llmIds) && JSON.stringify(llmIds) === JSON.stringify(uiIds)));
      if (stage1.intent === 'SHOW_ALTERNATIVES') {
        const intersection = canonicalIds.filter((id) => activePrevIds.includes(id));
        console.log('CANONICAL ∩ PREVIOUS = EMPTY?:', intersection.length === 0 ? 'YES (PASSED)' : `FAILED (${intersection.join(', ')})`);
      }
      console.log('==================================================================\n');
    }

    const responsePayload: ChatApiResponse = {
      reply,
      intent: stage1.intent,
      results: hasValidRecommendations ? recommendationResults : [],
      updatedState,
      needsRecommendations: hasValidRecommendations,
      suggestedChips: stage1.suggested_chips || undefined,
      debugInfo,
    };

    return NextResponse.json(responsePayload, { status: 200 });
  } catch (error) {
    console.error('[API /api/chat Error]:', error);
    return NextResponse.json(
      {
        reply: "I had a brief connection glitch. Could you try sending that once more?",
        intent: 'OUT_OF_SCOPE' as UserIntent,
        results: [],
        updatedState: createInitialConversationState(),
        needsRecommendations: false,
      },
      { status: 200 }
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getBrand, getProducts } from '@/data';
import { Product, RecommendationResult, CanonicalRecommendationResult } from '@/types/product';
import {
  ChatApiRequest,
  ChatApiResponse,
  UserIntent,
  ConsultationDebugInfo,
  CartActionPayload,
} from '@/types/chat';
import {
  classifyIntentAndExtractPreferences,
  findProductByNameOrFuzzy,
  doesIntentRequireProducts,
  normalizeText,
  fallbackIntentClassifier,
  applyExplicitReference,
} from '@/lib/intent-classifier';
import { parseSamplingContext } from '@/lib/sampling-format';
import { productMatchesRequestedFamily } from '@/lib/fragrance-vocabulary';
import {
  updateConversationState,
  toStructuredPreferences,
  createInitialConversationState,
} from '@/lib/state-manager';
import { getRecommendations } from '@/lib/recommendation-engine';
import { generateConversationalResponse, ResponseActionContext } from '@/lib/response-generator';
import { normalizeAssistantMessages } from '@/lib/message-sequencer';
import {
  toCanonicalProductSet,
  planCartAssistance,
  isAuthorizedCartMutation,
} from '@/lib/cart-action-resolver';
import { buildLiveCartContext, toResponseCartContext } from '@/lib/live-cart-context';
import { STOREFRONT_CURRENCY } from '@/lib/brand-utils';
import {
  buildComparativeContext,
  buildRecommendationPresentation,
  previousProductsFromState,
} from '@/lib/response-grounding';
import {
  applyScentiraCartFollowUp,
  resolveScentiraNamedProduct,
  scentiraCanUseListedProductInfo,
  scentiraResolvedCartMessage,
} from '@/lib/scentira-format';
import {
  loadLangChainSession,
  sessionHistoryAsChat,
  appendSessionTurn,
} from '@/lib/langchain-session';

export async function POST(req: NextRequest) {
  try {
    const body: ChatApiRequest = await req.json();
    const {
      message,
      brandSlug,
      conversationState,
      history: clientHistory = [],
      sessionId,
      resetSession = false,
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
    const langchainSession = await loadLangChainSession({
      sessionId,
      brandSlug,
      incomingHistory: clientHistory,
      incomingState: conversationState,
      reset: resetSession,
    });
    const history = await sessionHistoryAsChat(langchainSession);
    const activeState =
      langchainSession.conversationState || conversationState || createInitialConversationState();

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
    if (stage1.intent !== 'CART_ASSISTANCE') {
      updatedState = { ...updatedState, pendingCartAction: null };
    }

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
        const targetProduct =
          brand.slug === 'scentira'
            ? resolveScentiraNamedProduct(cleanMessage, products) ||
              (() => {
                const listed = products.find((product) => product.name === targetName);
                return listed && scentiraCanUseListedProductInfo(cleanMessage, listed) ? listed : null;
              })()
            : findProductByNameOrFuzzy(targetName, products);
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
              ...(updatedState.lastRecommendationIds || []),
              ...(activeState.lastCanonicalProductSet || []).map((p) => p.productId),
              ...(updatedState.lastCanonicalProductSet || []).map((p) => p.productId),
              ...(activeState.shownProductIds || []),
              ...(updatedState.shownProductIds || []),
            ])
          );
          structuredPrefs.excludedProductIds = Array.from(
            new Set([...(structuredPrefs.excludedProductIds || []), ...excludeIds])
          );
        } else {
          excludeIds = [];
        }

        const isSurpriseMe = Boolean(
          stage1.is_surprise_me ||
          stage1.is_broad_recommendation ||
          stage1.intent === 'surprise_me'
        );
        const recLimit = stage1.is_broad_recommendation ? 4 : 3;

        let recResponse = getRecommendations(
          structuredPrefs,
          products,
          recLimit,
          excludeIds,
          isSurpriseMe
        );

        const requestedFamilies = updatedState.activeRequest?.families || stage1.fragrance_families || [];
        const catalogueHasRequestedFamily = requestedFamilies.some((family) =>
          products.some((product) => productMatchesRequestedFamily(product, family))
        );
        const userStatedHardConstraint =
          /₹|rs\.?|under|below|budget|cheaper|full[- ]size|sample|pocket|not |don't |dont |avoid|except/i.test(
            cleanMessage
          ) ||
          (brand.slug === 'scentira' &&
            /\b(decant|5\s*ml|10\s*ml|20\s*ml|full[- ]bottle|discovery\s+set)\b/i.test(cleanMessage));
        const falseEmptyFamilyMatch =
          recResponse.results.length === 0 &&
          !isShowAlternatives &&
          !isSurpriseMe &&
          catalogueHasRequestedFamily &&
          !userStatedHardConstraint;

        if (falseEmptyFamilyMatch) {
          const sampled = parseSamplingContext(cleanMessage);
          const strippedPrefs = {
            ...structuredPrefs,
            formatPreference: sampled.formatPreference ?? undefined,
            budget: undefined,
            intensity: /\b(strong|subtle|light|soft|intense|beast)\b/i.test(cleanMessage)
              ? structuredPrefs.intensity
              : undefined,
            intensityPreference: undefined,
            intensityMax: undefined,
            exclusions: {
              ...(structuredPrefs.exclusions || {}),
              intensity: undefined,
              sillage: undefined,
            },
          };
          recResponse = getRecommendations(strippedPrefs, products, 3, excludeIds, false);

          if (recResponse.results.length === 0) {
            const fallbackStage1 = applyExplicitReference(
              fallbackIntentClassifier(cleanMessage, brand, products, activeState, history),
              cleanMessage,
              products,
              activeState
            );
            const fallbackState = updateConversationState(activeState, fallbackStage1, cleanMessage);
            const fallbackPrefs = toStructuredPreferences(fallbackState, cleanMessage);
            const fallbackRecs = getRecommendations(fallbackPrefs, products, 3, excludeIds, false);
            if (fallbackRecs.results.length > 0) {
              updatedState = fallbackState;
              recResponse = fallbackRecs;
            }
          }
        }

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
          updatedState.lastCanonicalProductSet = toCanonicalProductSet(retrievedProducts, brandSlug);
          updatedState.lastDiscussedProductSet = [...updatedState.lastCanonicalProductSet];
        }
      }

      if (discussedProductIds.length > 0) {
        updatedState.shownProductIds = Array.from(
          new Set([...(updatedState.shownProductIds || []), ...discussedProductIds])
        );
        updatedState.previously_discussed_products = [...updatedState.shownProductIds];
        if (stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'COMPARE_PRODUCTS') {
          updatedState.lastDiscussedProductSet = toCanonicalProductSet(retrievedProducts, brandSlug);
        }
      }
    }

    // ── STAGE 3B: ACTION CONTEXT RESOLUTION (PURCHASE & CART ACTIONS) ───────
    let actionContext: ResponseActionContext | undefined = undefined;
    let cartActionPayload: CartActionPayload | undefined = undefined;
    const liveCart = buildLiveCartContext(brandSlug, body.cart);
    const liveCartView = toResponseCartContext(liveCart);

    const matchProduct = (query: string): Product | undefined => {
      if (!query) return undefined;
      const clean = query.toLowerCase().trim();
      const exact = brandProducts.find(
        (p) => p.name.toLowerCase() === clean || p.slug.toLowerCase() === clean
      );
      if (exact) return exact;
      return findProductByNameOrFuzzy(query, brandProducts);
    };

    const resolvePurchaseProduct = (): Product | null => {
      const refs = stage1.product_references?.length
        ? stage1.product_references
        : stage1.target_product_names?.length
          ? stage1.target_product_names
          : stage1.product_reference
            ? [stage1.product_reference]
            : [];
      for (const ref of refs) {
        if (ref && ref !== 'this' && ref !== 'THIS' && ref !== 'it') {
          const found = matchProduct(ref);
          if (found) return found;
        }
      }
      if (contextProductSlug) {
        const found = brandProducts.find((p) => p.slug === contextProductSlug || p.id === contextProductSlug);
        if (found) return found;
      }
      if (activeState.shownProductIds && activeState.shownProductIds.length > 0) {
        for (let i = activeState.shownProductIds.length - 1; i >= 0; i--) {
          const id = activeState.shownProductIds[i];
          const found = brandProducts.find((p) => p.id === id);
          if (found) return found;
        }
      }
      return null;
    };

    if (stage1.intent === 'PURCHASE_ASSISTANCE') {
      const referencedProd = resolvePurchaseProduct();
      actionContext = {
        intent: 'PURCHASE_ASSISTANCE',
        product: referencedProd
          ? {
              id: referencedProd.id,
              name: referencedProd.name,
              price: referencedProd.price,
              size: referencedProd.size,
              fragranceFamily: referencedProd.fragranceFamily,
            }
          : null,
        currency: STOREFRONT_CURRENCY,
        cart: liveCartView,
        available_actions: referencedProd
          ? ['ADD_TO_CART', 'VIEW_PRODUCT_PAGE', 'VIEW_CART', 'CHECKOUT']
          : ['VIEW_CART', 'BROWSE_CATALOGUE'],
        purchase_flow: {
          product_page: referencedProd ? `product page for ${referencedProd.name}` : 'brand shop',
          cart_navigation: 'header cart icon or View Cart',
          checkout_modal: 'demo_checkout_modal',
        },
        response_policy: {
          must_not_claim_completed_purchase: true,
          must_not_send_to_recommendation_ranking: true,
          must_provide_concrete_next_step: true,
          must_not_print_raw_routes: true,
          currency_is_inr: true,
        },
      };
    } else if (stage1.intent === 'CART_ASSISTANCE') {
      const cartStage1 =
        brandSlug === 'scentira'
          ? applyScentiraCartFollowUp(stage1, cleanMessage, updatedState)
          : stage1;
      const planned = planCartAssistance({
        message:
          brandSlug === 'scentira'
            ? scentiraResolvedCartMessage(cleanMessage, updatedState)
            : cleanMessage,
        stage1: cartStage1,
        brandSlug,
        brandProducts,
        state: updatedState,
        liveCart,
        contextProductSlug,
      });
      const selectedFromAdd =
        brandSlug === 'scentira' && planned.success && planned.added?.length
          ? brandProducts.filter((product) => planned.added!.includes(product.name))
          : [];
      updatedState = {
        ...updatedState,
        pendingCartAction: planned.pendingCartAction,
        lastSelectedProductSet:
          selectedFromAdd.length > 0
            ? toCanonicalProductSet(selectedFromAdd, brandSlug)
            : updatedState.lastSelectedProductSet,
      };
      const first = planned.product;
      actionContext = {
        intent: 'CART_ASSISTANCE',
        product: first
          ? {
              id: first.id,
              name: first.name,
              price: first.price,
              size: first.size,
              fragranceFamily: first.fragranceFamily,
            }
          : null,
        cart_action: {
          action: planned.action,
          success: planned.success,
          productName: planned.added?.join(', '),
          added: planned.action === 'ADD_TO_CART' ? planned.added : undefined,
          removed: planned.action === 'REMOVE_FROM_CART' ? planned.added : undefined,
          failed: planned.failed,
          partial: Boolean(planned.failed?.length) && Boolean(planned.added?.length),
          needsClarification: planned.needsClarification,
          clearedCount: planned.clearedCount,
          addedItems: planned.cartActionPayload?.added?.map((item) => ({
            productName: item.productName,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
        },
        cart: liveCartView,
        currency: STOREFRONT_CURRENCY,
        response_policy: planned.policy,
      };
      if (isAuthorizedCartMutation(planned.cartActionPayload) && !planned.policy.do_not_mutate_cart && !planned.needsClarification) {
        cartActionPayload = planned.cartActionPayload;
      }
    } else if (stage1.intent === 'OUT_OF_SCOPE') {
      actionContext = {
        intent: 'OUT_OF_SCOPE',
        response_policy: {
          must_not_answer_original_question: true,
          must_not_recommend_products: true,
          must_clarify_specialized_fragrance_assistant: true,
          must_invite_fragrance_query: true,
        },
      };
    }

    if (!actionContext) {
      actionContext = {
        intent: stage1.intent,
        cart: liveCartView,
        currency: STOREFRONT_CURRENCY,
        response_policy: {
          live_cart_is_authoritative: true,
          currency_is_inr: true,
        },
      };
    } else {
      actionContext.cart = actionContext.cart || liveCartView;
      actionContext.currency = STOREFRONT_CURRENCY;
      actionContext.response_policy = {
        ...(actionContext.response_policy || {}),
        live_cart_is_authoritative: true,
        currency_is_inr: true,
      };
    }

    const isConversationalOnly =
      stage1.intent === 'GREETING' ||
      stage1.intent === 'IDENTITY' ||
      stage1.intent === 'CAPABILITY' ||
      stage1.intent === 'OUT_OF_SCOPE' ||
      stage1.intent === 'RESET_CONSULTATION' ||
      stage1.intent === 'GENERAL_CONVERSATION' ||
      stage1.intent === 'BRAND_CONVERSATION' ||
      stage1.intent === 'CLARIFICATION' ||
      stage1.intent === 'PRODUCT_INFO' ||
      stage1.intent === 'COMPARE_PRODUCTS' ||
      Boolean(stage1.needs_clarification) ||
      (stage1.intent === 'CUSTOMER_OBJECTION' && !stage1.needs_recommendations) ||
      stage1.intent === 'PURCHASE_ASSISTANCE' ||
      stage1.intent === 'CART_ASSISTANCE';

    let hasValidRecommendations = Boolean(
      !isConversationalOnly &&
      requiresProducts &&
      !stage1.needs_clarification &&
      !stage1.has_contradiction &&
      !hardConstraintFailed &&
      canonicalResult.status !== 'NO_ALTERNATIVES' &&
      canonicalResult.status !== 'NO_VALID_MATCH' &&
      recommendationResults.length > 0
    );

    if (stage1.intent === 'CUSTOMER_OBJECTION' && hasValidRecommendations) {
      recommendationResults = recommendationResults.slice(0, 2);
    }

    const uiRecommendationResults = hasValidRecommendations ? recommendationResults : [];
    const explanationResults =
      stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'COMPARE_PRODUCTS'
        ? recommendationResults
        : uiRecommendationResults;
    const recommendationPresentation = buildRecommendationPresentation(
      explanationResults,
      canonicalResult.status,
      {
        matchedPreferences: canonicalResult.matchedPreferences,
        unmetPreferences: canonicalResult.unmetPreferences,
        tradeOff: canonicalResult.tradeOff,
        isPartialMatch: canonicalResult.isPartialMatch,
      }
    );
    const comparativeContext = buildComparativeContext(
      cleanMessage,
      stage1,
      previousProductsFromState(activeState, brandProducts),
      explanationResults.map((r) => r.product)
    );

    // ── STAGE 4: CONVERSATIONAL RESPONSE GENERATION (GROQ EXPLAINS CANONICAL RESULT) ──
    const reply = await generateConversationalResponse(
      cleanMessage,
      brand,
      stage1,
      retrievedProducts,
      explanationResults,
      updatedState,
      history,
      {
        hardConstraintFailed,
        status: canonicalResult.status,
        actionContext,
        recommendationPresentation,
        comparativeContext,
        catalogueProducts: brandProducts,
      }
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
      status: (stage1.intent === 'CLARIFICATION' || stage1.needs_clarification) ? 'CLARIFY' : canonicalResult.status,
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

    const sequentialMessages = normalizeAssistantMessages(reply, brand, stage1.intent, {
      resultsCount: hasValidRecommendations ? recommendationResults.length : 0,
      hasPreference: Boolean(
        stage1.fragrance_families?.length ||
        stage1.preferred_notes?.length ||
        stage1.updates?.length
      ),
      referencePerfume: stage1.reference_perfume,
      isPartialMatch: canonicalResult.isPartialMatch,
      tradeOff: canonicalResult.tradeOff,
      productName: recommendationResults[0]?.product.name,
      needsClarification: Boolean(stage1.needs_clarification || stage1.intent === 'CLARIFICATION'),
    });

    await appendSessionTurn(
      langchainSession,
      cleanMessage,
      sequentialMessages.join('\n') || reply,
      updatedState
    );

    const responsePayload: ChatApiResponse = {
      reply,
      messages: sequentialMessages,
      intent: stage1.intent,
      results: hasValidRecommendations ? recommendationResults : [],
      updatedState,
      sessionId: langchainSession.id,
      needsRecommendations: hasValidRecommendations,
      suggestedChips: stage1.suggested_chips || undefined,
      cartAction: cartActionPayload,
      debugInfo,
      isPartialMatch: canonicalResult.isPartialMatch,
      unmetPreferences: canonicalResult.unmetPreferences,
      matchedPreferences: canonicalResult.matchedPreferences,
      tradeOff: canonicalResult.tradeOff,
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

import { classifyIntentAndExtractPreferences, fallbackIntentClassifier } from '../src/lib/intent-classifier';
import { updateConversationState, toStructuredPreferences, createInitialConversationState } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { getProducts, getBrand } from '../src/data';
import { ConversationState } from '../src/types/chat';

function runStep(
  label: string,
  userMessage: string,
  currentState: ConversationState,
  brandSlug = 'tmperfumehouse'
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);

  const stage1 = fallbackIntentClassifier(userMessage, brand, products, currentState);
  const updatedState = updateConversationState(currentState, stage1, userMessage);
  const structuredPrefs = toStructuredPreferences(updatedState, userMessage);

  let excludeIds: string[] = [];
  if (
    stage1.intent === 'SHOW_ALTERNATIVES' ||
    userMessage.toLowerCase().includes('something else')
  ) {
    excludeIds = [...(updatedState.shownProductIds || [])];
  }

  let recResponse: any = null;
  let recResults: any[] = [];
  if (stage1.needs_recommendations) {
    recResponse = getRecommendations(structuredPrefs, products, 3, excludeIds);
    recResults = recResponse.results;
    if (recResults.length > 0) {
      updatedState.lastRecommendationIds = recResults.map((r: any) => r.product.id);
      updatedState.shownProductIds = Array.from(new Set([...(updatedState.shownProductIds || []), ...recResults.map((r: any) => r.product.id)]));
    }
  }

  const hasValidRecs = Boolean(
    stage1.needs_recommendations &&
    !recResponse?.hardConstraintFailed &&
    recResults.length > 0
  );

  const canonicalProductIds = hasValidRecs ? recResults.map((r: any) => r.product.id) : [];
  const llmProductIds = [...canonicalProductIds];
  const uiProductIds = [...canonicalProductIds];

  console.log(`\n================== ${label} ==================`);
  console.log('USER MESSAGE:            ', userMessage);
  console.log('STAGE 1 INTENT:          ', stage1.intent);
  console.log('NEEDS RECS:              ', stage1.needs_recommendations);
  console.log('HARD CONSTRAINTS FAILED: ', Boolean(recResponse?.hardConstraintFailed));
  console.log('STATE AFTER:             ', JSON.stringify(updatedState.activeRequest));
  console.log('PERSISTENT EXCLUSIONS:   ', JSON.stringify(updatedState.backgroundContext?.persistentExclusions));
  console.log('CANONICAL PRODUCT IDS:   ', canonicalProductIds);
  console.log('LLM PRODUCT IDS:         ', llmProductIds);
  console.log('UI PRODUCT IDS:          ', uiProductIds);
  if (recResults.length > 0) {
    console.log('RETURNED PRODUCTS:');
    recResults.forEach((r: any, idx: number) => {
      console.log(`  [Rank ${idx + 1}] ${r.product.name} — ${r.product.fragranceFamily.join(' · ')} | ₹${r.product.price} | intensity: ${r.product.intensity}`);
    });
  } else {
    console.log('RETURNED PRODUCTS:       NONE (Structured No-Match or Non-Rec Turn)');
    if (recResponse?.failedConstraints) {
      console.log('FAILED CONSTRAINTS:      ', recResponse.failedConstraints);
    }
  }
  console.log('==================================================================');

  return { updatedState, recResponse, canonicalProductIds };
}

async function testAll() {
  console.log('STARTING CANONICAL RECOMMENDATION SUITE VERIFICATION');

  // TEST 1 — BASIC NEGATIVE
  let s1 = createInitialConversationState();
  const t1 = runStep('TEST 1 — BASIC NEGATIVE', "I don't like sweet perfumes.", s1);
  if (t1.canonicalProductIds.length > 0) {
    throw new Error('TEST 1 FAILED: Returned products on pure negative exclusion!');
  }
  if (!t1.updatedState.activeRequest?.excludedFamilies?.includes('sweet')) {
    throw new Error('TEST 1 FAILED: Sweet not in activeRequest.excludedFamilies!');
  }

  // TEST 2 — NEGATIVE + OCCASION
  const t2 = runStep('TEST 2 — NEGATIVE + OCCASION', 'Recommend something for a date.', t1.updatedState);
  if (t2.canonicalProductIds.length === 0) {
    throw new Error('TEST 2 FAILED: Expected recommendations for date!');
  }
  const products = getProducts('tmperfumehouse');
  for (const id of t2.canonicalProductIds) {
    const p = products.find(prod => prod.id === id)!;
    if (p.fragranceFamily.includes('sweet') || p.fragranceFamily.includes('gourmand') || p.sweetness === 'sweet') {
      throw new Error(`TEST 2 FAILED: Product ${p.name} contains sweet!`);
    }
  }

  // TEST 3 — NEGATIVE + REFINEMENT ("Make it stronger.")
  const t3 = runStep('TEST 3 — NEGATIVE + REFINEMENT', 'Make it stronger.', t2.updatedState);
  for (const id of t3.canonicalProductIds) {
    const p = products.find(prod => prod.id === id)!;
    if (p.fragranceFamily.includes('sweet') || p.fragranceFamily.includes('gourmand') || p.sweetness === 'sweet') {
      throw new Error(`TEST 3 FAILED: Product ${p.name} contains sweet!`);
    }
    if (p.intensity !== 'strong' && p.intensity !== 'projection-beast') {
      throw new Error(`TEST 3 FAILED: Product ${p.name} is not strong!`);
    }
  }

  // TEST 4 — NEGATIVE + SOMETHING ELSE
  const t4 = runStep('TEST 4 — NEGATIVE + SOMETHING ELSE', 'Show me something else.', t3.updatedState);
  for (const id of t4.canonicalProductIds) {
    if (t3.canonicalProductIds.includes(id)) {
      throw new Error(`TEST 4 FAILED: Product ${id} was already shown in Test 3!`);
    }
    const p = products.find(prod => prod.id === id)!;
    if (p.fragranceFamily.includes('sweet') || p.fragranceFamily.includes('gourmand') || p.sweetness === 'sweet') {
      throw new Error(`TEST 4 FAILED: Product ${p.name} contains sweet!`);
    }
  }

  // TEST 5 — OUD
  let s5 = createInitialConversationState();
  const t5a = runStep('TEST 5a — OUD EXCLUSION', 'I hate oud.', s5);
  const t5b = runStep('TEST 5b — WOODY FOR WINTER WITHOUT OUD', 'I want something woody for winter.', t5a.updatedState);
  for (const id of t5b.canonicalProductIds) {
    const p = products.find(prod => prod.id === id)!;
    if (p.fragranceFamily.includes('oud') || p.oudLevel !== 'none') {
      throw new Error(`TEST 5 FAILED: Product ${p.name} contains oud!`);
    }
    if (!p.fragranceFamily.includes('woody') && !p.season.includes('winter')) {
      throw new Error(`TEST 5 FAILED: Product ${p.name} neither woody nor winter!`);
    }
  }

  // TEST 6 — BUDGET
  let s6 = createInitialConversationState();
  const t6a = runStep('TEST 6a — FRESH OFFICE UNDER 800', 'I want something fresh for office under ₹800.', s6);
  const t6b = runStep('TEST 6b — BUDGET UPDATE TO 1000', 'I can spend up to ₹1000.', t6a.updatedState);
  if (t6b.updatedState.activeRequest?.budget?.max !== 1000) {
    throw new Error('TEST 6 FAILED: Budget max is not 1000!');
  }
  if (!t6b.updatedState.activeRequest?.families?.includes('fresh')) {
    throw new Error('TEST 6 FAILED: Fresh was lost!');
  }
  if (t6b.updatedState.activeRequest?.occasion !== 'office') {
    throw new Error('TEST 6 FAILED: Office was lost!');
  }

  // TEST 7 — WARMER
  let s7 = createInitialConversationState();
  const t7a = runStep('TEST 7a — FRESH OFFICE UNDER 800', 'I want something fresh for office under ₹800.', s7);
  const t7b = runStep('TEST 7b — WARMER REFINEMENT', 'Make it warmer.', t7a.updatedState);
  if (t7b.updatedState.activeRequest?.warmth !== 'warmer') {
    throw new Error('TEST 7 FAILED: Warmth not set to warmer!');
  }
  if (!t7b.updatedState.activeRequest?.families?.includes('fresh')) {
    throw new Error('TEST 7 FAILED: Fresh was lost!');
  }

  // TEST 8 — STRONGER (ZERO INVALID FALLBACK)
  let s8 = createInitialConversationState();
  const t8a = runStep('TEST 8a — FRESH OFFICE UNDER 800', 'I want something fresh for office under ₹800.', s8);
  const t8b = runStep('TEST 8b — STRONGER REFINEMENT', 'Make it stronger.', t8a.updatedState);
  // Under ₹800 fresh/office, no strong perfume exists. It MUST return NO_VALID_MATCH, 0 products!
  if (t8b.canonicalProductIds.length > 0) {
    throw new Error(`TEST 8 FAILED: Expected NO_VALID_MATCH (0 products), but got: ${t8b.canonicalProductIds.join(', ')}`);
  }
  if (!t8b.recResponse?.hardConstraintFailed) {
    throw new Error('TEST 8 FAILED: Expected hardConstraintFailed = true!');
  }
  console.log('TEST 8 SUCCESS: Returned structured NO_VALID_MATCH with 0 products instead of displaying weak products!');

  console.log('\nALL 8 CANONICAL FLOW TESTS PASSED WITH 100% ACCURACY!');
}

testAll().catch(err => {
  console.error('\nTEST SUITE FAILED:', err);
  process.exit(1);
});

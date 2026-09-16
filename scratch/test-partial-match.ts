import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { normalizeAssistantMessages } from '../src/lib/message-sequencer';

async function runPartialMatchTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING COMPREHENSIVE PARTIAL-MATCH RECOMMENDATION TESTS');
  console.log('================================================================\n');

  const tmBrand = getBrand('tmperfumehouse')!;
  const wopBrand = getBrand('worldofperfumers')!;
  const almahamBrand = getBrand('almaham')!;
  const tmProducts = getProducts('tmperfumehouse');
  const wopProducts = getProducts('worldofperfumers');
  const almahamProducts = getProducts('almaham');

  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // TEST 1: Fresh + Strong with no exact match
  console.log('\n--- TEST 1: FRESH + STRONG (NO EXACT MATCH) ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something intense and refreshing.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    assert('Test 1: Status is PARTIAL_MATCH', recs.canonicalResult.status === 'PARTIAL_MATCH');
    assert('Test 1: Exactly 1 product returned', recs.results.length === 1);
    assert('Test 1: Hard constraint failed is false', recs.hardConstraintFailed === false);
    assert('Test 1: Canonical product matches result product', recs.canonicalResult.products[0].productId === recs.results[0].product.id);
    assert('Test 1: Match tier is Closest Match', recs.results[0].matchTier === 'Closest Match');
    assert('Test 1: Has trade-off explanation', Boolean(recs.tradeOff && recs.tradeOff.length > 10));

    const reply = await generateConversationalResponse(query, tmBrand, stage1, [recs.results[0].product], recs.results, updatedState, [], {
      status: recs.canonicalResult.status,
      hardConstraintFailed: recs.hardConstraintFailed,
    });
    const messages = normalizeAssistantMessages(reply, tmBrand, stage1.intent, {
      resultsCount: 1,
      isPartialMatch: true,
      tradeOff: recs.tradeOff,
      productName: recs.results[0].product.name,
    });

    console.log('Product:', recs.results[0].product.name);
    console.log('Trade-off:', recs.tradeOff);
    console.log('Messages:', messages);
    assert('Test 1: Messages appear in 2-3 sequential thoughts', messages.length >= 2 && messages.length <= 4);
    assert('Test 1: No think tag in reply', !reply.includes('<think>') && !reply.includes('</think>'));
  }

  // TEST 2: Warm + Fresh with no exact match
  console.log('\n--- TEST 2: WARM + FRESH (NO EXACT MATCH) ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something warm but still fresh.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    assert('Test 2: Produces recommendations or partial match', recs.results.length >= 1);
    assert('Test 2: Exactly 1 product if partial match', recs.canonicalResult.status !== 'PARTIAL_MATCH' || recs.results.length === 1);
    console.log('Status:', recs.canonicalResult.status, 'Product:', recs.results[0]?.product.name, 'Trade-off:', recs.tradeOff);
  }

  // TEST 3: Fresh + Strong + Budget under ₹800
  console.log('\n--- TEST 3: FRESH + STRONG + UNDER ₹800 ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something fresh, strong and under ₹800.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    assert('Test 3: Budget constraint strictly preserved (<= 800)', recs.results.every((r) => r.product.price <= 800));
    assert('Test 3: Product has fresh profile', recs.results[0].product.fragranceFamily.includes('fresh') || recs.results[0].product.freshness === 'fresh');
    assert('Test 3: Results length is 1 for partial match', recs.results.length === 1);
    console.log('Product:', recs.results[0].product.name, 'Price: ₹' + recs.results[0].product.price);
  }

  // TEST 4: Fresh + Strong + Not sweet
  console.log('\n--- TEST 4: FRESH + STRONG + NOT SWEET ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something fresh, strong and not sweet.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    assert('Test 4: Excluded sweet preserved', recs.results.every((r) => !r.product.fragranceFamily.includes('sweet') && r.product.sweetness !== 'sweet' && r.product.sweetness !== 'very-sweet'));
    assert('Test 4: Product is fresh', recs.results[0].product.fragranceFamily.includes('fresh') || recs.results[0].product.freshness === 'fresh');
    console.log('Product:', recs.results[0].product.name, 'Sweetness:', recs.results[0].product.sweetness);
  }

  // TEST 5: Hard budget impossible constraint (Genuine NO_MATCH)
  console.log('\n--- TEST 5: GENUINE NO_MATCH (UNDER ₹200) ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want a fresh fragrance under ₹200 with no musk, no leather and extremely strong projection.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    assert('Test 5: Status is NO_VALID_MATCH', recs.canonicalResult.status === 'NO_VALID_MATCH');
    assert('Test 5: Zero products returned', recs.results.length === 0);
    assert('Test 5: Hard constraint failed is true', recs.hardConstraintFailed === true);
    assert('Test 5: Never invents invalid products', recs.canonicalResult.products.length === 0);
  }

  // TEST 6: Hard note exclusion strictly preserved
  console.log('\n--- TEST 6: HARD NOTE EXCLUSION (NO LEATHER) ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something woody and strong. No leather.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    const hasLeather = recs.results.some((r) =>
      [...r.product.topNotes, ...r.product.heartNotes, ...r.product.baseNotes, ...r.product.tags, r.product.name].some((n) =>
        n.toLowerCase().includes('leather')
      )
    );
    assert('Test 6: No leather in any recommended product', !hasLeather);
  }

  // TEST 7: Hard family exclusion strictly preserved
  console.log('\n--- TEST 7: HARD FAMILY EXCLUSION (NO SWEET) ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something warm and woody. No sweet.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);

    assert('Test 7: No sweet products returned', recs.results.every((r) => !r.product.fragranceFamily.includes('sweet') && r.product.sweetness !== 'sweet' && r.product.sweetness !== 'very-sweet'));
  }

  // TEST 8: Deterministic product selection
  console.log('\n--- TEST 8: DETERMINISM CHECK ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something intense and refreshing.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);

    const recsA = getRecommendations(prefs, tmProducts);
    const recsB = getRecommendations(prefs, tmProducts);

    assert('Test 8: Same query produces same product', recsA.results[0].product.id === recsB.results[0].product.id);
    assert('Test 8: Same score', recsA.results[0].score === recsB.results[0].score);
    assert('Test 8: Same trade-off', recsA.tradeOff === recsB.tradeOff);
  }

  // TEST 9: Explanation matches actual product metadata
  console.log('\n--- TEST 9: EXPLANATION GROUNDED IN METADATA ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'I want something intense and refreshing.';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const recs = getRecommendations(prefs, tmProducts);
    const product = recs.results[0].product;

    console.log('Product intensity in metadata:', product.intensity);
    console.log('Trade-off text:', recs.tradeOff);
    if (product.intensity === 'moderate') {
      assert('Test 9: Accurately identifies moderate intensity', recs.tradeOff?.toLowerCase().includes('moderate') || recs.tradeOff?.toLowerCase().includes('softer'));
    }
  }

  // TEST 10: Partial match followed by refinement
  console.log('\n--- TEST 10: PARTIAL MATCH FOLLOWED BY REFINEMENT ---');
  {
    let state = createInitialConversationState('tmperfumehouse');
    const q1 = 'I want something intense and refreshing.';
    const s1 = await classifyIntentAndExtractPreferences(q1, tmBrand, tmProducts, [], state);
    state = updateConversationState(state, s1, q1);
    const recs1 = getRecommendations(toStructuredPreferences(state, q1), tmProducts);
    state.lastRecommendationIds = [recs1.results[0].product.id];
    state.shownProductIds = [recs1.results[0].product.id];

    assert('Turn 1: Partial match generated', recs1.canonicalResult.status === 'PARTIAL_MATCH');

    const q2 = 'Make it warmer.';
    const s2 = await classifyIntentAndExtractPreferences(q2, tmBrand, tmProducts, [{ role: 'user', content: q1 }], state);
    state = updateConversationState(state, s2, q2);

    assert('Turn 2: Refines active request (warmth = warmer)', state.activeRequest?.warmth === 'warmer');
    assert('Turn 2: Retains previous context without crash', Boolean(state.lastRecommendationIds?.length));
  }

  // TEST 11: Partial match after reset does not retain old state
  console.log('\n--- TEST 11: RESET DOES NOT RETAIN OLD STATE ---');
  {
    let state = createInitialConversationState('tmperfumehouse');
    const q1 = 'I want something intense and refreshing.';
    const s1 = await classifyIntentAndExtractPreferences(q1, tmBrand, tmProducts, [], state);
    state = updateConversationState(state, s1, q1);

    const q2 = 'Forget everything.';
    const s2 = await classifyIntentAndExtractPreferences(q2, tmBrand, tmProducts, [], state);
    state = updateConversationState(state, s2, q2);

    assert('Test 11: Reset intent recognized', s2.intent === 'RESET_CONSULTATION');
    assert(
      'Test 11: State is clean after reset',
      state.activeRequest?.families.length === 0 &&
        state.activeRequest?.intensity === null &&
        state.shownProductIds.length === 0
    );
  }

  // TEST 12: Competitor objection remains separate
  console.log('\n--- TEST 12: COMPETITOR OBJECTION SEPARATION ---');
  {
    const state = createInitialConversationState('worldofperfumers');
    const q = 'TM Perfume House has better scents.';
    const s = await classifyIntentAndExtractPreferences(q, wopBrand, wopProducts, [], state);
    assert('Test 12: Competitor objection intent', s.intent === 'CUSTOMER_OBJECTION');
    assert('Test 12: No recommendations needed for pure objection', s.needs_recommendations === false);
  }

  // TEST 13: Product info remains separate
  console.log('\n--- TEST 13: PRODUCT INFO SEPARATION ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const q = 'What are the notes in Royal Oud?';
    const s = await classifyIntentAndExtractPreferences(q, tmBrand, tmProducts, [], state);
    assert('Test 13: Product info intent', s.intent === 'PRODUCT_INFO');
  }

  // TEST 14: Missing family still suggests a closest masculine/woody stand-in
  console.log('\n--- TEST 14: OUD-ISH + MANLY WITH NO OUD IN CATALOGUE ---');
  {
    const state = createInitialConversationState('tmperfumehouse');
    const query = 'give me something oud-ish and manly';
    const stage1 = await classifyIntentAndExtractPreferences(query, tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, query);
    const prefs = toStructuredPreferences(updatedState, query);
    const noOudCatalogue = tmProducts.filter((p) => !p.fragranceFamily.includes('oud'));
    const recs = getRecommendations(prefs, noOudCatalogue);

    assert('Test 14: Intent is recommendation-like', stage1.intent === 'RECOMMENDATION' || stage1.needs_recommendations === true);
    assert('Test 14: Oud family extracted', (stage1.fragrance_families || []).includes('oud') || (prefs.fragranceFamilies || []).includes('oud'));
    assert('Test 14: Suggests at least one product', recs.results.length >= 1, `status=${recs.canonicalResult.status} count=${recs.results.length}`);
    assert('Test 14: Not a hard failure', recs.hardConstraintFailed === false);
    assert('Test 14: Partial or success status', recs.canonicalResult.status === 'PARTIAL_MATCH' || recs.canonicalResult.status === 'SUCCESS');
    if (recs.results[0]) {
      console.log('Closest stand-in:', recs.results[0].product.name, recs.results[0].product.fragranceFamily.join('/'));
      console.log('Trade-off:', recs.tradeOff);
    }
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runPartialMatchTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

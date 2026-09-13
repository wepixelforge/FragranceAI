import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { createInitialConversationState, updateConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { getProducts, getBrand } from '../src/data';
import { generateConversationalResponse } from '../src/lib/response-generator';

async function runMasterNegationTests() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  console.log('===============================================================');
  console.log('TM SCENT FINDER — MASTER NEGATION QA SUITE');
  console.log('===============================================================\n');

  // ==============================================================
  // PART 1: THE EXACT THREE FAILURES FROM THE USER PROMPT
  // ==============================================================
  console.log('--- PART 1: THE EXACT THREE FAILURES (Section 30) ---');

  const exactFailures = [
    { name: 'Test A', input: 'i dont like sweet perfume' },
    { name: 'Test B', input: 'i do not like sweet perfume' },
    { name: 'Test C', input: 'i hate sweet perfumes' }
  ];

  for (const tc of exactFailures) {
    console.log(`\n[${tc.name}] "${tc.input}"`);
    const state0 = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences(tc.input, brand, products, [], state0);
    
    assert(stage1.intent === 'PREFERENCE_UPDATE', `Intent is PREFERENCE_UPDATE (got ${stage1.intent})`);
    assert(stage1.needs_recommendations === false, `needs_recommendations is false`);
    assert(stage1.excluded_families.includes('sweet'), `excluded_families includes 'sweet'`);
    assert(!stage1.fragrance_families?.includes('sweet'), `fragrance_families does NOT contain 'sweet'`);

    const stateAfter = updateConversationState(state0, stage1, tc.input);
    assert(stateAfter.activeRequest.excludedFamilies.includes('sweet'), `stateAfter.activeRequest.excludedFamilies includes 'sweet'`);
    assert(!stateAfter.activeRequest.families.includes('sweet'), `stateAfter.activeRequest.families does NOT include 'sweet'`);

    const structured = toStructuredPreferences(stateAfter);
    assert(structured.exclusions?.fragranceFamilies?.includes('sweet'), `structured.exclusions includes 'sweet'`);

    // Even if recommendation engine is run on this state:
    const recs = getRecommendations(structured, products);
    const hasSweet = recs.canonicalResult.products.some(p => 
      p.product.fragranceFamily.includes('sweet') || 
      p.product.fragranceFamily.includes('gourmand') ||
      p.product.sweetness === 'sweet'
    );
    assert(!hasSweet, `ZERO sweet products returned by recommendation engine`);

    // Test the generated response:
    const response = await generateConversationalResponse(
      tc.input,
      brand,
      stage1,
      [],
      [],
      stateAfter
    );
    assert(!response.toLowerCase().includes('based on sweet'), `Response NEVER says 'Based on sweet'`);
  }

  // ==============================================================
  // PART 2: CONVERSATION FLOW WITH PERSISTENCE & REVERSAL (Section 29)
  // ==============================================================
  console.log('\n--- PART 2: MULTI-TURN FLOW WITH REFINEMENT & REVERSAL (Section 29) ---');

  let convState = createInitialConversationState();

  // STEP 1: "I don't like sweet perfumes."
  console.log('\n[Step 1] "I don\'t like sweet perfumes."');
  let s1 = await classifyIntentAndExtractPreferences("I don't like sweet perfumes.", brand, products, [], convState);
  convState = updateConversationState(convState, s1, "I don't like sweet perfumes.");
  assert(convState.activeRequest.excludedFamilies.includes('sweet'), `Sweet excluded in Step 1`);

  // STEP 2: "Recommend something for a date."
  console.log('\n[Step 2] "Recommend something for a date."');
  let s2 = await classifyIntentAndExtractPreferences("Recommend something for a date.", brand, products, [], convState);
  convState = updateConversationState(convState, s2, "Recommend something for a date.");
  assert(convState.activeRequest.occasion === 'date-night', `Occasion is date-night`);
  assert(convState.activeRequest.excludedFamilies.includes('sweet'), `Sweet exclusion persisted to Step 2`);
  let prefs2 = toStructuredPreferences(convState);
  let recs2 = getRecommendations(prefs2, products);
  assert(recs2.canonicalResult.products.length > 0, `Returned date night recommendations`);
  assert(!recs2.canonicalResult.products[0].product.fragranceFamily.includes('sweet'), `Primary recommendation (${recs2.canonicalResult.products[0].product.name}) is NOT sweet`);

  // STEP 3: "Show me something else."
  console.log('\n[Step 3] "Show me something else."');
  let s3 = await classifyIntentAndExtractPreferences("Show me something else.", brand, products, [], convState);
  convState = updateConversationState(convState, s3, "Show me something else.");
  assert(convState.activeRequest.occasion === 'date-night', `Occasion remains date-night`);
  assert(convState.activeRequest.excludedFamilies.includes('sweet'), `Sweet exclusion persisted to Step 3`);
  let prefs3 = toStructuredPreferences(convState, [recs2.canonicalResult.products[0].productId]);
  let recs3 = getRecommendations(prefs3, products, 3, [recs2.canonicalResult.products[0].productId]);
  assert(recs3.canonicalResult.products.length > 0, `Returned alternative recommendations`);
  assert(recs3.canonicalResult.products[0].productId !== recs2.canonicalResult.products[0].productId, `Different primary product returned`);
  assert(!recs3.canonicalResult.products[0].product.fragranceFamily.includes('sweet'), `Alternative primary (${recs3.canonicalResult.products[0].product.name}) is NOT sweet`);

  // STEP 4: "Make it stronger."
  console.log('\n[Step 4] "Make it stronger."');
  let s4 = await classifyIntentAndExtractPreferences("Make it stronger.", brand, products, [], convState);
  convState = updateConversationState(convState, s4, "Make it stronger.");
  assert(convState.activeRequest.intensity === 'strong', `Intensity updated to strong`);
  assert(convState.activeRequest.excludedFamilies.includes('sweet'), `Sweet exclusion persisted to Step 4`);
  let prefs4 = toStructuredPreferences(convState);
  let recs4 = getRecommendations(prefs4, products);
  assert(recs4.canonicalResult.products[0].product.intensity === 'strong', `Primary recommendation has strong intensity`);
  assert(!recs4.canonicalResult.products[0].product.fragranceFamily.includes('sweet'), `Strong primary (${recs4.canonicalResult.products[0].product.name}) is NOT sweet`);

  // STEP 5: "Actually, I like sweet perfumes now."
  console.log('\n[Step 5] "Actually, I like sweet perfumes now."');
  let s5 = await classifyIntentAndExtractPreferences("Actually, I like sweet perfumes now.", brand, products, [], convState);
  convState = updateConversationState(convState, s5, "Actually, I like sweet perfumes now.");
  assert(!convState.activeRequest.excludedFamilies.includes('sweet'), `Sweet removed from activeRequest.excludedFamilies`);
  assert(!convState.backgroundContext.persistentExclusions.families.includes('sweet'), `Sweet removed from background persistent exclusions`);

  // STEP 6: "Recommend something for a date."
  console.log('\n[Step 6] "Recommend something for a date." (after reversal)');
  let s6 = await classifyIntentAndExtractPreferences("Recommend something for a date.", brand, products, [], convState);
  convState = updateConversationState(convState, s6, "Recommend something for a date.");
  let prefs6 = toStructuredPreferences(convState);
  assert(!prefs6.exclusions?.fragranceFamilies?.includes('sweet'), `Exclusions no longer block sweet`);
  let recs6 = getRecommendations(prefs6, products);
  assert(recs6.canonicalResult.products.length > 0, `Returned recommendations without sweet blocking`);

  // ==============================================================
  // PART 3: ALL 12 NATURAL NEGATION VARIANTS (Section 10)
  // ==============================================================
  console.log('\n--- PART 3: ALL 12 NATURAL NEGATION VARIANTS (Section 10) ---');

  const naturalVariants = [
    "I don't like sweet perfumes.",
    "I dont like sweet perfumes.",
    "I do not like sweet perfumes.",
    "I hate sweet perfumes.",
    "I don't want sweet perfumes.",
    "Avoid sweet perfumes.",
    "Nothing sweet.",
    "Anything but sweet.",
    "Keep sweet fragrances out.",
    "Please don't show me anything sugary.",
    "I can't stand sugary perfumes.",
    "No vanilla-heavy fragrances."
  ];

  for (const v of naturalVariants) {
    const s = await classifyIntentAndExtractPreferences(v, brand, products, [], createInitialConversationState());
    assert(s.excluded_families.includes('sweet') || s.excluded_notes.includes('vanilla') || s.excluded_notes.includes('sugar'), `"${v}" correctly identified exclusion`);
    assert(!s.fragrance_families?.includes('sweet'), `"${v}" did NOT put sweet in fragrance_families`);
  }

  // ==============================================================
  // PART 4: POSITIVE VS NEGATIVE PAIRS (Section 11)
  // ==============================================================
  console.log('\n--- PART 4: POSITIVE VS NEGATIVE PAIRS (Section 11) ---');

  const pairs = [
    { pos: "I like sweet perfumes.", neg: "I don't like sweet perfumes.", attr: 'sweet' },
    { pos: "I like oud.", neg: "I hate oud.", attr: 'oud' },
    { pos: "I want something strong.", neg: "I don't want anything strong.", attr: 'strong' },
    { pos: "I want something fresh.", neg: "I don't want anything fresh.", attr: 'fresh' }
  ];

  for (const p of pairs) {
    const sPos = await classifyIntentAndExtractPreferences(p.pos, brand, products, [], createInitialConversationState());
    const sNeg = await classifyIntentAndExtractPreferences(p.neg, brand, products, [], createInitialConversationState());

    if (p.attr === 'strong') {
      assert(sPos.intensity === 'strong', `"${p.pos}" -> intensity: strong`);
      assert(sNeg.intensity === 'subtle', `"${p.neg}" -> intensity: subtle`);
    } else {
      assert(sPos.fragrance_families?.includes(p.attr) || sPos.preferred_notes?.includes(p.attr), `"${p.pos}" -> positive ${p.attr}`);
      assert(sNeg.excluded_families?.includes(p.attr) || sNeg.excluded_notes?.includes(p.attr), `"${p.neg}" -> excluded ${p.attr}`);
      assert(!sNeg.fragrance_families?.includes(p.attr), `"${p.neg}" -> ${p.attr} strictly absent from positive families`);
    }
  }

  console.log('\n===============================================================');
  console.log(`TOTAL QA TESTS COMPLETED: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runMasterNegationTests().catch(console.error);

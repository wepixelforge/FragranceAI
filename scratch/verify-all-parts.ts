import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';

async function runVerification() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  let failures = 0;

  function assert(cond: boolean, desc: string, details?: any) {
    if (cond) {
      console.log(`✅ PASS: ${desc}`);
    } else {
      console.error(`❌ FAIL: ${desc}`);
      if (details) console.error('   Details:', details);
      failures++;
    }
  }

  console.log('============================================================');
  console.log('TEST SUITE: USER PROMPT VERIFICATION (PARTS 1, 2, 3, 4)');
  console.log('============================================================\n');

  // PART 1: REPLACEMENT VS COMBINATION
  console.log('--- PART 1: Replacement vs Combination ---');
  
  // 1.1 "Actually, make it warm." -> REPLACEMENT
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something fresh.');
    let recs1 = getRecommendations(toStructuredPreferences(s), products, 3);
    assert(recs1.results.some(r => r.product.name === 'Ocean Breeze'), 'Turn 1 includes Ocean Breeze');

    let s2 = await classifyIntentAndExtractPreferences('Actually, make it warm.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], s);
    s = updateConversationState(s, s2, 'Actually, make it warm.');
    let recs2 = getRecommendations(toStructuredPreferences(s), products, 3);
    assert(s.activeRequest.warmth === 'warmer', 'Turn 2 warmth is warmer');
    assert(s.activeRequest.freshness === null, 'Turn 2 freshness is null (replaced)');
    assert(!s.activeRequest.families.includes('fresh'), 'Turn 2 fresh family removed');
    assert(recs2.results.some(r => r.product.name === 'Royal Oud'), 'Turn 2 includes Royal Oud');
    assert(recs2.results.some(r => r.product.name === 'Cedar Noir'), 'Turn 2 includes Cedar Noir');
    assert(recs2.results.some(r => r.product.name === 'Amber Nights'), 'Turn 2 includes Amber Nights');
  }

  // 1.2 "Make it warm instead." -> REPLACEMENT
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something fresh.');
    let s2 = await classifyIntentAndExtractPreferences('Make it warm instead.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], s);
    s = updateConversationState(s, s2, 'Make it warm instead.');
    assert(s.activeRequest.warmth === 'warmer', 'Turn 2 warmth is warmer ("instead")');
    assert(s.activeRequest.freshness === null, 'Turn 2 freshness is null ("instead")');
  }

  // 1.3 "Forget fresh, make it warm." -> REPLACEMENT
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something fresh.');
    let s2 = await classifyIntentAndExtractPreferences('Forget fresh, make it warm.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], s);
    s = updateConversationState(s, s2, 'Forget fresh, make it warm.');
    assert(s.activeRequest.warmth === 'warmer', 'Turn 2 warmth is warmer ("forget fresh")');
    assert(s.activeRequest.freshness === null, 'Turn 2 freshness is null ("forget fresh")');
  }

  // 1.4 "Keep it fresh but make it warmer." -> COMBINATION
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something fresh.');
    let s2 = await classifyIntentAndExtractPreferences('Keep it fresh but make it warmer.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], s);
    s = updateConversationState(s, s2, 'Keep it fresh but make it warmer.');
    assert(s.activeRequest.freshness === 'fresher' || s.activeRequest.families.includes('fresh'), 'Fresh retained in combination ("keep it fresh")');
    assert(s.activeRequest.warmth === 'warmer', 'Warmth is warmer in combination');
    let recs = getRecommendations(toStructuredPreferences(s), products, 3);
    assert(recs.results.length > 0, 'Combination returns matching fresh+warmer scents');
  }

  // 1.5 "Something fresh but warmer." -> COMBINATION
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something fresh.');
    let s2 = await classifyIntentAndExtractPreferences('Something fresh but warmer.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], s);
    s = updateConversationState(s, s2, 'Something fresh but warmer.');
    assert(s.activeRequest.freshness === 'fresher' || s.activeRequest.families.includes('fresh'), 'Fresh retained in combination ("fresh but warmer")');
    assert(s.activeRequest.warmth === 'warmer', 'Warmth is warmer in combination');
  }

  // PART 2: FRESH + STRONG COMBINATION
  console.log('\n--- PART 2: Fresh + Strong Combination ---');
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something fresh.');
    let s2 = await classifyIntentAndExtractPreferences('Make it strong.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], s);
    s = updateConversationState(s, s2, 'Make it strong.');
    
    assert(s.activeRequest.freshness === 'fresher' || s.activeRequest.families.includes('fresh'), 'Active request retains fresh');
    assert(s.activeRequest.intensity === 'strong', 'Active request sets intensity=strong');

    let recs = getRecommendations(toStructuredPreferences(s), products, 3);
    assert(recs.canonicalResult.status === 'NO_VALID_MATCH', 'Catalogue truth: TM has 0 fresh+strong -> NO_VALID_MATCH');
    assert(recs.results.length === 0, 'Results array is empty for fresh+strong in TM');
    assert(recs.canonicalResult.products.length === 0, 'Canonical products array is empty');

    let reply = await generateConversationalResponse('Make it strong.', brand, s2, recs.results.map(r => r.product), recs.results, s, [], {
      status: recs.canonicalResult.status,
      hardConstraintFailed: recs.hardConstraintFailed,
      failedConstraints: recs.failedConstraints
    });
    console.log('   Fresh+Strong reply:', reply);
    assert(reply.includes("don't currently have") || reply.includes("doesn't") || reply.includes("combine"), 'Explanation explains fresh + strong conflict');
    assert(reply.includes("keep it fresh") || reply.includes("strongest"), 'Explanation offers honest relaxation choices');
  }

  // PART 3: "SHOW ME OPTIONS" PRESERVES CONSTRAINTS
  console.log('\n--- PART 3: Show Me Options Never Relaxes Constraints ---');
  {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something strong.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something strong.');
    let s2 = await classifyIntentAndExtractPreferences('But not loud.', brand, products, [{ role: 'user', content: 'I want something strong.' }], s);
    s = updateConversationState(s, s2, 'But not loud.');
    assert(s.activeRequest.intensity === 'strong', 'Intensity remains strong');
    assert(s.activeRequest.sillageMax === 'moderate', 'SillageMax is moderate');

    // Turn 3: "Show me options."
    let s3 = await classifyIntentAndExtractPreferences('Show me options.', brand, products, [
      { role: 'user', content: 'I want something strong.' },
      { role: 'user', content: 'But not loud.' }
    ], s);
    s = updateConversationState(s, s3, 'Show me options.');
    assert(s.activeRequest.intensity === 'strong', 'Turn 3 intensity remains strong');
    assert(s.activeRequest.sillageMax === 'moderate', 'Turn 3 sillageMax remains moderate');

    let recs3 = getRecommendations(toStructuredPreferences(s), products, 3);
    assert(recs3.canonicalResult.status === 'NO_VALID_MATCH' || recs3.canonicalResult.status === 'NO_ALTERNATIVES', 'Status is NO_MATCH/NO_ALTERNATIVES');
    assert(recs3.results.length === 0, 'UI recommendation cards are strictly empty (0 products)');
    assert(recs3.canonicalResult.products.length === 0, 'Canonical products is strictly empty');
  }

  // Alternative request variations
  const altPhrases = [
    'show me something else',
    'another option',
    'give me alternatives',
    'anything else?',
    'show options',
    'what else do you have?'
  ];

  for (const phrase of altPhrases) {
    let s = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something strong.', brand, products, [], s);
    s = updateConversationState(s, s1, 'I want something strong.');
    let s2 = await classifyIntentAndExtractPreferences('But not loud.', brand, products, [{ role: 'user', content: 'I want something strong.' }], s);
    s = updateConversationState(s, s2, 'But not loud.');

    let s3 = await classifyIntentAndExtractPreferences(phrase, brand, products, [
      { role: 'user', content: 'I want something strong.' },
      { role: 'user', content: 'But not loud.' }
    ], s);
    s = updateConversationState(s, s3, phrase);
    let recs = getRecommendations(toStructuredPreferences(s), products, 3);
    assert(recs.results.length === 0, `"${phrase}" preserves constraints and returns 0 products`);
  }

  console.log('\n============================================================');
  console.log(`RESULTS: ${failures === 0 ? 'ALL TESTS PASSED 🎉' : `${failures} FAILURES`}`);
  console.log('============================================================');
}

runVerification().catch(console.error);

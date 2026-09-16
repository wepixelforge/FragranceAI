/**
 * Master QA Test Suite for TM Scent Finder
 * Validates all 33 test cases across 11 sections (A through K)
 */

async function main() {
  const baseUrl = 'http://localhost:3000/api/chat';
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  function assert(condition: boolean, desc: string, detail?: any) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      if (detail) console.error('     Detail:', JSON.stringify(detail, null, 2));
      failed++;
      failures.push(desc);
    }
  }

  async function postMessage(message: string, state?: any, history: any[] = [], brandSlug = 'tmperfumehouse') {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        brandSlug,
        conversationState: state,
        history,
      }),
    });
    return res.json();
  }

  console.log('\n===============================================================');
  console.log('TM SCENT FINDER — MASTER ARCHITECTURAL QA SUITE (33 TESTS)');
  console.log('===============================================================\n');

  // ==========================================
  // SECTION A: BASIC
  // ==========================================
  console.log('\n--- SECTION A: BASIC ---');

  // Test 1: hi
  console.log('\n[Test 1] "hi"');
  let data = await postMessage('hi');
  assert(data.intent === 'GREETING', 'Intent is GREETING', data.intent);
  assert(data.results.length === 0, 'No products returned for greeting', data.results.length);
  assert(!data.needsRecommendations, 'needsRecommendations is false', data.needsRecommendations);

  // Test 2: who are you?
  console.log('\n[Test 2] "who are you?"');
  data = await postMessage('who are you?');
  assert(data.intent === 'IDENTITY', 'Intent is IDENTITY', data.intent);
  assert(data.results.length === 0, 'No products returned for identity', data.results.length);

  // Test 3: what can you help me with?
  console.log('\n[Test 3] "what can you help me with?"');
  data = await postMessage('what can you help me with?');
  assert(data.intent === 'CAPABILITY', 'Intent is CAPABILITY', data.intent);
  assert(data.results.length === 0, 'No products returned for capability', data.results.length);

  // Test 4: how are you?
  console.log('\n[Test 4] "how are you?"');
  data = await postMessage('how are you?');
  assert(data.intent === 'GREETING', 'Intent is GREETING/conversational', data.intent);
  assert(data.results.length === 0, 'No products returned for conversation', data.results.length);

  // Test 5: what's the capital of France?
  console.log('\n[Test 5] "what\'s the capital of France?"');
  data = await postMessage("what's the capital of France?");
  assert(data.intent === 'OUT_OF_SCOPE', 'Intent is OUT_OF_SCOPE', data.intent);
  assert(data.results.length === 0, 'No products returned for out-of-scope', data.results.length);
  assert(!data.reply.toLowerCase().includes('paris'), 'Does NOT answer Paris', data.reply);
  assert(data.reply.toLowerCase().includes('perfume') || data.reply.toLowerCase().includes('fragrance'), 'Politely redirects to fragrance', data.reply);
  assert(!data.updatedState.activeRequest?.occasion, 'No occasion preference mutated', data.updatedState.activeRequest);

  // ==========================================
  // SECTION B: RECOMMENDATION
  // ==========================================
  console.log('\n--- SECTION B: RECOMMENDATION ---');

  // Test 6: i want something fresh
  console.log('\n[Test 6] "i want something fresh"');
  data = await postMessage('i want something fresh');
  assert(data.results.length > 0, 'Returns fresh recommendations', data.results.length);
  assert(
    data.results[0].product.fragranceFamily.includes('fresh') ||
    data.results[0].product.fragranceFamily.includes('citrus') ||
    data.results[0].product.fragranceFamily.includes('aquatic'),
    'Best match has fresh/citrus/aquatic family',
    data.results[0].product.fragranceFamily
  );

  // Test 7: i want something fresh and woody for office under ₹800
  console.log('\n[Test 7] "i want something fresh and woody for office under ₹800"');
  data = await postMessage('i want something fresh and woody for office under ₹800');
  assert(data.results.length > 0, 'Returns results for fresh + woody + office under 800', data.results.length);
  const allUnder800 = data.results.every((r: any) => r.product.price <= 800);
  assert(allUnder800, 'Every returned product is <= ₹800', data.results.map((r: any) => r.product.price));
  assert(
    data.results.some((r: any) => r.product.occasion.includes('office') || r.product.occasion.includes('daily')),
    'Results fit office wear',
    data.results.map((r: any) => r.product.occasion)
  );

  // Test 8: i want something spicy for a date
  console.log('\n[Test 8] "i want something spicy for a date"');
  data = await postMessage('i want something spicy for a date');
  assert(data.results.length > 0, 'Returns results for spicy date night', data.results.length);
  assert(
    data.results[0].product.occasion.includes('date-night') || data.results[0].product.occasion.includes('evening'),
    'Best match fits date-night occasion',
    data.results[0].product.occasion
  );

  // Test 9: i want something woody and strong for winter
  console.log('\n[Test 9] "i want something woody and strong for winter"');
  data = await postMessage('i want something woody and strong for winter');
  assert(data.results.length > 0, 'Returns woody + strong + winter', data.results.length);
  assert(
    data.results[0].product.intensity === 'strong' || data.results[0].product.intensity === 'projection-beast',
    'Best match has strong intensity',
    data.results[0].product.intensity
  );

  // Test 10: i want something light and fresh for summer
  console.log('\n[Test 10] "i want something light and fresh for summer"');
  data = await postMessage('i want something light and fresh for summer');
  assert(data.results.length > 0, 'Returns light + fresh + summer', data.results.length);
  assert(
    data.results[0].product.intensity === 'subtle' || data.results[0].product.intensity === 'moderate',
    'Best match has light/subtle or moderate intensity',
    data.results[0].product.intensity
  );

  // ==========================================
  // SECTION C: BUDGET
  // ==========================================
  console.log('\n--- SECTION C: BUDGET ---');

  // Test 11: fresh for office under ₹800 -> then: i have ₹500
  console.log('\n[Test 11] "fresh for office under ₹800" -> "i have ₹500"');
  let step1Res = await postMessage('i want something fresh for office under ₹800');
  let step1State = step1Res.updatedState;
  let step2Res = await postMessage('i have ₹500', step1State, [{ role: 'user', content: 'i want something fresh for office under ₹800' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.budget?.max === 500, 'Budget max updated to 500', step2Res.updatedState.activeRequest?.budget);
  assert(step2Res.results.length > 0, 'Results rerun for <= 500', step2Res.results.length);
  assert(step2Res.results.every((r: any) => r.product.price <= 500), 'Every product is strictly <= ₹500', step2Res.results.map((r: any) => r.product.price));
  assert(step2Res.updatedState.activeRequest?.occasion === 'office', 'Occasion remains office', step2Res.updatedState.activeRequest?.occasion);

  // Test 12: fresh for office under ₹500 -> then: i can spend up to ₹1000
  console.log('\n[Test 12] "fresh for office under ₹500" -> "i can spend up to ₹1000"');
  step1Res = await postMessage('i want something fresh for office under ₹500');
  step1State = step1Res.updatedState;
  step2Res = await postMessage('i can spend up to ₹1000', step1State, [{ role: 'user', content: 'i want something fresh for office under ₹500' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.budget?.max === 1000, 'Budget max updated to 1000', step2Res.updatedState.activeRequest?.budget);
  assert(step2Res.results.length > 0, 'Recommendations rerun', step2Res.results.length);
  assert(step2Res.results.every((r: any) => r.product.price <= 1000), 'Every product is <= ₹1000', step2Res.results.map((r: any) => r.product.price));

  // Test 13: fresh for office under ₹800 -> then: i don't have a budget
  console.log('\n[Test 13] "fresh for office under ₹800" -> "i don\'t have a budget"');
  step1Res = await postMessage('i want something fresh for office under ₹800');
  step1State = step1Res.updatedState;
  step2Res = await postMessage("i don't have a budget", step1State, [{ role: 'user', content: 'i want something fresh for office under ₹800' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.budget?.max === null, 'Budget is null (removed)', step2Res.updatedState.activeRequest?.budget);
  assert(step2Res.updatedState.activeRequest?.occasion === 'office', 'Occasion preserved as office', step2Res.updatedState.activeRequest?.occasion);
  assert(step2Res.results.length > 0, 'Reruns recommendations without budget limit', step2Res.results.length);

  // ==========================================
  // SECTION D: REFINEMENT
  // ==========================================
  console.log('\n--- SECTION D: REFINEMENT ---');

  // Test 14: fresh for office -> then: make it stronger
  console.log('\n[Test 14] "fresh for office" -> "make it stronger"');
  step1Res = await postMessage('i want something fresh for office');
  step1State = step1Res.updatedState;
  step2Res = await postMessage('make it stronger', step1State, [{ role: 'user', content: 'i want something fresh for office' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.intensity === 'strong', 'Intensity updated to strong', step2Res.updatedState.activeRequest?.intensity);
  assert(step2Res.results.length > 0, 'Returns recommendations', step2Res.results.length);

  // Test 15: make it lighter
  console.log('\n[Test 15] "fresh for office" -> "make it lighter"');
  step2Res = await postMessage('make it lighter', step1State, [{ role: 'user', content: 'i want something fresh for office' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.intensity === 'subtle', 'Intensity updated to subtle', step2Res.updatedState.activeRequest?.intensity);
  assert(step2Res.results[0].product.intensity === 'subtle' || step2Res.results[0].product.intensity === 'moderate', 'Top match is subtle/moderate', step2Res.results[0].product.intensity);

  // Test 16: make it warmer
  console.log('\n[Test 16] "fresh for office" -> "make it warmer"');
  step2Res = await postMessage('make it warmer', step1State, [{ role: 'user', content: 'i want something fresh for office' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.warmth === 'warmer', 'Warmth updated to warmer', step2Res.updatedState.activeRequest?.warmth);
  assert(
    step2Res.results[0].product.warmth === 'warm' || step2Res.results[0].product.warmth === 'very-warm' || step2Res.results[0].product.id === 'tm-005',
    'Ranking updated toward warmer profile (e.g. Cedar Noir)',
    step2Res.results[0].product.name
  );

  // ==========================================
  // SECTION E: NEGATIVE PREFERENCES
  // ==========================================
  console.log('\n--- SECTION E: NEGATIVE PREFERENCES ---');

  // Test 17: i don't like sweet perfumes
  console.log('\n[Test 17] "i don\'t like sweet perfumes"');
  data = await postMessage("i don't like sweet perfumes");
  assert(
    data.updatedState.activeRequest?.excludedFamilies?.includes('sweet') ||
    data.updatedState.backgroundContext?.persistentExclusions?.families?.includes('sweet'),
    'Sweet family excluded',
    data.updatedState.backgroundContext?.persistentExclusions?.families
  );
  if (data.results.length > 0) {
    const hasSweet = data.results.some((r: any) => r.product.fragranceFamily.includes('sweet'));
    assert(!hasSweet, 'Zero sweet products returned in results', data.results.map((r: any) => r.product.name));
  }

  // Test 18: i hate oud -> then: show me something woody for winter
  console.log('\n[Test 18] "i hate oud" -> "show me something woody for winter"');
  step1Res = await postMessage('i hate oud');
  step1State = step1Res.updatedState;
  step2Res = await postMessage('show me something woody for winter', step1State, [{ role: 'user', content: 'i hate oud' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.results.length > 0, 'Returns woody winter recommendations', step2Res.results.length);
  const hasOud = step2Res.results.some((r: any) => r.product.fragranceFamily.includes('oud') || r.product.name.toLowerCase().includes('oud') || r.product.oudLevel === 'dominant');
  assert(!hasOud, 'ZERO oud products in recommendations', step2Res.results.map((r: any) => r.product.name));

  // Test 19: i don't want anything too strong -> then: recommend something for a date
  console.log('\n[Test 19] "i don\'t want anything too strong" -> "recommend something for a date"');
  step1Res = await postMessage("i don't want anything too strong");
  step1State = step1Res.updatedState;
  step2Res = await postMessage('recommend something for a date', step1State, [{ role: 'user', content: "i don't want anything too strong" }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.results.length > 0, 'Returns date recommendations', step2Res.results.length);
  assert(step2Res.results[0].product.intensity !== 'strong' && step2Res.results[0].product.intensity !== 'projection-beast', 'Primary recommendation is NOT strong', step2Res.results[0].product.intensity);

  // Test 20: i don't like sweet perfumes -> actually i like sweet perfumes now -> recommend something for a date
  console.log('\n[Test 20] "i don\'t like sweet perfumes" -> "actually i like sweet perfumes now" -> "recommend something for a date"');
  step1Res = await postMessage("i don't like sweet perfumes");
  step1State = step1Res.updatedState;
  let step2Rev = await postMessage('actually i like sweet perfumes now', step1State, [{ role: 'user', content: "i don't like sweet perfumes" }, { role: 'assistant', content: step1Res.reply }]);
  assert(
    !step2Rev.updatedState.backgroundContext?.persistentExclusions?.families?.includes('sweet'),
    'Sweet exclusion removed from persistent exclusions',
    step2Rev.updatedState.backgroundContext?.persistentExclusions
  );
  let step3Res = await postMessage('recommend something for a date', step2Rev.updatedState, [{ role: 'user', content: 'actually i like sweet perfumes now' }, { role: 'assistant', content: step2Rev.reply }]);
  assert(step3Res.results.length > 0, 'Returns date recommendations without sweet blocking', step3Res.results.length);

  // ==========================================
  // SECTION F: REFERENCE
  // ==========================================
  console.log('\n--- SECTION F: REFERENCE ---');

  // Test 21: i usually wear Dior Sauvage
  console.log('\n[Test 21] "i usually wear Dior Sauvage"');
  data = await postMessage('i usually wear Dior Sauvage');
  assert(
    data.updatedState.backgroundContext?.referencePerfume === 'Dior Sauvage' ||
    data.updatedState.backgroundContext?.usualFragrances?.includes('Dior Sauvage'),
    'Reference stored in background context',
    data.updatedState.backgroundContext
  );
  assert(data.results.length === 0, 'No products automatically returned for background reference', data.results.length);

  // Test 22: give me something similar to Dior Sauvage
  console.log('\n[Test 22] "give me something similar to Dior Sauvage"');
  data = await postMessage('give me something similar to Dior Sauvage');
  assert(data.results.length > 0, 'Returns similarity recommendations', data.results.length);
  assert(
    data.results[0].product.similarTo.some((s: string) => s.toLowerCase().includes('sauvage')),
    'Best match is inspired by / similar to Dior Sauvage (e.g. Cedar Noir)',
    data.results[0].product.similarTo
  );

  // Test 23: i want something light and fresh for summer (new direction)
  console.log('\n[Test 23] "i want something light and fresh for summer" (after Sauvage)');
  step2Res = await postMessage('i want something light and fresh for summer', data.updatedState, [{ role: 'user', content: 'give me something similar to Dior Sauvage' }, { role: 'assistant', content: data.reply }]);
  assert(step2Res.results.length > 0, 'Returns summer recommendations', step2Res.results.length);
  assert(
    step2Res.updatedState.activeRequest?.season === 'summer' && step2Res.updatedState.activeRequest?.families?.includes('fresh'),
    'New direction active without Sauvage forcing',
    step2Res.updatedState.activeRequest
  );

  // ==========================================
  // SECTION G: ALTERNATIVES
  // ==========================================
  console.log('\n--- SECTION G: ALTERNATIVES ---');

  // Test 24: fresh for office under ₹800 -> then: show me something else
  console.log('\n[Test 24] "fresh for office under ₹800" -> "show me something else"');
  step1Res = await postMessage('i want something fresh for office under ₹800');
  const firstIds = step1Res.results.map((r: any) => r.product.id);
  step2Res = await postMessage('show me something else', step1Res.updatedState, [{ role: 'user', content: 'i want something fresh for office under ₹800' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.results.length > 0, 'Returns alternative products', step2Res.results.length);
  const secondIds = step2Res.results.map((r: any) => r.product.id);
  const overlapsFirstPrimary = secondIds[0] === firstIds[0];
  assert(!overlapsFirstPrimary, 'Primary match is different from previous primary match', { firstPrimary: firstIds[0], secondPrimary: secondIds[0] });

  // ==========================================
  // SECTION H: NEW REQUEST
  // ==========================================
  console.log('\n--- SECTION H: NEW REQUEST ---');

  // Test 25: spicy for a date -> then: light and fresh for summer
  console.log('\n[Test 25] "spicy for a date" -> "i want something light and fresh for summer"');
  step1Res = await postMessage('i want something spicy for a date');
  step2Res = await postMessage('i want something light and fresh for summer', step1Res.updatedState, [{ role: 'user', content: 'i want something spicy for a date' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.occasion !== 'date-night', 'Stale date occasion cleared', step2Res.updatedState.activeRequest?.occasion);
  assert(!step2Res.updatedState.activeRequest?.families?.includes('spicy'), 'Stale spicy family cleared', step2Res.updatedState.activeRequest?.families);
  assert(step2Res.updatedState.activeRequest?.families?.includes('fresh'), 'Fresh family active', step2Res.updatedState.activeRequest?.families);

  // ==========================================
  // SECTION I: PRODUCT INFO
  // ==========================================
  console.log('\n--- SECTION I: PRODUCT INFO ---');

  // Test 26: tell me about Royal Oud
  console.log('\n[Test 26] "tell me about Royal Oud"');
  data = await postMessage('tell me about Royal Oud');
  assert(data.intent === 'PRODUCT_INFO', 'Intent is PRODUCT_INFO', data.intent);
  assert(data.results.length === 1, 'Returns single product info result', data.results.length);
  assert(data.results[0].product.name === 'Royal Oud', 'Product is Royal Oud', data.results[0].product.name);
  assert(data.results[0].matchTier !== 'Best Match', 'Card is NOT labeled Best Match (Spotlight instead)', data.results[0].matchTier);

  // ==========================================
  // SECTION J: COMPARISON
  // ==========================================
  console.log('\n--- SECTION J: COMPARISON ---');

  // Test 27: compare Royal Oud and Cedar Noir
  console.log('\n[Test 27] "compare Royal Oud and Cedar Noir"');
  data = await postMessage('compare Royal Oud and Cedar Noir');
  assert(data.intent === 'COMPARE_PRODUCTS', 'Intent is COMPARE_PRODUCTS', data.intent);
  assert(data.results.length === 2, 'Returns both compared products', data.results.length);
  assert(data.results[0].matchTier !== 'Best Match', 'Comparison product 1 NOT labeled Best Match', data.results[0].matchTier);
  assert(data.results[1].matchTier !== 'Best Match', 'Comparison product 2 NOT labeled Best Match', data.results[1].matchTier);

  // ==========================================
  // SECTION K: NATURAL LANGUAGE
  // ==========================================
  console.log('\n--- SECTION K: NATURAL LANGUAGE ---');

  // Test 28: I need something I can wear to meetings that smells crisp but doesn't fill the room.
  console.log('\n[Test 28] "I need something I can wear to meetings that smells crisp but doesn\'t fill the room."');
  data = await postMessage("I need something I can wear to meetings that smells crisp but doesn't fill the room.");
  assert(data.results.length > 0, 'Returns recommendations for meeting crisp low-projection', data.results.length);
  assert(data.results[0].product.intensity !== 'strong', 'Top match does not fill the room (subtle/moderate)', data.results[0].product.intensity);

  // Test 29: I want something for dinner where I smell confident but not like I'm trying too hard.
  console.log('\n[Test 29] "I want something for dinner where I smell confident but not like I\'m trying too hard."');
  data = await postMessage("I want something for dinner where I smell confident but not like I'm trying too hard.");
  assert(data.results.length > 0, 'Returns recommendations for dinner', data.results.length);
  assert(data.results[0].product.intensity !== 'projection-beast', 'Not overpowering/trying too hard', data.results[0].product.intensity);

  // Test 30: Anything but sugary scents.
  console.log('\n[Test 30] "Anything but sugary scents."');
  data = await postMessage('Anything but sugary scents.');
  assert(
    data.updatedState.backgroundContext?.persistentExclusions?.families?.includes('sweet') ||
    data.updatedState.activeRequest?.excludedFamilies?.includes('sweet'),
    'Sweet excluded for sugary scents',
    data.updatedState.backgroundContext?.persistentExclusions
  );

  // Test 31: Keep it below seven hundred bucks.
  console.log('\n[Test 31] "Keep it below seven hundred bucks."');
  data = await postMessage('Keep it below seven hundred bucks.');
  assert(data.updatedState.activeRequest?.budget?.max === 700, 'Budget parsed as <= 700 from seven hundred bucks', data.updatedState.activeRequest?.budget);

  // Test 32: Can you make the last suggestions a little more intense?
  console.log('\n[Test 32] "Can you make the last suggestions a little more intense?"');
  step1Res = await postMessage('i want something fresh for office');
  step2Res = await postMessage('Can you make the last suggestions a little more intense?', step1Res.updatedState, [{ role: 'user', content: 'i want something fresh for office' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.intensity === 'strong', 'Intensity updated to strong', step2Res.updatedState.activeRequest?.intensity);

  // Test 33: same kind of fragrance, but something cheaper (NO INVENTED 600!)
  console.log('\n[Test 33] "same kind of fragrance, but something cheaper"');
  step1Res = await postMessage('i want something fresh for office under ₹800');
  step2Res = await postMessage('same kind of fragrance, but something cheaper', step1Res.updatedState, [{ role: 'user', content: 'i want something fresh for office under ₹800' }, { role: 'assistant', content: step1Res.reply }]);
  assert(step2Res.updatedState.activeRequest?.relativePrice === 'cheaper', 'Relative price flagged as cheaper', step2Res.updatedState.activeRequest?.relativePrice);
  assert(step2Res.updatedState.activeRequest?.budget?.max !== 600, 'DID NOT INVENT ₹600 BUDGET', step2Res.updatedState.activeRequest?.budget);
  assert(step2Res.results.length > 0, 'Found cheaper recommendations', step2Res.results.map((r: any) => ({ name: r.product.name, price: r.product.price })));

  console.log('\n===============================================================');
  console.log(`TOTAL QA TESTS COMPLETED: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('===============================================================\n');

  if (failed > 0) {
    console.error('FAILURES SUMMARY:');
    failures.forEach((f, i) => console.error(`${i + 1}. ${f}`));
    process.exit(1);
  } else {
    console.log('🎉 ALL 33 TESTS PASSED WITH 0 FAILURES!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});

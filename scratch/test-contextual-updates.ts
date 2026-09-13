/**
 * Test Suite: Contextual Budget Updates and Preference Refinements
 */

async function main() {
  const baseUrl = 'http://localhost:3000/api/chat';
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string, detail?: any) {
    if (condition) {
      console.log(`  ✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${desc}`);
      if (detail) console.error('     Detail:', JSON.stringify(detail));
      failed++;
    }
  }

  console.log('\n===============================================================');
  console.log('TEST SUITE: CONTEXTUAL BUDGET UPDATES & PREFERENCE REFINEMENTS');
  console.log('===============================================================\n');

  // ─────────────────────────────────────────────────────────────
  // 1. ACCEPTANCE CONVERSATION: 4-STEP CHAIN
  // ─────────────────────────────────────────────────────────────
  console.log('--- TEST 1: ACCEPTANCE CONVERSATION CHAIN ---');
  let history: any[] = [];
  let conversationState: any = undefined;

  // Step 1: "I want something fresh for office under 800rs"
  console.log('\nStep 1: "I want something fresh for office under 800rs"');
  let res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want something fresh for office under 800rs',
      brandSlug: 'tmperfumehouse',
      history,
      conversationState,
    }),
  });
  let data = await res.json();
  conversationState = data.updatedState;
  history.push({ role: 'user', content: 'I want something fresh for office under 800rs' });
  history.push({ role: 'assistant', content: data.reply });

  assert(
    conversationState.currentConsultation.occasion === 'office',
    'Step 1: Occasion is office',
    conversationState.currentConsultation.occasion
  );
  assert(
    conversationState.currentConsultation.fragrance_families.includes('fresh'),
    'Step 1: Fragrance family includes fresh',
    conversationState.currentConsultation.fragrance_families
  );
  assert(
    conversationState.currentConsultation.budget_max === 800,
    'Step 1: Budget max is 800',
    conversationState.currentConsultation.budget_max
  );
  assert(
    data.results && data.results.length > 0,
    'Step 1: Returns recommendations',
    data.results.length
  );
  assert(
    data.results.every((r: any) => r.product.price <= 800),
    'Step 1: All recommendations <= ₹800'
  );

  // Step 2: "I have 500rs"
  console.log('\nStep 2: "I have 500rs" (Refinement: budget lowered)');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I have 500rs',
      brandSlug: 'tmperfumehouse',
      history,
      conversationState,
    }),
  });
  data = await res.json();
  conversationState = data.updatedState;
  history.push({ role: 'user', content: 'I have 500rs' });
  history.push({ role: 'assistant', content: data.reply });

  assert(
    conversationState.currentConsultation.occasion === 'office',
    'Step 2: Occasion "office" PRESERVED',
    conversationState.currentConsultation.occasion
  );
  assert(
    conversationState.currentConsultation.fragrance_families.includes('fresh'),
    'Step 2: Family "fresh" PRESERVED',
    conversationState.currentConsultation.fragrance_families
  );
  assert(
    conversationState.currentConsultation.budget_max === 500,
    'Step 2: Budget max UPDATED to 500 (replaces 800)',
    conversationState.currentConsultation.budget_max
  );
  assert(
    !data.reply.includes("Tell me what occasion, scent family, or budget you're looking for"),
    'Step 2: No generic clarification or repetition prompt'
  );
  assert(
    data.results && data.results.length > 0,
    'Step 2: Recommendations re-run',
    data.results.length
  );
  assert(
    data.results.every((r: any) => r.product.price <= 500),
    'Step 2: All recommended products <= ₹500',
    data.results.map((r: any) => ({ name: r.product.name, price: r.product.price }))
  );
  assert(
    data.debugInfo?.productRetrievalStatus === 'CALLED',
    'Step 2: Product retrieval was CALLED'
  );
  assert(
    data.debugInfo?.recommendationEngineStatus === 'CALLED',
    'Step 2: Recommendation engine was CALLED'
  );

  // Step 3: "I can spend up to ₹1000"
  console.log('\nStep 3: "I can spend up to ₹1000" (Refinement: budget raised)');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I can spend up to ₹1000',
      brandSlug: 'tmperfumehouse',
      history,
      conversationState,
    }),
  });
  data = await res.json();
  conversationState = data.updatedState;
  history.push({ role: 'user', content: 'I can spend up to ₹1000' });
  history.push({ role: 'assistant', content: data.reply });

  assert(
    conversationState.currentConsultation.occasion === 'office',
    'Step 3: Occasion "office" PRESERVED',
    conversationState.currentConsultation.occasion
  );
  assert(
    conversationState.currentConsultation.fragrance_families.includes('fresh'),
    'Step 3: Family "fresh" PRESERVED',
    conversationState.currentConsultation.fragrance_families
  );
  assert(
    conversationState.currentConsultation.budget_max === 1000,
    'Step 3: Budget max UPDATED to 1000 (replaces 500)',
    conversationState.currentConsultation.budget_max
  );
  assert(
    data.results && data.results.length > 0,
    'Step 3: Recommendations re-run for <= 1000',
    data.results.length
  );

  // Step 4: "I don't have a budget"
  console.log('\nStep 4: "I don\'t have a budget" (Refinement: budget removed)');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: "I don't have a budget",
      brandSlug: 'tmperfumehouse',
      history,
      conversationState,
    }),
  });
  data = await res.json();
  conversationState = data.updatedState;
  history.push({ role: 'user', content: "I don't have a budget" });
  history.push({ role: 'assistant', content: data.reply });

  assert(
    conversationState.currentConsultation.occasion === 'office',
    'Step 4: Occasion "office" PRESERVED',
    conversationState.currentConsultation.occasion
  );
  assert(
    conversationState.currentConsultation.fragrance_families.includes('fresh'),
    'Step 4: Family "fresh" PRESERVED',
    conversationState.currentConsultation.fragrance_families
  );
  assert(
    conversationState.currentConsultation.budget_max === null,
    'Step 4: Budget constraint REMOVED (null)',
    conversationState.currentConsultation.budget_max
  );
  assert(
    data.results && data.results.length > 0,
    'Step 4: Recommendations re-run without budget constraint',
    data.results.length
  );

  // ─────────────────────────────────────────────────────────────
  // 2. ATTRIBUTE REFINEMENTS (Warmer, Lighter, Woody Instead)
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 2: ATTRIBUTE REFINEMENTS ---');

  // Start with fresh office under 800
  let state2: any = {
    currentConsultation: {
      occasion: 'office',
      season: null,
      gender: null,
      fragrance_families: ['fresh'],
      preferred_notes: [],
      intensity: null,
      sillage: null,
      longevity: null,
      budget_max: 800,
      budget_min: null,
      warmth: null,
      freshness: null,
      sweetness: null,
      active_reference_perfume: null,
    },
    backgroundPreferences: {
      usual_fragrances: [],
      persistent_exclusions: { notes: [], families: [], intensity_cap: null },
    },
    previously_discussed_products: [],
    turnCount: 1,
  };

  // Test: "Make it warmer"
  console.log('\nRefinement 2A: "Make it warmer"');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Make it warmer',
      brandSlug: 'tmperfumehouse',
      history: [{ role: 'user', content: 'I want something fresh for office under 800rs' }],
      conversationState: state2,
    }),
  });
  data = await res.json();
  state2 = data.updatedState;

  assert(
    state2.currentConsultation.fragrance_families.includes('fresh'),
    '2A: Family "fresh" KEPT',
    state2.currentConsultation.fragrance_families
  );
  assert(
    state2.currentConsultation.occasion === 'office',
    '2A: Occasion "office" KEPT',
    state2.currentConsultation.occasion
  );
  assert(
    state2.currentConsultation.budget_max === 800,
    '2A: Budget max ₹800 KEPT',
    state2.currentConsultation.budget_max
  );
  assert(
    state2.currentConsultation.warmth === 'warmer',
    '2A: Warmth UPDATED to "warmer"',
    state2.currentConsultation.warmth
  );

  // Test: "Something lighter"
  console.log('\nRefinement 2B: "Something lighter"');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Something lighter',
      brandSlug: 'tmperfumehouse',
      history: [
        { role: 'user', content: 'I want something fresh for office under 800rs' },
        { role: 'user', content: 'Make it warmer' },
      ],
      conversationState: state2,
    }),
  });
  data = await res.json();
  state2 = data.updatedState;

  assert(
    state2.currentConsultation.fragrance_families.includes('fresh'),
    '2B: Family "fresh" KEPT',
    state2.currentConsultation.fragrance_families
  );
  assert(
    state2.currentConsultation.occasion === 'office',
    '2B: Occasion "office" KEPT',
    state2.currentConsultation.occasion
  );
  assert(
    state2.currentConsultation.budget_max === 800,
    '2B: Budget max ₹800 KEPT',
    state2.currentConsultation.budget_max
  );
  assert(
    state2.currentConsultation.warmth === 'warmer',
    '2B: Warmth "warmer" KEPT',
    state2.currentConsultation.warmth
  );
  assert(
    state2.currentConsultation.intensity === 'subtle',
    '2B: Intensity UPDATED downward to "subtle"',
    state2.currentConsultation.intensity
  );

  // Test: "Actually, make it woody instead"
  console.log('\nRefinement 2C: "Actually, make it woody instead"');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Actually, make it woody instead',
      brandSlug: 'tmperfumehouse',
      history: [
        { role: 'user', content: 'I want something fresh for office under 800rs' },
        { role: 'user', content: 'Make it warmer' },
        { role: 'user', content: 'Something lighter' },
      ],
      conversationState: state2,
    }),
  });
  data = await res.json();
  state2 = data.updatedState;

  assert(
    state2.currentConsultation.fragrance_families.includes('woody'),
    '2C: Family changed to "woody"',
    state2.currentConsultation.fragrance_families
  );
  assert(
    state2.currentConsultation.occasion === 'office',
    '2C: Occasion "office" remains',
    state2.currentConsultation.occasion
  );
  assert(
    state2.currentConsultation.budget_max === 800,
    '2C: Budget max ₹800 remains',
    state2.currentConsultation.budget_max
  );

  // ─────────────────────────────────────────────────────────────
  // 3. NEW CONSULTATION DISTINCTION
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 3: NEW CONSULTATION CLEARS STALE CONSTRAINTS ---');
  // State before: spicy date night
  const spicyDateState: any = {
    currentConsultation: {
      occasion: 'date-night',
      season: 'winter',
      gender: null,
      fragrance_families: ['spicy'],
      preferred_notes: [],
      intensity: 'strong',
      sillage: null,
      longevity: null,
      budget_max: 1500,
      budget_min: null,
      warmth: null,
      freshness: null,
      sweetness: null,
      active_reference_perfume: null,
    },
    backgroundPreferences: {
      usual_fragrances: [],
      persistent_exclusions: { notes: [], families: [], intensity_cap: null },
    },
    previously_discussed_products: [],
    turnCount: 2,
  };

  console.log('User sends new request: "I want something fresh for summer"');
  res = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want something fresh for summer',
      brandSlug: 'tmperfumehouse',
      history: [
        { role: 'user', content: 'I want something spicy for a date in winter' },
        { role: 'assistant', content: 'Here are spicy date night options...' },
      ],
      conversationState: spicyDateState,
    }),
  });
  data = await res.json();
  const newState = data.updatedState;

  assert(
    data.debugInfo?.request_type === 'new_consultation',
    '3: Detected as new_consultation',
    data.debugInfo?.request_type
  );
  assert(
    newState.currentConsultation.occasion !== 'date-night',
    '3: Stale occasion "date-night" cleared',
    newState.currentConsultation.occasion
  );
  assert(
    !newState.currentConsultation.fragrance_families.includes('spicy'),
    '3: Stale family "spicy" cleared',
    newState.currentConsultation.fragrance_families
  );
  assert(
    newState.currentConsultation.fragrance_families.includes('fresh'),
    '3: New family "fresh" set',
    newState.currentConsultation.fragrance_families
  );
  assert(
    newState.currentConsultation.season === 'summer',
    '3: New season "summer" set',
    newState.currentConsultation.season
  );

  // ─────────────────────────────────────────────────────────────
  // 4. NATURAL LANGUAGE BUDGET PHRASING TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('\n--- TEST 4: NATURAL LANGUAGE BUDGET VARIATIONS ---');
  const variations = [
    'I have 500',
    'I can spend 500',
    'My budget is 500',
    "I've got 500 rupees",
    'Keep it under 500',
    'I can go up to 500',
    "Let's make the budget 500",
    'I only want to spend 500',
    "I don't want to spend more than 500",
    '500 is my limit',
  ];

  for (const phrase of variations) {
    const baseConsultationState = {
      currentConsultation: {
        occasion: 'office',
        season: null,
        gender: null,
        fragrance_families: ['fresh'],
        preferred_notes: [],
        intensity: null,
        sillage: null,
        longevity: null,
        budget_max: 800,
        budget_min: null,
        warmth: null,
        freshness: null,
        sweetness: null,
        active_reference_perfume: null,
      },
      backgroundPreferences: {
        usual_fragrances: [],
        persistent_exclusions: { notes: [], families: [], intensity_cap: null },
      },
      previously_discussed_products: [],
      turnCount: 1,
    };

    const r = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: phrase,
        brandSlug: 'tmperfumehouse',
        history: [{ role: 'user', content: 'I want something fresh for office under 800rs' }],
        conversationState: baseConsultationState,
      }),
    });
    const d = await r.json();
    const updated = d.updatedState;

    const budgetOk = updated.currentConsultation.budget_max === 500;
    const occOk = updated.currentConsultation.occasion === 'office';
    const famOk = updated.currentConsultation.fragrance_families.includes('fresh');
    const recsOk = d.results && d.results.length > 0 && d.results.every((p: any) => p.product.price <= 500);

    assert(
      budgetOk && occOk && famOk && recsOk,
      `Variation "${phrase}": budget=500, office & fresh preserved, recs <= 500`,
      { budget: updated.currentConsultation.budget_max, occasion: updated.currentConsultation.occasion, resultsCount: d.results?.length }
    );
  }

  console.log('\n===============================================================');
  console.log(`TOTAL RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

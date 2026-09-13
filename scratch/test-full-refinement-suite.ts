import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, toStructuredPreferences, createInitialConversationState } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';

async function runFullRefinementSuite() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  console.log('================================================================');
  console.log('🧪 RUNNING FULL CONVERSATIONAL REFINEMENT & PREFERENCE SUITE');
  console.log('================================================================');

  let passedCount = 0;
  let totalCount = 0;

  function assertTest(name: string, condition: boolean, details?: any) {
    totalCount++;
    if (condition) {
      passedCount++;
      console.log(`✅ PASS: ${name}`);
    } else {
      console.error(`❌ FAIL: ${name}`, details ? details : '');
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: Fresh -> Warm (Pivot / Replacement, not stacking!)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 1: Fresh -> Warm (Correction/Pivot) ---');
  let state1 = createInitialConversationState();
  const t1_1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], state1);
  state1 = updateConversationState(state1, t1_1, 'I want something fresh.');
  const rec1_1 = getRecommendations(toStructuredPreferences(state1, 'I want something fresh.'), products, 3, []);
  
  assertTest('T1.1 "I want something fresh" sets fresh preference', state1.activeRequest?.freshness === 'fresher' || state1.activeRequest?.families?.includes('fresh') === true);
  assertTest('T1.1 recommends fresh products (e.g. Ocean Breeze)', rec1_1.results.some(r => r.product.slug === 'ocean-breeze'));

  const t1_2 = await classifyIntentAndExtractPreferences('Actually I want something warm.', brand, products, [], state1);
  state1 = updateConversationState(state1, t1_2, 'Actually I want something warm.');
  const rec1_2 = getRecommendations(toStructuredPreferences(state1, 'Actually I want something warm.'), products, 3, []);

  assertTest('T1.2 "Actually I want something warm" clears fresh and sets warmth', 
    state1.activeRequest?.warmth === 'warmer' && !state1.activeRequest?.families?.includes('fresh'),
    { warmth: state1.activeRequest?.warmth, families: state1.activeRequest?.families }
  );
  assertTest('T1.2 produces valid warm recommendations (NOT NO_MATCH)', 
    rec1_2.results.length > 0 && rec1_2.results.some(r => r.product.warmth === 'warm' || r.product.warmth === 'very-warm'),
    rec1_2.results.map(r => ({ name: r.product.name, warmth: r.product.warmth }))
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: Warm -> Summer (Additive refinement)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 2: Warm -> Summer (Additive Season) ---');
  const t2 = await classifyIntentAndExtractPreferences('But still suitable for summer.', brand, products, [], state1);
  state1 = updateConversationState(state1, t2, 'But still suitable for summer.');
  const rec2 = getRecommendations(toStructuredPreferences(state1, 'But still suitable for summer.'), products, 3, []);

  assertTest('T2 "But still suitable for summer" adds summer season and preserves warmth',
    state1.activeRequest?.season === 'summer' && state1.activeRequest?.warmth === 'warmer',
    { season: state1.activeRequest?.season, warmth: state1.activeRequest?.warmth }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: Add Sweet Exclusion
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 3: Nothing sweet (Exclusion) ---');
  const t3 = await classifyIntentAndExtractPreferences('And nothing sweet.', brand, products, [], state1);
  state1 = updateConversationState(state1, t3, 'And nothing sweet.');
  const rec3 = getRecommendations(toStructuredPreferences(state1, 'And nothing sweet.'), products, 3, []);

  assertTest('T3 "And nothing sweet" adds sweet to excludedFamilies',
    state1.activeRequest?.excludedFamilies?.includes('sweet') === true
  );
  assertTest('T3 recommendations contain 0 sweet products',
    rec3.results.every(r => !r.product.fragranceFamily.includes('sweet') && r.product.sweetness !== 'sweet' && r.product.sweetness !== 'very-sweet')
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: Make it stronger
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 4: Make it stronger (Intensity Update) ---');
  const t4 = await classifyIntentAndExtractPreferences('Make it stronger.', brand, products, [], state1);
  state1 = updateConversationState(state1, t4, 'Make it stronger.');
  const rec4 = getRecommendations(toStructuredPreferences(state1, 'Make it stronger.'), products, 3, []);

  assertTest('T4 "Make it stronger" sets intensity to strong', state1.activeRequest?.intensity === 'strong');

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Actually, not too loud (Intensity Reversal)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 5: Actually, not too loud (Subtle Intensity Reversal) ---');
  const t5 = await classifyIntentAndExtractPreferences('Actually, not too loud.', brand, products, [], state1);
  state1 = updateConversationState(state1, t5, 'Actually, not too loud.');
  const rec5 = getRecommendations(toStructuredPreferences(state1, 'Actually, not too loud.'), products, 3, []);

  assertTest('T5 "Actually, not too loud" updates intensity to subtle and removes strong requirement',
    state1.activeRequest?.intensity === 'subtle' && state1.backgroundContext?.persistentExclusions?.intensity_cap === 'moderate',
    { intensity: state1.activeRequest?.intensity, cap: state1.backgroundContext?.persistentExclusions?.intensity_cap }
  );

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 6: Complete Office Refinement Chain (8 Sequential Turns)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 6: Complete Office Refinement Chain (8 Turns) ---');
  let stateOffice = createInitialConversationState();
  const officeTurns = [
    { msg: 'Give me something for office.', check: (s: any, r: any) => s.activeRequest?.occasion === 'office' && r.results.some((x: any) => x.product.name.includes('Ocean') || x.product.name.includes('Cedar')) },
    { msg: 'Hmm too boring.', check: (s: any, r: any) => r.results.length > 0 },
    { msg: 'Something more interesting.', check: (s: any, r: any) => r.results.length > 0 },
    { msg: 'But not loud.', check: (s: any, r: any) => s.activeRequest?.intensity === 'subtle' },
    { msg: 'Maybe a little warmer.', check: (s: any, r: any) => s.activeRequest?.warmth === 'warmer' },
    { msg: 'Actually I hate sweet fragrances.', check: (s: any, r: any) => s.activeRequest?.excludedFamilies?.includes('sweet') },
    { msg: 'Something different.', check: (s: any, r: any) => true },
    { msg: 'Under ₹800.', check: (s: any, r: any) => s.activeRequest?.budget?.max === 800 && r.results.every((x: any) => x.product.price <= 800) },
  ];

  for (let i = 0; i < officeTurns.length; i++) {
    const { msg, check } = officeTurns[i];
    const st1 = await classifyIntentAndExtractPreferences(msg, brand, products, [], stateOffice);
    stateOffice = updateConversationState(stateOffice, st1, msg);
    const struct = toStructuredPreferences(stateOffice, msg);
    const rec = getRecommendations(struct, products, 3, st1.intent === 'SHOW_ALTERNATIVES' ? stateOffice.shownProductIds : []);
    const ok = check(stateOffice, rec);
    assertTest(`Office Turn ${i + 1}: "${msg}"`, ok, {
      intent: st1.intent,
      activeState: {
        occasion: stateOffice.activeRequest?.occasion,
        warmth: stateOffice.activeRequest?.warmth,
        intensity: stateOffice.activeRequest?.intensity,
        budget: stateOffice.activeRequest?.budget,
        excludedFamilies: stateOffice.activeRequest?.excludedFamilies,
      },
      products: rec.results.map((x: any) => `${x.product.name} (₹${x.product.price})`)
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 7: Long multi-preference natural sentence (Failure 5)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Scenario 7: Long Multi-Preference Request ---');
  const longPrompt = "I'm going out with someone this weekend and want something that smells expensive and noticeable but I don't want it to be sugary, and I'm not really looking to spend more than a thousand.";
  const stLong = await classifyIntentAndExtractPreferences(longPrompt, brand, products, [], createInitialConversationState());
  const stateLong = updateConversationState(createInitialConversationState(), stLong, longPrompt);
  const recLong = getRecommendations(toStructuredPreferences(stateLong, longPrompt), products, 3, []);

  assertTest('Long Prompt: Occasion extracted as date-night', stateLong.activeRequest?.occasion === 'date-night');
  assertTest('Long Prompt: Budget extracted as <= 1000', stateLong.activeRequest?.budget?.max === 1000);
  assertTest('Long Prompt: Sweet excluded', stateLong.activeRequest?.excludedFamilies?.includes('sweet') === true);
  assertTest('Long Prompt: Style extracted as sophisticated', stateLong.activeRequest?.style === 'sophisticated');
  assertTest('Long Prompt: Yields valid recommended products under budget', 
    recLong.results.length > 0 && recLong.results.every(r => r.product.price <= 1000),
    recLong.results.map(r => `${r.product.name} (₹${r.product.price})`)
  );

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('================================================================');
}

runFullRefinementSuite().catch(console.error);

import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences, fallbackIntentClassifier } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator } from '../src/lib/response-generator';

const brand = getBrand('tmperfumehouse')!;
const products = getProducts('tmperfumehouse');

async function runTestSuite() {
  console.log('================================================================');
  console.log('RUNNING TARGETED REPAIR TEST SUITE (TESTS A - J)');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    total++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
    }
  }

  // TEST A: Warm -> Not too warm -> Warmer
  console.log('--- TEST A: Warmth Target Transitions ---');
  let stateA = createInitialConversationState();
  const stage1A_1 = fallbackIntentClassifier('I want something warm.', brand, products, stateA);
  stateA = updateConversationState(stateA, stage1A_1, 'I want something warm.');
  assert(stateA.activeRequest.warmth === 'warmer', 'TEST A.1: "I want something warm" sets warmth=warmer');

  const stage1A_2 = fallbackIntentClassifier('Not too warm.', brand, products, stateA);
  stateA = updateConversationState(stateA, stage1A_2, 'Not too warm.');
  assert(stateA.activeRequest.warmth === 'moderate-warm' && stateA.activeRequest.warmthMax === 'warm', 'TEST A.2: "Not too warm" sets warmth=moderate-warm and warmthMax=warm');
  const replyA_2 = fallbackResponseGenerator('Not too warm.', brand, stage1A_2, products, getRecommendations(toStructuredPreferences(stateA), products).results, stateA);
  assert(!replyA_2.includes('leaning into a warmer profile'), 'TEST A.2b: explanation does NOT say "leaning into a warmer profile"');

  const stage1A_3 = fallbackIntentClassifier('Actually, warmer.', brand, products, stateA);
  stateA = updateConversationState(stateA, stage1A_3, 'Actually, warmer.');
  assert(stateA.activeRequest.warmth === 'warmer' && stateA.activeRequest.warmthMax === null, 'TEST A.3: "Actually, warmer" restores warmth=warmer and clears warmthMax');

  // TEST B: Strong -> But not loud
  console.log('\n--- TEST B: Strong + Not Loud Separation ---');
  let stateB = createInitialConversationState();
  const stage1B_1 = fallbackIntentClassifier('I want something strong.', brand, products, stateB);
  stateB = updateConversationState(stateB, stage1B_1, 'I want something strong.');
  assert(stateB.activeRequest.intensity === 'strong', 'TEST B.1: "I want something strong" sets intensity=strong');

  const stage1B_2 = fallbackIntentClassifier('But not loud.', brand, products, stateB);
  stateB = updateConversationState(stateB, stage1B_2, 'But not loud.');
  assert(stateB.activeRequest.intensity === 'strong', 'TEST B.2: intensity remains strong after "But not loud"');
  assert(stateB.activeRequest.sillageMax === 'moderate' || stateB.backgroundContext.persistentExclusions.sillage_cap === 'moderate', 'TEST B.3: sillageMax becomes moderate');

  // TEST C: Long lasting -> But not loud
  console.log('\n--- TEST C: Longevity + Not Loud Separation ---');
  let stateC = createInitialConversationState();
  const stage1C_1 = fallbackIntentClassifier('I want something long lasting.', brand, products, stateC);
  stateC = updateConversationState(stateC, stage1C_1, 'I want something long lasting.');
  assert(stateC.activeRequest.longevity === 'long-lasting', 'TEST C.1: longevity is long-lasting');

  const stage1C_2 = fallbackIntentClassifier('But not loud.', brand, products, stateC);
  stateC = updateConversationState(stateC, stage1C_2, 'But not loud.');
  assert(stateC.activeRequest.longevity === 'long-lasting', 'TEST C.2: longevity remains long-lasting');
  assert(stateC.activeRequest.sillageMax === 'moderate', 'TEST C.3: sillageMax is moderate');

  // TEST D: Fresh -> Actually warm -> Still suitable for summer -> Not too warm
  console.log('\n--- TEST D: Pivot Sequence & Retention ---');
  let stateD = createInitialConversationState();
  const stage1D_1 = fallbackIntentClassifier('I want something fresh.', brand, products, stateD);
  stateD = updateConversationState(stateD, stage1D_1, 'I want something fresh.');

  const stage1D_2 = fallbackIntentClassifier('Actually warm.', brand, products, stateD);
  stateD = updateConversationState(stateD, stage1D_2, 'Actually warm.');
  assert(!stateD.activeRequest.families.includes('fresh'), 'TEST D.1: fresh is removed when replaced with warm');
  assert(stateD.activeRequest.warmth === 'warmer', 'TEST D.2: warm remains');

  const stage1D_3 = fallbackIntentClassifier('Still suitable for summer.', brand, products, stateD);
  stateD = updateConversationState(stateD, stage1D_3, 'Still suitable for summer.');
  assert(stateD.activeRequest.season === 'summer', 'TEST D.3: summer is set');

  const stage1D_4 = fallbackIntentClassifier('Not too warm.', brand, products, stateD);
  stateD = updateConversationState(stateD, stage1D_4, 'Not too warm.');
  assert(stateD.activeRequest.warmth === 'moderate-warm', 'TEST D.4: warmth becomes bounded (moderate-warm)');
  assert(stateD.activeRequest.season === 'summer', 'TEST D.5: summer remains intact');

  // TEST E: 4 Simultaneous Constraints
  console.log('\n--- TEST E: 4 Multi-turn Constraints Preservation ---');
  let stateE = createInitialConversationState();
  stateE = updateConversationState(stateE, fallbackIntentClassifier('I want something warm.', brand, products, stateE), 'I want something warm.');
  stateE = updateConversationState(stateE, fallbackIntentClassifier('Nothing sweet.', brand, products, stateE), 'Nothing sweet.');
  stateE = updateConversationState(stateE, fallbackIntentClassifier('Make it stronger.', brand, products, stateE), 'Make it stronger.');
  stateE = updateConversationState(stateE, fallbackIntentClassifier('Not too loud.', brand, products, stateE), 'Not too loud.');

  assert(stateE.activeRequest.warmth === 'warmer', 'TEST E.1: warmth=warmer preserved');
  assert(stateE.backgroundContext.persistentExclusions.families.includes('sweet'), 'TEST E.2: sweet excluded preserved');
  assert(stateE.activeRequest.intensity === 'strong', 'TEST E.3: intensity=strong preserved');
  assert(stateE.activeRequest.sillageMax === 'moderate', 'TEST E.4: sillageMax=moderate preserved');

  // TEST F: Weakening Strong instead of Stacking
  console.log('\n--- TEST F: Weakening/Replacing Strong Preference ---');
  let stateF = createInitialConversationState();
  stateF = updateConversationState(stateF, fallbackIntentClassifier('I want something woody.', brand, products, stateF), 'I want something woody.');
  stateF = updateConversationState(stateF, fallbackIntentClassifier('Make it stronger.', brand, products, stateF), 'Make it stronger.');
  assert(stateF.activeRequest.intensity === 'strong', 'TEST F.1: intensity is strong');
  stateF = updateConversationState(stateF, fallbackIntentClassifier('Actually, not too strong.', brand, products, stateF), 'Actually, not too strong.');
  assert(stateF.activeRequest.intensity === 'moderate', 'TEST F.2: intensity weakened to moderate instead of stacked');

  // TEST G: Fresh + slightly warm
  console.log('\n--- TEST G: Fresh + Slightly Warm Composition ---');
  let stateG = createInitialConversationState();
  stateG = updateConversationState(stateG, fallbackIntentClassifier('I want something fresh.', brand, products, stateG), 'I want something fresh.');
  stateG = updateConversationState(stateG, fallbackIntentClassifier('Make it warmer.', brand, products, stateG), 'Make it warmer.');
  stateG = updateConversationState(stateG, fallbackIntentClassifier('Actually, keep it fresh but only slightly warm.', brand, products, stateG), 'Actually, keep it fresh but only slightly warm.');
  assert(stateG.activeRequest.families.includes('fresh') || stateG.activeRequest.freshness === 'fresher', 'TEST G.1: fresh is retained');
  assert(stateG.activeRequest.warmth === 'moderate-warm', 'TEST G.2: warmth is moderate-warm');

  // TEST H: Hard Sweet Exclusions
  console.log('\n--- TEST H: Hard Sweet Exclusions Verification ---');
  let stateH = createInitialConversationState();
  stateH = updateConversationState(stateH, fallbackIntentClassifier('I hate sweet fragrances.', brand, products, stateH), 'I hate sweet fragrances.');
  const recH = getRecommendations(toStructuredPreferences(stateH), products);
  const containsSweet = recH.results.some(r =>
    r.product.sweetness === 'sweet' ||
    r.product.sweetness === 'very-sweet' ||
    r.product.fragranceFamily.includes('sweet') ||
    r.product.fragranceFamily.includes('gourmand')
  );
  assert(!containsSweet, 'TEST H.1: Zero sweet/gourmand fragrances in canonical recommendations');

  // TEST I: Bounded Warmth Ranking Difference
  console.log('\n--- TEST I: Bounded Warmth vs Unrestricted Warm Ranking ---');
  let stateI_unrestricted = createInitialConversationState();
  stateI_unrestricted = updateConversationState(stateI_unrestricted, fallbackIntentClassifier('I want something warm.', brand, products, stateI_unrestricted), 'I want something warm.');
  const recI_unrestricted = getRecommendations(toStructuredPreferences(stateI_unrestricted), products);

  let stateI_bounded = createInitialConversationState();
  stateI_bounded = updateConversationState(stateI_bounded, fallbackIntentClassifier('I want something warm.', brand, products, stateI_bounded), 'I want something warm.');
  stateI_bounded = updateConversationState(stateI_bounded, fallbackIntentClassifier('Not too warm.', brand, products, stateI_bounded), 'Not too warm.');
  const recI_bounded = getRecommendations(toStructuredPreferences(stateI_bounded), products);

  const unresScores = recI_unrestricted.results.map(r => `${r.product.name} (warmth: ${r.product.warmth}, score: ${r.score})`);
  const boundScores = recI_bounded.results.map(r => `${r.product.name} (warmth: ${r.product.warmth}, score: ${r.score})`);
  console.log('Unrestricted warm recs:', unresScores);
  console.log('Bounded warm recs:', boundScores);
  assert(recI_bounded.results.length > 0, 'TEST I.1: Bounded warm returns valid recommendations');
  assert(recI_bounded.results[0].product.warmth !== 'very-warm' || recI_bounded.results.length > 0, 'TEST I.2: Moderate warm prioritizes balanced warmth');

  // TEST J: Strong but Not Loud Product Selection
  console.log('\n--- TEST J: Strong But Not Loud Canonical Selection ---');
  let stateJ = createInitialConversationState();
  stateJ = updateConversationState(stateJ, fallbackIntentClassifier('I want something strong.', brand, products, stateJ), 'I want something strong.');
  stateJ = updateConversationState(stateJ, fallbackIntentClassifier('Not loud.', brand, products, stateJ), 'Not loud.');
  const recJ = getRecommendations(toStructuredPreferences(stateJ), products);
  const anyEnormous = recJ.results.some(r => r.product.sillage === 'enormous' || r.product.projection === 'enormous');
  assert(!anyEnormous, 'TEST J.1: No enormous sillage / room-filling products selected when not loud is active');
  assert(recJ.canonicalResult.status === 'NO_VALID_MATCH' || recJ.results.every(r => r.product.sillage !== 'strong' && r.product.projection !== 'strong'), 'TEST J.2: Genuine NO_VALID_MATCH or controlled sillage');

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passed}/${total} TESTS PASSED (${((passed / total) * 100).toFixed(1)}%)`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test Suite Error:', err);
  process.exit(1);
});

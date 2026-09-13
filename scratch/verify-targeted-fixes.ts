import { getBrand, getProducts } from '../src/data';
import { fallbackIntentClassifier, validateAndEnforcePolarity } from '../src/lib/intent-classifier';
import { createInitialConversationState, updateConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { enrichProduct } from '../src/lib/product-enricher';

interface TestResult {
  testId: string;
  description: string;
  expected: string;
  actual: string;
  passed: boolean;
  details?: any;
}

const results: TestResult[] = [];

function step(state: any, brandSlug: string, userMsg: string) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const rawStage1 = fallbackIntentClassifier(userMsg, brand, products, state);
  const stage1 = validateAndEnforcePolarity(rawStage1, userMsg, state);
  const nextState = updateConversationState(state, stage1, userMsg);
  const structuredPrefs = toStructuredPreferences(nextState);
  const recs = getRecommendations(structuredPrefs, products);
  return { stage1, state: nextState, structuredPrefs, recs };
}

function runTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING 16 TARGETED REGRESSION AUDIT TESTS');
  console.log('================================================================\n');

  // TEST 1: I want something fresh. -> Forget fresh, I want warm.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something fresh.').state;
    const res = step(s, 'tmperfumehouse', 'Forget fresh, I want warm.');
    const fams = res.state.activeRequest?.families || [];
    const warmth = res.state.activeRequest?.warmth;
    const passed = !fams.includes('fresh') && (fams.includes('warm') || warmth === 'warmer' || warmth === 'moderate-warm');
    results.push({
      testId: 'TEST 1',
      description: 'Forget fresh, I want warm',
      expected: 'warm only, fresh removed',
      actual: `families: [${fams.join(', ')}], warmth: ${warmth}`,
      passed
    });
  }

  // TEST 2: I want something woody. -> Switch to floral.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something woody.').state;
    const res = step(s, 'tmperfumehouse', 'Switch to floral.');
    const fams = res.state.activeRequest?.families || [];
    const passed = fams.includes('floral') && !fams.includes('woody');
    results.push({
      testId: 'TEST 2',
      description: 'Switch to floral (Family Replacement)',
      expected: 'families = ["floral"] (woody removed)',
      actual: `families = [${fams.join(', ')}]`,
      passed
    });
  }

  // TEST 3: I want something woody. -> No leather.
  {
    let s = createInitialConversationState('almaham');
    s = step(s, 'almaham', 'I want something woody.').state;
    const res = step(s, 'almaham', 'No leather.');
    const exclNotes = res.state.activeRequest?.excludedNotes || [];
    const leatherRecs = (res.recs.results || []).filter(r => 
      [...r.product.topNotes, ...r.product.heartNotes, ...r.product.baseNotes].some(n => /leather/i.test(n))
    );
    const passed = exclNotes.includes('leather') && leatherRecs.length === 0;
    results.push({
      testId: 'TEST 3',
      description: 'No leather note exclusion',
      expected: 'excludedNotes contains leather, no leather products recommended',
      actual: `excludedNotes = [${exclNotes.join(', ')}], leather products returned: ${leatherRecs.length}`,
      passed
    });
  }

  // TEST 4: I want something fresh. -> Under ₹800. -> Make it woody.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something fresh.').state;
    s = step(s, 'tmperfumehouse', 'Under ₹800.').state;
    const res = step(s, 'tmperfumehouse', 'Make it woody.');
    const fams = res.state.activeRequest?.families || [];
    const maxBudget = res.state.activeRequest?.budget?.max;
    const passed = fams.includes('woody') && !fams.includes('fresh') && maxBudget === 800;
    results.push({
      testId: 'TEST 4',
      description: 'Budget persistence after family refinement',
      expected: 'families = ["woody"], budget.max = 800',
      actual: `families = [${fams.join(', ')}], budget.max = ${maxBudget}`,
      passed
    });
  }

  // TEST 5: Under ₹500. -> Forget the budget.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'Under ₹500.').state;
    const res = step(s, 'tmperfumehouse', 'Forget the budget.');
    const maxBudget = res.state.activeRequest?.budget?.max;
    const minBudget = res.state.activeRequest?.budget?.min;
    const passed = maxBudget === null && minBudget === null;
    results.push({
      testId: 'TEST 5',
      description: 'Forget the budget (Budget removal)',
      expected: 'budget.max = null, budget.min = null',
      actual: `budget.max = ${maxBudget}, budget.min = ${minBudget}`,
      passed
    });
  }

  // TEST 6: Multi-preference natural language
  // "I need something fresh for summer, not too sweet, reasonably strong, and under ₹800."
  {
    let s = createInitialConversationState('tmperfumehouse');
    const res = step(s, 'tmperfumehouse', 'I need something fresh for summer, not too sweet, reasonably strong, and under ₹800.');
    const fams = res.state.activeRequest?.families || [];
    const season = res.state.activeRequest?.season;
    const exclFams = res.state.activeRequest?.excludedFamilies || [];
    const intensity = res.state.activeRequest?.intensity;
    const maxBudget = res.state.activeRequest?.budget?.max;
    const passed = fams.includes('fresh') && season === 'summer' && exclFams.includes('sweet') && (intensity === 'strong' || intensity === 'moderate') && maxBudget === 800;
    results.push({
      testId: 'TEST 6',
      description: 'Multi-preference parsing without shortcut hijacking',
      expected: 'fresh, summer, excluded sweet, strong/moderate, budget <= 800',
      actual: `fams: [${fams.join(', ')}], season: ${season}, exclFams: [${exclFams.join(', ')}], intensity: ${intensity}, budget: ${maxBudget}`,
      passed
    });
  }

  // TEST 7: Strong but not loud (Imperium Complex check)
  {
    let s = createInitialConversationState('almaham');
    s = step(s, 'almaham', 'I want something strong.').state;
    const res = step(s, 'almaham', 'But not loud.');
    const imperiumInRecs = (res.recs.results || []).some(r => r.product.name.toLowerCase().includes('imperium complex'));
    const passed = !imperiumInRecs;
    results.push({
      testId: 'TEST 7',
      description: 'Imperium Complex sillage constraint (projection-beast blocked by moderate sillage)',
      expected: 'Imperium Complex excluded from moderate sillage recommendations',
      actual: `Imperium Complex returned: ${imperiumInRecs}, total recs: ${(res.recs.results || []).length}`,
      passed
    });
  }

  // TEST 8: Strong -> Not loud -> Actually, make it louder.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something strong.').state;
    s = step(s, 'tmperfumehouse', 'But not loud.').state;
    const res = step(s, 'tmperfumehouse', 'Actually, make it louder.');
    const sillage = res.state.activeRequest?.sillage;
    const sillageMax = res.state.activeRequest?.sillageMax;
    const passed = sillage === 'strong' && sillageMax === null;
    results.push({
      testId: 'TEST 8',
      description: 'Actually, make it louder restores high projection',
      expected: 'sillage = strong, sillageMax = null',
      actual: `sillage = ${sillage}, sillageMax = ${sillageMax}`,
      passed
    });
  }

  // TEST 9: What are the notes in Royal Oud?
  {
    const s = createInitialConversationState('tmperfumehouse');
    const res = step(s, 'tmperfumehouse', 'What are the notes in Royal Oud?');
    const passed = res.stage1.intent === 'PRODUCT_INFO' && res.stage1.target_product_names?.includes('Royal Oud');
    results.push({
      testId: 'TEST 9',
      description: 'What are the notes in Royal Oud? (Product Info Routing)',
      expected: 'intent: PRODUCT_INFO, target: Royal Oud',
      actual: `intent: ${res.stage1.intent}, target: ${res.stage1.target_product_names?.join(', ')}`,
      passed
    });
  }

  // TEST 10: How long does Royal Oud last?
  {
    const s = createInitialConversationState('tmperfumehouse');
    const res = step(s, 'tmperfumehouse', 'How long does Royal Oud last?');
    const passed = res.stage1.intent === 'PRODUCT_INFO' && res.stage1.target_product_names?.includes('Royal Oud');
    results.push({
      testId: 'TEST 10',
      description: 'How long does Royal Oud last? (Product Info Routing)',
      expected: 'intent: PRODUCT_INFO, target: Royal Oud',
      actual: `intent: ${res.stage1.intent}, target: ${res.stage1.target_product_names?.join(', ')}`,
      passed
    });
  }

  // TEST 11: I want something musky.
  {
    const s = createInitialConversationState('tmperfumehouse');
    const res = step(s, 'tmperfumehouse', 'I want something musky.');
    const fams = res.state.activeRequest?.families || [];
    const recsHaveMusk = (res.recs.results || []).some(r => r.product.fragranceFamily.includes('musky') || r.product.name.toLowerCase().includes('musk'));
    const passed = fams.includes('musky') && recsHaveMusk;
    results.push({
      testId: 'TEST 11',
      description: 'Musk vocabulary support',
      expected: 'families contains "musky", musky products recommended',
      actual: `families: [${fams.join(', ')}], recs: ${(res.recs.results || []).map(r => r.product.name).join(', ')}`,
      passed
    });
  }

  // TEST 12: Something like Dior Sauvage but cheaper. -> Forget that reference. I want something woody.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'Something like Dior Sauvage but cheaper.').state;
    const res = step(s, 'tmperfumehouse', 'Forget that reference. I want something woody.');
    const fams = res.state.activeRequest?.families || [];
    const isSim = res.state.activeRequest?.isSimilarityRequest;
    const ref = res.state.backgroundContext?.referencePerfume;
    const relPrice = res.state.activeRequest?.relativePrice;
    const passed = fams.includes('woody') && !isSim && !ref && !relPrice;
    results.push({
      testId: 'TEST 12',
      description: 'Reference drop clears relativePrice and similarity context',
      expected: 'families = ["woody"], isSimilarityRequest = false, relativePrice = null',
      actual: `families: [${fams.join(', ')}], isSim: ${isSim}, ref: ${ref}, relPrice: ${relPrice}`,
      passed
    });
  }

  // TEST 13: Forget my preferences. -> I want something woody.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something fresh under ₹600.').state;
    s = step(s, 'tmperfumehouse', 'Forget my preferences.').state;
    const res = step(s, 'tmperfumehouse', 'I want something woody.');
    const fams = res.state.activeRequest?.families || [];
    const maxBudget = res.state.activeRequest?.budget?.max;
    const passed = fams.includes('woody') && !fams.includes('fresh') && maxBudget === null;
    results.push({
      testId: 'TEST 13',
      description: 'Forget my preferences (Reset command)',
      expected: 'clean state + woody (budget cleared)',
      actual: `families: [${fams.join(', ')}], budget: ${maxBudget}`,
      passed
    });
  }

  // TEST 14: New search. -> I want something fresh.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something woody for office under ₹800.').state;
    s = step(s, 'tmperfumehouse', 'New search.').state;
    const res = step(s, 'tmperfumehouse', 'I want something fresh.');
    const fams = res.state.activeRequest?.families || [];
    const occasion = res.state.activeRequest?.occasion;
    const maxBudget = res.state.activeRequest?.budget?.max;
    const passed = fams.includes('fresh') && !fams.includes('woody') && occasion === null && maxBudget === null;
    results.push({
      testId: 'TEST 14',
      description: 'New search. (Reset command)',
      expected: 'clean state + fresh (occasion & budget cleared)',
      actual: `families: [${fams.join(', ')}], occasion: ${occasion}, budget: ${maxBudget}`,
      passed
    });
  }

  // TEST 15: I want something fresh. -> Keep it fresh but make it warmer.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something fresh.').state;
    const res = step(s, 'tmperfumehouse', 'Keep it fresh but make it warmer.');
    const fams = res.state.activeRequest?.families || [];
    const warmth = res.state.activeRequest?.warmth;
    const passed = fams.includes('fresh') && warmth === 'warmer';
    results.push({
      testId: 'TEST 15',
      description: 'Keep it fresh but make it warmer (Additive combination)',
      expected: 'fresh + warmer',
      actual: `families: [${fams.join(', ')}], warmth: ${warmth}`,
      passed
    });
  }

  // TEST 16: I want something fresh. -> Actually, make it warm.
  {
    let s = createInitialConversationState('tmperfumehouse');
    s = step(s, 'tmperfumehouse', 'I want something fresh.').state;
    const res = step(s, 'tmperfumehouse', 'Actually, make it warm.');
    const fams = res.state.activeRequest?.families || [];
    const warmth = res.state.activeRequest?.warmth;
    const passed = !fams.includes('fresh') && warmth === 'warmer';
    results.push({
      testId: 'TEST 16',
      description: 'Actually, make it warm (Replacement: fresh removed)',
      expected: 'warmth = warmer, fresh removed',
      actual: `families: [${fams.join(', ')}], warmth: ${warmth}`,
      passed
    });
  }

  console.log('| Test | Description | Expected | Actual | Status |');
  console.log('|------|-------------|----------|--------|--------|');
  let passCount = 0;
  for (const r of results) {
    const status = r.passed ? '✅ PASS' : '❌ FAIL';
    if (r.passed) passCount++;
    console.log(`| ${r.testId} | ${r.description} | ${r.expected} | ${r.actual} | ${status} |`);
  }
  console.log(`\nResults: ${passCount} / ${results.length} PASSED`);
  if (passCount !== results.length) {
    process.exit(1);
  }
}

runTests();

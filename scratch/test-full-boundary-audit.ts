import { getAllBrandSlugs, getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, toStructuredPreferences, createInitialConversationState } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';

interface AuditRecord {
  category: string;
  testName: string;
  userInput: string;
  passed: boolean;
  intent: string;
  stateBefore: any;
  stateUpdate: any;
  stateAfter: any;
  canonicalProducts: string[];
  notes?: string;
}

async function runBoundaryCaseAudit() {
  console.log('================================================================');
  console.log('🔬 EXECUTING COMPREHENSIVE BOUNDARY-CASE AUDIT MATRIX');
  console.log('================================================================');

  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  const records: AuditRecord[] = [];

  async function executeTurn(
    category: string,
    testName: string,
    userInput: string,
    state: any,
    assertion: (res: any, stage1: any, updatedState: any) => boolean,
    notes?: string
  ) {
    const stage1 = await classifyIntentAndExtractPreferences(userInput, brand, products, [], state);
    const updatedState = updateConversationState(state, stage1, userInput);
    const structured = toStructuredPreferences(updatedState, userInput);
    const isAlt = stage1.intent === 'SHOW_ALTERNATIVES';
    const rec = getRecommendations(structured, products, 3, isAlt ? updatedState.shownProductIds : []);
    
    const passed = assertion(rec, stage1, updatedState);
    records.push({
      category,
      testName,
      userInput,
      passed,
      intent: stage1.intent,
      stateBefore: state.activeRequest,
      stateUpdate: stage1.updates,
      stateAfter: updatedState.activeRequest,
      canonicalProducts: rec.results.map(r => r.product.name),
      notes,
    });

    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${category} | ${testName} -> "${userInput}"`);
    if (!passed) {
      console.error(`   ⚠️ Details: intent=${stage1.intent}, products=[${rec.results.map(r => r.product.name).join(', ')}]`);
    }

    return { updatedState, rec, stage1 };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 1. STATE SEMANTICS: Additive, Replacement, Negative, Composition, Reversal
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Category 1: State Semantics ---');
  let s = createInitialConversationState();
  
  // 1.1 Fresh
  let res = await executeTurn('State Semantics', 'Fresh Base', 'I want something fresh.', s, 
    (r, st1, state) => (state.activeRequest?.freshness === 'fresher' || state.activeRequest?.families?.includes('fresh')) && r.results.length > 0
  );
  s = res.updatedState;

  // 1.2 Actually warm (Replacement)
  res = await executeTurn('State Semantics', 'Actually Warm (Replacement)', 'Actually I want something warm.', s,
    (r, st1, state) => state.activeRequest?.warmth === 'warmer' && !state.activeRequest?.families?.includes('fresh') && r.results.length > 0
  );
  s = res.updatedState;

  // 1.3 Warm but still fresh (Composition)
  res = await executeTurn('State Semantics', 'Warm but still fresh (Composition)', 'Warm but still fresh.', s,
    (r, st1, state) => state.activeRequest?.warmth === 'warmer' && state.activeRequest?.freshness === 'fresher' && r.results.length > 0
  );
  s = res.updatedState;

  // 1.4 Fresh but warmer (Composition)
  res = await executeTurn('State Semantics', 'Fresh but warmer (Composition)', 'Fresh but warmer.', s,
    (r, st1, state) => state.activeRequest?.warmth === 'warmer' && state.activeRequest?.freshness === 'fresher' && r.results.length > 0
  );
  s = res.updatedState;

  // 1.5 Not too loud (Projection/Sillage Cap)
  res = await executeTurn('State Semantics', 'Not too loud (Sillage Cap)', 'Not too loud.', s,
    (r, st1, state) => state.activeRequest?.sillageMax === 'moderate' || state.backgroundContext?.persistentExclusions?.sillage_cap === 'moderate'
  );
  s = res.updatedState;

  // 1.6 Strong but not overpowering (Moderate Sillage + Strong Character -> NO_VALID_MATCH in TM Perfume House)
  res = await executeTurn('State Semantics', 'Strong but not overpowering', 'Strong but not overpowering.', s,
    (r, st1, state) => r.canonicalResult?.status === 'NO_VALID_MATCH' || r.results.length === 0
  );
  s = res.updatedState;

  // 1.7 Not sweet at all (Hard Exclusion)
  res = await executeTurn('State Semantics', 'Not sweet at all (Negative Exclusion)', 'Not sweet at all.', s,
    (r, st1, state) => state.activeRequest?.excludedFamilies?.includes('sweet') && r.results.every((p: any) => !p.product.fragranceFamily.includes('sweet') && p.product.sweetness !== 'sweet')
  );
  s = res.updatedState;

  // 1.8 Something different (Alternative under current state)
  res = await executeTurn('State Semantics', 'Something different (Alternative)', 'Something different.', s,
    (r, st1, state) => st1.intent === 'SHOW_ALTERNATIVES'
  );
  s = res.updatedState;

  // ──────────────────────────────────────────────────────────────────────────
  // 2. OCCASION SEMANTICS
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Category 2: Occasion Semantics ---');
  let sOcc = createInitialConversationState();
  
  // 2.1 "I need something for the office"
  await executeTurn('Occasion Semantics', 'Direct Office Need', 'I need something for the office.', sOcc,
    (r, st1, state) => state.activeRequest?.occasion === 'office' && r.results.some((p: any) => p.product.occasion.includes('office'))
  );

  // 2.2 "Something that feels professional" (Style / Professional context)
  await executeTurn('Occasion Semantics', 'Professional Feeling', 'Something that feels professional.', sOcc,
    (r, st1, state) => r.results.length > 0 && r.results.some((p: any) => p.product.occasion.includes('office') || p.product.tags.includes('professional') || p.product.tags.includes('sophisticated'))
  );

  // 2.3 Date Night
  await executeTurn('Occasion Semantics', 'Date Night', 'Something for a romantic date night.', sOcc,
    (r, st1, state) => state.activeRequest?.occasion === 'date-night' && r.results.length > 0
  );

  // 2.4 Wedding
  await executeTurn('Occasion Semantics', 'Wedding', 'Perfume for a wedding.', sOcc,
    (r, st1, state) => state.activeRequest?.occasion === 'wedding' && r.results.length > 0
  );

  // 2.5 Gym / Sport
  await executeTurn('Occasion Semantics', 'Gym / Sport', 'Something fresh for gym and workout.', sOcc,
    (r, st1, state) => (state.activeRequest?.occasion === 'gym' || state.activeRequest?.freshness === 'fresher') && r.results.length > 0
  );

  // ──────────────────────────────────────────────────────────────────────────
  // 3. INTENSITY VS PROJECTION VS LONGEVITY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Category 3: Intensity vs Projection vs Longevity ---');
  let sPerf = createInitialConversationState();

  // 3.1 "Not loud" -> projection intimate/moderate
  await executeTurn('Performance', 'Not Loud (Projection Intimate)', 'Not loud at all.', sPerf,
    (r, st1, state) => state.activeRequest?.sillageMax === 'moderate' || state.activeRequest?.sillage === 'moderate' || state.backgroundContext?.persistentExclusions?.sillage_cap === 'moderate'
  );

  // 3.2 "Make it stronger" -> high intensity
  await executeTurn('Performance', 'Make it stronger', 'Make it stronger.', sPerf,
    (r, st1, state) => state.activeRequest?.intensity === 'strong'
  );

  // 3.3 "Lasts all day" -> longevity
  await executeTurn('Performance', 'Long-lasting', 'Something that lasts all day.', sPerf,
    (r, st1, state) => r.results.length > 0
  );

  // ──────────────────────────────────────────────────────────────────────────
  // 4. SUBJECTIVE LANGUAGE (No hallucination, honest mapping)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Category 4: Subjective Language ---');
  const subjectiveCases = [
    { text: 'Something that smells expensive.', check: (r: any, st1: any, s: any) => s.activeRequest?.style === 'sophisticated' && r.results.length > 0 },
    { text: 'Something classy and elegant.', check: (r: any, st1: any, s: any) => s.activeRequest?.style === 'sophisticated' && r.results.length > 0 },
    { text: 'Something sexy for the evening.', check: (r: any, st1: any, s: any) => r.results.length > 0 },
    { text: 'Something more interesting with character.', check: (r: any, st1: any, s: any) => r.results.length > 0 },
    { text: 'Too generic and boring.', check: (r: any, st1: any, s: any) => st1.intent === 'SHOW_ALTERNATIVES' },
  ];

  for (const sc of subjectiveCases) {
    await executeTurn('Subjective Language', sc.text, sc.text, createInitialConversationState(), sc.check);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. NO_MATCH & HARD CONSTRAINT VALIDATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Category 5: NO_MATCH Validation ---');
  // 5.1 Impossible constraint: Royal Oud / pure oud under ₹200
  let sImp = createInitialConversationState();
  const resImp = await executeTurn('NO_MATCH Validation', 'Impossible Budget for Oud (< ₹200)', 'I want Royal Oud for under ₹200.', sImp,
    (r, st1, state) => r.canonicalResult?.status === 'NO_VALID_MATCH' && r.results.length === 0,
    'Expected true NO_MATCH because minimum oud product price is ₹1499'
  );

  // 5.2 Feasible constraint: Fresh perfume under ₹500
  await executeTurn('NO_MATCH Validation', 'Feasible Budget (< ₹500 Fresh)', 'Fresh perfume under ₹500.', createInitialConversationState(),
    (r, st1, state) => r.results.length > 0 && r.results.every((p: any) => p.product.price <= 500)
  );

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY REPORT
  // ──────────────────────────────────────────────────────────────────────────
  const totalTests = records.length;
  const passedTests = records.filter(r => r.passed).length;
  const failedTests = records.filter(r => !r.passed);

  console.log('\n================================================================');
  console.log(`📊 BOUNDARY-CASE AUDIT SUMMARY: ${passedTests}/${totalTests} PASSED`);
  console.log('================================================================');

  if (failedTests.length > 0) {
    console.log(`\nFound ${failedTests.length} Failures to Document:`);
    failedTests.forEach(f => {
      console.log(`❌ [${f.category}] ${f.testName} (${f.userInput})`);
    });
  } else {
    console.log('🎉 ALL BOUNDARY-CASE AUDIT SCENARIOS PASSED WITH ZERO ERRORS!');
  }
}

runBoundaryCaseAudit().catch(console.error);

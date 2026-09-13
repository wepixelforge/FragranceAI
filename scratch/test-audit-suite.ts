import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { getProducts, getBrand } from '../src/data';

async function runAudit() {
  console.log('====================================================');
  console.log('STARTING RECOMMENDATION ENGINE AUDIT TESTS (A - J)');
  console.log('====================================================\n');

  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  let passedCount = 0;
  let totalCount = 0;

  function assert(name: string, condition: boolean, detail?: string) {
    totalCount++;
    if (condition) {
      console.log(`✅ [PASS] ${name}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${name}`);
      if (detail) console.error(`   Details: ${detail}`);
    }
  }

  // ----------------------------------------------------
  // TEST A: Budget Increase Refinement
  // ----------------------------------------------------
  console.log('\n--- Running Test A: Budget Increase Refinement ---');
  let stateA = createInitialConversationState();
  const msgA_1 = 'I want something fresh for office under ₹800.';
  const stage1A_1 = await classifyIntentAndExtractPreferences(
    msgA_1,
    brand,
    products,
    [],
    stateA
  );
  stateA = updateConversationState(stateA, stage1A_1, msgA_1);
  const prefsA_1 = toStructuredPreferences(stateA);
  const recsA_1 = getRecommendations(prefsA_1, products, 3);
  stateA = updateConversationState(stateA, stage1A_1, recsA_1.results.map((r) => r.product.id));

  // Turn 2: "I can spend up to ₹1000."
  const msgA_2 = 'I can spend up to ₹1000.';
  const stage1A_2 = await classifyIntentAndExtractPreferences(
    msgA_2,
    brand,
    products,
    [],
    stateA
  );
  stateA = updateConversationState(stateA, stage1A_2, msgA_2);
  const prefsA_2 = toStructuredPreferences(stateA);
  const recsA_2 = getRecommendations(prefsA_2, products, 3);

  assert(
    'Test A.1: Preserves occasion "office"',
    stateA.activeRequest?.occasion === 'office',
    `Expected office, got ${stateA.activeRequest?.occasion}`
  );
  assert(
    'Test A.2: Preserves family "fresh"',
    stateA.activeRequest?.families.includes('fresh') ?? false,
    `Families: ${stateA.activeRequest?.families.join(', ')}`
  );
  assert(
    'Test A.3: Updates budget max to 1000',
    stateA.activeRequest?.budget?.max === 1000,
    `Budget max: ${stateA.activeRequest?.budget?.max}`
  );
  assert(
    'Test A.4: All recommended products are <= 1000 and fresh',
    recsA_2.results.length > 0 &&
      recsA_2.results.every(
        (r) => r.product.price <= 1000 && r.product.fragranceFamily.includes('fresh')
      ),
    `Results: ${recsA_2.results.map((r) => `${r.product.name} (₹${r.product.price}, ${r.product.fragranceFamily.join('/')})`).join(', ')}`
  );
  assert(
    'Test A.5: Midnight Velvet is NOT recommended for fresh office',
    !recsA_2.results.some((r) => r.product.name === 'Midnight Velvet'),
    `Midnight Velvet present: ${recsA_2.results.some((r) => r.product.name === 'Midnight Velvet')}`
  );

  // ----------------------------------------------------
  // TEST B: Budget Removal Refinement
  // ----------------------------------------------------
  console.log('\n--- Running Test B: Budget Removal Refinement ---');
  let stateB = createInitialConversationState();
  const msgB_1 = 'I want something fresh for office under ₹800.';
  const stage1B_1 = await classifyIntentAndExtractPreferences(
    msgB_1,
    brand,
    products,
    [],
    stateB
  );
  stateB = updateConversationState(stateB, stage1B_1, msgB_1);
  const prefsB_1 = toStructuredPreferences(stateB);
  const recsB_1 = getRecommendations(prefsB_1, products, 3);
  stateB = updateConversationState(stateB, stage1B_1, recsB_1.results.map((r) => r.product.id));

  // Turn 2: "I don't have a budget."
  const msgB_2 = "I don't have a budget.";
  const stage1B_2 = await classifyIntentAndExtractPreferences(
    msgB_2,
    brand,
    products,
    [],
    stateB
  );
  stateB = updateConversationState(stateB, stage1B_2, msgB_2);
  const prefsB_2 = toStructuredPreferences(stateB);
  const recsB_2 = getRecommendations(prefsB_2, products, 3);

  assert(
    'Test B.1: Preserves occasion "office"',
    stateB.activeRequest?.occasion === 'office',
    `Occasion: ${stateB.activeRequest?.occasion}`
  );
  assert(
    'Test B.2: Preserves family "fresh"',
    stateB.activeRequest?.families.includes('fresh') ?? false,
    `Families: ${stateB.activeRequest?.families.join(', ')}`
  );
  assert(
    'Test B.3: Budget max is null (removed)',
    stateB.activeRequest?.budget?.max === null,
    `Budget max: ${stateB.activeRequest?.budget?.max}`
  );
  assert(
    'Test B.4: Recommendations are fresh office products',
    recsB_2.results.length > 0 &&
      recsB_2.results.every((r) => r.product.fragranceFamily.includes('fresh')),
    `Results: ${recsB_2.results.map((r) => r.product.name).join(', ')}`
  );

  // ----------------------------------------------------
  // TEST C: Make it Warmer Refinement
  // ----------------------------------------------------
  console.log('\n--- Running Test C: Make it Warmer Refinement ---');
  let stateC = createInitialConversationState();
  const msgC_1 = 'I want something fresh for office under ₹800.';
  const stage1C_1 = await classifyIntentAndExtractPreferences(
    msgC_1,
    brand,
    products,
    [],
    stateC
  );
  stateC = updateConversationState(stateC, stage1C_1, msgC_1);
  const prefsC_1 = toStructuredPreferences(stateC);
  const recsC_1 = getRecommendations(prefsC_1, products, 3);
  stateC = updateConversationState(stateC, stage1C_1, recsC_1.results.map((r) => r.product.id));

  // Turn 2: "Make it warmer."
  const msgC_2 = 'Make it warmer.';
  const stage1C_2 = await classifyIntentAndExtractPreferences(
    msgC_2,
    brand,
    products,
    [],
    stateC
  );
  stateC = updateConversationState(stateC, stage1C_2, msgC_2);
  const prefsC_2 = toStructuredPreferences(stateC, msgC_2);
  const recsC_2 = getRecommendations(prefsC_2, products, 3);

  assert(
    'Test C.1: Preserves occasion "office"',
    stateC.activeRequest?.occasion === 'office',
    `Occasion: ${stateC.activeRequest?.occasion}`
  );
  assert(
    'Test C.2: Preserves family "fresh"',
    stateC.activeRequest?.families.includes('fresh') ?? false,
    `Families: ${stateC.activeRequest?.families.join(', ')}`
  );
  assert(
    'Test C.3: Preserves budget <= 800',
    stateC.activeRequest?.budget?.max === 800,
    `Budget max: ${stateC.activeRequest?.budget?.max}`
  );
  assert(
    'Test C.4: Warmth preference set to "warmer"',
    stateC.activeRequest?.warmth === 'warmer',
    `Warmth: ${stateC.activeRequest?.warmth}`
  );
  assert(
    'Test C.5: White Musk ranks #1 (fresh/musky/warm at ₹650 <= 800)',
    recsC_2.results[0]?.product.name === 'White Musk',
    `Rank #1 is: ${recsC_2.results[0]?.product.name}`
  );
  assert(
    'Test C.6: No sweet/gourmand fallback products (e.g. Vanilla Dreams)',
    !recsC_2.results.some((r) => r.product.name === 'Vanilla Dreams' || r.product.fragranceFamily.includes('sweet')),
    `Results: ${recsC_2.results.map((r) => r.product.name).join(', ')}`
  );

  // ----------------------------------------------------
  // TEST D: Make it Stronger Refinement
  // ----------------------------------------------------
  console.log('\n--- Running Test D: Make it Stronger Refinement ---');
  let stateD = createInitialConversationState();
  const msgD_1 = 'I want something fresh for office under ₹800.';
  const stage1D_1 = await classifyIntentAndExtractPreferences(
    msgD_1,
    brand,
    products,
    [],
    stateD
  );
  stateD = updateConversationState(stateD, stage1D_1, msgD_1);
  const prefsD_1 = toStructuredPreferences(stateD);
  const recsD_1 = getRecommendations(prefsD_1, products, 3);
  stateD = updateConversationState(stateD, stage1D_1, recsD_1.results.map((r) => r.product.id));

  // Turn 2: "Make it stronger."
  const msgD_2 = 'Make it stronger.';
  const stage1D_2 = await classifyIntentAndExtractPreferences(
    msgD_2,
    brand,
    products,
    [],
    stateD
  );
  stateD = updateConversationState(stateD, stage1D_2, msgD_2);
  const prefsD_2 = toStructuredPreferences(stateD, msgD_2);
  const recsD_2 = getRecommendations(prefsD_2, products, 3);

  assert(
    'Test D.1: Intensity set to "strong"',
    stateD.activeRequest?.intensity === 'strong',
    `Intensity: ${stateD.activeRequest?.intensity}`
  );
  assert(
    'Test D.2: Preserves fresh, office, and budget <= 800',
    stateD.activeRequest?.occasion === 'office' &&
      stateD.activeRequest?.families.includes('fresh') &&
      stateD.activeRequest?.budget?.max === 800,
    `Occasion: ${stateD.activeRequest?.occasion}, Families: ${stateD.activeRequest?.families.join(',')}, Budget: ${stateD.activeRequest?.budget?.max}`
  );
  assert(
    'Test D.3: Returns NO_VALID_MATCH with 0 products because no strong fresh office fragrance exists <= ₹800',
    recsD_2.hardConstraintFailed === true && recsD_2.results.length === 0,
    `Results length: ${recsD_2.results.length}, hardConstraintFailed: ${recsD_2.hardConstraintFailed}`
  );

  // ----------------------------------------------------
  // TEST E: Make it Lighter Refinement
  // ----------------------------------------------------
  console.log('\n--- Running Test E: Make it Lighter Refinement ---');
  let stateE = createInitialConversationState();
  const msgE_1 = 'I want something fresh for office under ₹800.';
  const stage1E_1 = await classifyIntentAndExtractPreferences(
    msgE_1,
    brand,
    products,
    [],
    stateE
  );
  stateE = updateConversationState(stateE, stage1E_1, msgE_1);
  const prefsE_1 = toStructuredPreferences(stateE);
  const recsE_1 = getRecommendations(prefsE_1, products, 3);
  stateE = updateConversationState(stateE, stage1E_1, recsE_1.results.map((r) => r.product.id));

  // Turn 2: "Make it lighter."
  const msgE_2 = 'Make it lighter.';
  const stage1E_2 = await classifyIntentAndExtractPreferences(
    msgE_2,
    brand,
    products,
    [],
    stateE
  );
  stateE = updateConversationState(stateE, stage1E_2, msgE_2);
  const prefsE_2 = toStructuredPreferences(stateE, msgE_2);
  const recsE_2 = getRecommendations(prefsE_2, products, 3);

  assert(
    'Test E.1: Intensity set to "subtle"',
    stateE.activeRequest?.intensity === 'subtle',
    `Intensity: ${stateE.activeRequest?.intensity}`
  );
  assert(
    'Test E.2: Preserves fresh, office, and budget <= 800',
    stateE.activeRequest?.occasion === 'office' &&
      stateE.activeRequest?.families.includes('fresh') &&
      stateE.activeRequest?.budget?.max === 800,
    `Occasion: ${stateE.activeRequest?.occasion}, Families: ${stateE.activeRequest?.families.join(',')}`
  );
  assert(
    'Test E.3: Results prioritize subtle/moderate projection',
    recsE_2.results.length > 0 && recsE_2.results[0].product.intensity !== 'strong',
    `Rank #1 intensity: ${recsE_2.results[0]?.product.intensity}`
  );

  // ----------------------------------------------------
  // TEST F: Genuinely Spicy vs Incidental Note
  // ----------------------------------------------------
  console.log('\n--- Running Test F: Genuinely Spicy vs Incidental Note ---');
  let stateF = createInitialConversationState();
  const msgF = 'I want something spicy for a date.';
  const stage1F = await classifyIntentAndExtractPreferences(
    msgF,
    brand,
    products,
    [],
    stateF
  );
  stateF = updateConversationState(stateF, stage1F, msgF);
  const prefsF = toStructuredPreferences(stateF);
  const recsF = getRecommendations(prefsF, products, 3);

  const topProductF = recsF.results[0]?.product;
  const isTrulySpicy =
    topProductF?.fragranceFamily.includes('spicy') ||
    topProductF?.spicyLevel === 'dominant' ||
    topProductF?.spicyLevel === 'moderate';

  assert(
    'Test F.1: Genuinely spicy product ranks #1 (e.g. Cedar Noir, Noir Intense, Amber Nights)',
    Boolean(isTrulySpicy),
    `Rank #1 is ${topProductF?.name} (families: ${topProductF?.fragranceFamily.join('/')}, spicyLevel: ${topProductF?.spicyLevel})`
  );
  assert(
    'Test F.2: Midnight Velvet (sweet with incidental pink pepper) does NOT beat dominant spicy scents',
    topProductF?.name !== 'Midnight Velvet',
    `Rank #1 is: ${topProductF?.name}`
  );

  // ----------------------------------------------------
  // TEST G: Multi-turn Persistent Exclusions (No Sweet)
  // ----------------------------------------------------
  console.log('\n--- Running Test G: Multi-turn Persistent Exclusions (No Sweet) ---');
  let stateG = createInitialConversationState();

  // Turn 1: "I don't like sweet perfumes."
  const msgG_1 = "I don't like sweet perfumes.";
  const stage1G_1 = await classifyIntentAndExtractPreferences(
    msgG_1,
    brand,
    products,
    [],
    stateG
  );
  stateG = updateConversationState(stateG, stage1G_1, msgG_1);
  assert(
    'Test G.1: Sweet excluded after Turn 1',
    (stateG.backgroundContext?.persistentExclusions?.families?.includes('sweet') ?? false) ||
      (stateG.activeRequest?.excludedFamilies?.includes('sweet') ?? false),
    `Persistent: ${stateG.backgroundContext?.persistentExclusions?.families.join(',')}, Active: ${stateG.activeRequest?.excludedFamilies?.join(',')}`
  );

  // Turn 2: "I need something for date night."
  const msgG_2 = 'I need something for date night.';
  const stage1G_2 = await classifyIntentAndExtractPreferences(
    msgG_2,
    brand,
    products,
    [],
    stateG
  );
  stateG = updateConversationState(stateG, stage1G_2, msgG_2);
  const prefsG_2 = toStructuredPreferences(stateG);
  const recsG_2 = getRecommendations(prefsG_2, products, 3);
  stateG = updateConversationState(stateG, stage1G_2, recsG_2.results.map((r) => r.product.id));

  assert(
    'Test G.2: Zero sweet products in date night recommendations',
    !recsG_2.results.some((r) => r.product.fragranceFamily.includes('sweet')),
    `Date night recs: ${recsG_2.results.map((r) => `${r.product.name} (${r.product.fragranceFamily.join('/')})`).join(', ')}`
  );

  // Turn 3: "Make it stronger."
  const msgG_3 = 'Make it stronger.';
  const stage1G_3 = await classifyIntentAndExtractPreferences(
    msgG_3,
    brand,
    products,
    [],
    stateG
  );
  stateG = updateConversationState(stateG, stage1G_3, msgG_3);
  const prefsG_3 = toStructuredPreferences(stateG, msgG_3);
  const recsG_3 = getRecommendations(prefsG_3, products, 3);
  stateG = updateConversationState(stateG, stage1G_3, recsG_3.results.map((r) => r.product.id));

  assert(
    'Test G.3: Zero sweet products after "Make it stronger"',
    !recsG_3.results.some((r) => r.product.fragranceFamily.includes('sweet')),
    `Stronger recs: ${recsG_3.results.map((r) => r.product.name).join(', ')}`
  );

  // Turn 4: "Show me something else."
  const msgG_4 = 'Show me something else.';
  const stage1G_4 = await classifyIntentAndExtractPreferences(
    msgG_4,
    brand,
    products,
    [],
    stateG
  );
  stateG = updateConversationState(stateG, stage1G_4, msgG_4);
  const prefsG_4 = toStructuredPreferences(stateG);
  const recsG_4 = getRecommendations(prefsG_4, products, 3, stateG.shownProductIds);

  assert(
    'Test G.4: Zero sweet products after "Show me something else"',
    !recsG_4.results.some((r) => r.product.fragranceFamily.includes('sweet')),
    `Something else recs: ${recsG_4.results.map((r) => r.product.name).join(', ')}`
  );

  // ----------------------------------------------------
  // TEST H: Specific Note Exclusion (Oud)
  // ----------------------------------------------------
  console.log('\n--- Running Test H: Specific Note Exclusion (Oud) ---');
  let stateH = createInitialConversationState();

  // Turn 1: "I hate oud."
  const msgH_1 = 'I hate oud.';
  const stage1H_1 = await classifyIntentAndExtractPreferences(msgH_1, brand, products, [], stateH);
  stateH = updateConversationState(stateH, stage1H_1, msgH_1);

  // Turn 2: "I want something woody for winter."
  const msgH_2 = 'I want something woody for winter.';
  const stage1H_2 = await classifyIntentAndExtractPreferences(
    msgH_2,
    brand,
    products,
    [],
    stateH
  );
  stateH = updateConversationState(stateH, stage1H_2, msgH_2);
  const prefsH_2 = toStructuredPreferences(stateH);
  const recsH_2 = getRecommendations(prefsH_2, products, 3);

  assert(
    'Test H.1: Oud note and family excluded in state',
    (stateH.activeRequest?.excludedFamilies.includes('oud') ?? false) ||
      (stateH.activeRequest?.excludedNotes.includes('oud') ?? false) ||
      (stateH.backgroundContext?.persistentExclusions?.notes.includes('oud') ?? false) ||
      (stateH.backgroundContext?.persistentExclusions?.families.includes('oud') ?? false),
    `Excluded families: ${stateH.activeRequest?.excludedFamilies.join(',')}, Excluded notes: ${stateH.activeRequest?.excludedNotes.join(',')}`
  );
  assert(
    'Test H.2: Royal Oud is NOT recommended',
    !recsH_2.results.some((r) => r.product.name === 'Royal Oud'),
    `Recommendations: ${recsH_2.results.map((r) => r.product.name).join(', ')}`
  );
  assert(
    'Test H.3: No product containing oud is recommended',
    !recsH_2.results.some(
      (r) =>
        r.product.fragranceFamily.includes('oud') ||
        r.product.topNotes.concat(r.product.heartNotes, r.product.baseNotes).some((n) => n.toLowerCase().includes('oud'))
    ),
    `Results: ${recsH_2.results.map((r) => r.product.name).join(', ')}`
  );

  // ----------------------------------------------------
  // TEST I: Reference Perfume Scoping
  // ----------------------------------------------------
  console.log('\n--- Running Test I: Reference Perfume Scoping ---');
  let stateI = createInitialConversationState();

  // Turn 1: "Give me something similar to Dior Sauvage."
  const msgI_1 = 'Give me something similar to Dior Sauvage.';
  const stage1I_1 = await classifyIntentAndExtractPreferences(
    msgI_1,
    brand,
    products,
    [],
    stateI
  );
  stateI = updateConversationState(stateI, stage1I_1, msgI_1);
  assert(
    'Test I.1: Reference perfume set to Dior Sauvage',
    stateI.backgroundContext?.referencePerfume?.toLowerCase().includes('sauvage') ?? false,
    `Reference perfume: ${stateI.backgroundContext?.referencePerfume}`
  );

  // Turn 2: "I want something light and fresh for summer."
  const msgI_2 = 'I want something light and fresh for summer.';
  const stage1I_2 = await classifyIntentAndExtractPreferences(
    msgI_2,
    brand,
    products,
    [],
    stateI
  );
  stateI = updateConversationState(stateI, stage1I_2, msgI_2);
  assert(
    'Test I.2: Reference perfume cleared upon genuine new direction consultation',
    stateI.backgroundContext?.referencePerfume === null,
    `Reference perfume after Turn 2: ${stateI.backgroundContext?.referencePerfume}`
  );

  // ----------------------------------------------------
  // TEST J: Strictly Cheaper Refinement
  // ----------------------------------------------------
  console.log('\n--- Running Test J: Strictly Cheaper Refinement ---');
  let stateJ = createInitialConversationState();

  // Turn 1: "I want something fresh for office."
  const msgJ_1 = 'I want something fresh for office.';
  const stage1J_1 = await classifyIntentAndExtractPreferences(
    msgJ_1,
    brand,
    products,
    [],
    stateJ
  );
  stateJ = updateConversationState(stateJ, stage1J_1, msgJ_1);
  const prefsJ_1 = toStructuredPreferences(stateJ);
  const recsJ_1 = getRecommendations(prefsJ_1, products, 3);
  stateJ = updateConversationState(stateJ, stage1J_1, recsJ_1.results.map((r) => r.product.id));

  const primaryProductTurn1 = recsJ_1.results[0]?.product;
  const primaryPriceTurn1 = primaryProductTurn1?.price ?? 800;
  console.log(`   Turn 1 Primary Product: ${primaryProductTurn1?.name} at ₹${primaryPriceTurn1}`);

  // Turn 2: "Show me something cheaper."
  const msgJ_2 = 'Show me something cheaper.';
  const stage1J_2 = await classifyIntentAndExtractPreferences(
    msgJ_2,
    brand,
    products,
    [],
    stateJ
  );
  stateJ = updateConversationState(stateJ, stage1J_2, msgJ_2);
  const prefsJ_2 = toStructuredPreferences(stateJ, msgJ_2, [primaryPriceTurn1]);
  const recsJ_2 = getRecommendations(prefsJ_2, products, 3, [primaryProductTurn1.id]);

  assert(
    'Test J.1: Relative price set to "cheaper"',
    stateJ.activeRequest?.relativePrice === 'cheaper',
    `Relative price: ${stateJ.activeRequest?.relativePrice}`
  );
  assert(
    'Test J.2: Preserves occasion "office" and family "fresh"',
    stateJ.activeRequest?.occasion === 'office' && (stateJ.activeRequest?.families.includes('fresh') ?? false),
    `Occasion: ${stateJ.activeRequest?.occasion}, Families: ${stateJ.activeRequest?.families.join(',')}`
  );
  assert(
    'Test J.3: All returned products are strictly cheaper than Turn 1 primary product',
    recsJ_2.results.length > 0 && recsJ_2.results.every((r) => r.product.price < primaryPriceTurn1),
    `Turn 1 price: ₹${primaryPriceTurn1}, Cheaper products: ${recsJ_2.results.map((r) => `${r.product.name} (₹${r.product.price})`).join(', ')}`
  );
  assert(
    'Test J.4: Turn 1 primary product is excluded from alternatives',
    !recsJ_2.results.some((r) => r.product.id === primaryProductTurn1.id),
    `Turn 1 ID ${primaryProductTurn1.id} present: ${recsJ_2.results.some((r) => r.product.id === primaryProductTurn1.id)}`
  );

  console.log('\n====================================================');
  console.log(`AUDIT TEST SUMMARY: ${passedCount} / ${totalCount} PASSED`);
  console.log('====================================================\n');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});

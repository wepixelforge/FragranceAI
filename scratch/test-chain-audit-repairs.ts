import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { enrichProduct } from '../src/lib/product-enricher';

async function runTests() {
  const brand = getBrand('tmperfumehouse')!;
  const rawProducts = getProducts('tmperfumehouse');
  let failures = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAILED: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASSED: ${msg}`);
    }
  }

  console.log('============================================================');
  console.log('TEST 1: Warm -> Not too warm -> Actually, warmer');
  console.log('============================================================');
  {
    let state = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something warm.', brand, rawProducts, [], state);
    state = updateConversationState(state, s1, 'I want something warm.');
    let recs1 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs1.results.some(r => r.product.name === 'Royal Oud'), 'Turn 1 includes Royal Oud');
    assert(recs1.results.some(r => r.product.name === 'Amber Nights'), 'Turn 1 includes Amber Nights');

    let s2 = await classifyIntentAndExtractPreferences('Not too warm.', brand, rawProducts, [{ role: 'user', content: 'I want something warm.' }], state);
    state = updateConversationState(state, s2, 'Not too warm.');
    assert(state.activeRequest.warmth === 'moderate-warm', 'Turn 2 warmth is moderate-warm');
    assert(state.activeRequest.warmthMax === 'warm', 'Turn 2 warmthMax is warm');
    let recs2 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(!recs2.results.some(r => r.product.name === 'Royal Oud'), 'Turn 2 excludes Royal Oud');
    assert(!recs2.results.some(r => r.product.name === 'Amber Nights'), 'Turn 2 excludes Amber Nights');
    assert(recs2.results.every(r => r.product.warmth !== 'very-warm'), 'Turn 2 excludes all very-warm products');

    let s3 = await classifyIntentAndExtractPreferences('Actually, warmer.', brand, rawProducts, [
      { role: 'user', content: 'I want something warm.' },
      { role: 'user', content: 'Not too warm.' }
    ], state);
    state = updateConversationState(state, s3, 'Actually, warmer.');
    assert(state.activeRequest.warmth === 'warmer', 'Turn 3 warmth is warmer');
    assert(state.activeRequest.warmthMax === null, 'Turn 3 warmthMax is cleared');
    let recs3 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs3.results.some(r => r.product.name === 'Royal Oud'), 'Turn 3 Royal Oud returns');
    assert(recs3.results.some(r => r.product.name === 'Amber Nights'), 'Turn 3 Amber Nights returns');
  }

  console.log('\n============================================================');
  console.log('TEST 2: Strong -> But not loud (Genuine NO_VALID_MATCH)');
  console.log('============================================================');
  {
    let state = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something strong.', brand, rawProducts, [], state);
    state = updateConversationState(state, s1, 'I want something strong.');
    let recs1 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs1.results.length > 0, 'Turn 1 returns strong recommendations');

    let s2 = await classifyIntentAndExtractPreferences('But not loud.', brand, rawProducts, [{ role: 'user', content: 'I want something strong.' }], state);
    state = updateConversationState(state, s2, 'But not loud.');
    assert(state.activeRequest.intensity === 'strong', 'Turn 2 intensity remains strong');
    assert(state.activeRequest.sillageMax === 'moderate', 'Turn 2 sillageMax is moderate');
    
    let recs2 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs2.canonicalResult.status === 'NO_VALID_MATCH', 'Turn 2 status is NO_VALID_MATCH');
    assert(recs2.results.length === 0, 'Turn 2 results array is empty');
    assert(recs2.canonicalResult.products.length === 0, 'Turn 2 canonical products is empty');
    assert(!recs2.results.some(r => r.product.name === 'Royal Oud'), 'Turn 2 NEVER recommends Royal Oud');
    assert(!recs2.results.some(r => r.product.name === 'Amber Nights'), 'Turn 2 NEVER recommends Amber Nights');
    assert(!recs2.results.some(r => r.product.name === 'Noir Intense'), 'Turn 2 NEVER recommends Noir Intense');

    let resp = await generateConversationalResponse('But not loud.', brand, s2, recs2.results.map(r => r.product), recs2.results, state, [], {
      status: recs2.canonicalResult.status,
      hardConstraintFailed: recs2.hardConstraintFailed,
      failedConstraints: recs2.failedConstraints
    });
    console.log('Assistant Response for Test 2:', resp);
    assert(resp.includes('controlled projection') || resp.includes('Nothing in this collection combines strong') || resp.includes('moderate-intensity'), 'Assistant offers controlled projection relaxation');
  }

  console.log('\n============================================================');
  console.log('TEST 3: Warm -> Not too warm -> Show me options (Ocean Breeze check)');
  console.log('============================================================');
  {
    const enrichedOceanBreeze = enrichProduct(rawProducts.find(p => p.id === 'tm-002')!);
    assert(enrichedOceanBreeze.warmth === 'cool', `Ocean Breeze warmth is '${enrichedOceanBreeze.warmth}', not 'warm'`);

    let state = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something warm.', brand, rawProducts, [], state);
    state = updateConversationState(state, s1, 'I want something warm.');
    let s2 = await classifyIntentAndExtractPreferences('Not too warm.', brand, rawProducts, [{ role: 'user', content: 'I want something warm.' }], state);
    state = updateConversationState(state, s2, 'Not too warm.');
    let s3 = await classifyIntentAndExtractPreferences('Show me options.', brand, rawProducts, [
      { role: 'user', content: 'I want something warm.' },
      { role: 'user', content: 'Not too warm.' }
    ], state);
    state = updateConversationState(state, s3, 'Show me options.');
    let recs3 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(!recs3.results.some(r => r.product.id === 'tm-002'), 'Ocean Breeze is NOT recommended for not too warm');
    assert(!recs3.results.some(r => r.product.warmth === 'very-warm'), 'No very-warm product is recommended');
    assert(recs3.results.every(r => r.product.warmth === 'warm'), 'All recommended products have moderate warm temperature');
  }

  console.log('\n============================================================');
  console.log('TEST 4: Strong -> Not loud -> Make it less intense');
  console.log('============================================================');
  {
    let state = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something strong.', brand, rawProducts, [], state);
    state = updateConversationState(state, s1, 'I want something strong.');
    let s2 = await classifyIntentAndExtractPreferences('Not loud.', brand, rawProducts, [{ role: 'user', content: 'I want something strong.' }], state);
    state = updateConversationState(state, s2, 'Not loud.');

    let s3 = await classifyIntentAndExtractPreferences('Make it less intense.', brand, rawProducts, [
      { role: 'user', content: 'I want something strong.' },
      { role: 'user', content: 'Not loud.' }
    ], state);
    state = updateConversationState(state, s3, 'Make it less intense.');
    assert(state.activeRequest.intensity === 'moderate', `Intensity weakened to moderate (got ${state.activeRequest.intensity})`);
    assert(state.activeRequest.sillageMax === 'moderate', 'Sillage cap remains moderate');
    
    let recs3 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs3.canonicalResult.status === 'SUCCESS', `Status is SUCCESS (got ${recs3.canonicalResult.status})`);
    assert(recs3.results.length > 0, 'Returns valid recommendations');
    assert(!recs3.results.some(r => r.product.sillage === 'strong' || r.product.projection === 'strong'), 'No strong sillage product appears');
    assert(recs3.results.every(r => r.product.sillage === 'moderate' || r.product.sillage === 'intimate'), 'All recommended products have controlled sillage');
  }

  console.log('\n============================================================');
  console.log('TEST 5: Fresh -> Actually warm -> Summer -> Not too warm');
  console.log('============================================================');
  {
    let state = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, rawProducts, [], state);
    state = updateConversationState(state, s1, 'I want something fresh.');
    
    let s2 = await classifyIntentAndExtractPreferences('Actually warm.', brand, rawProducts, [{ role: 'user', content: 'I want something fresh.' }], state);
    state = updateConversationState(state, s2, 'Actually warm.');
    assert(state.activeRequest.warmth === 'warmer', 'Warmth is warmer');
    
    let s3 = await classifyIntentAndExtractPreferences('Summer.', brand, rawProducts, [
      { role: 'user', content: 'I want something fresh.' },
      { role: 'user', content: 'Actually warm.' }
    ], state);
    state = updateConversationState(state, s3, 'Summer.');
    assert(state.activeRequest.season === 'summer', 'Season is summer');
    
    let s4 = await classifyIntentAndExtractPreferences('Not too warm.', brand, rawProducts, [
      { role: 'user', content: 'I want something fresh.' },
      { role: 'user', content: 'Actually warm.' },
      { role: 'user', content: 'Summer.' }
    ], state);
    state = updateConversationState(state, s4, 'Not too warm.');
    assert(state.activeRequest.warmth === 'moderate-warm', 'Warmth is moderate-warm');
    assert(state.activeRequest.warmthMax === 'warm', 'WarmthMax is warm');
    assert(state.activeRequest.season === 'summer', 'Season summer remains');

    let recs4 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs4.results.every(r => r.product.warmth !== 'very-warm'), 'Zero very-warm products recommended');
    assert(recs4.results.every(r => r.product.season.includes('summer') || r.product.season.includes('all-season')), 'All recommended products fit summer');
  }

  console.log('\n============================================================');
  console.log('TEST 6: Strong -> Not loud -> Actually, make it louder');
  console.log('============================================================');
  {
    let state = createInitialConversationState();
    let s1 = await classifyIntentAndExtractPreferences('I want something strong.', brand, rawProducts, [], state);
    state = updateConversationState(state, s1, 'I want something strong.');
    let s2 = await classifyIntentAndExtractPreferences('Not loud.', brand, rawProducts, [{ role: 'user', content: 'I want something strong.' }], state);
    state = updateConversationState(state, s2, 'Not loud.');
    assert(state.activeRequest.sillageMax === 'moderate', 'Step 2 has sillageMax moderate');

    let s3 = await classifyIntentAndExtractPreferences('Actually, make it louder.', brand, rawProducts, [
      { role: 'user', content: 'I want something strong.' },
      { role: 'user', content: 'Not loud.' }
    ], state);
    state = updateConversationState(state, s3, 'Actually, make it louder.');
    assert(state.activeRequest.sillageMax === null, `Step 3 sillageMax is cleared (got ${state.activeRequest.sillageMax})`);
    assert(state.activeRequest.intensity === 'strong', 'Step 3 intensity remains strong');
    assert(state.activeRequest.sillage === 'strong', 'Step 3 sillage is strong');

    let recs3 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
    assert(recs3.canonicalResult.status === 'SUCCESS', 'Step 3 status is SUCCESS');
    assert(recs3.results.some(r => r.product.name === 'Royal Oud'), 'Step 3 Royal Oud is eligible again');
    assert(recs3.results.some(r => r.product.name === 'Amber Nights'), 'Step 3 Amber Nights is eligible again');
  }

  console.log('\n============================================================');
  console.log(`TEST SUMMARY: ${failures === 0 ? 'ALL 6 TESTS PASSED ✅' : `${failures} TEST(S) FAILED ❌`}`);
  console.log('============================================================');
  if (failures > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

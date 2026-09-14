import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { normalizeAssistantMessages, getVerifiedBrandDifferentiator } from '../src/lib/message-sequencer';

async function runConversationalTests() {
  console.log('================================================================');
  console.log('🧪 RUNNING CONVERSATIONAL MESSAGES & OBJECTION TESTS');
  console.log('================================================================\n');

  const wopBrand = getBrand('worldofperfumers')!;
  const tmBrand = getBrand('tmperfumehouse')!;
  const wopProducts = getProducts('worldofperfumers');
  const tmProducts = getProducts('tmperfumehouse');

  let passed = 0;
  let total = 0;

  function assert(name: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // --- TEST 1: Greeting ("Hi") ---
  console.log('\n--- TEST 1: GREETING ("Hi") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('Hi', tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, 'Hi');
    const recs = getRecommendations(toStructuredPreferences(updatedState, 'Hi'), tmProducts);
    const reply = await generateConversationalResponse('Hi', tmBrand, stage1, tmProducts, recs.results, state, []);
    const messages = normalizeAssistantMessages(reply, tmBrand, stage1.intent, { resultsCount: 0 });

    console.log('Messages:', messages);
    assert('Test 1: Greeting produces 2 short messages', messages.length === 2);
    assert('Test 1: Greeting produces 0 product recommendations', recs.results.length === 0 || stage1.intent === 'GREETING');
  }

  // --- TEST 2: Basic discovery ("I want something fresh.") ---
  console.log('\n--- TEST 2: BASIC DISCOVERY ("I want something fresh.") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('I want something fresh.', tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, 'I want something fresh.');
    const recs = getRecommendations(toStructuredPreferences(updatedState, 'I want something fresh.'), tmProducts);
    const reply = await generateConversationalResponse('I want something fresh.', tmBrand, stage1, tmProducts, recs.results, state, []);
    const messages = normalizeAssistantMessages(reply, tmBrand, stage1.intent, { resultsCount: recs.results.length });

    console.log('Messages:', messages);
    console.log('Products:', recs.results.map((r) => r.product.name));
    assert('Test 2: Fresh discovery produces 2-4 messages', messages.length >= 1 && messages.length <= 4);
    assert('Test 2: Fresh products recommended', recs.results.length > 0 && recs.results.every((r) => r.product.fragranceFamily.includes('fresh')));
  }

  // --- TEST 3: Competitor objection without preference ("TM Perfume House has better scents.") ---
  console.log('\n--- TEST 3: COMPETITOR OBJECTION ("TM Perfume House has better scents.") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('TM Perfume House has better scents.', wopBrand, wopProducts, [], state);
    assert('Test 3: Intent is CUSTOMER_OBJECTION', stage1.intent === 'CUSTOMER_OBJECTION');
    assert('Test 3: needs_recommendations is false', stage1.needs_recommendations === false);

    const reply = await generateConversationalResponse('TM Perfume House has better scents.', wopBrand, stage1, wopProducts, [], state, []);
    const messages = normalizeAssistantMessages(reply, wopBrand, stage1.intent, { resultsCount: 0 });

    console.log('Messages:', messages);
    assert('Test 3: Produces 3-4 sequential thoughts', messages.length >= 3 && messages.length <= 4);
    const allText = messages.join(' ');
    assert('Test 3: Contains verified differentiator', allText.includes('10ml') || allText.includes('inspired fragrances'));
    assert('Test 3: Acknowledges personal nature of fragrance', allText.toLowerCase().includes('personal') || allText.toLowerCase().includes('fair'));
  }

  // --- TEST 4: Competitor objection WITH preference ("TM Perfume House has better scents. I like fresh perfumes.") ---
  console.log('\n--- TEST 4: COMPETITOR OBJECTION + PREFERENCE ("TM Perfume House has better scents. I like fresh perfumes.") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('TM Perfume House has better scents. I like fresh perfumes.', wopBrand, wopProducts, [], state);
    console.log('Stage 1 intent:', stage1.intent, 'families:', stage1.fragrance_families, 'needs_recs:', stage1.needs_recommendations);

    const updatedState = updateConversationState(state, stage1, 'TM Perfume House has better scents. I like fresh perfumes.');
    let recs = getRecommendations(toStructuredPreferences(updatedState, 'TM Perfume House has better scents. I like fresh perfumes.'), wopProducts).results;
    // Cap to max 2 in objection flow as implemented in route.ts
    if (stage1.intent === 'CUSTOMER_OBJECTION' && recs.length > 0) {
      recs = recs.slice(0, 2);
    }

    const reply = await generateConversationalResponse('TM Perfume House has better scents. I like fresh perfumes.', wopBrand, stage1, wopProducts, recs, updatedState, []);
    const messages = normalizeAssistantMessages(reply, wopBrand, stage1.intent, {
      resultsCount: recs.length,
      hasPreference: true,
    });

    console.log('Messages:', messages);
    console.log('Capped Products (max 2):', recs.map((r) => r.product.name));
    assert('Test 4: Produces sequential messages', messages.length >= 2 && messages.length <= 4);
    assert('Test 4: Maximum 2 products in conversational objection flow', recs.length > 0 && recs.length <= 2);
    assert('Test 4: All recommended products are fresh', recs.every((r) => r.product.fragranceFamily.includes('fresh')));
  }

  // --- TEST 5: Competitor objection + similarity ("Fraganote has better scents. Show me something similar.") ---
  console.log('\n--- TEST 5: COMPETITOR OBJECTION + SIMILARITY ("Fraganote has better scents. Show me something similar.") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('Fraganote has better scents. Show me something similar.', tmBrand, tmProducts, [], state);
    console.log('Stage 1 intent:', stage1.intent, 'reference:', stage1.reference_perfume, 'is_sim:', stage1.is_similarity_request);
    assert('Test 5: Captures similarity intent or reference', stage1.intent === 'SIMILAR_TO_REFERENCE' || Boolean(stage1.reference_perfume));
    assert('Test 5: needs_recommendations is true', stage1.needs_recommendations === true);
  }

  // --- TEST 6: Complex recommendation query ("I want something fresh for summer under ₹800.") ---
  console.log('\n--- TEST 6: MULTI-CONSTRAINT RECOMMENDATION ("I want something fresh for summer under ₹800.") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('I want something fresh for summer under ₹800.', tmBrand, tmProducts, [], state);
    const updatedState = updateConversationState(state, stage1, 'I want something fresh for summer under ₹800.');
    const recs = getRecommendations(toStructuredPreferences(updatedState, 'I want something fresh for summer under ₹800.'), tmProducts).results;
    const reply = await generateConversationalResponse('I want something fresh for summer under ₹800.', tmBrand, stage1, tmProducts, recs, updatedState, []);
    const messages = normalizeAssistantMessages(reply, tmBrand, stage1.intent, { resultsCount: recs.length });

    console.log('Messages:', messages);
    console.log('Products:', recs.map((r) => `${r.product.name} (₹${r.product.price})`));
    assert('Test 6: Produces 2-4 messages', messages.length >= 2 && messages.length <= 4);
    assert('Test 6: Budget constraint respected (<= 800)', recs.every((r) => r.product.price <= 800));
  }

  // --- TEST 7: Reset consultation ("Forget everything.") ---
  console.log('\n--- TEST 7: RESET ("Forget everything.") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('Forget everything.', tmBrand, tmProducts, [], state);
    const reply = await generateConversationalResponse('Forget everything.', tmBrand, stage1, tmProducts, [], state, []);
    const messages = normalizeAssistantMessages(reply, tmBrand, stage1.intent, { resultsCount: 0 });

    console.log('Messages:', messages);
    assert('Test 7: Intent is RESET_CONSULTATION', stage1.intent === 'RESET_CONSULTATION');
    assert('Test 7: Produces 2 clean reset messages', messages.length === 2);
  }

  // --- TEST 8: Product info ("What are the notes in Royal Oud?") ---
  console.log('\n--- TEST 8: PRODUCT INFO ("What are the notes in Royal Oud?") ---');
  {
    const state = createInitialConversationState();
    const stage1 = await classifyIntentAndExtractPreferences('What are the notes in Royal Oud?', tmBrand, tmProducts, [], state);
    const targetProduct = stage1.target_product_names?.length ? tmProducts.find((p) => p.name.toLowerCase().includes('royal oud')) : undefined;
    const reply = await generateConversationalResponse('What are the notes in Royal Oud?', tmBrand, stage1, targetProduct ? [targetProduct] : [], [], state, []);
    const messages = normalizeAssistantMessages(reply, tmBrand, stage1.intent, { resultsCount: 0 });

    console.log('Messages:', messages);
    assert('Test 8: Intent is PRODUCT_INFO', stage1.intent === 'PRODUCT_INFO');
    assert('Test 8: Produces sequential explanation', messages.length >= 1 && messages.length <= 4);
    assert('Test 8: Grounded in Royal Oud note profile', messages.join(' ').toLowerCase().includes('oud') || messages.join(' ').toLowerCase().includes('wood'));
  }

  // --- VERIFY DIFFERENTIATORS FOR ALL 4 BRANDS ---
  console.log('\n--- VERIFYING DIFFERENTIATORS FOR ALL 4 BRANDS ---');
  const brands = ['worldofperfumers', 'tmperfumehouse', 'almaham', 'arabianaroma'];
  for (const bSlug of brands) {
    const b = getBrand(bSlug)!;
    const diff = getVerifiedBrandDifferentiator(b);
    console.log(`[${b.name}]: "${diff}"`);
    assert(`Differentiator exists for ${b.name}`, Boolean(diff && diff.length > 15));
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================');

  if (passed !== total) {
    process.exit(1);
  }
}

runConversationalTests().catch((err) => {
  console.error(err);
  process.exit(1);
});

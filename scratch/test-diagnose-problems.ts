import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';

async function diagnose() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  console.log('--- TEST 1: Fresh -> Actually, make it warm ---');
  let state = createInitialConversationState();
  let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], state);
  state = updateConversationState(state, s1, 'I want something fresh.');
  console.log('Turn 1 activeRequest:', JSON.stringify(state.activeRequest));
  let recs1 = getRecommendations(toStructuredPreferences(state), products, 3);
  console.log('Turn 1 products:', recs1.results.map(r => r.product.name));

  let s2 = await classifyIntentAndExtractPreferences('Actually, make it warm.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], state);
  console.log('Turn 2 stage1 updates:', JSON.stringify(s2.updates));
  console.log('Turn 2 stage1 full:', JSON.stringify({
    intent: s2.intent,
    warmth: s2.warmth,
    freshness: s2.freshness,
    families: s2.fragrance_families,
    updates: s2.updates
  }));
  state = updateConversationState(state, s2, 'Actually, make it warm.');
  console.log('Turn 2 activeRequest:', JSON.stringify(state.activeRequest));
  let recs2 = getRecommendations(toStructuredPreferences(state), products, 3);
  console.log('Turn 2 products:', recs2.results.map(r => `${r.product.name} (score: ${r.score})`));

  console.log('\n--- TEST 2: Fresh -> Make it strong ---');
  let stateB = createInitialConversationState();
  let sb1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], stateB);
  stateB = updateConversationState(stateB, sb1, 'I want something fresh.');
  let sb2 = await classifyIntentAndExtractPreferences('Make it strong.', brand, products, [{ role: 'user', content: 'I want something fresh.' }], stateB);
  stateB = updateConversationState(stateB, sb2, 'Make it strong.');
  console.log('Test 2 activeRequest:', JSON.stringify(stateB.activeRequest));
  let recsB = getRecommendations(toStructuredPreferences(stateB), products, 3);
  console.log('Test 2 status:', recsB.canonicalResult.status);
  console.log('Test 2 products:', recsB.results.map(r => `${r.product.name} (intensity: ${r.product.intensity}, families: ${r.product.fragranceFamily.join(',')})`));

  console.log('\n--- TEST 3: Strong -> But not loud -> Show me options ---');
  let stateC = createInitialConversationState();
  let sc1 = await classifyIntentAndExtractPreferences('I want something strong.', brand, products, [], stateC);
  stateC = updateConversationState(stateC, sc1, 'I want something strong.');
  let sc2 = await classifyIntentAndExtractPreferences('But not loud.', brand, products, [{ role: 'user', content: 'I want something strong.' }], stateC);
  stateC = updateConversationState(stateC, sc2, 'But not loud.');
  console.log('After "But not loud." activeRequest:', JSON.stringify(stateC.activeRequest));
  let recsC2 = getRecommendations(toStructuredPreferences(stateC), products, 3);
  console.log('After "But not loud." status:', recsC2.canonicalResult.status, 'results:', recsC2.results.length);

  let sc3 = await classifyIntentAndExtractPreferences('Show me options.', brand, products, [
    { role: 'user', content: 'I want something strong.' },
    { role: 'user', content: 'But not loud.' }
  ], stateC);
  console.log('Show me options intent:', sc3.intent, 'updates:', sc3.updates);
  stateC = updateConversationState(stateC, sc3, 'Show me options.');
  let recsC3 = getRecommendations(toStructuredPreferences(stateC), products, 3);
  console.log('Show me options status:', recsC3.canonicalResult.status, 'results count:', recsC3.results.length, 'products:', recsC3.results.map(r => r.product.name));
}

diagnose().catch(console.error);

import { getBrand, getProducts } from '../src/data';
import { enrichProduct } from '../src/lib/product-enricher';
import { isValidCandidate, getRecommendations } from '../src/lib/recommendation-engine';
import { toStructuredPreferences, createInitialConversationState, updateConversationState } from '../src/lib/state-manager';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';

async function testFreshStrong() {
  const brand = getBrand('tmperfumehouse')!;
  const rawProducts = getProducts('tmperfumehouse');

  console.log('Testing Fresh -> Make it strong:');
  let state = createInitialConversationState();
  let s1 = await classifyIntentAndExtractPreferences('I want something fresh.', brand, rawProducts, [], state);
  state = updateConversationState(state, s1, 'I want something fresh.');
  console.log('Turn 1 activeRequest:', state.activeRequest);
  let recs1 = getRecommendations(toStructuredPreferences(state), rawProducts, 3);
  console.log('Turn 1 recs:', recs1.results.map(r => r.product.name));

  let s2 = await classifyIntentAndExtractPreferences('Make it strong.', brand, rawProducts, [{ role: 'user', content: 'I want something fresh.' }], state);
  state = updateConversationState(state, s2, 'Make it strong.');
  console.log('Turn 2 activeRequest:', state.activeRequest);
  let prefs2 = toStructuredPreferences(state);
  console.log('Turn 2 structuredPrefs:', prefs2);

  let recs2 = getRecommendations(prefs2, rawProducts, 3);
  console.log('Turn 2 recs status:', recs2.canonicalResult.status);
  console.log('Turn 2 recs results count:', recs2.results.length);
  console.log('Turn 2 recs products:', recs2.results.map(r => `${r.product.name} (intensity=${r.product.intensity}, families=${r.product.fragranceFamily})`));
}

testFreshStrong().catch(console.error);

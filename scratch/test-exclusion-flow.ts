import { classifyIntentAndExtractPreferences, validateAndEnforcePolarity, fallbackIntentClassifier, analyzePolarity } from '../src/lib/intent-classifier';
import { updateConversationState, toStructuredPreferences, createInitialConversationState } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { getProducts, getBrand } from '../src/data';

async function test() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  const testPhrases = [
    "I don't like sweet perfumes.",
    "I don’t like sweet perfumes.",
    "i dont like sweet perfume",
    "i do not like sweet perfume",
    "i hate sweet perfumes",
    "Anything but sugary scents.",
    "I hate oud."
  ];

  console.log('--- TESTING POLARITY & INTENT ---');
  for (const phrase of testPhrases) {
    const sweetPol = analyzePolarity(phrase, 'sweet');
    const oudPol = analyzePolarity(phrase, 'oud');
    console.log(`Phrase: "${phrase}"`);
    console.log('  sweet polarity:', sweetPol);
    console.log('  oud polarity:  ', oudPol);

    const fallback = fallbackIntentClassifier(phrase, brand, products);
    console.log('  fallback intent:', fallback.intent, 'needs_rec:', fallback.needs_recommendations, 'excluded_families:', fallback.excluded_families, 'fragrance_families:', fallback.fragrance_families);
  }
  console.log('\n--- MULTI-TURN CONVERSATION TEST ---');
  let state = createInitialConversationState();

  // Turn 1: "I don't like sweet perfumes."
  const turn1Stage1 = fallbackIntentClassifier("I don't like sweet perfumes.", brand, products, state);
  state = updateConversationState(state, turn1Stage1, "I don't like sweet perfumes.");
  console.log('After Turn 1 state:');
  console.log('  excludedFamilies:', state.activeRequest?.excludedFamilies);
  console.log('  bg persistentExclusions:', state.backgroundContext?.persistentExclusions);

  // Turn 2: "Recommend something for a date."
  const turn2Stage1 = fallbackIntentClassifier("Recommend something for a date.", brand, products, state);
  console.log('Turn 2 Stage 1:');
  console.log('  intent:', turn2Stage1.intent);
  console.log('  occasion:', turn2Stage1.occasion);
  console.log('  is_new_request:', turn2Stage1.is_new_request);
  console.log('  is_refinement:', turn2Stage1.is_refinement);

  state = updateConversationState(state, turn2Stage1, "Recommend something for a date.");
  console.log('After Turn 2 state:');
  console.log('  occasion:', state.activeRequest?.occasion);
  console.log('  excludedFamilies:', state.activeRequest?.excludedFamilies);
  console.log('  bg persistentExclusions:', state.backgroundContext?.persistentExclusions);

  const prefs2 = toStructuredPreferences(state, "Recommend something for a date.");
  console.log('Turn 2 Structured Preferences:');
  console.log('  exclusions:', prefs2.exclusions);
  const rec2 = getRecommendations(prefs2, products, 3);
  console.log('Turn 2 Rec products:', rec2.results.map(r => `${r.product.name} (${r.product.fragranceFamily.join('/')})`));

  // Turn 3: "Make it stronger."
  const turn3Stage1 = fallbackIntentClassifier("Make it stronger.", brand, products, state);
  state = updateConversationState(state, turn3Stage1, "Make it stronger.");
  console.log('After Turn 3 state:');
  console.log('  occasion:', state.activeRequest?.occasion);
  console.log('  intensity:', state.activeRequest?.intensity);
  console.log('  excludedFamilies:', state.activeRequest?.excludedFamilies);
  console.log('  bg persistentExclusions:', state.backgroundContext?.persistentExclusions);

  const prefs3 = toStructuredPreferences(state, "Make it stronger.");
  console.log('Turn 3 Structured Preferences:');
  console.log('  exclusions:', prefs3.exclusions);
  const rec3 = getRecommendations(prefs3, products, 3);
  console.log('Turn 3 Rec products:', rec3.results.map(r => `${r.product.name} (${r.product.fragranceFamily.join('/')})`));
}

test().catch(console.error);

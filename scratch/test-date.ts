import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { createInitialConversationState, updateConversationState } from '../src/lib/state-manager';
import { getProducts, getBrand } from '../src/data';

async function testDate() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  let state = createInitialConversationState();

  // Step 1: "I don't like sweet perfumes."
  const s1 = await classifyIntentAndExtractPreferences("I don't like sweet perfumes.", brand, products, [], state);
  state = updateConversationState(state, s1, "I don't like sweet perfumes.");
  console.log('After Step 1:', JSON.stringify(state.activeRequest, null, 2));

  // Step 2: "Recommend something for a date."
  const s2 = await classifyIntentAndExtractPreferences("Recommend something for a date.", brand, products, [], state);
  console.log('Stage 1 for Step 2:', JSON.stringify(s2, null, 2));
  state = updateConversationState(state, s2, "Recommend something for a date.");
  console.log('After Step 2:', JSON.stringify(state.activeRequest, null, 2));
}

testDate().catch(console.error);

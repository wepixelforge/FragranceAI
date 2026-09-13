/**
 * Conversation Gate Test Suite
 * Verifies that non-recommendation messages don't trigger the product engine.
 * 
 * Run from project root: npx tsx --tsconfig tsconfig.json scratch/test-conversation-gate.ts
 */

// Use relative paths since scratch is excluded from tsconfig paths
const data = require('../src/data');
const intentClassifier = require('../src/lib/intent-classifier');
const stateManager = require('../src/lib/state-manager');

const { getBrand, getProducts } = data;
const { normalizeText, doesIntentRequireProducts, fallbackIntentClassifier } = intentClassifier;
const { createInitialConversationState } = stateManager;

const brand = getBrand('tmperfumehouse')!;
const products = getProducts('tmperfumehouse');
const freshState = createInitialConversationState();

interface TestCase {
  name: string;
  message: string;
  expectedIntent: string;
  shouldRequireProducts: boolean;
}

const TESTS: TestCase[] = [
  // === CUSTOMER OBJECTION TESTS ===
  { name: 'Objection: "other brands have better scents"', message: 'other brands have better scents', expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },
  { name: 'Objection: "these perfumes smell cheap"', message: 'these perfumes smell cheap', expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },
  { name: 'Objection: "why should I buy from you and not Zara?"', message: 'why should I buy from you and not Zara?', expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },
  { name: 'Objection: "your fragrances don\'t last long"', message: "your fragrances don't last long", expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },
  { name: 'Objection: "this is overpriced"', message: 'this is overpriced', expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },
  { name: 'Objection: "I\'ve smelled better"', message: "I've smelled better", expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },
  { name: 'Objection: "nothing here matches luxury brands"', message: 'nothing here matches luxury brands', expectedIntent: 'CUSTOMER_OBJECTION', shouldRequireProducts: false },

  // === BRAND CONVERSATION TESTS ===
  { name: 'Brand: "where are your perfumes made?"', message: 'where are your perfumes made?', expectedIntent: 'BRAND_CONVERSATION', shouldRequireProducts: false },
  { name: 'Brand: "do you do returns?"', message: 'do you do returns?', expectedIntent: 'BRAND_CONVERSATION', shouldRequireProducts: false },
  { name: 'Brand: "is this brand cruelty free?"', message: 'is this brand cruelty free?', expectedIntent: 'BRAND_CONVERSATION', shouldRequireProducts: false },
  { name: 'Brand: "tell me about your brand"', message: 'tell me about your brand', expectedIntent: 'BRAND_CONVERSATION', shouldRequireProducts: false },

  // === PURCHASE ASSISTANCE TESTS ===
  { name: 'Purchase: "I\'m not sure which one to pick"', message: "I'm not sure which one to pick", expectedIntent: 'PURCHASE_ASSISTANCE', shouldRequireProducts: false },
  { name: 'Purchase: "should I get the 30ml or the 50ml?"', message: 'should I get the 30ml or the 50ml?', expectedIntent: 'PURCHASE_ASSISTANCE', shouldRequireProducts: false },
  { name: 'Purchase: "is it worth the price?"', message: 'is it worth the price?', expectedIntent: 'PURCHASE_ASSISTANCE', shouldRequireProducts: false },
  { name: 'Purchase: "I\'m still thinking"', message: "I'm still thinking", expectedIntent: 'PURCHASE_ASSISTANCE', shouldRequireProducts: false },

  // === GENERAL CONVERSATION TESTS ===
  { name: 'General: "thank you"', message: 'thank you', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "goodbye"', message: 'goodbye', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "okay"', message: 'okay', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "cool"', message: 'cool', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "you\'re helpful"', message: "you're helpful", expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "interesting"', message: 'interesting', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "thanks a lot"', message: 'thanks a lot', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },
  { name: 'General: "noted"', message: 'noted', expectedIntent: 'GENERAL_CONVERSATION', shouldRequireProducts: false },

  // === EXISTING FLOWS STILL WORK ===
  { name: 'Recommendation: "I want something fresh for office"', message: 'I want something fresh for office', expectedIntent: 'RECOMMENDATION', shouldRequireProducts: true },
  { name: 'Recommendation: "I want something spicy for a date"', message: 'I want something spicy for a date', expectedIntent: 'RECOMMENDATION', shouldRequireProducts: true },
  { name: 'Greeting still works: "hi"', message: 'hi', expectedIntent: 'GREETING', shouldRequireProducts: false },
  { name: 'Neg preference still works: "I don\'t like sweet perfumes"', message: "I don't like sweet perfumes", expectedIntent: 'PREFERENCE_UPDATE', shouldRequireProducts: false },
  { name: 'Out of scope: "what is the capital of France?"', message: 'what is the capital of France?', expectedIntent: 'OUT_OF_SCOPE', shouldRequireProducts: false },
];

async function runTests() {
  console.log('\n========================================');
  console.log('  CONVERSATION GATE TEST SUITE');
  console.log('========================================\n');

  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    const cleanMessage = normalizeText(test.message);
    
    // Use fallback classifier (deterministic, no Groq) for fast testing
    const result = fallbackIntentClassifier(cleanMessage, brand, products, freshState);
    const requiresProducts = doesIntentRequireProducts(result.intent, result);
    const intentMatch = result.intent === test.expectedIntent;
    const productsMatch = requiresProducts === test.shouldRequireProducts;
    const testPassed = intentMatch && productsMatch;

    if (testPassed) {
      passed++;
      console.log(`  ✅ ${test.name}`);
    } else {
      failed++;
      console.log(`  ❌ ${test.name}`);
      if (!intentMatch) console.log(`     Intent: expected "${test.expectedIntent}", got "${result.intent}"`);
      if (!productsMatch) console.log(`     Products: expected ${test.shouldRequireProducts}, got ${requiresProducts}`);
    }
  }

  console.log(`\n========================================`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed (${TESTS.length} total)`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});

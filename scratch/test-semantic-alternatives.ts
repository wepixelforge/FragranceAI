import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { getBrand, getProducts } from '../src/data';

async function testSemanticAlternatives() {
  console.log('================================================================');
  console.log('🔍 VERIFYING SEMANTIC ALTERNATIVE INTENT CLASSIFICATION');
  console.log('================================================================\n');

  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  const phrases = [
    'Show me something else',
    'Anything different?',
    'Give me another option',
    'What else do you have?',
    'More options',
    'Give me another one',
    'Something different',
    "I don't like these, show me something different",
    'Anything other than these?',
    'Can you give me another choice?',
  ];

  let passed = 0;
  for (const phrase of phrases) {
    const result = await classifyIntentAndExtractPreferences(
      phrase,
      brand,
      products,
      [],
      undefined
    );

    const isAlternative = result.intent === 'SHOW_ALTERNATIVES';
    if (isAlternative) {
      passed++;
      console.log(`✅ PASS: "${phrase}" -> intent: ${result.intent}`);
    } else {
      console.error(`❌ FAIL: "${phrase}" -> intent: ${result.intent}`);
    }
  }

  console.log(`\nResult: ${passed}/${phrases.length} semantic alternative intents verified.`);
  if (passed !== phrases.length) {
    process.exit(1);
  }
}

testSemanticAlternatives().catch(err => {
  console.error(err);
  process.exit(1);
});

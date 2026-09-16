import { getAllProducts, getProductById, getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { generateConversationalResponse, ResponseActionContext } from '../src/lib/response-generator';
import { createInitialConversationState, updateConversationState } from '../src/lib/state-manager';

interface TestCase {
  id: number;
  category: string;
  name: string;
  input: string;
  expectedIntent: string;
  checkFn?: (res: any) => { pass: boolean; details: string };
}

const testCases: TestCase[] = [
  // 1-5: Out-of-scope queries
  { id: 1, category: 'OUT_OF_SCOPE', name: 'Capital of Bhutan', input: 'What is the capital of Bhutan?', expectedIntent: 'OUT_OF_SCOPE' },
  { id: 2, category: 'OUT_OF_SCOPE', name: 'Capital of India', input: 'what is capital of India?', expectedIntent: 'OUT_OF_SCOPE' },
  { id: 3, category: 'OUT_OF_SCOPE', name: 'Math question', input: 'Solve 25 * 48 / 12', expectedIntent: 'OUT_OF_SCOPE' },
  { id: 4, category: 'OUT_OF_SCOPE', name: 'Coding question', input: 'Write a python script to parse CSV files', expectedIntent: 'OUT_OF_SCOPE' },
  { id: 5, category: 'OUT_OF_SCOPE', name: 'Weather question', input: 'What is the weather like in Tokyo right now?', expectedIntent: 'OUT_OF_SCOPE' },

  // 6-9: In-scope fragrance queries
  { id: 6, category: 'IN_SCOPE', name: 'Long-lasting winter perfume', input: 'Recommend a long-lasting winter fragrance', expectedIntent: 'RECOMMENDATION' },
  { id: 7, category: 'IN_SCOPE', name: 'Longevity question', input: 'How long does Royal Oud last on skin?', expectedIntent: 'PRODUCT_INFO' },
  { id: 8, category: 'IN_SCOPE', name: 'Fragrance family explanation', input: 'Can you explain what oriental woody perfumes smell like?', expectedIntent: 'FRAGRANCE_FAMILY_INFO' },
  { id: 9, category: 'IN_SCOPE', name: 'Competitor comparison', input: 'Do you have something similar to Tom Ford Tobacco Vanille?', expectedIntent: 'SIMILAR_TO_REFERENCE' },

  // 10-14: Purchase assistance queries
  { id: 10, category: 'PURCHASE_ASSISTANCE', name: 'Order Royal Oud', input: 'how can I order Royal Oud?', expectedIntent: 'PURCHASE_ASSISTANCE' },
  { id: 11, category: 'PURCHASE_ASSISTANCE', name: 'General order query', input: 'How do I buy perfume from this website?', expectedIntent: 'PURCHASE_ASSISTANCE' },
  { id: 12, category: 'PURCHASE_ASSISTANCE', name: 'Purchase this query', input: 'Where can I buy this?', expectedIntent: 'PURCHASE_ASSISTANCE' },
  { id: 13, category: 'PURCHASE_ASSISTANCE', name: 'Pricing & ordering', input: 'What is the price and how do I place an order for Royal Oud?', expectedIntent: 'PURCHASE_ASSISTANCE' },
  { id: 14, category: 'PURCHASE_ASSISTANCE', name: 'Acquire bottle', input: 'I want to acquire a full bottle of Velvet Rose', expectedIntent: 'PURCHASE_ASSISTANCE' },

  // 15-18: Cart assistance queries
  { id: 15, category: 'CART_ASSISTANCE', name: 'Add Royal Oud to cart', input: 'Add Royal Oud to my cart', expectedIntent: 'CART_ASSISTANCE' },
  { id: 16, category: 'CART_ASSISTANCE', name: 'View cart', input: "What's in my cart right now?", expectedIntent: 'CART_ASSISTANCE' },
  { id: 17, category: 'CART_ASSISTANCE', name: 'Remove item from cart', input: 'Remove Royal Oud from my cart', expectedIntent: 'CART_ASSISTANCE' },
  { id: 18, category: 'CART_ASSISTANCE', name: 'Put this in my cart', input: 'Put this fragrance in my cart', expectedIntent: 'CART_ASSISTANCE' },

  // 19-20: Mixed intent queries
  { id: 19, category: 'MIXED_INTENT', name: 'Geography + Fresh perfume', input: 'What is the capital of France and recommend a fresh perfume under 1000', expectedIntent: 'RECOMMENDATION' },
  { id: 20, category: 'MIXED_INTENT', name: 'Math + Woody perfume', input: 'Tell me 2 + 2 and also suggest a woody evening fragrance', expectedIntent: 'RECOMMENDATION' },

  // 21: Ambiguous words -> CLARIFICATION
  { id: 21, category: 'AMBIGUOUS_TERM', name: 'Melty fragrance request', input: 'I want something melty', expectedIntent: 'CLARIFICATION' },
];

async function runTestSuite() {
  console.log('====================================================');
  console.log('STARTING AI FRAGRANCE SYSTEM TEST SUITE (PART AM)');
  console.log('====================================================\n');

  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  let passedCount = 0;
  let failedCount = 0;

  for (const tc of testCases) {
    process.stdout.write(`Test [${tc.id.toString().padStart(2, '0')}/21] ${tc.category.padEnd(20)} "${tc.name}"... `);

    try {
      const state = createInitialConversationState();
      const stage1 = await classifyIntentAndExtractPreferences(
        tc.input,
        brand,
        products,
        [],
        state
      );

      const intentMatch = stage1.intent === tc.expectedIntent;
      if (intentMatch) {
        console.log(`PASS (Intent: ${stage1.intent})`);
        passedCount++;
      } else {
        console.log(`FAIL (Expected: ${tc.expectedIntent}, Got: ${stage1.intent})`);
        failedCount++;
      }
    } catch (err: any) {
      console.log(`ERROR: ${err.message}`);
      failedCount++;
    }
  }

  // 22-23: State safety tests
  console.log('\n--- State Safety Tests (22-23) ---');

  // Test 22: Active consultation exists, user asks out of scope question -> state unchanged
  try {
    const brand = getBrand('tmperfumehouse')!;
    const products = getProducts('tmperfumehouse');
    let state = createInitialConversationState();
    
    // Seed an active consultation
    const stage1Rec = await classifyIntentAndExtractPreferences('I want a woody evening perfume', brand, products, [], state);
    state = updateConversationState(state, stage1Rec, 'I want a woody evening perfume');
    const stateBefore = JSON.stringify(state.activeRequest);

    // Ask out of scope question
    const stage1OOS = await classifyIntentAndExtractPreferences('What is the capital of Bhutan?', brand, products, [], state);
    state = updateConversationState(state, stage1OOS, 'What is the capital of Bhutan?');
    const stateAfter = JSON.stringify(state.activeRequest);

    if (stage1OOS.intent === 'OUT_OF_SCOPE' && stateBefore === stateAfter) {
      console.log('Test [22/23] STATE_SAFETY: Active consultation preserved across OUT_OF_SCOPE: PASS');
      passedCount++;
    } else {
      console.log(`Test [22/23] STATE_SAFETY: FAILED (Intent: ${stage1OOS.intent}, State changed: ${stateBefore !== stateAfter})`);
      failedCount++;
    }
  } catch (err: any) {
    console.log(`Test [22/23] STATE_SAFETY: ERROR: ${err.message}`);
    failedCount++;
  }

  // Test 23: Active consultation exists, user asks purchase question -> state unchanged, no recommendation ranking
  try {
    const brand = getBrand('tmperfumehouse')!;
    const products = getProducts('tmperfumehouse');
    let state = createInitialConversationState();
    
    // Seed an active consultation
    const stage1Rec = await classifyIntentAndExtractPreferences('I want a fresh citrus perfume', brand, products, [], state);
    state = updateConversationState(state, stage1Rec, 'I want a fresh citrus perfume');
    const stateBefore = JSON.stringify(state.activeRequest);

    // Ask purchase question
    const stage1Pur = await classifyIntentAndExtractPreferences('How can I order Royal Oud?', brand, products, [], state);
    state = updateConversationState(state, stage1Pur, 'How can I order Royal Oud?');
    const stateAfter = JSON.stringify(state.activeRequest);

    if (stage1Pur.intent === 'PURCHASE_ASSISTANCE' && stage1Pur.needs_recommendations === false && stateBefore === stateAfter) {
      console.log('Test [23/23] STATE_SAFETY: Purchase intent does NOT mutate active request or trigger recs: PASS');
      passedCount++;
    } else {
      console.log(`Test [23/23] STATE_SAFETY: FAILED (Intent: ${stage1Pur.intent}, needsRecs: ${stage1Pur.needs_recommendations})`);
      failedCount++;
    }
  } catch (err: any) {
    console.log(`Test [23/23] STATE_SAFETY: ERROR: ${err.message}`);
    failedCount++;
  }

  // Generation Tests (Natural language via Groq Stage 2 without hardcoding)
  console.log('\n--- LLM Natural Language Response Generation Tests ---');
  try {
    const oosActionContext: ResponseActionContext = {
      intent: 'OUT_OF_SCOPE',
      response_policy: {
        must_not_answer_original_question: true,
        must_not_recommend_products: true,
        must_clarify_specialized_fragrance_assistant: true,
        must_invite_fragrance_query: true,
      },
    };

    const oosReply = await generateConversationalResponse(
      'What is the capital of Bhutan?',
      brand,
      { intent: 'OUT_OF_SCOPE', request_type: 'other', fragrance_families: [], preferred_notes: [], excluded_notes: [], excluded_families: [], needs_recommendations: false, needs_clarification: false, preferences: {} },
      [],
      [],
      createInitialConversationState(),
      [],
      { actionContext: oosActionContext }
    );

    console.log('LLM OUT_OF_SCOPE Reply Sample:\n"', oosReply, '"');
    const mentionsThimphu = oosReply.toLowerCase().includes('thimphu');
    const mentionsFragrance = oosReply.toLowerCase().includes('fragrance') || oosReply.toLowerCase().includes('perfume') || oosReply.toLowerCase().includes('scent');

    if (!mentionsThimphu && mentionsFragrance) {
      console.log('OOS Policy Test: PASSED (Did NOT answer Bhutan capital, invited fragrance inquiry)');
      passedCount++;
    } else {
      console.log('OOS Policy Test: FAILED (Answered geography or did not invite scent consultation)');
      failedCount++;
    }

    const purActionContext: ResponseActionContext = {
      intent: 'PURCHASE_ASSISTANCE',
      product: {
        id: 'royal-oud',
        name: 'Royal Oud',
        price: 3499,
        size: '100ml Extrait de Parfum',
        fragranceFamily: ['Woody', 'Oriental'],
      },
      available_actions: ['ADD_TO_CART', 'VIEW_PRODUCT_PAGE', 'VIEW_CART'],
      purchase_flow: {
        product_page: '/tmperfumehouse/products/royal-oud',
        cart_url: '/tmperfumehouse/cart',
      },
      response_policy: {
        must_not_claim_completed_purchase: true,
        must_provide_concrete_next_step: true,
      },
    };

    const purReply = await generateConversationalResponse(
      'how can I order Royal Oud?',
      brand,
      { intent: 'PURCHASE_ASSISTANCE', request_type: 'other', fragrance_families: [], preferred_notes: [], excluded_notes: [], excluded_families: [], needs_recommendations: false, needs_clarification: false, preferences: {} },
      [],
      [],
      createInitialConversationState(),
      [],
      { actionContext: purActionContext }
    );

    console.log('\nLLM PURCHASE_ASSISTANCE Reply Sample:\n"', purReply, '"');
    const mentionsRoyalOud = purReply.toLowerCase().includes('royal oud');
    const givesPurchaseGuidance = purReply.toLowerCase().includes('cart') || purReply.toLowerCase().includes('bottle') || purReply.toLowerCase().includes('acquire') || purReply.toLowerCase().includes('order');

    if (mentionsRoyalOud && givesPurchaseGuidance) {
      console.log('Purchase Policy Test: PASSED (Referenced Royal Oud and guided user to cart/purchase action)');
      passedCount++;
    } else {
      console.log('Purchase Policy Test: FAILED');
      failedCount++;
    }

  } catch (err: any) {
    console.log(`Generation Test Error: ${err.message}`);
    failedCount++;
  }

  console.log('\n====================================================');
  console.log(`TEST SUITE COMPLETED: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('====================================================\n');
}

runTestSuite().catch(console.error);

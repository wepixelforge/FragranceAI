/**
 * Test Suite verifying that conversational intents do NOT access the product database/catalogue,
 * and that shopping intents access product data reliably without connection errors.
 */
export {};

interface ChatResponse {
  reply: string;
  intent: string;
  results: Array<{
    product: {
      id: string;
      name: string;
      price: number;
      fragranceFamily: string[];
      intensity: string;
    };
    score: number;
    explanation: string;
  }>;
  updatedState: any;
  needsRecommendations: boolean;
  debugInfo?: {
    requiresProductData: boolean;
    productRetrievalStatus: 'CALLED' | 'SKIPPED' | 'FAILED';
    recommendationEngineStatus: 'CALLED' | 'SKIPPED';
    totalCatalogueCount: number;
    filteredCount: number;
  };
}

const BASE_URL = 'http://localhost:3000/api/chat';

async function sendChat(
  message: string,
  conversationState?: any,
  brandSlug = 'tmperfumehouse'
): Promise<ChatResponse> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      brandSlug,
      conversationState,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  await new Promise((resolve) => setTimeout(resolve, 300));
  return data;
}

async function runTests() {
  console.log('================================================================');
  console.log('RUNNING FRAGRANCE DATABASE DEPENDENCY VERIFICATION (10 TESTS)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function record(condition: boolean, num: number, name: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] TEST ${num}: ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] TEST ${num}: ${name} -> ${detail || 'Failed'}`);
      failed++;
    }
  }

  try {
    // ── TEST 1: "hi" ─────────────────────────────────────────────────────────
    const t1 = await sendChat('hi');
    record(
      t1.results.length === 0 &&
      !t1.reply.toLowerCase().includes('database') &&
      t1.debugInfo?.requiresProductData === false &&
      t1.debugInfo?.productRetrievalStatus === 'SKIPPED',
      1,
      'Greeting ("hi") bypasses product retrieval with no database call',
      `reply="${t1.reply}", retrieval=${t1.debugInfo?.productRetrievalStatus}`
    );

    // ── TEST 2: "who are you?" ───────────────────────────────────────────────
    const t2 = await sendChat('who are you?');
    record(
      t2.results.length === 0 &&
      !t2.reply.toLowerCase().includes('database') &&
      t2.debugInfo?.requiresProductData === false &&
      t2.debugInfo?.productRetrievalStatus === 'SKIPPED',
      2,
      'Identity ("who are you?") bypasses product retrieval with no database call',
      `reply="${t2.reply.slice(0, 60)}", retrieval=${t2.debugInfo?.productRetrievalStatus}`
    );

    // ── TEST 3: "what can you help me with?" ─────────────────────────────────
    const t3 = await sendChat('what can you help me with?');
    record(
      t3.results.length === 0 &&
      !t3.reply.toLowerCase().includes('database') &&
      t3.debugInfo?.requiresProductData === false &&
      t3.debugInfo?.productRetrievalStatus === 'SKIPPED',
      3,
      'Capability ("what can you help me with?") bypasses product retrieval',
      `reply="${t3.reply.slice(0, 60)}", retrieval=${t3.debugInfo?.productRetrievalStatus}`
    );

    // ── TEST 4: "how are you?" ───────────────────────────────────────────────
    const t4 = await sendChat('how are you?');
    record(
      t4.results.length === 0 &&
      !t4.reply.toLowerCase().includes('database') &&
      t4.debugInfo?.requiresProductData === false &&
      t4.debugInfo?.productRetrievalStatus === 'SKIPPED',
      4,
      'Conversational response ("how are you?") bypasses product retrieval',
      `reply="${t4.reply.slice(0, 60)}", retrieval=${t4.debugInfo?.productRetrievalStatus}`
    );

    // ── TEST 5: "what is the capital of France?" ─────────────────────────────
    const t5 = await sendChat('what is the capital of France?');
    record(
      t5.results.length === 0 &&
      !t5.reply.toLowerCase().includes('paris') &&
      (t5.reply.toLowerCase().includes('perfume') || t5.reply.toLowerCase().includes('fragrance')) &&
      !t5.reply.toLowerCase().includes('database') &&
      t5.debugInfo?.requiresProductData === false &&
      t5.debugInfo?.productRetrievalStatus === 'SKIPPED',
      5,
      'OUT_OF_SCOPE ("what is the capital of France?") bypasses product retrieval and politely refuses without answering',
      `reply="${t5.reply.slice(0, 60)}", retrieval=${t5.debugInfo?.productRetrievalStatus}`
    );

    // ── TEST 6: "I want something fresh for office." ──────────────────────────
    const t6 = await sendChat('I want something fresh for office.');
    record(
      t6.results.length > 0 &&
      t6.debugInfo?.requiresProductData === true &&
      t6.debugInfo?.productRetrievalStatus === 'CALLED' &&
      t6.debugInfo?.recommendationEngineStatus === 'CALLED',
      6,
      'Recommendation query accesses product catalogue and returns products',
      `results=${t6.results.map((r) => r.product.name).join(', ')}, retrieval=${t6.debugInfo?.productRetrievalStatus}`
    );

    // ── TEST 7: "I have ₹500 and want something fresh." ──────────────────────
    const t7 = await sendChat('I have ₹500 and want something fresh.');
    const allUnder500 = t7.results.every((r) => r.product.price <= 500);
    record(
      t7.debugInfo?.requiresProductData === true &&
      t7.debugInfo?.productRetrievalStatus === 'CALLED' &&
      allUnder500 &&
      t7.results.length > 0,
      7,
      'Product data accessed and only products <= ₹500 recommended',
      `prices=${t7.results.map((r) => r.product.price).join(', ')}`
    );

    // ── TEST 8: "I don't like sweet perfumes." ──────────────────────────────
    const t8 = await sendChat("I don't like sweet perfumes.");
    const avoidSweet = t8.updatedState?.backgroundPreferences?.persistent_exclusions?.families?.includes('sweet');
    record(
      avoidSweet && t8.results.length === 0,
      8,
      'Negative exclusion recorded without dumping products',
      `avoidSweet=${avoidSweet}, results=${t8.results.length}`
    );

    // ── TEST 9: "Tell me about Royal Oud." ───────────────────────────────────
    const t9 = await sendChat('Tell me about Royal Oud.');
    record(
      t9.debugInfo?.requiresProductData === true &&
      t9.debugInfo?.productRetrievalStatus === 'CALLED' &&
      t9.reply.toLowerCase().includes('royal oud') &&
      (t9.reply.includes('1499') || t9.reply.toLowerCase().includes('oud')),
      9,
      'Product data accessed and factual Royal Oud info returned',
      `reply="${t9.reply.slice(0, 80)}"`
    );

    // ── TEST 10: "Compare Royal Oud and Cedar Noir." ─────────────────────────
    const t10 = await sendChat('Compare Royal Oud and Cedar Noir.');
    record(
      t10.debugInfo?.requiresProductData === true &&
      t10.debugInfo?.productRetrievalStatus === 'CALLED' &&
      t10.reply.toLowerCase().includes('royal oud'),
      10,
      'Product data accessed and factual comparison returned',
      `reply="${t10.reply.slice(0, 80)}"`
    );

  } catch (err) {
    console.error('Test error:', err);
  }

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passed}/10 PASSED, ${failed}/10 FAILED`);
  console.log('================================================================');
}

runTests();

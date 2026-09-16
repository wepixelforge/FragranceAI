import { POST } from '../src/app/api/chat/route';
import { NextRequest } from 'next/server';
import { ConversationState } from '../src/types/chat';

function createRequest(body: any): NextRequest {
  return new NextRequest('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function sendChat(message: string, state?: ConversationState, history: any[] = []) {
  const req = createRequest({
    message,
    brandSlug: 'tmperfumehouse',
    conversationState: state,
    history,
  });
  const res = await POST(req);
  return await res.json();
}

async function runAudit() {
  console.log('================================================================');
  console.log('🧪 RUNNING PRE-AUDIT CHATBOT REPAIR REGRESSION SUITE');
  console.log('================================================================\n');

  let state: ConversationState | undefined = undefined;
  let history: any[] = [];
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalCount++;
    if (condition) {
      passedCount++;
      console.log(`✅ PASS: ${testName}`);
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (details) console.error(`   Details: ${details}`);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1, 2, 3, 4, 5, 6: MULTI-TURN CONVERSATION SCENARIO
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- SCENARIO: Not Sweet -> Date -> Stronger -> Show Something Else (x2) ---');

  // Turn 1: "I don't like sweet perfumes."
  let res1 = await sendChat("I don't like sweet perfumes.", state, history);
  state = res1.updatedState;
  history.push({ role: 'user', content: "I don't like sweet perfumes." });
  history.push({ role: 'assistant', content: res1.reply });

  assert(!res1.reply.includes('<think>') && !res1.reply.includes('</think>'), 'Turn 1: No think tag in reply');
  assert(res1.updatedState?.activeRequest?.excludedFamilies?.includes('sweet'), 'Turn 1: Excluded sweet in activeRequest');
  assert(res1.updatedState?.backgroundContext?.persistentExclusions?.families?.includes('sweet'), 'Turn 1: Excluded sweet in persistentExclusions');

  // Turn 2: "Recommend something for a date."
  let res2 = await sendChat("Recommend something for a date.", state, history);
  state = res2.updatedState;
  history.push({ role: 'user', content: "Recommend something for a date." });
  history.push({ role: 'assistant', content: res2.reply });

  assert(!res2.reply.includes('<think>') && !res2.reply.includes('</think>'), 'Turn 2: No think tag in reply');
  assert(res2.results.length > 0, 'Turn 2: Recommendations returned');
  assert(
    res2.results.every((r: any) => !r.product.fragranceFamily.includes('sweet') && r.product.sweetness !== 'sweet' && r.product.sweetness !== 'very-sweet'),
    'Turn 2: No sweet products returned'
  );
  assert(res2.debugInfo.canonicalProductIds.length === res2.results.length, 'Turn 2: Canonical == Results');

  // Turn 3: "Make it stronger."
  let res3 = await sendChat("Make it stronger.", state, history);
  state = res3.updatedState;
  history.push({ role: 'user', content: "Make it stronger." });
  history.push({ role: 'assistant', content: res3.reply });

  const turn3ProductIds = res3.results.map((r: any) => r.product.id);
  console.log('Turn 3 Product IDs (Stronger):', turn3ProductIds);

  assert(!res3.reply.includes('<think>') && !res3.reply.includes('</think>') && !res3.reply.includes('<analysis>') && !res3.reply.includes('active context'), 'TEST 1: No internal reasoning / think leakage in "Make it stronger"');
  assert(
    res3.results.some((r: any) => r.product.intensity === 'strong' || r.product.intensity === 'projection-beast' || r.product.longevity === 'beast-mode'),
    'Turn 3: Strong intensity respected'
  );
  assert(
    res3.results.every((r: any) => !r.product.fragranceFamily.includes('sweet') && r.product.sweetness !== 'sweet'),
    'TEST 5: Sweet exclusion preserved in Turn 3'
  );
  assert(
    res3.debugInfo.canonicalProductIds.every((id: string, idx: number) => id === res3.debugInfo.llmProductIds[idx] && id === res3.debugInfo.uiProductIds[idx]),
    'TEST 4: Strict synchronization (Canonical == LLM == UI)'
  );

  // Turn 4: "Show me something else." (Alternative 1)
  let res4 = await sendChat("Show me something else.", state, history);
  state = res4.updatedState;
  history.push({ role: 'user', content: "Show me something else." });
  history.push({ role: 'assistant', content: res4.reply });

  const turn4ProductIds = res4.results.map((r: any) => r.product.id);
  console.log('Turn 4 Product IDs (Alternative 1):', turn4ProductIds);

  assert(!res4.reply.includes('<think>') && !res4.reply.includes('</think>'), 'Turn 4: No think tag in reply');
  assert(res4.intent === 'SHOW_ALTERNATIVES', 'Turn 4: Intent recognized as SHOW_ALTERNATIVES');
  assert(
    res4.results.length === 0 || !res4.results.some((r: any) => turn3ProductIds.includes(r.product.id)),
    'TEST 2: Alternative 1 does not repeat immediately previous products',
    `Turn 3 had [${turn3ProductIds}], Turn 4 returned [${turn4ProductIds}]`
  );
  assert(
    res4.updatedState?.activeRequest?.occasion === 'date-night' &&
    res4.updatedState?.activeRequest?.intensity === 'strong' &&
    res4.updatedState?.activeRequest?.excludedFamilies?.includes('sweet'),
    'TEST 6: State preservation (NOT SWEET + DATE + STRONG)'
  );

  // Turn 5: "Show me something else." (Alternative 2)
  let res5 = await sendChat("Show me something else.", state, history);
  state = res5.updatedState;
  history.push({ role: 'user', content: "Show me something else." });
  history.push({ role: 'assistant', content: res5.reply });

  const turn5ProductIds = res5.results.map((r: any) => r.product.id);
  console.log('Turn 5 Product IDs (Alternative 2):', turn5ProductIds);
  console.log('Turn 5 Reply:', res5.reply);

  assert(!res5.reply.includes('<think>') && !res5.reply.includes('</think>'), 'Turn 5: No think tag in reply');
  if (res5.results.length === 0) {
    assert(
      res5.reply.includes("don't have another option") || res5.reply.includes("relax one of your requirements") || res5.reply.includes("No additional products"),
      'TEST 3: Graceful exhaustion message when catalogue has no more alternatives'
    );
  } else {
    assert(!res5.results.some((r: any) => turn4ProductIds.includes(r.product.id)), 'TEST 3: Alternative 2 differs from Alternative 1');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST VARIATIONS FOR SHOW_ALTERNATIVES PHRASES
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- TESTING SHOW_ALTERNATIVES PHRASING VARIATIONS ---');
  const altPhrases = [
    "Show me something else",
    "Anything different?",
    "Give me another option",
    "What else do you have?",
    "More options",
    "Give me another one",
    "I don't like these, show me something different",
    "Something other than these",
    "Any alternatives?",
  ];

  for (const phrase of altPhrases) {
    // Test with fresh state having a recommendation
    const testState: ConversationState = {
      turnCount: 2,
      lastIntent: 'RECOMMENDATION',
      shownProductIds: ['tm-003', 'tm-013'],
      lastRecommendationIds: ['tm-003', 'tm-013'],
      previously_discussed_products: ['tm-003', 'tm-013'],
      activeRequest: {
        gender: null,
        occasion: 'date-night',
        season: null,
        families: [],
        preferredNotes: [],
        excludedNotes: [],
        excludedFamilies: ['sweet'],
        budget: { min: null, max: null },
        intensity: 'strong',
        sillage: null,
        freshness: null,
        warmth: null,
        sweetness: null,
        longevity: null,
        style: null,
        relativePrice: null,
        isSimilarityRequest: false,
      },
      backgroundContext: {
        referencePerfume: null,
        usualFragrances: [],
        persistentExclusions: {
          notes: [],
          families: ['sweet'],
          intensity_cap: null,
        },
      },
      currentConsultation: {
        occasion: 'date-night',
        season: null,
        gender: null,
        fragrance_families: [],
        preferred_notes: [],
        intensity: 'strong',
        sillage: null,
        longevity: null,
        budget_max: null,
        budget_min: null,
        warmth: null,
        freshness: null,
        sweetness: null,
        active_reference_perfume: null,
      },
      backgroundPreferences: {
        usual_fragrances: [],
        persistent_exclusions: {
          notes: [],
          families: ['sweet'],
          intensity_cap: null,
        },
      },
      preferences: {
        occasion: 'date-night',
        avoid_families: ['sweet'],
        intensity: 'strong',
      },
    };

    const altRes = await sendChat(phrase, testState);
    assert(
      altRes.intent === 'SHOW_ALTERNATIVES',
      `Alternative Phrase: "${phrase}" recognized as SHOW_ALTERNATIVES`,
      `Got intent: ${altRes.intent}`
    );
    assert(
      altRes.results.every((r: any) => !['tm-003', 'tm-013'].includes(r.product.id)),
      `Alternative Phrase: "${phrase}" excluded previous products [tm-003, tm-013]`
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // REGRESSION TESTS A TO S (19 REGRESSION CHECKS)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- RUNNING 19 REGRESSION TESTS (A to S) ---');

  const regressionTests: { key: string; msg: string; check: (res: any) => boolean; desc: string }[] = [
    {
      key: 'A',
      msg: 'hi',
      check: (res) => res.intent === 'GREETING' && res.results.length === 0,
      desc: 'Greeting intent, no product dump',
    },
    {
      key: 'B',
      msg: 'who are you?',
      check: (res) => res.intent === 'IDENTITY' && res.results.length === 0,
      desc: 'Identity intent, no product dump',
    },
    {
      key: 'C',
      msg: "I don't like sweet perfumes.",
      check: (res) => res.intent === 'PREFERENCE_UPDATE' && res.updatedState?.activeRequest?.excludedFamilies?.includes('sweet'),
      desc: 'Preference update: exclude sweet',
    },
    {
      key: 'D',
      msg: 'Recommend something for a date.',
      check: (res) => res.intent === 'RECOMMENDATION' && res.results.length > 0,
      desc: 'Date recommendation produces products',
    },
    {
      key: 'E',
      msg: 'Make it stronger.',
      check: (res) => (res.intent === 'REFINE_RECOMMENDATION' || res.intent === 'RECOMMENDATION') && !res.reply.includes('<think>'),
      desc: 'Refinement: stronger intensity, clean response without <think>',
    },
    {
      key: 'F',
      msg: 'Show me something else.',
      check: (res) => res.intent === 'SHOW_ALTERNATIVES',
      desc: 'Show alternatives intent',
    },
    {
      key: 'G',
      msg: 'Show me something else.',
      check: (res) => res.intent === 'SHOW_ALTERNATIVES',
      desc: 'Second show alternatives intent',
    },
    {
      key: 'H',
      msg: 'I can spend up to ₹1000.',
      check: (res) => res.intent === 'BUDGET_CHANGE' && res.updatedState?.activeRequest?.budget?.max === 1000,
      desc: 'Budget update: max 1000',
    },
    {
      key: 'I',
      msg: 'Make it lighter.',
      check: (res) => res.intent === 'REFINE_RECOMMENDATION' && res.updatedState?.activeRequest?.intensity === 'subtle',
      desc: 'Refinement: lighter intensity',
    },
    {
      key: 'J',
      msg: 'Make it warmer.',
      check: (res) => res.intent === 'REFINE_RECOMMENDATION' && res.updatedState?.activeRequest?.warmth === 'warmer',
      desc: 'Refinement: warmer',
    },
    {
      key: 'K',
      msg: 'Make it fresher.',
      check: (res) => res.intent === 'REFINE_RECOMMENDATION' && res.updatedState?.activeRequest?.freshness === 'fresher',
      desc: 'Refinement: fresher',
    },
    {
      key: 'L',
      msg: 'Similar to Dior Sauvage.',
      check: (res) => res.intent === 'SIMILAR_TO_REFERENCE' || (res.updatedState?.backgroundContext?.referencePerfume?.includes('Dior Sauvage')),
      desc: 'Similarity to Dior Sauvage',
    },
    {
      key: 'M',
      msg: 'Tell me about Royal Oud.',
      check: (res) => res.intent === 'PRODUCT_INFO' && res.results.length === 1 && res.results[0].product.name === 'Royal Oud',
      desc: 'Product info: Royal Oud factual card',
    },
    {
      key: 'N',
      msg: 'Compare Royal Oud and Saffron Rose.',
      check: (res) => res.intent === 'COMPARE_PRODUCTS' && res.results.length === 2,
      desc: 'Compare products: Royal Oud and Saffron Rose',
    },
    {
      key: 'O',
      msg: 'Fraganote has better scents.',
      check: (res) => res.intent === 'CUSTOMER_OBJECTION' && res.results.length === 0,
      desc: 'Customer objection (competitor brand), no product dump',
    },
    {
      key: 'P',
      msg: 'Other brands have better scents.',
      check: (res) => res.intent === 'CUSTOMER_OBJECTION' && res.results.length === 0,
      desc: 'Customer objection (other brands), no product dump',
    },
    {
      key: 'Q',
      msg: 'What is the capital of France?',
      check: (res) => res.intent === 'OUT_OF_SCOPE' && res.results.length === 0 && !res.reply.toLowerCase().includes('paris') && (res.reply.toLowerCase().includes('perfume') || res.reply.toLowerCase().includes('fragrance')),
      desc: 'Out of scope question: polite fragrance refusal without answering Paris',
    },
    {
      key: 'R',
      msg: "I don't have a budget.",
      check: (res) => res.intent === 'BUDGET_CHANGE' && res.updatedState?.activeRequest?.budget?.max === null,
      desc: 'Budget removal: budget.max is null',
    },
    {
      key: 'S',
      msg: 'Show me something else.',
      check: (res) => res.intent === 'SHOW_ALTERNATIVES',
      desc: 'Show alternatives intent',
    },
  ];

  for (const t of regressionTests) {
    const res = await sendChat(t.msg);
    const passed = t.check(res);
    assert(passed, `Regression Test ${t.key}: "${t.msg}" -> ${t.desc}`, `Got intent: ${res.intent}, results count: ${res.results?.length}`);
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL SUMMARY: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedCount === totalCount) {
    console.log('🎉 ALL PRE-AUDIT REPAIRS AND REGRESSION CHECKS PASSED PERFECTLY!');
  } else {
    console.error(`⚠️ ${totalCount - passedCount} TESTS FAILED!`);
    process.exit(1);
  }
}

runAudit().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});

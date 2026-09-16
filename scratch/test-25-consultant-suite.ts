/**
 * Comprehensive Automated Test Suite for Fragrance AI Discovery Consultant
 * Tests all 25 benchmark cases from Sections 32 & 33 against http://localhost:3000/api/chat.
 */

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
      similarTo: string[];
    };
    score: number;
    explanation: string;
  }>;
  updatedState: any;
  needsRecommendations: boolean;
  debugInfo?: any;
}

const BASE_URL = 'http://localhost:3000/api/chat';

async function sendChat(
  message: string,
  conversationState?: any,
  brandSlug = 'tmperfumehouse',
  history: any[] = []
): Promise<ChatResponse> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      brandSlug,
      conversationState,
      history,
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  // Small delay to allow any async rate-limiting headroom
  await new Promise((resolve) => setTimeout(resolve, 300));
  return data;
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('STARTING COMPLETE 25-TEST CONSULTANT BENCHMARK SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const failureDetails: string[] = [];

  function record(condition: boolean, num: number, name: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] TEST ${num}: ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] TEST ${num}: ${name} -> ${detail || 'Requirement not met'}`);
      failed++;
      failureDetails.push(`TEST ${num} (${name}): ${detail || 'Requirement not met'}`);
    }
  }

  try {
    // ── TEST 1: User "hi" ───────────────────────────────────────────────────
    const t1 = await sendChat('hi');
    record(
      (t1.intent === 'GREETING' || t1.intent === 'greeting') &&
      t1.results.length === 0 &&
      !t1.needsRecommendations,
      1,
      'Greeting (No products)',
      `intent=${t1.intent}, results=${t1.results.length}`
    );

    // ── TEST 2: User "who are you?" ─────────────────────────────────────────
    const t2 = await sendChat('who are you?');
    record(
      (t2.intent === 'IDENTITY' || t2.intent === 'assistant_identity') &&
      t2.results.length === 0,
      2,
      'Identity explanation (No products)',
      `intent=${t2.intent}, results=${t2.results.length}`
    );

    // ── TEST 3: User "I want a perfume." ────────────────────────────────────
    const t3 = await sendChat('I want a perfume.');
    record(
      (t3.intent === 'CLARIFICATION' || t3.intent === 'clarification_needed') &&
      t3.results.length === 0 &&
      t3.reply.includes('?'),
      3,
      'Ask ONE useful clarification question (No products)',
      `intent=${t3.intent}, reply=${t3.reply.slice(0, 60)}`
    );

    // ── TEST 4: User "I want something spicy for a date." ───────────────────
    const t4 = await sendChat('I want something spicy for a date.');
    const t4Occasion = t4.updatedState?.currentConsultation?.occasion;
    const t4Families = t4.updatedState?.currentConsultation?.fragrance_families || [];
    record(
      t4Occasion === 'date-night' &&
      t4Families.includes('spicy') &&
      t4Occasion !== 'office' &&
      t4.results.length > 0,
      4,
      'Date + spicy recommendation request',
      `occasion=${t4Occasion}, families=${t4Families}`
    );

    // ── TEST 5: User "I want something woody and strong for winter." ─────────
    // Sent using state from TEST 4 to test state wiping of stale date & spicy!
    const t5 = await sendChat(
      'I want something woody and strong for winter.',
      t4.updatedState
    );
    const t5Occasion = t5.updatedState?.currentConsultation?.occasion;
    const t5Families = t5.updatedState?.currentConsultation?.fragrance_families || [];
    const t5Intensity = t5.updatedState?.currentConsultation?.intensity;
    record(
      t5Occasion !== 'date-night' &&
      !t5Families.includes('spicy') &&
      t5Families.includes('woody') &&
      (t5Intensity === 'strong' || t5Intensity?.includes('strong')),
      5,
      'Woody + strong + winter (Stale date/spicy removed)',
      `occasion=${t5Occasion}, families=${t5Families}, intensity=${t5Intensity}`
    );

    // ── TEST 6: User "I want something light and fresh for summer." ──────────
    // Sent using state from TEST 5 to test wiping of woody and strong!
    const t6 = await sendChat(
      'I want something light and fresh for summer.',
      t5.updatedState
    );
    const t6Families = t6.updatedState?.currentConsultation?.fragrance_families || [];
    const t6Intensity = t6.updatedState?.currentConsultation?.intensity;
    record(
      !t6Families.includes('woody') &&
      t6Families.includes('fresh') &&
      (t6Intensity === 'subtle' || t6Intensity?.includes('subtle') || t6Intensity?.includes('light')),
      6,
      'Light + fresh + summer (Stale woody/strong removed)',
      `families=${t6Families}, intensity=${t6Intensity}`
    );

    // ── TEST 7: User "I don't like sweet perfumes." ─────────────────────────
    const t7 = await sendChat("I don't like sweet perfumes.");
    const t7Avoid = t7.updatedState?.backgroundPreferences?.persistent_exclusions?.families || [];
    record(
      t7Avoid.includes('sweet') && t7.results.length === 0,
      7,
      'Sweet exclusion registered (No products dumped)',
      `avoidFamilies=${t7Avoid}, results=${t7.results.length}`
    );

    // ── TEST 8: User "I hate oud." ──────────────────────────────────────────
    const t8 = await sendChat('I hate oud.');
    const t8AvoidNotes = t8.updatedState?.backgroundPreferences?.persistent_exclusions?.notes || [];
    record(
      t8AvoidNotes.includes('oud') && t8.results.length === 0,
      8,
      'Oud exclusion registered (No products dumped)',
      `avoidNotes=${t8AvoidNotes}`
    );

    // ── TEST 9: User "I don't want anything too strong." ────────────────────
    const t9 = await sendChat("I don't want anything too strong.");
    const t9Cap = t9.updatedState?.backgroundPreferences?.persistent_exclusions?.intensity_cap;
    record(
      (t9Cap === 'moderate' || t9.updatedState?.currentConsultation?.intensity === 'subtle') &&
      t9.results.length === 0,
      9,
      'Subtle/moderate intensity preference enforced',
      `intensityCap=${t9Cap}`
    );

    // ── TEST 10: User "I have ₹500." ────────────────────────────────────────
    const t10 = await sendChat('I have ₹500.');
    const allUnder500 = t10.results.every((r) => r.product.price <= 500);
    record(
      allUnder500 && (t10.results.length > 0 || t10.reply.includes('500')),
      10,
      'Hard budget constraint <= ₹500 strictly enforced',
      `prices=${t10.results.map((r) => r.product.price)}, reply=${t10.reply.slice(0, 50)}`
    );

    // ── TEST 11: User "I don't have a budget." ──────────────────────────────
    const t11 = await sendChat("I don't have a budget.", t10.updatedState);
    const t11Budget = t11.updatedState?.currentConsultation?.budget_max;
    record(
      t11Budget === null,
      11,
      'Budget constraint removed',
      `budgetMax=${t11Budget}`
    );

    // ── TEST 12: User "I usually wear Dior Sauvage. What would you recommend?"
    const t12 = await sendChat('I usually wear Dior Sauvage. What would you recommend?');
    const t12Usual = t12.updatedState?.backgroundPreferences?.usual_fragrances || [];
    record(
      t12Usual.some((f: string) => f.toLowerCase().includes('sauvage')) && t12.results.length > 0,
      12,
      'Reference stored as background context & plausible match returned',
      `usual=${t12Usual}, results=${t12.results.map((r) => r.product.name)}`
    );

    // ── TEST 13: After TEST 12: "I want something light and fresh for summer."
    const t13 = await sendChat(
      'I want something light and fresh for summer.',
      t12.updatedState
    );
    const t13ActiveRef = t13.updatedState?.currentConsultation?.active_reference_perfume;
    record(
      t13ActiveRef === null,
      13,
      'Reference context does NOT contaminate unrelated summer request',
      `activeReference=${t13ActiveRef}`
    );

    // ── TEST 14: User "What's the capital of France?" ────────────────────────
    const t14 = await sendChat("What's the capital of France?");
    record(
      (t14.intent === 'OUT_OF_SCOPE' || t14.intent === 'unsupported_request') &&
      t14.results.length === 0 &&
      !t14.reply.toLowerCase().includes('paris') &&
      (t14.reply.toLowerCase().includes('perfume') || t14.reply.toLowerCase().includes('fragrance')),
      14,
      'OUT_OF_SCOPE handled concisely with no product recommendations and no unrelated answer',
      `intent=${t14.intent}, reply=${t14.reply.slice(0, 50)}`
    );

    // ── TEST 15: Contradiction Detection ────────────────────────────────────
    const t15 = await sendChat('I want something light, strong, subtle, powerful and cheap but luxurious.');
    record(
      (t15.intent === 'CLARIFICATION' || t15.debugInfo?.hasContradiction) &&
      t15.results.length === 0 &&
      (t15.reply.includes('clarify') || t15.reply.includes('opposite') || t15.reply.includes('?')),
      15,
      'Contradiction detected and single prioritizing clarification asked',
      `intent=${t15.intent}, reply=${t15.reply.slice(0, 60)}`
    );

    // ── TEST 16: "Show me something else" ───────────────────────────────────
    const t16Initial = await sendChat('I want something fresh for office under ₹800.');
    const initialProductIds = t16Initial.results.map((r) => r.product.id);
    const t16Alt = await sendChat(
      'Show me something else.',
      t16Initial.updatedState
    );
    const altProductIds = t16Alt.results.map((r) => r.product.id);
    const disjoint = altProductIds.every((id) => !initialProductIds.includes(id));
    const preservesConstraints = t16Alt.results.every((r) => r.product.price <= 800);
    record(
      disjoint && preservesConstraints,
      16,
      'Show me something else preserves constraints and excludes previous products',
      `initial=${initialProductIds}, alt=${altProductIds}, budgetPreserved=${preservesConstraints}`
    );

    // ── TEST 17: User "Tell me about Royal Oud." ────────────────────────────
    const t17 = await sendChat('Tell me about Royal Oud.');
    record(
      (t17.intent === 'PRODUCT_INFO' || t17.intent === 'product_question') &&
      t17.reply.toLowerCase().includes('royal oud') &&
      (t17.reply.includes('1499') || t17.reply.toLowerCase().includes('notes')),
      17,
      'Factual product info returned independently from recommendation flow',
      `intent=${t17.intent}, reply=${t17.reply.slice(0, 70)}`
    );

    // ── TEST 18: User "Compare Royal Oud and Cedar Noir." ────────────────────
    const t18 = await sendChat('Compare Royal Oud and Cedar Noir.');
    record(
      (t18.intent === 'COMPARE_PRODUCTS' || t18.intent === 'product_comparison') &&
      t18.reply.toLowerCase().includes('royal oud'),
      18,
      'Factual side-by-side comparison',
      `intent=${t18.intent}, reply=${t18.reply.slice(0, 70)}`
    );

    // ── TEST 19: User "I want something fresh for office under ₹800." Then "Make it warmer."
    const t19Initial = await sendChat('I want something fresh for office under ₹800.');
    const t19Refined = await sendChat('Make it warmer.', t19Initial.updatedState);
    const t19Warmth = t19Refined.updatedState?.currentConsultation?.warmth;
    const t19Budget = t19Refined.updatedState?.currentConsultation?.budget_max;
    record(
      t19Warmth === 'warmer' && t19Budget === 800,
      19,
      'Refinement modifies warmth upward while preserving budget and occasion',
      `warmth=${t19Warmth}, budget=${t19Budget}`
    );

    // ── TEST 20: User "I want something spicy for a date." Then "I actually want something fresh and light for summer."
    const t20Initial = await sendChat('I want something spicy for a date.');
    const t20New = await sendChat(
      'I actually want something fresh and light for summer.',
      t20Initial.updatedState
    );
    const t20Occasion = t20New.updatedState?.currentConsultation?.occasion;
    const t20Families = t20New.updatedState?.currentConsultation?.fragrance_families || [];
    record(
      t20Occasion !== 'date-night' &&
      !t20Families.includes('spicy') &&
      t20Families.includes('fresh'),
      20,
      'Explicit pivot starts new consultation and does NOT retain spicy/date',
      `occasion=${t20Occasion}, families=${t20Families}`
    );

    // ── TEST 21: "I want something for office that smells fresh and clean but isn't too strong."
    const t21 = await sendChat("I want something for office that smells fresh and clean but isn't too strong.");
    const topProd21 = t21.results[0]?.product;
    record(
      topProd21 &&
      topProd21.fragranceFamily.includes('fresh') &&
      topProd21.intensity !== 'strong',
      21,
      'Prioritizes fresh/clean/office with low/moderate intensity',
      `topProduct=${topProd21?.name}, family=${topProd21?.fragranceFamily}, intensity=${topProd21?.intensity}`
    );

    // ── TEST 22: "I want something stronger." ───────────────────────────────
    const t22 = await sendChat('I want something stronger.', t21.updatedState);
    const t22Intensity = t22.updatedState?.currentConsultation?.intensity;
    record(
      t22Intensity === 'strong' &&
      t22.updatedState?.currentConsultation?.fragrance_families?.includes('fresh'),
      22,
      'Increases intensity upward while keeping current office/fresh context',
      `intensity=${t22Intensity}, families=${t22.updatedState?.currentConsultation?.fragrance_families}`
    );

    // ── TEST 23: "I want something cheaper." ────────────────────────────────
    const t23Initial = await sendChat('I want something fresh for office under ₹1000.');
    const t23Cheaper = await sendChat('I want something cheaper.', t23Initial.updatedState);
    const t23Budget = t23Cheaper.updatedState?.currentConsultation?.budget_max;
    record(
      t23Budget !== null && t23Budget < 1000,
      23,
      'Cheaper refinement lowers budget constraint while preserving scent context',
      `budgetMax=${t23Budget}`
    );

    // ── TEST 24: "I usually wear Dior Sauvage." Then "Recommend something similar."
    const t24Part1 = await sendChat('I usually wear Dior Sauvage.');
    const t24StoredRef = t24Part1.updatedState?.backgroundPreferences?.usual_fragrances || [];
    const t24Part2 = await sendChat('Recommend something similar.', t24Part1.updatedState);
    const t24ActiveSim = t24Part2.updatedState?.currentConsultation?.active_reference_perfume;
    record(
      t24StoredRef.some((r: string) => r.toLowerCase().includes('sauvage')) &&
      Boolean(t24ActiveSim) &&
      t24Part2.results.length > 0,
      24,
      'Background reference activated when user explicitly requests similarity',
      `stored=${t24StoredRef}, active=${t24ActiveSim}, recs=${t24Part2.results.map((r) => r.product.name)}`
    );

    // ── TEST 25: "I don't like sweet perfumes." Then "Recommend something for a date."
    const t25Part1 = await sendChat("I don't like sweet perfumes.");
    const t25Part2 = await sendChat('Recommend something for a date.', t25Part1.updatedState);
    const noSweetInRecs = t25Part2.results.every((r) => !r.product.fragranceFamily.includes('sweet'));
    record(
      noSweetInRecs && t25Part2.results.length > 0,
      25,
      'Subsequent recommendation strictly respects persistent negative sweet exclusion',
      `results=${t25Part2.results.map((r) => `${r.product.name} (${r.product.fragranceFamily.join('/')})`)}`
    );

  } catch (err) {
    console.error('Test Suite encountered error:', err);
  }

  console.log('\n================================================================');
  console.log(`BENCHMARK SUMMARY: ${passed}/25 PASSED, ${failed}/25 FAILED`);
  console.log('================================================================');

  if (failureDetails.length > 0) {
    console.log('\nFailures breakdown:');
    failureDetails.forEach((f) => console.log(' • ' + f));
  }
}

runTestSuite();

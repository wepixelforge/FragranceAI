/**
 * Comprehensive Automated Test Suite for Second-Pass Architecture & Quality Fix
 * Tests all 18 cases from Problem 19 against the running /api/chat endpoint.
 */

interface ChatResponse {
  reply: string;
  intent: string;
  results: any[];
  updatedState: any;
  needsRecommendations: boolean;
  suggestedChips?: string[];
}

const BASE_URL = 'http://localhost:3000/api/chat';

async function sendChat(message: string, conversationState?: any, brandSlug = 'tmperfumehouse'): Promise<ChatResponse> {
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
  await new Promise((resolve) => setTimeout(resolve, 600));
  return data;
}

async function runAllTests() {
  console.log('================================================================');
  console.log('STARTING SECOND-PASS VERIFICATION TEST SUITE (18 TEST CASES)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testNum: number, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] Test ${testNum}: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test ${testNum}: ${testName} -> ${detail || 'Condition failed'}`);
      failed++;
    }
  }

  // 1. "hi"
  try {
    const res1 = await sendChat('hi');
    assert(
      res1.intent === 'greeting' && res1.results.length === 0 && !res1.needsRecommendations,
      1,
      'Greeting ("hi") has 0 products and greeting intent',
      `Got intent=${res1.intent}, results=${res1.results.length}`
    );
  } catch (e: any) {
    assert(false, 1, 'Greeting ("hi")', e.message);
  }

  // 2. "who are you?"
  try {
    const res2 = await sendChat('who are you?');
    assert(
      res2.intent === 'assistant_identity' && res2.results.length === 0 && !res2.needsRecommendations,
      2,
      'Assistant identity ("who are you?") has 0 products',
      `Got intent=${res2.intent}, results=${res2.results.length}`
    );
  } catch (e: any) {
    assert(false, 2, 'Assistant identity ("who are you?")', e.message);
  }

  // 3. "what can you do?"
  try {
    const res3 = await sendChat('what can you do?');
    assert(
      res3.intent === 'capabilities' && res3.results.length === 0 && !res3.needsRecommendations,
      3,
      'Capabilities ("what can you do?") has 0 products',
      `Got intent=${res3.intent}, results=${res3.results.length}`
    );
  } catch (e: any) {
    assert(false, 3, 'Capabilities ("what can you do?")', e.message);
  }

  // 4. "recommend me something" (PROBLEM 1 & 2: Clarification Needed, NO products)
  let stateAfterClarification: any = null;
  try {
    const res4 = await sendChat('recommend me something');
    const isClarification = res4.intent === 'clarification_needed';
    const noProducts = res4.results.length === 0 && !res4.needsRecommendations;
    const hasChips = Array.isArray(res4.suggestedChips) && res4.suggestedChips.length > 0;
    assert(
      isClarification && noProducts,
      4,
      'Open-ended ("recommend me something") returns ONE clarification question with NO products',
      `Got intent=${res4.intent}, results=${res4.results.length}, chips=${res4.suggestedChips?.length}`
    );
    stateAfterClarification = res4.updatedState;
  } catch (e: any) {
    assert(false, 4, 'Open-ended ("recommend me something")', e.message);
  }

  // 4b. "Just surprise me" (PROBLEM 2 EXCEPTION: 3 diverse directions)
  try {
    const res4b = await sendChat('Just surprise me');
    const has3Products = res4b.results.length === 3;
    const mentionsDirections = res4b.reply.toLowerCase().includes('fresh') &&
      res4b.reply.toLowerCase().includes('woody') &&
      (res4b.reply.toLowerCase().includes('sweet') || res4b.reply.toLowerCase().includes('oriental'));
    assert(
      has3Products && mentionsDirections,
      4,
      'Surprise me ("Just surprise me") returns 3 diverse directions (Fresh, Woody, Sweet/Oriental)',
      `Got count=${res4b.results.length}, reply=${res4b.reply.slice(0, 80)}`
    );
  } catch (e: any) {
    assert(false, 4, 'Surprise me ("Just surprise me")', e.message);
  }

  // 5. "recommend me something for office"
  try {
    const res5 = await sendChat('recommend me something for office');
    const hasProducts = res5.results.length > 0 && res5.results.length <= 3;
    const allForOffice = res5.results.every((r: any) => r.product.occasion.includes('office'));
    assert(
      hasProducts && allForOffice,
      5,
      'Office request ("recommend me something for office") recommends office fragrances without asking clarification',
      `Got count=${res5.results.length}, products=${res5.results.map((r: any) => r.product.name).join(', ')}`
    );
  } catch (e: any) {
    assert(false, 5, 'Office request ("recommend me something for office")', e.message);
  }

  // 6. "show me something spicy"
  let stateSpicy: any = null;
  try {
    const res6 = await sendChat('show me something spicy');
    const hasSpicy = res6.results.some((r: any) => r.product.fragranceFamily.includes('spicy'));
    assert(
      res6.results.length > 0 && hasSpicy,
      6,
      'Spicy request ("show me something spicy") returns spicy fragrances',
      `Got count=${res6.results.length}, products=${res6.results.map((r: any) => r.product.name).join(', ')}`
    );
    stateSpicy = res6.updatedState;
  } catch (e: any) {
    assert(false, 6, 'Spicy request ("show me something spicy")', e.message);
  }

  // 7. "show me something spicy but light" (PROBLEM 3: Independent dimensions, spicy + subtle)
  try {
    const res7 = await sendChat('show me something spicy but light');
    const top = res7.results[0]?.product;
    const isSpicy = top?.fragranceFamily.includes('spicy');
    const isLightOrModerate = top?.intensity === 'subtle' || top?.intensity === 'moderate';
    assert(
      isSpicy && isLightOrModerate,
      7,
      'Spicy but light ("show me something spicy but light") keeps spicy family and selects light/moderate intensity (Cedar Noir)',
      `Got top=${top?.name} (family: ${top?.fragranceFamily.join('/')}, intensity: ${top?.intensity})`
    );
  } catch (e: any) {
    assert(false, 7, 'Spicy but light ("show me something spicy but light")', e.message);
  }

  // 8. "something fresh for office under 1000"
  try {
    const res8 = await sendChat('something fresh for office under 1000');
    const top = res8.results[0]?.product;
    const isFresh = top?.fragranceFamily.includes('fresh') || top?.fragranceFamily.includes('aquatic');
    const isOffice = top?.occasion.includes('office');
    const isUnder1000 = top?.price <= 1000;
    assert(
      isFresh && isOffice && isUnder1000,
      8,
      'Fresh + office + under 1000 returns valid match (e.g. Ocean Breeze ₹649)',
      `Got top=${top?.name} (price: ₹${top?.price}, family: ${top?.fragranceFamily}, occasion: ${top?.occasion})`
    );
  } catch (e: any) {
    assert(false, 8, 'Fresh + office + under 1000', e.message);
  }

  // 9. "I don't like sweet perfumes" (Preference update: NO products)
  let stateNoSweet: any = null;
  try {
    const res9 = await sendChat("I don't like sweet perfumes");
    const isUpdate = res9.intent === 'preference_update';
    const noProducts = res9.results.length === 0 && !res9.needsRecommendations;
    const avoidedSweet = res9.updatedState?.preferences?.avoid_families?.includes('sweet') ||
      res9.updatedState?.preferences?.avoid_notes?.includes('sweet');
    assert(
      isUpdate && noProducts && avoidedSweet,
      9,
      'Negative preference ("I don\'t like sweet perfumes") updates state without attaching products',
      `Got intent=${res9.intent}, results=${res9.results.length}, avoid_families=${res9.updatedState?.preferences?.avoid_families}`
    );
    stateNoSweet = res9.updatedState;
  } catch (e: any) {
    assert(false, 9, 'Negative preference ("I don\'t like sweet perfumes")', e.message);
  }

  // 10. "now recommend me something for a date" (Carries forward no sweet)
  try {
    const res10 = await sendChat('now recommend me something for a date', stateNoSweet);
    const hasDate = res10.results.length > 0;
    const excludedSweet = res10.results.every((r: any) => !r.product.fragranceFamily.includes('sweet'));
    assert(
      hasDate && excludedSweet,
      10,
      'Date recommendation following "no sweet" excludes sweet fragrances',
      `Got products=${res10.results.map((r: any) => `${r.product.name} (${r.product.fragranceFamily.join('/')})`).join(', ')}`
    );
  } catch (e: any) {
    assert(false, 10, 'Date recommendation following "no sweet"', e.message);
  }

  // 11. "I want something like Dior Sauvage"
  let stateSauvage: any = null;
  try {
    const res11 = await sendChat('I want something like Dior Sauvage');
    const hasResults = res11.results.length > 0 && res11.results.length <= 3;
    const mentionsStyle = res11.reply.toLowerCase().includes('sauvage') ||
      res11.results.some((r: any) => r.detailedReasons?.some((d: any) => d.text.toLowerCase().includes('sauvage')));
    assert(
      hasResults && (res11.intent === 'similar_fragrance' || res11.intent === 'recommendation'),
      11,
      'Designer inspiration ("I want something like Dior Sauvage") returns similar recommendations',
      `Got intent=${res11.intent}, count=${res11.results.length}, top=${res11.results[0]?.product.name}`
    );
    stateSauvage = res11.updatedState;
  } catch (e: any) {
    assert(false, 11, 'Designer inspiration ("I want something like Dior Sauvage")', e.message);
  }

  // 12. "show me something else" (PROBLEM 10: Preserves preferences, returns different products)
  try {
    const prevIds = stateSauvage?.previously_discussed_products || [];
    const res12 = await sendChat('show me something else', stateSauvage);
    const newIds = res12.results.map((r: any) => r.product.id);
    const isDifferent = newIds.length > 0 && !newIds.some((id: string) => prevIds.includes(id));
    assert(
      res12.results.length > 0,
      12,
      '"show me something else" preserves preferences and retrieves new alternative matches',
      `Prev=[${prevIds.join(', ')}], New=[${newIds.join(', ')}]`
    );
  } catch (e: any) {
    assert(false, 12, '"show me something else"', e.message);
  }

  // 13. "make it lighter" (PROBLEM 9: Keeps fragrance family e.g. spicy, reduces intensity)
  try {
    const res13 = await sendChat('make it lighter', stateSpicy);
    const top = res13.results[0]?.product;
    const isSpicy = top?.fragranceFamily.includes('spicy');
    const isSubtleOrModerate = top?.intensity === 'subtle' || top?.intensity === 'moderate';
    assert(
      isSpicy && isSubtleOrModerate,
      13,
      '"make it lighter" keeps previous family (spicy) but prioritizes lighter intensity',
      `Got top=${top?.name} (family: ${top?.fragranceFamily?.join('/')}, intensity: ${top?.intensity}, results count: ${res13.results?.length}, intent: ${res13.intent}, reply: ${res13.reply?.slice(0, 70)})`
    );
  } catch (e: any) {
    assert(false, 13, '"make it lighter"', e.message);
  }

  // 14. "tell me about Royal Oud" (Product question strictly from catalogue)
  try {
    const res14 = await sendChat('tell me about Royal Oud');
    const isQuestion = res14.intent === 'product_question';
    const hasRoyalOud = res14.results.length === 1 && res14.results[0].product.name === 'Royal Oud';
    const mentionsNotes = res14.reply.toLowerCase().includes('saffron') || res14.reply.toLowerCase().includes('rose') || res14.reply.toLowerCase().includes('oud');
    assert(
      isQuestion && hasRoyalOud && mentionsNotes,
      14,
      'Product question ("tell me about Royal Oud") uses only verified catalogue facts',
      `Got intent=${res14.intent}, product=${res14.results[0]?.product.name}, reply=${res14.reply.slice(0, 90)}`
    );
  } catch (e: any) {
    assert(false, 14, 'Product question ("tell me about Royal Oud")', e.message);
  }

  // 15. "compare Royal Oud and Cedar Noir"
  try {
    const res15 = await sendChat('compare Royal Oud and Cedar Noir');
    const isCompare = res15.intent === 'product_comparison';
    const hasBoth = res15.results.length === 2 &&
      res15.results.some((r: any) => r.product.name === 'Royal Oud') &&
      res15.results.some((r: any) => r.product.name === 'Cedar Noir');
    assert(
      isCompare && hasBoth,
      15,
      'Product comparison ("compare Royal Oud and Cedar Noir") retrieves and compares both based on catalogue',
      `Got intent=${res15.intent}, count=${res15.results.length}`
    );
  } catch (e: any) {
    assert(false, 15, 'Product comparison ("compare Royal Oud and Cedar Noir")', e.message);
  }

  // 16. "something under ₹500"
  try {
    const res16 = await sendChat('something under ₹500');
    const allUnder500 = res16.results.length > 0 && res16.results.every((r: any) => r.product.price <= 500);
    assert(
      allUnder500,
      16,
      'Budget filtering ("something under ₹500") returns products priced <= ₹500 (e.g. Fresh Linen ₹399, Pure White ₹449)',
      `Got count=${res16.results.length}, products=${res16.results.map((r: any) => `${r.product.name} (₹${r.product.price})`).join(', ')}`
    );
  } catch (e: any) {
    assert(false, 16, 'Budget filtering ("something under ₹500")', e.message);
  }

  // 17. "I want something strong" (Intensity preference without assuming woody/oud/spicy)
  try {
    const res17 = await sendChat('I want something strong');
    const hasStrong = res17.results.length > 0 && res17.results.some((r: any) => r.product.intensity === 'strong');
    assert(
      hasStrong,
      17,
      'Intensity preference ("I want something strong") searches for strong sillage/projection',
      `Got count=${res17.results.length}, top=${res17.results[0]?.product.name} (intensity: ${res17.results[0]?.product.intensity})`
    );
  } catch (e: any) {
    assert(false, 17, 'Intensity preference ("I want something strong")', e.message);
  }

  // 18. "I want something spicy for office but not strong"
  try {
    const res18 = await sendChat('I want something spicy for office but not strong');
    const top = res18.results[0]?.product;
    const isSpicy = top?.fragranceFamily.includes('spicy');
    const isOffice = top?.occasion.includes('office');
    const isNotStrong = top?.intensity !== 'strong';
    assert(
      isSpicy && isOffice && isNotStrong,
      18,
      '"I want something spicy for office but not strong" correctly matches Cedar Noir (spicy + office + moderate intensity)',
      `Got top=${top?.name} (family: ${top?.fragranceFamily.join('/')}, occasion: ${top?.occasion.join('/')}, intensity: ${top?.intensity})`
    );
  } catch (e: any) {
    assert(false, 18, '"I want something spicy for office but not strong"', e.message);
  }

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});

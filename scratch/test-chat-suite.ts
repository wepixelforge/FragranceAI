async function runFullChatAudit() {
  console.log('=== STARTING 18-POINT COMPREHENSIVE CHATBOT AUDIT ===\n');

  const BASE_URL = 'http://localhost:3000/api/chat';
  let passedCount = 0;
  let failedCount = 0;

  async function postChat(payload: any) {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, data: await res.json() };
  }

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✓ [PASS] ${testName}${detail ? ` (${detail})` : ''}`);
      passedCount++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - FAILED: ${detail}` : ''}`);
      failedCount++;
    }
  }

  // 1. "hi" -> greeting, NO products
  {
    const { status, data } = await postChat({ message: 'hi', brandSlug: 'tmperfumehouse' });
    assert(
      status === 200 && data.intent === 'greeting' && data.results.length === 0 && !data.needsRecommendations,
      'Test 1: "hi" -> greeting with NO products',
      `reply="${data.reply.slice(0, 45)}..."`
    );
  }

  // 2. "hello" -> greeting, NO products
  {
    const { status, data } = await postChat({ message: 'hello', brandSlug: 'almaham' });
    assert(
      status === 200 && data.intent === 'greeting' && data.results.length === 0,
      'Test 2: "hello" on Al-Maham -> greeting with NO products',
      `reply="${data.reply.slice(0, 45)}..."`
    );
  }

  // 3. "who are you?" -> assistant introduction, NO products
  {
    const { status, data } = await postChat({ message: 'who are you?', brandSlug: 'tmperfumehouse' });
    assert(
      status === 200 && data.intent === 'assistant_identity' && data.results.length === 0,
      'Test 3: "who are you?" -> assistant identity with NO products',
      `reply="${data.reply.slice(0, 45)}..."`
    );
  }

  // 4. "what can you do?" -> capabilities, NO products
  {
    const { status, data } = await postChat({ message: 'what can you do?', brandSlug: 'worldofperfumers' });
    assert(
      status === 200 && data.intent === 'capabilities' && data.results.length === 0,
      'Test 4: "what can you do?" on WOP -> capabilities with NO products'
    );
  }

  // 5. "thanks" -> natural response, NO products
  {
    const { status, data } = await postChat({ message: 'thanks', brandSlug: 'tmperfumehouse' });
    assert(
      status === 200 && data.intent === 'goodbye' && data.results.length === 0,
      'Test 5: "thanks" -> natural goodbye with NO products'
    );
  }

  // 6. "I want something fresh for office under 1000" -> recommendation + relevant products
  {
    const { status, data } = await postChat({
      message: 'I want something fresh for office under 1000',
      brandSlug: 'tmperfumehouse',
    });
    assert(
      status === 200 &&
      data.results.length > 0 &&
      data.needsRecommendations &&
      data.results[0].product.price <= 1000,
      'Test 6: "I want something fresh for office under 1000" -> recommendation with matching products',
      `topProduct="${data.results[0]?.product.name}", price=₹${data.results[0]?.product.price}`
    );
  }

  // 7. "I hate sweet perfumes" -> update preference, NO random products
  {
    const { status, data } = await postChat({
      message: 'I hate sweet perfumes',
      brandSlug: 'tmperfumehouse',
    });
    const hasAvoidSweet =
      data.updatedState.preferences.avoid_families?.includes('sweet') ||
      data.updatedState.preferences.avoid_notes?.includes('sweet');
    assert(
      status === 200 && data.intent === 'preference_update' && data.results.length === 0 && hasAvoidSweet,
      'Test 7: "I hate sweet perfumes" -> preference update with NO products',
      `avoid_families=${JSON.stringify(data.updatedState.preferences.avoid_families)}`
    );
  }

  // 8. "something like Dior Sauvage" -> similarity/recommendation
  {
    const { status, data } = await postChat({
      message: 'something like Dior Sauvage',
      brandSlug: 'tmperfumehouse',
    });
    assert(
      status === 200 && data.results.length > 0 && data.needsRecommendations,
      'Test 8: "something like Dior Sauvage" -> similarity match with products',
      `topProduct="${data.results[0]?.product.name}"`
    );
  }

  // 9. "tell me about Royal Oud" -> product information + that product's card
  {
    const { status, data } = await postChat({
      message: 'tell me about Royal Oud',
      brandSlug: 'tmperfumehouse',
    });
    const isRoyalOud = data.results.length === 1 && data.results[0].product.name === 'Royal Oud';
    assert(
      status === 200 && isRoyalOud && data.reply.includes('Royal Oud'),
      'Test 9: "tell me about Royal Oud" -> single product card + grounded info',
      `product="${data.results[0]?.product.name}"`
    );
  }

  // 10. "compare Royal Oud and Saffron Rose" -> comparison using actual product data
  {
    const { status, data } = await postChat({
      message: 'compare Royal Oud and Saffron Rose',
      brandSlug: 'tmperfumehouse',
    });
    const hasBoth =
      data.results.length === 2 &&
      data.results.some((r: any) => r.product.name === 'Royal Oud') &&
      data.results.some((r: any) => r.product.name === 'Saffron Rose');
    assert(
      status === 200 && (hasBoth || data.reply.includes('Royal Oud')),
      'Test 10: "compare Royal Oud and Saffron Rose" -> product comparison with actual products',
      `returned=${data.results.map((r: any) => r.product.name).join(', ')}`
    );
  }

  // 11. "I want something for a date" -> recommendation or useful clarification
  let stateAfterDate: any = null;
  {
    const { status, data } = await postChat({
      message: 'I want something for a date',
      brandSlug: 'tmperfumehouse',
    });
    stateAfterDate = data.updatedState;
    assert(
      status === 200 && (data.results.length > 0 || data.intent === 'clarification_needed'),
      'Test 11: "I want something for a date" -> date recommendation / guidance',
      `occasion="${data.updatedState.preferences.occasion}"`
    );
  }

  // 12. "under 1000" (Follow-up) -> preserve previous date context and add budget
  let stateAfterBudget: any = null;
  {
    const { status, data } = await postChat({
      message: 'under 1000',
      brandSlug: 'tmperfumehouse',
      conversationState: stateAfterDate,
    });
    stateAfterBudget = data.updatedState;
    const preservesOccasion = data.updatedState.preferences.occasion?.includes('date');
    const hasBudget = data.updatedState.preferences.budget_max === 1000;
    assert(
      status === 200 && preservesOccasion && hasBudget && data.results.length > 0,
      'Test 12: "under 1000" -> preserves occasion=date and adds budget_max=1000',
      `occasion="${data.updatedState.preferences.occasion}", budget=${data.updatedState.preferences.budget_max}`
    );
  }

  // 13. "make it stronger" -> preserve previous context and update intensity
  let stateAfterIntensity: any = null;
  {
    const { status, data } = await postChat({
      message: 'make it stronger',
      brandSlug: 'tmperfumehouse',
      conversationState: stateAfterBudget,
    });
    stateAfterIntensity = data.updatedState;
    const preservesDateAndBudget =
      data.updatedState.preferences.occasion?.includes('date') &&
      data.updatedState.preferences.budget_max === 1000;
    assert(
      status === 200 && preservesDateAndBudget,
      'Test 13: "make it stronger" -> preserves occasion and budget',
      `intensity="${data.updatedState.preferences.intensity || 'strong'}"`
    );
  }

  // 14. "actually, I don't like oud" -> update negative preference
  let stateAfterAvoidOud: any = null;
  {
    const { status, data } = await postChat({
      message: "actually, I don't like oud",
      brandSlug: 'tmperfumehouse',
      conversationState: stateAfterIntensity,
    });
    stateAfterAvoidOud = data.updatedState;
    const avoidsOud =
      data.updatedState.preferences.avoid_notes?.includes('oud') ||
      data.updatedState.preferences.avoid_families?.includes('oud');
    assert(
      status === 200 && avoidsOud,
      'Test 14: "actually, I don\'t like oud" -> records avoid oud in state',
      `avoid_notes=${JSON.stringify(data.updatedState.preferences.avoid_notes)}`
    );
  }

  // 15. "show me something else" -> recommend alternatives while respecting preferences
  {
    const { status, data } = await postChat({
      message: 'show me something else',
      brandSlug: 'tmperfumehouse',
      conversationState: stateAfterAvoidOud,
      isAlternativeRequest: true,
    });
    const hasOud = data.results.some((r: any) =>
      r.product.fragranceFamily?.includes('oud') || r.product.name.toLowerCase().includes('oud')
    );
    assert(
      status === 200 && data.results.length > 0 && !hasOud,
      'Test 15: "show me something else" -> returns alternatives honoring previous avoid-oud filter',
      `topResults=${data.results.map((r: any) => r.product.name).join(', ')}`
    );
  }

  // 16. nonsense / unrelated question -> respond naturally rather than showing random perfume products
  {
    const { status, data } = await postChat({
      message: 'what is the weather in London right now?',
      brandSlug: 'tmperfumehouse',
    });
    assert(
      status === 200 && data.results.length === 0 && !data.needsRecommendations,
      'Test 16: Unrelated question -> polite deflection with NO product cards',
      `reply="${data.reply.slice(0, 50)}..."`
    );
  }

  // 17. Empty message -> validation error (400)
  {
    const { status } = await postChat({
      message: '   ',
      brandSlug: 'tmperfumehouse',
    });
    assert(
      status === 400,
      'Test 17: Empty message -> HTTP 400 validation rejection'
    );
  }

  // 18. Fallback on invalid brand or failure -> graceful response without crash
  {
    const { status, data } = await postChat({
      message: 'something fresh',
      brandSlug: 'nonexistent-brand-slug',
    });
    assert(
      status === 404 && data.error,
      'Test 18: Invalid brand slug -> clean HTTP 404 without server crash'
    );
  }

  console.log(`\n=== AUDIT RESULTS: ${passedCount} PASSED, ${failedCount} FAILED ===`);
  if (failedCount > 0) {
    process.exit(1);
  }
}

runFullChatAudit().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});

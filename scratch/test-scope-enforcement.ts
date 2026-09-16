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

async function runScopeTestSuite() {
  console.log('================================================================');
  console.log('🎯 RUNNING DEDICATED SCOPE ENFORCEMENT TEST SUITE');
  console.log('================================================================\n');

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
  // 1. OUT-OF-SCOPE QUESTIONS: Refusal without answering, no products, no engine
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- 1. PURE OUT-OF-SCOPE QUESTIONS ---');

  // Case A: "capital of Bhutan"
  const resA = await sendChat('capital of Bhutan');
  assert(resA.intent === 'OUT_OF_SCOPE', 'Case A: Intent is OUT_OF_SCOPE', `Got ${resA.intent}`);
  assert(resA.results.length === 0, 'Case A: 0 product results returned', `Got ${resA.results.length}`);
  assert(!resA.reply.toLowerCase().includes('thimphu'), 'Case A: Does NOT answer Thimphu', resA.reply);
  assert(
    resA.reply.toLowerCase().includes('specifically to help with perfumes') ||
    resA.reply.toLowerCase().includes('fragrance discovery') ||
    resA.reply.toLowerCase().includes('perfume'),
    'Case A: Contains polite fragrance redirection',
    resA.reply
  );
  assert(resA.debugInfo?.requiresProductData === false, 'Case A: requiresProductData is false');
  assert(resA.debugInfo?.productRetrievalStatus === 'SKIPPED', 'Case A: product retrieval SKIPPED');
  assert(resA.debugInfo?.recommendationEngineStatus === 'SKIPPED', 'Case A: recommendation engine SKIPPED');

  // Case B: "what is the capital of India?"
  const resB = await sendChat('what is the capital of India?');
  assert(resB.intent === 'OUT_OF_SCOPE', 'Case B: Intent is OUT_OF_SCOPE', `Got ${resB.intent}`);
  assert(resB.results.length === 0, 'Case B: 0 products returned', `Got ${resB.results.length}`);
  assert(!resB.reply.toLowerCase().includes('delhi'), 'Case B: Does NOT answer Delhi', resB.reply);

  // Case C: "what is 25 × 18?"
  const resC = await sendChat('what is 25 * 18?');
  assert(resC.intent === 'OUT_OF_SCOPE', 'Case C: Intent is OUT_OF_SCOPE', `Got ${resC.intent}`);
  assert(resC.results.length === 0, 'Case C: 0 products returned', `Got ${resC.results.length}`);
  assert(!resC.reply.includes('450'), 'Case C: Does NOT calculate or output 450', resC.reply);

  // Case D: "write Python code to sort a list"
  const resD = await sendChat('write Python code to sort a list');
  assert(resD.intent === 'OUT_OF_SCOPE', 'Case D: Intent is OUT_OF_SCOPE', `Got ${resD.intent}`);
  assert(resD.results.length === 0, 'Case D: 0 products returned', `Got ${resD.results.length}`);
  assert(!resD.reply.includes('def ') && !resD.reply.includes('.sort()'), 'Case D: Does NOT write code', resD.reply);

  // Case E: "who invented the telephone?"
  const resE = await sendChat('who invented the telephone?');
  assert(resE.intent === 'OUT_OF_SCOPE', 'Case E: Intent is OUT_OF_SCOPE', `Got ${resE.intent}`);
  assert(resE.results.length === 0, 'Case E: 0 products returned', `Got ${resE.results.length}`);
  assert(!resE.reply.toLowerCase().includes('bell'), 'Case E: Does NOT answer Alexander Graham Bell', resE.reply);

  // Case F: "what's the weather today?"
  const resF = await sendChat("what's the weather today?");
  assert(resF.intent === 'OUT_OF_SCOPE', 'Case F: Intent is OUT_OF_SCOPE', `Got ${resF.intent}`);
  assert(resF.results.length === 0, 'Case F: 0 products returned', `Got ${resF.results.length}`);

  // Case G: "what happened in today's news?"
  const resG = await sendChat("what happened in today's news?");
  assert(resG.intent === 'OUT_OF_SCOPE', 'Case G: Intent is OUT_OF_SCOPE', `Got ${resG.intent}`);
  assert(resG.results.length === 0, 'Case G: 0 products returned', `Got ${resG.results.length}`);

  // ──────────────────────────────────────────────────────────────────────────
  // 2. IN-SCOPE INQUIRIES MUST NOT BE BLOCKED
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 2. IN-SCOPE INQUIRIES (NOT BLOCKED) ---');

  // Case H: "recommend a fresh perfume"
  const resH = await sendChat('recommend a fresh perfume');
  assert(resH.intent === 'RECOMMENDATION', 'Case H: Intent is RECOMMENDATION', `Got ${resH.intent}`);
  assert(resH.results.length > 0, 'Case H: Returns recommendations', `Got ${resH.results.length}`);

  // Case I: "what are the notes in Royal Oud?"
  const resI = await sendChat('what are the notes in Royal Oud?');
  assert(resI.intent === 'PRODUCT_INFO', 'Case I: Intent is PRODUCT_INFO', `Got ${resI.intent}`);
  assert(
    resI.reply.toLowerCase().includes('oud') || resI.reply.toLowerCase().includes('royal oud'),
    'Case I: Explains notes of Royal Oud',
    resI.reply
  );

  // Case J: "Fraganote has better scents"
  const resJ = await sendChat('Fraganote has better scents');
  assert(resJ.intent === 'CUSTOMER_OBJECTION', 'Case J: Intent is CUSTOMER_OBJECTION', `Got ${resJ.intent}`);
  assert(resJ.results.length === 0, 'Case J: 0 products dumped for pure objection');

  // Case K: "I want something melty"
  const resK = await sendChat('I want something melty');
  assert(resK.intent === 'CLARIFICATION', 'Case K: Intent is CLARIFICATION for ambiguous descriptor', `Got ${resK.intent}`);
  assert(resK.results.length === 0, 'Case K: 0 products returned during clarification');

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MIXED INTENT: Unrelated ignored, perfume fulfilled
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 3. MIXED INTENT HANDLING ---');

  // Case L: "what is the capital of France and recommend a fresh perfume under ₹1000"
  const resL = await sendChat('what is the capital of France and recommend a fresh perfume under ₹1000');
  assert(resL.intent === 'RECOMMENDATION', 'Case L: Intent is RECOMMENDATION', `Got ${resL.intent}`);
  assert(resL.results.length > 0, 'Case L: Returns perfume recommendations', `Got ${resL.results.length}`);
  assert(!resL.reply.toLowerCase().includes('paris'), 'Case L: Does NOT answer Paris in the reply', resL.reply);
  assert(
    resL.results.every((r: any) => r.product.price <= 1000),
    'Case L: All recommended products are under ₹1000'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CONVERSATION STATE PRESERVATION
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- 4. CONVERSATION STATE PRESERVATION ---');

  // Case M: fresh -> capital of Bhutan -> warmer
  console.log('Multi-turn Flow M:');
  let stateM: ConversationState | undefined = undefined;
  const historyM: any[] = [];

  // Step 1: Fresh perfume
  const stepM1 = await sendChat('I want a fresh perfume', stateM, historyM);
  stateM = stepM1.updatedState;
  historyM.push({ role: 'user', content: 'I want a fresh perfume' });
  historyM.push({ role: 'assistant', content: stepM1.reply });
  assert(stateM?.activeRequest?.families?.includes('fresh'), 'Flow M - Step 1: State has fresh');

  // Step 2: Out of scope interjection
  const stateBeforeOutOfScope = JSON.stringify(stateM?.activeRequest);
  const stepM2 = await sendChat('capital of Bhutan', stateM, historyM);
  stateM = stepM2.updatedState;
  historyM.push({ role: 'user', content: 'capital of Bhutan' });
  historyM.push({ role: 'assistant', content: stepM2.reply });
  const stateAfterOutOfScope = JSON.stringify(stateM?.activeRequest);
  assert(stepM2.intent === 'OUT_OF_SCOPE', 'Flow M - Step 2: OUT_OF_SCOPE intent');
  assert(stepM2.results.length === 0, 'Flow M - Step 2: 0 products');
  assert(stateBeforeOutOfScope === stateAfterOutOfScope, 'Flow M - Step 2: activeRequest was 100% preserved and untouched');

  // Step 3: Refinement "make it warmer"
  const stepM3 = await sendChat('make it warmer', stateM, historyM);
  stateM = stepM3.updatedState;
  assert(stepM3.intent === 'RECOMMENDATION' || stepM3.intent === 'REFINE_RECOMMENDATION', 'Flow M - Step 3: Refinement processed');
  assert(stateM?.activeRequest?.warmth === 'warmer', 'Flow M - Step 3: Warmth is warmer');
  assert(stepM3.results.length > 0, 'Flow M - Step 3: Results returned for refinement');

  // Case N: woody -> what is 25 * 18? -> no leather
  console.log('\nMulti-turn Flow N:');
  let stateN: ConversationState | undefined = undefined;
  const historyN: any[] = [];

  // Step 1: Woody perfume
  const stepN1 = await sendChat('I want a woody perfume', stateN, historyN);
  stateN = stepN1.updatedState;
  historyN.push({ role: 'user', content: 'I want a woody perfume' });
  historyN.push({ role: 'assistant', content: stepN1.reply });
  assert(stateN?.activeRequest?.families?.includes('woody'), 'Flow N - Step 1: State has woody');

  // Step 2: Math out of scope
  const stepN2 = await sendChat('what is 25 * 18?', stateN, historyN);
  stateN = stepN2.updatedState;
  historyN.push({ role: 'user', content: 'what is 25 * 18?' });
  historyN.push({ role: 'assistant', content: stepN2.reply });
  assert(stepN2.intent === 'OUT_OF_SCOPE', 'Flow N - Step 2: OUT_OF_SCOPE intent');
  assert(!stepN2.reply.includes('450'), 'Flow N - Step 2: 450 not answered');
  assert(stateN?.activeRequest?.families?.includes('woody'), 'Flow N - Step 2: Woody still in state');

  // Step 3: Exclusion "no leather"
  const stepN3 = await sendChat('no leather', stateN, historyN);
  stateN = stepN3.updatedState;
  assert(stateN?.activeRequest?.excludedNotes?.includes('leather'), 'Flow N - Step 3: Leather added to exclusions');
  assert(stateN?.activeRequest?.families?.includes('woody'), 'Flow N - Step 3: Woody maintained');

  // ──────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`SCOPE ENFORCEMENT TEST RESULTS: ${passedCount}/${totalCount} PASSED`);
  console.log('================================================================\n');

  if (passedCount < totalCount) {
    process.exit(1);
  }
}

runScopeTestSuite().catch((err) => {
  console.error('Fatal error in test suite:', err);
  process.exit(1);
});

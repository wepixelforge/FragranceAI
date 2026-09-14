import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences, doesIntentRequireProducts } from '../src/lib/intent-classifier';
import { updateConversationState, createInitialConversationState, toStructuredPreferences } from '../src/lib/state-manager';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { normalizeAssistantMessages } from '../src/lib/message-sequencer';
import { getRecommendations } from '../src/lib/recommendation-engine';

async function runTests() {
  console.log('--- STARTING CLARIFICATION & PARTIAL-MATCH TEST SUITE ---\n');
  const brand = getBrand('worldofperfumers')!;
  const products = getProducts('worldofperfumers');

  let passed = 0;
  let failed = 0;

  function assert(cond: boolean, name: string, detail?: any) {
    if (cond) {
      console.log(`✅ PASS: ${name}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${name}`, detail || '');
      failed++;
    }
  }

  // TEST 1: Ambiguous Term "off" -> CLARIFICATION, 0 products
  console.log('\n[TEST 1]: Ambiguous term "off"');
  let state = createInitialConversationState();
  const stage1Off = await classifyIntentAndExtractPreferences('I want something off.', brand, products, [], state);
  assert(
    stage1Off.intent === 'CLARIFICATION' || Boolean(stage1Off.needs_clarification),
    'Intent classified as CLARIFICATION or needs_clarification',
    stage1Off
  );
  assert(
    stage1Off.ambiguous_term === 'off',
    `Ambiguous term identified as "off" (got: ${stage1Off.ambiguous_term})`
  );
  assert(
    !doesIntentRequireProducts(stage1Off.intent, stage1Off),
    'doesIntentRequireProducts returns false for clarification'
  );
  const stateAfterOff = updateConversationState(state, stage1Off, 'I want something off.');
  assert(
    stateAfterOff.pendingClarification?.ambiguousTerm === 'off',
    'pendingClarification recorded in state'
  );
  const replyOff = await generateConversationalResponse('I want something off.', brand, stage1Off, [], [], stateAfterOff, []);
  const messagesOff = normalizeAssistantMessages(replyOff, brand, stage1Off.intent, {
    needsClarification: true,
    resultsCount: 0,
  });
  assert(
    messagesOff.length >= 1 && messagesOff.length <= 2,
    `Clarification sequenced into 1-2 thoughts (got: ${messagesOff.length}): ${JSON.stringify(messagesOff)}`
  );
  assert(
    !replyOff.toLowerCase().includes('database') && !replyOff.toLowerCase().includes('couldn\'t find'),
    'Clarification response is conversational and consultant-led'
  );

  // TEST 2: Ambiguous Term "melty" -> State purity (no guessed fields)
  console.log('\n[TEST 2]: State purity on "melty"');
  const stage1Melty = await classifyIntentAndExtractPreferences('I want something melty.', brand, products, [], state);
  assert(
    stage1Melty.intent === 'CLARIFICATION' || Boolean(stage1Melty.needs_clarification),
    'Intent classified as CLARIFICATION for "melty"'
  );
  const stateAfterMelty = updateConversationState(state, stage1Melty, 'I want something melty.');
  assert(
    stateAfterMelty.activeRequest?.sweetness === null || stateAfterMelty.activeRequest?.sweetness === undefined,
    'Sweetness NOT guessed or set to true for "melty"'
  );
  assert(
    (stateAfterMelty.activeRequest?.families || []).length === 0,
    'No fragrance families guessed for "melty"'
  );
  assert(
    stateAfterMelty.pendingClarification?.ambiguousTerm === 'melty',
    'Pending clarification preserved for "melty"'
  );

  // TEST 3: Clarification Recovery (Follow-up Turn)
  console.log('\n[TEST 3]: Clarification Recovery ("Something warm and creamy")');
  const stage1FollowUp = await classifyIntentAndExtractPreferences(
    'Something warm and creamy.',
    brand,
    products,
    [
      { role: 'user', content: 'I want something melty.' },
      { role: 'assistant', content: 'When you say melty, what kind of feeling do you mean? Something warm and creamy, or sweet?' }
    ],
    stateAfterMelty
  );
  assert(
    stage1FollowUp.intent === 'RECOMMENDATION',
    `Follow-up classified as RECOMMENDATION (got: ${stage1FollowUp.intent})`
  );
  assert(
    Boolean(stage1FollowUp.needs_recommendations),
    'Follow-up triggers needs_recommendations = true'
  );
  const stateAfterFollowUp = updateConversationState(stateAfterMelty, stage1FollowUp, 'Something warm and creamy.');
  assert(
    stateAfterFollowUp.pendingClarification === null,
    'pendingClarification cleared after successful resolution'
  );
  assert(
    stateAfterFollowUp.activeRequest?.warmth === 'warmer' ||
    (stateAfterFollowUp.activeRequest?.preferredNotes || []).some(n => n.includes('cream') || n.includes('vanilla')) ||
    (stateAfterFollowUp.activeRequest?.families || []).includes('gourmand') ||
    (stateAfterFollowUp.activeRequest?.families || []).includes('oriental'),
    'Follow-up preferences correctly captured in state'
  );

  // TEST 4: Known Vocabulary -> NEVER clarify
  console.log('\n[TEST 4]: Known vocabulary ("I want something fresh")');
  const stage1Fresh = await classifyIntentAndExtractPreferences('I want something fresh.', brand, products, [], state);
  assert(
    stage1Fresh.intent === 'RECOMMENDATION',
    `"fresh" classified as RECOMMENDATION (got: ${stage1Fresh.intent})`
  );
  assert(
    !stage1Fresh.needs_clarification,
    '"fresh" does NOT trigger needs_clarification'
  );

  console.log('\n[TEST 4b]: Known vocabulary ("I want something woody")');
  const stage1Woody = await classifyIntentAndExtractPreferences('I want something woody.', brand, products, [], state);
  assert(
    stage1Woody.intent === 'RECOMMENDATION',
    `"woody" classified as RECOMMENDATION (got: ${stage1Woody.intent})`
  );
  assert(
    !stage1Woody.needs_clarification,
    '"woody" does NOT trigger needs_clarification'
  );

  // TEST 5: Partial Match Wording & Formatting
  console.log('\n[TEST 5]: Partial match wording ("I want something intense and refreshing")');
  const tmBrand = getBrand('tmperfumehouse')!;
  const tmProducts = getProducts('tmperfumehouse');
  const stage1Partial = await classifyIntentAndExtractPreferences('I want something intense and refreshing.', tmBrand, tmProducts, [], state);
  const statePartial = updateConversationState(state, stage1Partial, 'I want something intense and refreshing.');
  const prefsPartial = toStructuredPreferences(statePartial, 'I want something intense and refreshing.');
  const recPartial = getRecommendations(prefsPartial, tmProducts, 3, []);

  assert(
    recPartial.canonicalResult.status === 'PARTIAL_MATCH' || Boolean(recPartial.isPartialMatch),
    'Engine identified partial match for intense + refreshing'
  );
  assert(
    recPartial.results.length === 1,
    `Partial match returns exactly 1 candidate (got: ${recPartial.results.length})`
  );

  const partialReply = await generateConversationalResponse(
    'I want something intense and refreshing.',
    tmBrand,
    stage1Partial,
    recPartial.results.map(r => r.product),
    recPartial.results,
    statePartial,
    [],
    { status: recPartial.canonicalResult.status }
  );

  assert(
    !partialReply.toLowerCase().startsWith("i couldn't find a fragrance"),
    `Partial match does NOT start with "I couldn't find a fragrance" (got: "${partialReply.slice(0, 60)}...")`
  );
  assert(
    !partialReply.toLowerCase().startsWith("i don't have a fragrance"),
    `Partial match does NOT start with "I don't have a fragrance" (got: "${partialReply.slice(0, 60)}...")`
  );

  const partialMessages = normalizeAssistantMessages(partialReply, brand, stage1Partial.intent, {
    isPartialMatch: true,
    productName: recPartial.results[0]?.product.name,
    tradeOff: recPartial.tradeOff,
    resultsCount: 1,
  });

  console.log('Partial match sequenced thoughts:', partialMessages);
  assert(
    partialMessages.length === 2,
    `Partial match sequenced into exactly 2 thoughts (got: ${partialMessages.length})`
  );
  assert(
    partialMessages[0].startsWith('The closest option is'),
    `Thought 1 leads directly with "The closest option is..." (got: "${partialMessages[0]}")`
  );
  assert(
    !partialMessages[0].toLowerCase().includes("couldn't find") && !partialMessages[1].toLowerCase().includes("couldn't find"),
    'No negative database phrases in sequenced thoughts'
  );

  // TEST 6: Genuine NO_MATCH (Budget limit)
  console.log('\n[TEST 6]: Genuine NO_MATCH ("I want something fresh under ₹200")');
  const stage1BudgetNoMatch = await classifyIntentAndExtractPreferences('I want something fresh under ₹200.', brand, products, [], state);
  const stateBudget = updateConversationState(state, stage1BudgetNoMatch, 'I want something fresh under ₹200.');
  const prefsBudget = toStructuredPreferences(stateBudget, 'I want something fresh under ₹200.');
  const recBudget = getRecommendations(prefsBudget, products, 3, []);

  assert(
    recBudget.results.length === 0,
    `0 products returned for impossible ₹200 budget (got: ${recBudget.results.length})`
  );
  assert(
    recBudget.status === 'NO_VALID_MATCH' || recBudget.hardConstraintFailed,
    `Status indicates no valid match or hard constraint failure (got: ${recBudget.status})`
  );

  const noMatchReply = await generateConversationalResponse(
    'I want something fresh under ₹200.',
    brand,
    stage1BudgetNoMatch,
    [],
    [],
    stateBudget,
    [],
    { status: recBudget.status, hardConstraintFailed: true }
  );

  assert(
    !noMatchReply.toLowerCase().includes('relax one of your preferences'),
    `No robotic "relax one of your preferences" copy in NO_MATCH reply (got: "${noMatchReply}")`
  );

  // TEST 7: Ambiguous term + known family ("I want something unusual and woody")
  console.log('\n[TEST 7]: Ambiguous term + known family ("I want something unusual and woody")');
  const stage1UnusualWoody = await classifyIntentAndExtractPreferences('I want something unusual and woody.', brand, products, [], state);
  assert(
    stage1UnusualWoody.intent === 'CLARIFICATION' || Boolean(stage1UnusualWoody.needs_clarification),
    'Clarification triggered for "unusual"'
  );
  const stateUnusualWoody = updateConversationState(state, stage1UnusualWoody, 'I want something unusual and woody.');
  assert(
    (stateUnusualWoody.activeRequest?.families || []).includes('woody'),
    `Known family "woody" is preserved in activeRequest (got: ${JSON.stringify(stateUnusualWoody.activeRequest?.families)})`
  );

  console.log(`\n==============================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==============================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in test:', err);
  process.exit(1);
});

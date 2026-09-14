async function runHttpTests() {
  console.log('--- STARTING HTTP LIVE TESTS FOR /api/chat ---\n');

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

  // SCENARIO A: "I want something off."
  console.log('\n[SCENARIO A]: "I want something off."');
  const resA = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want something off.',
      brandSlug: 'worldofperfumers',
      history: []
    })
  });
  const dataA = await resA.json();
  console.log('Scenario A reply messages:', dataA.messages);
  console.log('Scenario A results count:', (dataA.results || []).length);
  assert(dataA.intent === 'CLARIFICATION', `Scenario A intent is CLARIFICATION (got: ${dataA.intent})`);
  assert((dataA.results || []).length === 0, `Scenario A returns 0 product cards (got: ${(dataA.results || []).length})`);
  assert(dataA.messages.length >= 1 && dataA.messages.length <= 2, `Scenario A sequenced into 1-2 messages (got: ${dataA.messages.length})`);
  assert(dataA.updatedState.pendingClarification?.ambiguousTerm === 'off', 'Scenario A pendingClarification stored');

  // SCENARIO B: "I want something melty."
  console.log('\n[SCENARIO B]: "I want something melty."');
  const resB = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want something melty.',
      brandSlug: 'worldofperfumers',
      history: []
    })
  });
  const dataB = await resB.json();
  console.log('Scenario B reply messages:', dataB.messages);
  assert(dataB.intent === 'CLARIFICATION', `Scenario B intent is CLARIFICATION (got: ${dataB.intent})`);
  assert((dataB.results || []).length === 0, `Scenario B returns 0 product cards (got: ${(dataB.results || []).length})`);
  assert(dataB.updatedState.activeRequest?.sweetness === null, 'Scenario B activeRequest sweetness is untouched');
  assert(dataB.updatedState.pendingClarification?.ambiguousTerm === 'melty', 'Scenario B pendingClarification is melty');

  // SCENARIO C: Clarification Follow-up: "Something warm and creamy."
  console.log('\n[SCENARIO C]: Follow-up "Something warm and creamy."');
  const resC = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Something warm and creamy.',
      brandSlug: 'worldofperfumers',
      history: [
        { role: 'user', content: 'I want something melty.' },
        { role: 'assistant', content: dataB.messages.join(' ') }
      ],
      state: dataB.updatedState
    })
  });
  const dataC = await resC.json();
  console.log('Scenario C reply messages:', dataC.messages);
  console.log('Scenario C results count:', (dataC.results || []).length);
  assert(dataC.intent === 'RECOMMENDATION', `Scenario C intent is RECOMMENDATION (got: ${dataC.intent})`);
  assert((dataC.results || []).length > 0, `Scenario C returns product cards (got: ${(dataC.results || []).length})`);
  assert(dataC.updatedState.pendingClarification === null, 'Scenario C pendingClarification cleared');

  // SCENARIO D: "I want something intense and refreshing." (TM Perfume House)
  console.log('\n[SCENARIO D]: "I want something intense and refreshing."');
  const resD = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want something intense and refreshing.',
      brandSlug: 'tmperfumehouse',
      history: []
    })
  });
  const dataD = await resD.json();
  console.log('Scenario D reply messages:', dataD.messages);
  console.log('Scenario D results:', dataD.results.map((r: any) => r.product.name));
  assert(dataD.isPartialMatch === true, 'Scenario D isPartialMatch is true');
  assert(dataD.results.length === 1, `Scenario D returns exactly 1 product (got: ${dataD.results.length})`);
  assert(dataD.messages.length === 2, `Scenario D sequenced into exactly 2 thoughts (got: ${dataD.messages.length})`);
  assert(dataD.messages[0].startsWith('The closest option is Ocean Breeze.'), `Scenario D leads directly with "The closest option is Ocean Breeze." (got: "${dataD.messages[0]}")`);
  assert(!dataD.messages[0].toLowerCase().includes("couldn't find"), 'Scenario D has no negative opener');

  // SCENARIO E: "I want something fresh." (Known vocabulary)
  console.log('\n[SCENARIO E]: "I want something fresh."');
  const resE = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'I want something fresh.',
      brandSlug: 'worldofperfumers',
      history: []
    })
  });
  const dataE = await resE.json();
  assert(dataE.intent === 'RECOMMENDATION', `Scenario E is RECOMMENDATION (got: ${dataE.intent})`);
  assert(dataE.results.length > 0, `Scenario E returns products (got: ${dataE.results.length})`);

  console.log(`\n==============================================`);
  console.log(`HTTP TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`==============================================\n`);

  if (failed > 0) process.exit(1);
}

runHttpTests().catch((err) => {
  console.error('HTTP test error:', err);
  process.exit(1);
});

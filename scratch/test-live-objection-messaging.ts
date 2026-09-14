async function testLiveChat() {
  console.log('Testing live /api/chat with sequential messages and objection handling...\n');

  // Test 1: Pure competitor objection
  console.log('--- TEST 1: Pure Competitor Objection ---');
  const res1 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'TM Perfume House has better scents.',
      brandSlug: 'worldofperfumers',
    }),
  });
  const data1 = await res1.json();
  console.log('Status:', res1.status);
  console.log('Intent:', data1.intent);
  console.log('Messages:', data1.messages);
  console.log('Products count:', data1.results?.length ?? 0);
  if (
    data1.intent === 'CUSTOMER_OBJECTION' &&
    Array.isArray(data1.messages) &&
    data1.messages.length >= 3 &&
    data1.results.length === 0
  ) {
    console.log('✅ TEST 1 PASSED: Non-defensive 3-4 messages, zero product dump.\n');
  } else {
    console.error('❌ TEST 1 FAILED');
    process.exit(1);
  }

  // Test 2: Competitor objection + preference
  console.log('--- TEST 2: Competitor Objection + Preference ---');
  const res2 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'TM Perfume House has better scents. I like fresh perfumes.',
      brandSlug: 'worldofperfumers',
    }),
  });
  const data2 = await res2.json();
  console.log('Status:', res2.status);
  console.log('Intent:', data2.intent);
  console.log('Messages:', data2.messages);
  console.log('Products:', data2.results?.map((r: any) => r.product.name));
  if (
    data2.intent === 'CUSTOMER_OBJECTION' &&
    Array.isArray(data2.messages) &&
    data2.messages.length >= 2 &&
    data2.results.length > 0 &&
    data2.results.length <= 2
  ) {
    console.log('✅ TEST 2 PASSED: 2-3 messages + maximum 2 products discovery.\n');
  } else {
    console.error('❌ TEST 2 FAILED');
    process.exit(1);
  }

  // Test 3: Greeting
  console.log('--- TEST 3: Greeting ---');
  const res3 = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Hi',
      brandSlug: 'tmperfumehouse',
    }),
  });
  const data3 = await res3.json();
  console.log('Status:', res3.status);
  console.log('Messages:', data3.messages);
  console.log('Products count:', data3.results?.length ?? 0);
  if (
    data3.intent === 'GREETING' &&
    Array.isArray(data3.messages) &&
    data3.messages.length === 2 &&
    data3.results.length === 0
  ) {
    console.log('✅ TEST 3 PASSED: Exactly 2 conversational messages, 0 products.\n');
  } else {
    console.error('❌ TEST 3 FAILED');
    process.exit(1);
  }

  console.log('🎉 ALL LIVE HTTP TESTS PASSED PERFECTLY!');
}

testLiveChat().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { getBrand, getProducts } from '../src/data';

async function testHttpFlows() {
  console.log('=== TESTING LIVE HTTP /api/chat END-TO-END FLOWS ===\n');

  async function postChat(message: string, state: any, history: any[] = []) {
    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        brandSlug: 'tmperfumehouse',
        conversationState: state,
        history,
      }),
    });
    return await res.json();
  }

  // FLOW 1: Warm -> Not too warm -> Actually, warmer
  console.log('--- FLOW 1: Warm -> Not too warm -> Actually, warmer ---');
  let res1 = await postChat('I want something warm.', null, []);
  console.log('Turn 1 ("I want something warm."):');
  console.log('  Products:', res1.results.map((r: any) => r.product.name));
  console.log('  Reply:', res1.reply.substring(0, 100) + '...');

  let res2 = await postChat('Not too warm.', res1.updatedState, [{ role: 'user', content: 'I want something warm.' }]);
  console.log('Turn 2 ("Not too warm."):');
  console.log('  Products:', res2.results.map((r: any) => r.product.name));
  console.log('  Warmth in activeRequest:', res2.updatedState?.activeRequest?.warmth);
  console.log('  WarmthMax in activeRequest:', res2.updatedState?.activeRequest?.warmthMax);
  console.log('  Reply:', res2.reply.substring(0, 100) + '...');

  let res3 = await postChat('Actually, warmer.', res2.updatedState, [
    { role: 'user', content: 'I want something warm.' },
    { role: 'user', content: 'Not too warm.' }
  ]);
  console.log('Turn 3 ("Actually, warmer."):');
  console.log('  Products:', res3.results.map((r: any) => r.product.name));
  console.log('  Warmth in activeRequest:', res3.updatedState?.activeRequest?.warmth);
  console.log('  WarmthMax in activeRequest:', res3.updatedState?.activeRequest?.warmthMax);

  // FLOW 2: Strong -> But not loud
  console.log('\n--- FLOW 2: Strong -> But not loud ---');
  let resF2_1 = await postChat('I want something strong.', null, []);
  console.log('Turn 1 ("I want something strong."):');
  console.log('  Products:', resF2_1.results.map((r: any) => r.product.name));

  let resF2_2 = await postChat('But not loud.', resF2_1.updatedState, [{ role: 'user', content: 'I want something strong.' }]);
  console.log('Turn 2 ("But not loud."):');
  console.log('  Products (should be empty):', resF2_2.results.map((r: any) => r.product.name));
  console.log('  Status:', resF2_2.needsRecommendations ? 'HAS_RECS' : 'NO_RECS');
  console.log('  Reply:\n ', resF2_2.reply);

  // FLOW 3: Strong -> But not loud -> Actually, louder
  console.log('\n--- FLOW 3: Strong -> But not loud -> Actually, louder ---');
  let resF3_3 = await postChat('Actually, louder.', resF2_2.updatedState, [
    { role: 'user', content: 'I want something strong.' },
    { role: 'user', content: 'But not loud.' }
  ]);
  console.log('Turn 3 ("Actually, louder."):');
  console.log('  Products:', resF3_3.results.map((r: any) => r.product.name));
  console.log('  SillageMax:', resF3_3.updatedState?.activeRequest?.sillageMax);

  // FLOW 4: Strong -> But not loud -> Make it less intense
  console.log('\n--- FLOW 4: Strong -> But not loud -> Make it less intense ---');
  let resF4_3 = await postChat('Make it less intense.', resF2_2.updatedState, [
    { role: 'user', content: 'I want something strong.' },
    { role: 'user', content: 'But not loud.' }
  ]);
  console.log('Turn 3 ("Make it less intense."):');
  console.log('  Products:', resF4_3.results.map((r: any) => r.product.name));
  console.log('  Intensity:', resF4_3.updatedState?.activeRequest?.intensity);
  // FLOW 5: Fresh -> Make it strong
  console.log('\n--- FLOW 5: Fresh -> Make it strong ---');
  let resF5_1 = await postChat('I want something fresh.', null, []);
  console.log('Turn 1 ("I want something fresh."):');
  console.log('  Products:', resF5_1.results.map((r: any) => r.product.name));

  let resF5_2 = await postChat('Make it strong.', resF5_1.updatedState, [{ role: 'user', content: 'I want something fresh.' }]);
  console.log('Turn 2 ("Make it strong."):');
  console.log('  Products (should be empty):', resF5_2.results.map((r: any) => r.product.name));
  console.log('  Status:', resF5_2.needsRecommendations ? 'HAS_RECS' : 'NO_RECS');
  console.log('  Reply:\n ', resF5_2.reply);

  // FLOW 6: Strong -> But not loud -> Show me options
  console.log('\n--- FLOW 6: Strong -> But not loud -> Show me options ---');
  let resF6_3 = await postChat('Show me options.', resF2_2.updatedState, [
    { role: 'user', content: 'I want something strong.' },
    { role: 'user', content: 'But not loud.' }
  ]);
  console.log('Turn 3 ("Show me options."):');
  console.log('  Products (should be empty):', resF6_3.results.map((r: any) => r.product.name));
  console.log('  Status:', resF6_3.needsRecommendations ? 'HAS_RECS' : 'NO_RECS');
  console.log('  Reply:\n ', resF6_3.reply);

  console.log('\n=== ALL HTTP END-TO-END VERIFICATIONS COMPLETED! ===');
}

testHttpFlows().catch(console.error);

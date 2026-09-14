async function runManualScenarios() {
  console.log('================================================================');
  console.log('🧪 RUNNING 5 LIVE MANUAL QA SCENARIOS');
  console.log('================================================================\n');

  async function postChat(message: string, brandSlug: string = 'tmperfumehouse') {
    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, brandSlug }),
    });
    return await res.json();
  }

  const queries = [
    { query: 'I want something intense and refreshing.', brand: 'tmperfumehouse' },
    { query: 'I want something warm but still fresh.', brand: 'tmperfumehouse' },
    { query: 'I want something fresh, strong and under ₹800.', brand: 'tmperfumehouse' },
    { query: 'I want something fresh, strong and not sweet.', brand: 'tmperfumehouse' },
    { query: 'I want something similar to Dior Sauvage.', brand: 'tmperfumehouse' },
  ];

  const report: any[] = [];

  for (let i = 0; i < queries.length; i++) {
    const { query, brand } = queries[i];
    console.log(`\n--- SCENARIO ${i + 1}: "${query}" ---`);
    const data = await postChat(query, brand);

    const isPartial = data.isPartialMatch || data.debugInfo?.status === 'PARTIAL_MATCH';
    const topResult = data.results && data.results[0];
    const item = {
      scenario: i + 1,
      query,
      brand,
      matchType: isPartial ? 'PARTIAL MATCH' : (data.results?.length > 0 ? 'EXACT MATCH' : 'NO MATCH'),
      hardConstraints: data.debugInfo?.hardConstraints,
      matchedPreferences: data.matchedPreferences || [],
      unmetPreferences: data.unmetPreferences || [],
      canonicalProductId: topResult?.product?.id || null,
      displayedProductName: topResult?.product?.name || null,
      displayedProductImage: topResult?.product?.imageUrl || 'Generated flacon rendering',
      explanation: topResult?.explanation || data.reply,
      messages: data.messages || [data.reply],
      tradeOff: data.tradeOff || null,
    };

    report.push(item);
    console.log('Match Type:            ', item.matchType);
    console.log('Canonical Product ID:  ', item.canonicalProductId);
    console.log('Displayed Name:        ', item.displayedProductName);
    console.log('Matched Preferences:   ', item.matchedPreferences);
    console.log('Unmet Preferences:     ', item.unmetPreferences);
    console.log('Trade-off:             ', item.tradeOff);
    console.log('Sequential Messages:   ', item.messages);
  }

  console.log('\n================================================================');
  console.log('📊 SCENARIOS SUMMARY TABLE:');
  console.log('================================================================');
  console.table(
    report.map((r) => ({
      Scenario: r.scenario,
      Query: r.query,
      MatchType: r.matchType,
      Product: r.displayedProductName,
      CanonicalId: r.canonicalProductId,
    }))
  );
}

runManualScenarios().catch((err) => {
  console.error(err);
  process.exit(1);
});

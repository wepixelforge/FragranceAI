import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import {
  buildRecommendationPresentation,
  evaluateRecommendationGrounding,
} from '../src/lib/response-grounding';
import { ConversationState } from '../src/types/chat';
import { RecommendationResult } from '../src/types/product';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function leadsWithApology(text: string): boolean {
  const lower = text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .trim();
  return /^(i('?m| am) (sorry|afraid)|unfortunately|i don'?t have a fragrance|i'?m sorry)\b/.test(lower);
}

async function turn(message: string, brandSlug: string, state: ConversationState) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, [], state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let rec: ReturnType<typeof getRecommendations> | null = null;
  if (stage1.needs_recommendations && !stage1.needs_clarification) {
    const prefs = toStructuredPreferences(updated, message);
    rec = getRecommendations(prefs, products, 3);
    results = rec.results;
    if (results.length > 0) {
      updated.lastRecommendationIds = results.map((r) => r.product.id);
    }
  }
  const status =
    rec?.canonicalResult.status ||
    (stage1.needs_clarification ? 'CLARIFY' : results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
  const presentation = buildRecommendationPresentation(results, status, {
    matchedPreferences: rec?.matchedPreferences,
    unmetPreferences: rec?.unmetPreferences,
    tradeOff: rec?.tradeOff,
    isPartialMatch: rec?.isPartialMatch,
  });
  const reply = await generateConversationalResponse(
    message,
    brand,
    stage1,
    results.map((r) => r.product),
    results,
    updated,
    [],
    {
      status,
      hardConstraintFailed: rec?.hardConstraintFailed,
      recommendationPresentation: presentation,
      catalogueProducts: products,
    }
  );
  return { stage1, state: updated, results, reply, status, presentation, rec };
}

async function run() {
  let passed = 0;
  let failed = 0;
  const check = async (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${id}  ${name}`);
    } catch (err: any) {
      failed++;
      console.log(`FAIL  ${id}  ${name}  → ${err.message}`);
    }
  };

  await check('1', 'Exact match: fresh office under ₹800 is SUCCESS, not closest-match copy', async () => {
    const res = await turn(
      'Show me fresh office perfumes under ₹800',
      'tmperfumehouse',
      createInitialConversationState()
    );
    assert(res.results.length > 0, 'expected products');
    assert(res.status === 'SUCCESS', `status=${res.status}`);
    assert(!res.rec?.isPartialMatch, 'should not be partial');
    assert(res.results.every((r) => r.product.price <= 800), 'budget violated');
    assert(!/closest match/i.test(res.reply), res.reply);
    assert(!leadsWithApology(res.reply), res.reply);
  });

  await check('2', 'summer + official + whole day leads with a product, not an apology', async () => {
    const res = await turn(
      'I want something for summers for official use and which last for a whole day',
      'tmperfumehouse',
      createInitialConversationState()
    );
    assert(res.stage1.occasion === 'office' || res.state.activeRequest.occasion === 'office', `occasion=${res.stage1.occasion}`);
    assert(res.stage1.longevity === 'long-lasting' || res.state.activeRequest.longevity === 'long-lasting', `longevity=${res.stage1.longevity}`);
    assert((res.state.activeRequest.excludedFamilies || []).length === 0, 'invented fresh exclusion');
    assert(res.results.length > 0, `expected a closest/exact product, status=${res.status}`);
    assert(!leadsWithApology(res.reply), res.reply);
    assert(!/i don'?t have a fragrance in our catalogue/i.test(res.reply.replace(/[\u2018\u2019]/g, "'")), res.reply);
    const named = res.results.filter((r) => new RegExp(r.product.name, 'i').test(res.reply));
    assert(named.length >= 1, `reply did not name canonical product: ${res.reply}`);
    const grounding = evaluateRecommendationGrounding(res.reply, res.results, getProducts('tmperfumehouse'), {
      intent: 'RECOMMENDATION',
      status: res.status,
    });
    assert(grounding.ok, grounding.reason || 'grounding failed');
    console.log('    products:', res.results.map((r) => `${r.product.name}/${r.product.longevity}`).join(', '));
    console.log('    status:', res.status, 'partial:', Boolean(res.rec?.isPartialMatch));
    console.log('    reply:', res.reply.replace(/\s+/g, ' ').slice(0, 280));
  });

  await check('3', 'Partial match names primary + alternatives when multiple canonical products', async () => {
    const res = await turn('I want something intense and refreshing', 'tmperfumehouse', createInitialConversationState());
    assert(res.status === 'PARTIAL_MATCH' || res.results.length > 0, `status=${res.status}`);
    if (res.results.length >= 2) {
      const mentioned = res.results.filter((r) => new RegExp(r.product.name, 'i').test(res.reply));
      assert(mentioned.length >= 2, res.reply);
    } else {
      assert(/closest/i.test(res.reply), res.reply);
      assert(!leadsWithApology(res.reply), res.reply);
    }
  });

  await check('4', 'Genuine NO_MATCH stays empty and does not invent products', async () => {
    const res = await turn('I want something fresh under ₹200', 'tmperfumehouse', createInitialConversationState());
    assert(res.results.length === 0, `got ${res.results.map((r) => r.product.name).join(',')}`);
    assert(res.status === 'NO_VALID_MATCH' || Boolean(res.rec?.hardConstraintFailed), `status=${res.status}`);
    assert(!/Ocean Breeze|Royal Oud|Gentleman/.test(res.reply), res.reply);
    assert(!leadsWithApology(res.reply) || /close fit|couldn't find/i.test(res.reply), res.reply);
  });

  await check('5', 'Budget remains hard — under ₹500 never returns ₹949', async () => {
    const res = await turn('fresh office perfume under ₹500', 'tmperfumehouse', createInitialConversationState());
    assert(res.results.every((r) => r.product.price <= 500), res.results.map((r) => `${r.product.name}:${r.product.price}`).join(','));
  });

  await check('6', 'no leather exclusion is respected', async () => {
    const res = await turn('I want a woody office perfume with no leather', 'tmperfumehouse', createInitialConversationState());
    assert(
      res.results.every(
        (r) =>
          !r.product.fragranceFamily.includes('leather' as any) &&
          ![...r.product.topNotes, ...r.product.heartNotes, ...r.product.baseNotes, ...r.product.tags]
            .join(' ')
            .toLowerCase()
            .includes('leather')
      ),
      res.results.map((r) => r.product.name).join(',')
    );
  });

  await check('7', 'not sweet does not recommend a sweet closest match', async () => {
    const res = await turn('I want something fresh for office, not sweet', 'tmperfumehouse', createInitialConversationState());
    assert(
      res.results.every((r) => r.product.sweetness !== 'sweet' && r.product.sweetness !== 'very-sweet' && !r.product.fragranceFamily.includes('sweet')),
      res.results.map((r) => `${r.product.name}:${r.product.fragranceFamily}`).join(',')
    );
  });

  await check('10', 'longevity honesty: moderate product is not sold as all-day', async () => {
    const ocean = getProducts('tmperfumehouse').find((p) => p.name === 'Ocean Breeze')!;
    const results = [
      {
        product: ocean,
        score: 40,
        matchTier: 'Closest Match' as const,
        matchReasons: [],
        detailedReasons: [{ category: 'Profile' as const, text: 'It fits summer and office wear, although its longevity is moderate rather than a guaranteed full day.' }],
        explanation: 'closest match',
      },
    ];
    const g = evaluateRecommendationGrounding(
      'Ocean Breeze lasts all day and is perfect for office summers.',
      results,
      getProducts('tmperfumehouse'),
      { intent: 'RECOMMENDATION', status: 'PARTIAL_MATCH' }
    );
    assert(!g.ok, 'should reject false all-day claim');
    const g2 = evaluateRecommendationGrounding(
      'The closest match is Ocean Breeze. It fits summer and office wear, although its longevity is moderate rather than a guaranteed full day.',
      results,
      getProducts('tmperfumehouse'),
      { intent: 'RECOMMENDATION', status: 'PARTIAL_MATCH' }
    );
    assert(g2.ok, g2.reason || 'honest trade-off should pass');
  });

  await check('14', 'NO_MATCH UI product IDs are empty', async () => {
    const res = await turn('I want something fresh under ₹50', 'tmperfumehouse', createInitialConversationState());
    assert(JSON.stringify(res.presentation.products.map((p) => p.productId)) === '[]', 'stale presentation ids');
  });

  await check('17', 'canonical IDs equal presentation IDs', async () => {
    const res = await turn(
      'I want something for summers for official use and which last for a whole day',
      'tmperfumehouse',
      createInitialConversationState()
    );
    assert(
      JSON.stringify(res.results.map((r) => r.product.id)) ===
        JSON.stringify(res.presentation.products.map((p) => p.productId)),
      'id mismatch'
    );
  });

  await check('19', 'multi-brand catalogues stay isolated', async () => {
    for (const slug of ['tmperfumehouse', 'worldofperfumers', 'almaham', 'arabianaroma'] as const) {
      const res = await turn(
        'I want something for summers for official use and which last for a whole day',
        slug,
        createInitialConversationState()
      );
      if (res.results.length > 0) {
        assert(
          res.results.every((r) => r.product.brandSlug === slug),
          `${slug}: ${res.results.map((r) => r.product.id).join(',')}`
        );
        assert(!leadsWithApology(res.reply), `${slug}: ${res.reply}`);
      }
    }
  });

  await check('20', 'melty stays clarification, no invented closest product', async () => {
    const res = await turn('I want something melty.', 'tmperfumehouse', createInitialConversationState());
    assert(res.stage1.intent === 'CLARIFICATION' || Boolean(res.stage1.needs_clarification), res.stage1.intent);
    assert(res.results.length === 0, 'should not manufacture a closest product');
  });

  await check('G', 'apology-first reply fails grounding when products exist', () => {
    const p = getProducts('tmperfumehouse').find((x) => x.name === 'Ocean Breeze')!;
    const results = [
      {
        product: p,
        score: 40,
        matchTier: 'Closest Match' as const,
        matchReasons: [],
        detailedReasons: [],
        explanation: '',
      },
    ];
    const g = evaluateRecommendationGrounding(
      "I’m sorry, but I don’t have a fragrance in our catalogue that meets all of those requirements.",
      results,
      getProducts('tmperfumehouse'),
      { intent: 'RECOMMENDATION', status: 'PARTIAL_MATCH' }
    );
    assert(!g.ok, 'unicode apology should fail grounding');
  });

  console.log('\n========================================');
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
  console.log('========================================');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

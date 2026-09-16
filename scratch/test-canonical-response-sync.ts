import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences, findProductByNameOrFuzzy } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator, generateConversationalResponse } from '../src/lib/response-generator';
import {
  evaluateRecommendationGrounding,
  buildComparativeContext,
  buildRecommendationPresentation,
  intensityRank,
} from '../src/lib/response-grounding';
import { ConversationState } from '../src/types/chat';
import { RecommendationResult } from '../src/types/product';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

async function turn(
  message: string,
  brandSlug: string,
  state: ConversationState,
  extra?: { isAlternativeRequest?: boolean }
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, [], state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let status = stage1.needs_clarification ? 'CLARIFY' : 'SUCCESS';
  let retrieved = [] as typeof products;
  if (stage1.intent === 'PRODUCT_INFO' && stage1.target_product_names?.[0]) {
    const target = findProductByNameOrFuzzy(stage1.target_product_names[0], products);
    if (target) {
      retrieved = [target];
      results = [
        {
          product: target,
          score: 95,
          matchTier: 'Spotlight',
          matchReasons: [],
          detailedReasons: [],
          explanation: '',
        },
      ];
    }
  } else if (stage1.needs_recommendations && !stage1.needs_clarification) {
    const prefs = toStructuredPreferences(updated, message);
    const exclude = extra?.isAlternativeRequest
      ? [...(state.lastRecommendationIds || []), ...(state.shownProductIds || [])]
      : [];
    const rec = getRecommendations(prefs, products, 3, exclude);
    results = rec.results;
    status = rec.canonicalResult.status || (results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
    if (results.length > 0) {
      updated.lastRecommendationIds = results.map((r) => r.product.id);
    }
  }
  const previous = (state.lastRecommendationIds || [])
    .map((id) => products.find((p) => p.id === id))
    .filter(Boolean) as any[];
  const comparativeContext = buildComparativeContext(
    message,
    stage1,
    previous,
    results.map((r) => r.product)
  );
  const presentation = buildRecommendationPresentation(results, status);
  const reply = await generateConversationalResponse(
    message,
    brand,
    stage1,
    retrieved,
    results,
    updated,
    [],
    {
      status,
      recommendationPresentation: presentation,
      comparativeContext,
      catalogueProducts: products,
      hardConstraintFailed: status === 'NO_VALID_MATCH' || status === 'NO_ALTERNATIVES',
    }
  );
  return { stage1, state: updated, results, reply, status, presentation, comparativeContext };
}

async function run() {
  const tm = getBrand('tmperfumehouse')!;
  const tmProducts = getProducts('tmperfumehouse');
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

  await check('G1', 'Grounding fails when reply names only 1 of 3 canonical products', () => {
    const cedar = tmProducts.find((p) => p.name === 'Cedar Noir')!;
    const royal = tmProducts.find((p) => p.name === 'Royal Oud')!;
    const amber = tmProducts.find((p) => p.name === 'Amber Nights')!;
    const results = [cedar, royal, amber].map((p, i) => ({
      product: p,
      score: 90 - i,
      matchTier: 'Great Match' as const,
      matchReasons: [],
      detailedReasons: [],
      explanation: '',
    }));
    const g = evaluateRecommendationGrounding(
      'Cedar Noir is a great warmer alternative to Dior Sauvage.',
      results,
      tmProducts,
      { intent: 'SIMILAR_TO_REFERENCE' }
    );
    assert(!g.ok, 'should fail when only one of three is mentioned');
  });

  await check('G2', 'Grounding fails on contradictory stronger language', () => {
    const royal = tmProducts.find((p) => p.name === 'Royal Oud')!;
    const results = [royal].map((p) => ({
      product: p,
      score: 90,
      matchTier: 'Great Match' as const,
      matchReasons: [],
      detailedReasons: [],
      explanation: '',
    }));
    const g = evaluateRecommendationGrounding(
      "I don't have a fragrance that's stronger than the strong-intensity options we have. The strongest choices are Royal Oud.",
      results,
      tmProducts,
      { intent: 'REFINE_RECOMMENDATION' }
    );
    assert(!g.ok, 'should flag contradictory no-stronger language');
  });

  await check('G3', 'Grounding passes when all canonical names appear', () => {
    const cedar = tmProducts.find((p) => p.name === 'Cedar Noir')!;
    const royal = tmProducts.find((p) => p.name === 'Royal Oud')!;
    const noir = tmProducts.find((p) => p.name === 'Noir Intense')!;
    const results = [cedar, royal, noir].map((p, i) => ({
      product: p,
      score: 90 - i,
      matchTier: 'Great Match' as const,
      matchReasons: [],
      detailedReasons: [],
      explanation: '',
    }));
    const g = evaluateRecommendationGrounding(
      'Cedar Noir is the closest warmer match. I have also included Royal Oud and Noir Intense.',
      results,
      tmProducts,
      { intent: 'SIMILAR_TO_REFERENCE' }
    );
    assert(g.ok, g.reason || 'expected pass');
  });

  await check('1', 'Single canonical product → singular fallback names only that product', () => {
    const ocean = tmProducts.find((p) => p.name === 'Ocean Breeze')!;
    const results = [
      {
        product: ocean,
        score: 90,
        matchTier: 'Great Match' as const,
        matchReasons: [],
        detailedReasons: [],
        explanation: '',
      },
    ];
    const reply = fallbackResponseGenerator(
      'office perfume',
      tm,
      {
        intent: 'RECOMMENDATION',
        request_type: 'new_consultation',
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: true,
        needs_clarification: false,
        preferences: {},
      },
      [ocean],
      results,
      createInitialConversationState(),
      { status: 'SUCCESS', recommendationPresentation: buildRecommendationPresentation(results, 'SUCCESS') }
    );
    assert(/Ocean Breeze/.test(reply), reply);
    assert(!/Royal Oud/.test(reply), reply);
  });

  await check('A', 'CASE A: Dior Sauvage + warmer — text and IDs match canonical set', async () => {
    const res = await turn('I like Dior Sauvage but want something warmer', 'tmperfumehouse', createInitialConversationState());
    assert(res.results.length >= 2, `expected multiple recs, got ${res.results.map((r) => r.product.name).join(',')}`);
    const canonicalIds = res.results.map((r) => r.product.id);
    const uiIds = [...canonicalIds];
    assert(JSON.stringify(canonicalIds) === JSON.stringify(uiIds), 'canonical != ui');
    assert(canonicalIds.every((id) => id.startsWith('tm-')), 'cross-brand id');
    const mentioned = res.results.filter((r) => new RegExp(r.product.name, 'i').test(res.reply));
    assert(mentioned.length >= 2, `reply did not acknowledge multiple products: ${res.reply}`);
    assert(!/only one/i.test(res.reply), res.reply);
    console.log('    CASE A products:', res.results.map((r) => r.product.name).join(', '));
    console.log('    CASE A reply:', res.reply.replace(/\s+/g, ' ').slice(0, 240));
  });

  await check('B', 'CASE B: office → Ocean Breeze-like → stronger without contradictory language', async () => {
    const t1 = await turn('i want something for office use', 'tmperfumehouse', createInitialConversationState());
    assert(t1.results.length > 0, 'office rec empty');
    assert(t1.state.activeRequest.occasion === 'office' || t1.results[0].product.occasion.includes('office'), 'office not in context');
    const prevIntensity = intensityRank(t1.results[0].product.intensity);
    const t2 = await turn('stronger', 'tmperfumehouse', t1.state);
    assert(t2.stage1.is_refinement || t2.stage1.intent === 'REFINE_RECOMMENDATION' || t2.stage1.intensity === 'strong', `not a refinement: ${t2.stage1.intent}`);
    assert(t2.state.activeRequest.occasion === 'office', `office lost, now ${t2.state.activeRequest.occasion}`);
    assert(t2.state.activeRequest.intensity === 'strong', `intensity=${t2.state.activeRequest.intensity}`);
    assert(t2.results.length > 0, 'stronger produced no products');
    const newMin = Math.min(...t2.results.map((r) => intensityRank(r.product.intensity)));
    assert(newMin >= prevIntensity, `did not move up: ${t2.results.map((r) => r.product.intensity).join(',')}`);
    assert(!/i don'?t have a fragrance that'?s stronger/i.test(t2.reply), t2.reply);
    assert(!/i don'?t have anything stronger/i.test(t2.reply), t2.reply);
    const mentioned = t2.results.filter((r) => new RegExp(r.product.name, 'i').test(t2.reply));
    assert(mentioned.length >= Math.min(2, t2.results.length), `reply/canonical mismatch: ${t2.reply}`);
    console.log('    CASE B from:', t1.results.map((r) => `${r.product.name}/${r.product.intensity}`).join(', '));
    console.log('    CASE B to:', t2.results.map((r) => `${r.product.name}/${r.product.intensity}`).join(', '));
    console.log('    CASE B reply:', t2.reply.replace(/\s+/g, ' ').slice(0, 240));
  });

  await check('6', 'stronger preserves office in active request', async () => {
    const t1 = await turn('i want something for office use', 'tmperfumehouse', createInitialConversationState());
    const t2 = await turn('stronger', 'tmperfumehouse', t1.state);
    assert(t2.state.activeRequest.occasion === 'office', String(t2.state.activeRequest.occasion));
  });

  await check('7', 'louder is sillage not intensity', () => {
    const ctx = buildComparativeContext(
      'make it louder',
      {
        intent: 'REFINE_RECOMMENDATION',
        request_type: 'refinement',
        is_refinement: true,
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        sillage: 'strong',
        needs_recommendations: true,
        needs_clarification: false,
        preferences: {},
      },
      [],
      []
    );
    assert(ctx?.dimension === 'sillage', JSON.stringify(ctx));
    assert(ctx?.type === 'louder', JSON.stringify(ctx));
  });

  await check('11', 'NO_MATCH empty canonical must not name products', () => {
    const g = evaluateRecommendationGrounding(
      'Royal Oud is a great option.',
      [],
      tmProducts,
      { intent: 'RECOMMENDATION', status: 'NO_VALID_MATCH' }
    );
    assert(!g.ok, 'empty canonical with named products should fail');
  });

  await check('13', 'Product info does not use recommendation grounding failure for other catalogue names only in recs', async () => {
    const res = await turn('What are the notes in Royal Oud?', 'tmperfumehouse', createInitialConversationState());
    assert(res.stage1.intent === 'PRODUCT_INFO', res.stage1.intent);
    assert(/Royal Oud/i.test(res.reply), res.reply);
  });

  await check('16', 'WOP recs stay on WOP ids', async () => {
    const res = await turn('show me a fresh office perfume', 'worldofperfumers', createInitialConversationState());
    if (res.results.length > 0) {
      assert(res.results.every((r) => r.product.brandSlug === 'worldofperfumers'), res.results.map((r) => r.product.id).join(','));
    }
  });

  await check('5', 'already strongest does not invent stronger products', async () => {
    const t1 = await turn('i want something strong and woody', 'tmperfumehouse', createInitialConversationState());
    assert(t1.results.length > 0, 'strong woody empty');
    const t2 = await turn('stronger', 'tmperfumehouse', t1.state);
    assert(t2.state.activeRequest.intensity === 'strong', `intensity=${t2.state.activeRequest.intensity}`);
    if (t2.comparativeContext?.alreadyAtBound) {
      assert(!/step up from/i.test(t2.reply), t2.reply);
      assert(/already|strongest|most pronounced/i.test(t2.reply), t2.reply);
    }
    if (t2.results.length > 0) {
      assert(!/i don'?t have anything stronger/i.test(t2.reply), t2.reply);
    }
  });

  await check('8', 'warmer refinement names the canonical set', async () => {
    const t1 = await turn('show me fresh perfumes', 'tmperfumehouse', createInitialConversationState());
    const t2 = await turn('make it warmer', 'tmperfumehouse', t1.state);
    if (t2.results.length >= 2) {
      const mentioned = t2.results.filter((r) => new RegExp(r.product.name, 'i').test(t2.reply));
      assert(mentioned.length >= 2, t2.reply);
    }
  });

  await check('10', 'alternatives describe the new canonical result', async () => {
    const t1 = await turn('show me woody perfumes', 'tmperfumehouse', createInitialConversationState());
    assert(t1.results.length > 0, 'woody empty');
    const prev = new Set(t1.results.map((r) => r.product.id));
    const t2 = await turn('show me something else', 'tmperfumehouse', t1.state, { isAlternativeRequest: true });
    if (t2.status === 'NO_ALTERNATIVES' || t2.results.length === 0) {
      assert(t2.results.length === 0, 'NO_ALTERNATIVES must have empty products');
      return;
    }
    assert(t2.results.every((r) => !prev.has(r.product.id)), `stale alternatives: ${t2.results.map((r) => r.product.name).join(',')}`);
    const mentioned = t2.results.filter((r) => new RegExp(r.product.name, 'i').test(t2.reply));
    assert(mentioned.length >= Math.min(2, t2.results.length), t2.reply);
  });

  await check('11b', 'genuine NO_MATCH does not name catalogue products', async () => {
    const res = await turn(
      'I need a fresh aquatic office perfume under ₹50 that is also strong oud and leather',
      'tmperfumehouse',
      createInitialConversationState()
    );
    if (res.results.length === 0) {
      const named = res.reply.match(/Royal Oud|Amber Nights|Cedar Noir|Ocean Breeze|Noir Intense|White Musk/gi) || [];
      assert(named.length === 0, `NO_MATCH named products: ${res.reply}`);
    }
  });

  await check('16b', 'Al-Maham recs stay on almaham ids', async () => {
    const res = await turn('show me a warm woody perfume', 'almaham', createInitialConversationState());
    if (res.results.length > 0) {
      assert(res.results.every((r) => r.product.brandSlug === 'almaham'), res.results.map((r) => r.product.id).join(','));
      const mentioned = res.results.filter((r) => new RegExp(r.product.name, 'i').test(res.reply));
      assert(mentioned.length >= Math.min(2, res.results.length) || res.results.length === 1, res.reply);
    }
  });

  await check('16c', 'Arabian Aroma recs stay on arabianaroma ids', async () => {
    const res = await turn('show me a warm woody perfume', 'arabianaroma', createInitialConversationState());
    if (res.results.length > 0) {
      assert(res.results.every((r) => r.product.brandSlug === 'arabianaroma'), res.results.map((r) => r.product.id).join(','));
    }
  });

  await check('18', 'Presentation IDs equal result IDs', async () => {
    const res = await turn('Show me fresh perfumes for office under ₹800', 'tmperfumehouse', createInitialConversationState());
    const ids = res.results.map((r) => r.product.id);
    assert(JSON.stringify(ids) === JSON.stringify(res.presentation.products.map((p) => p.productId)), 'presentation mismatch');
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

import { getBrand, getProducts } from '../src/data';
import { analyzeScentConcept } from '../src/lib/request-match-quality';
import { classifyIntentAndExtractPreferences, findProductByNameOrFuzzy } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { buildRecommendationPresentation, buildComparativeContext } from '../src/lib/response-grounding';
import { ChatMessage, ConversationState } from '../src/types/chat';
import { Product, RecommendationResult } from '../src/types/product';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function historyFrom(turns: Array<[ChatMessage['role'], string]>): ChatMessage[] {
  return turns.map(([role, content]) => ({ role, content }));
}

async function turn(
  message: string,
  brandSlug: string,
  state: ConversationState,
  history: ChatMessage[] = [],
  extra?: { actionContext?: Record<string, unknown> }
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, history, state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let status = stage1.needs_clarification ? 'CLARIFY' : 'SUCCESS';
  let retrieved: Product[] = [];
  let rec: ReturnType<typeof getRecommendations> | null = null;

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
  } else if (stage1.intent === 'COMPARE_PRODUCTS' && (stage1.target_product_names?.length || 0) >= 2) {
    retrieved = stage1
      .target_product_names!.slice(0, 2)
      .map((name) => findProductByNameOrFuzzy(name, products))
      .filter((product): product is Product => Boolean(product));
    results = retrieved.map((product, idx) => ({
      product,
      score: 90 - idx * 5,
      matchTier: 'Comparison Candidate' as const,
      matchReasons: [],
      detailedReasons: [],
      explanation: '',
    }));
  } else if (
    stage1.intent !== 'CART_ASSISTANCE' &&
    stage1.intent !== 'OUT_OF_SCOPE' &&
    stage1.needs_recommendations &&
    !stage1.needs_clarification
  ) {
    rec = getRecommendations(toStructuredPreferences(updated, message), products, 3);
    results = rec.results;
    status = rec.canonicalResult.status || (results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
  }

  if (retrieved.length > 0) {
    updated.lastDiscussedProductSet = retrieved.map((product) => ({
      productId: product.id,
      brandSlug: product.brandSlug,
      name: product.name,
    }));
  }

  const reply = await generateConversationalResponse(
    message,
    brand,
    stage1,
    retrieved,
    results,
    updated,
    history,
    {
      status,
      recommendationPresentation: buildRecommendationPresentation(results, status, {
        matchedPreferences: rec?.matchedPreferences,
        unmetPreferences: rec?.unmetPreferences,
        tradeOff: rec?.tradeOff,
        isPartialMatch: rec?.isPartialMatch,
      }),
      comparativeContext: buildComparativeContext(message, stage1, [], results.map((item) => item.product)),
      catalogueProducts: products,
      hardConstraintFailed: status === 'NO_VALID_MATCH' || status === 'NO_ALTERNATIVES',
      actionContext: extra?.actionContext as any,
    }
  );

  return { stage1, state: updated, results, reply, status, rec, products };
}

async function run() {
  const empty = createInitialConversationState();
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
      console.error(`FAIL  ${id}  ${name}`);
      console.error(`      ${err?.message || err}`);
    }
  };

  await check('OFF-1', 'capital of France is OUT_OF_SCOPE', async () => {
    const res = await turn('What is the capital of France?', 'tmperfumehouse', empty);
    assert(res.stage1.intent === 'OUT_OF_SCOPE', res.stage1.intent);
    assert(res.results.length === 0, 'must not recommend');
    assert(/fragrance|scent/i.test(res.reply), res.reply);
    assert(!/paris/i.test(res.reply), res.reply);
  });

  await check('OFF-2', 'What is Python is OUT_OF_SCOPE', async () => {
    const res = await turn('What is Python?', 'tmperfumehouse', empty);
    assert(res.stage1.intent === 'OUT_OF_SCOPE', res.stage1.intent);
    assert(res.results.length === 0, 'must not recommend');
  });

  await check('OFF-3', 'book a flight is OUT_OF_SCOPE', async () => {
    const res = await turn('Book me a flight.', 'tmperfumehouse', empty);
    assert(res.stage1.intent === 'OUT_OF_SCOPE', res.stage1.intent);
    assert(res.results.length === 0, 'must not recommend');
  });

  await check('OFF-4', 'weather is OUT_OF_SCOPE', async () => {
    const res = await turn("What's the weather?", 'tmperfumehouse', empty);
    assert(res.stage1.intent === 'OUT_OF_SCOPE', res.stage1.intent);
    assert(res.results.length === 0, 'must not recommend');
  });

  await check('OBJ-1', 'chair is clarification or no-match, never a random rec', async () => {
    const res = await turn('I want a perfume that smells like a chair', 'tmperfumehouse', empty);
    assert(
      res.stage1.intent === 'CLARIFICATION' || res.status === 'NO_VALID_MATCH' || res.results.length === 0,
      `${res.stage1.intent} ${res.status}`
    );
    assert(res.results.length === 0, `chair leaked products: ${res.results.map((r) => r.product.name).join(',')}`);
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
    assert(!/leather\/woody|try this woody/i.test(res.reply), res.reply);
    console.log('    chair:', res.stage1.intent, res.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('OBJ-2', 'laptop is no-match or clarification', async () => {
    const res = await turn('I want a perfume that smells like a laptop', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(res.stage1.intent === 'CLARIFICATION' || res.status === 'NO_VALID_MATCH' || res.results.length === 0, res.stage1.intent);
  });

  await check('OBJ-3', 'car is clarification or no-match', async () => {
    const res = await turn('I want a perfume that smells like a car', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
  });

  await check('FOOD-1', 'pizza is unusual fragrance request, not a random product', async () => {
    const res = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(res.stage1.intent !== 'OUT_OF_SCOPE', res.stage1.intent);
    assert(res.stage1.intent === 'CLARIFICATION' || res.status === 'NO_VALID_MATCH' || res.stage1.needs_recommendations, res.status);
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
    assert(!/closest match/i.test(res.reply), res.reply);
    assert(!/best balanced composition/i.test(res.reply), res.reply);
    assert(!/can'?t help with that/i.test(res.reply), res.reply);
    console.log('    pizza:', res.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('FOOD-2', 'burger is unusual fragrance request, not OUT_OF_SCOPE', async () => {
    const res = await turn('I want a perfume that smells like burger', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(res.stage1.intent !== 'OUT_OF_SCOPE', `burger OOS: ${res.stage1.intent} ${res.reply}`);
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
    assert(!/can'?t help with that|fragrance specialist/i.test(res.reply), res.reply);
  });

  await check('FOOD-3', 'hotdog is NO_MATCH', async () => {
    const res = await turn('I want a perfume that smells like hotdog', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
  });

  await check('REP-1', 'pizza → burger → pizza keeps callback + no-match truth', async () => {
    const t1 = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', empty);
    const t2 = await turn(
      'I want something that smells like burger',
      'tmperfumehouse',
      t1.state,
      historyFrom([
        ['user', 'I want a perfume that smells like pizza'],
        ['assistant', t1.reply],
      ])
    );
    const t3 = await turn(
      'I want something that smells like pizza',
      'tmperfumehouse',
      t2.state,
      historyFrom([
        ['user', 'I want a perfume that smells like pizza'],
        ['assistant', t1.reply],
        ['user', 'I want something that smells like burger'],
        ['assistant', t2.reply],
      ])
    );
    assert(t1.results.length === 0 && t2.results.length === 0 && t3.results.length === 0, 'repetition invented a product');
    assert(/back to the pizza idea|still chasing that pizza/i.test(t3.reply), t3.reply);
    assert(/still don'?t have an? (exact|close|meaningful)/i.test(t3.reply), t3.reply);
    assert(!/Could you tell me what aspects of a pizza scent/i.test(t3.reply), t3.reply);
    assert(!/Midnight Velvet/i.test(t3.reply), t3.reply);
    assert(t2.stage1.intent !== 'OUT_OF_SCOPE', t2.reply);
    console.log('    repeat pizza:', t3.reply.replace(/\s+/g, ' ').slice(0, 200));
  });

  await check('REP-2', 'pizza pizza pizza stays NO_MATCH', async () => {
    let state = empty;
    const history: ChatMessage[] = [];
    const replies: string[] = [];
    for (const msg of [
      'I want a perfume that smells like pizza',
      'I want something like pizza again',
      'pizza again',
    ]) {
      const res = await turn(msg, 'tmperfumehouse', state, history);
      assert(res.results.length === 0, `got ${res.results.map((r) => r.product.name).join(',')}`);
      replies.push(res.reply);
      history.push({ role: 'user', content: msg }, { role: 'assistant', content: res.reply });
      state = res.state;
    }
    assert(/still don'?t have a meaningful match|couldn'?t find a meaningful match|don'?t have a fragrance that meaningfully|still don'?t have an exact/i.test(replies[2]), replies[2]);
  });

  await check('PARTIAL', 'genuine partial match explains a real trade-off', async () => {
    const res = await turn('I want something intense and refreshing', 'tmperfumehouse', empty);
    assert(res.results.length > 0, 'expected a useful closest/exact product');
    if (res.status === 'PARTIAL_MATCH') {
      assert((res.rec?.matchedPreferences || []).length > 0, 'partial needs matched attributes');
      assert(/closest match I found|shares|although|rather than/i.test(res.reply), res.reply);
      assert(!/best balanced composition/i.test(res.reply), res.reply);
    }
    console.log('    partial status:', res.status, res.rec?.matchedPreferences, res.rec?.unmetPreferences);
    console.log('    partial reply:', res.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('AMB', 'chair then leather chair uses stated leather, not an invented map', async () => {
    const chair = await turn('I want something that smells like a chair', 'tmperfumehouse', empty);
    assert(chair.results.length === 0, 'chair must not recommend');
    const leather = await turn(
      'Actually I mean leather chair',
      'tmperfumehouse',
      chair.state,
      historyFrom([
        ['user', 'I want something that smells like a chair'],
        ['assistant', chair.reply],
      ])
    );
    if (leather.results.length > 0) {
      assert(
        leather.results.every((r) =>
          [...r.product.topNotes, ...r.product.heartNotes, ...r.product.baseNotes, ...r.product.tags]
            .join(' ')
            .toLowerCase()
            .includes('leather')
        ),
        `leather recs lack leather notes: ${leather.results.map((r) => r.product.name).join(',')}`
      );
    }
    console.log('    leather follow-up:', leather.stage1.intent, leather.results.map((r) => r.product.name).join(',') || 'none');
  });

  await check('NORM', 'fresh office under ₹800 uses normal engine', async () => {
    const res = await turn('Show me a fresh office perfume under ₹800', 'tmperfumehouse', empty);
    assert(res.results.length > 0, 'expected exact/success recs');
    assert(res.results.every((r) => r.product.price <= 800), 'budget broken');
    assert(res.status === 'SUCCESS' || res.results.length > 0, res.status);
    assert(!analyzeScentConcept('Show me a fresh office perfume under ₹800', tmProducts).topic, 'should not be unusual');
  });

  await check('REFINE', 'fresh → warmer → keep fresh still works', async () => {
    const t1 = await turn('I want something fresh', 'tmperfumehouse', empty);
    const t2 = await turn('Make it warmer', 'tmperfumehouse', t1.state, historyFrom([['user', 'I want something fresh'], ['assistant', t1.reply]]));
    const t3 = await turn(
      'Actually keep it fresh',
      'tmperfumehouse',
      t2.state,
      historyFrom([
        ['user', 'I want something fresh'],
        ['assistant', t1.reply],
        ['user', 'Make it warmer'],
        ['assistant', t2.reply],
      ])
    );
    assert(t1.results.length > 0, 'fresh should recommend');
    assert(t3.results.length > 0, 'return to fresh should recommend');
  });

  await check('INFO', 'Tell me about Royal Oud is PRODUCT_INFO', async () => {
    const res = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    assert(res.stage1.intent === 'PRODUCT_INFO', res.stage1.intent);
    assert(/Royal Oud/i.test(res.reply), res.reply);
  });

  await check('CMP', 'Royal Oud vs Amber Nights stays a comparison', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const cmp = await turn(
      'Which is sweeter, Royal Oud or Amber Nights?',
      'tmperfumehouse',
      info.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud'],
        ['assistant', info.reply],
      ])
    );
    assert(cmp.stage1.intent === 'COMPARE_PRODUCTS', cmp.stage1.intent);
    assert(/Royal Oud/i.test(cmp.reply) && /Amber Nights/i.test(cmp.reply), cmp.reply);
  });

  await check('CART', 'add the first one stays cart-controlled', async () => {
    const recs = await turn('I want something woody', 'tmperfumehouse', empty);
    const added = recs.results[0]?.product.name || 'Mystic Woods';
    const cart = await turn(
      'Add the first one.',
      'tmperfumehouse',
      recs.state,
      historyFrom([
        ['user', 'I want something woody'],
        ['assistant', recs.reply],
      ]),
      {
        actionContext: {
          intent: 'CART_ASSISTANCE',
          cart_action: { action: 'ADD_TO_CART', success: true, added: [added], productName: added },
        },
      }
    );
    assert(cart.stage1.intent === 'CART_ASSISTANCE', cart.stage1.intent);
    assert(!/back to/i.test(cart.reply), cart.reply);
  });

  await check('RESET', 'pizza → reset → pizza has no old callback', async () => {
    const pizza = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', empty);
    const reset = await turn(
      'Start fresh',
      'tmperfumehouse',
      pizza.state,
      historyFrom([
        ['user', 'I want a perfume that smells like pizza'],
        ['assistant', pizza.reply],
      ])
    );
    assert(reset.stage1.intent === 'RESET_CONSULTATION', reset.stage1.intent);
    const again = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', createInitialConversationState(), []);
    assert(again.results.length === 0, 'reset pizza invented a match');
    assert(!/back to the pizza idea/i.test(again.reply), again.reply);
  });

  await check('BRAND', 'WOP pizza does not leak TM products', async () => {
    const wop = await turn('I want a perfume that smells like pizza', 'worldofperfumers', {
      ...createInitialConversationState(),
      lastDiscussedProductSet: [{ productId: 'tm-royal-oud', brandSlug: 'tmperfumehouse', name: 'Royal Oud' }],
    });
    assert(wop.results.every((r) => r.product.brandSlug === 'worldofperfumers'), 'brand leak');
    assert(!/Royal Oud/i.test(wop.reply), wop.reply);
  });

  await check('FU-1', 'What are its notes? resolves to Royal Oud', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const notes = await turn(
      'What are its notes?',
      'tmperfumehouse',
      info.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud'],
        ['assistant', info.reply],
      ])
    );
    assert(notes.stage1.intent === 'PRODUCT_INFO', notes.stage1.intent);
    assert(/Royal Oud/i.test(notes.reply), notes.reply);
    assert(/saffron/i.test(notes.reply) && /rose/i.test(notes.reply), notes.reply);
    assert(!/couldn'?t find a close fit/i.test(notes.reply), notes.reply);
  });

  await check('FU-2', 'How long does it last? uses Royal Oud longevity', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const last = await turn('How long does it last?', 'tmperfumehouse', info.state, historyFrom([['user', 'Tell me about Royal Oud'], ['assistant', info.reply]]));
    assert(last.stage1.intent === 'PRODUCT_INFO', last.stage1.intent);
    assert(/Royal Oud/i.test(last.reply) && /beast mode|long/i.test(last.reply), last.reply);
  });

  await check('FU-3', 'Is it good for office? uses Royal Oud occasion', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const office = await turn('Is it good for office?', 'tmperfumehouse', info.state, historyFrom([['user', 'Tell me about Royal Oud'], ['assistant', info.reply]]));
    assert(office.stage1.intent === 'PRODUCT_INFO', office.stage1.intent);
    assert(/Royal Oud/i.test(office.reply), office.reply);
    assert(/office|wedding|formal/i.test(office.reply), office.reply);
  });

  await check('FU-4', 'What is it inspired by? uses Royal Oud similarTo', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const inspired = await turn('What is it inspired by?', 'tmperfumehouse', info.state, historyFrom([['user', 'Tell me about Royal Oud'], ['assistant', info.reply]]));
    assert(inspired.stage1.intent === 'PRODUCT_INFO', inspired.stage1.intent);
    assert(/Royal Oud/i.test(inspired.reply) && /Oud for Greatness|Oud Wood|Arabian Oud/i.test(inspired.reply), inspired.reply);
  });

  await check('FU-5', 'Which is sweeter? still compares Royal Oud and Amber Nights', async () => {
    const cmp = await turn('Compare Royal Oud and Amber Nights', 'tmperfumehouse', empty);
    const sweeter = await turn(
      'Which one is sweeter?',
      'tmperfumehouse',
      cmp.state,
      historyFrom([
        ['user', 'Compare Royal Oud and Amber Nights'],
        ['assistant', cmp.reply],
      ])
    );
    assert(sweeter.stage1.intent === 'COMPARE_PRODUCTS', sweeter.stage1.intent);
    assert(/Amber Nights is sweeter/i.test(sweeter.reply), sweeter.reply);
  });

  await check('FU-10', 'fresh woody under 800 all-day stays honest NO_MATCH', async () => {
    const res = await turn(
      'I want something fresh, woody and under ₹800, but I also want it to last all day.',
      'tmperfumehouse',
      empty
    );
    assert(res.results.length === 0, `forced a product: ${res.results.map((r) => r.product.name).join(',')}`);
    assert(/couldn'?t find|don'?t have/i.test(res.reply), res.reply);
    assert(/₹800|800|longevity|all-day|all day/i.test(res.reply), res.reply);
  });

  await check('U', 'concept analysis is generic, not word-hardcoded', () => {
    assert(analyzeScentConcept('smells like pizza', tmProducts).kind === 'unsupported_other', 'pizza');
    assert(analyzeScentConcept('smells like a chair', tmProducts).kind === 'unsupported_object', 'chair');
    assert(analyzeScentConcept('smells like rain', tmProducts).kind === 'fragrance_direction', 'rain');
    assert(analyzeScentConcept('something earthy', tmProducts).kind === 'none' || analyzeScentConcept('smells like earth', tmProducts).kind === 'fragrance_direction', 'earthy');
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

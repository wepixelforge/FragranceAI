import { getBrand, getProducts } from '../src/data';
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
  history: ChatMessage[] = []
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

  const reply = await generateConversationalResponse(message, brand, stage1, retrieved, results, updated, history, {
    status,
    recommendationPresentation: buildRecommendationPresentation(results, status, {
      matchedPreferences: rec?.matchedPreferences,
      unmetPreferences: rec?.unmetPreferences,
      tradeOff: rec?.tradeOff,
      isPartialMatch: rec?.isPartialMatch,
    }),
    comparativeContext: buildComparativeContext(message, stage1, [], results.map((item) => item.product)),
    catalogueProducts: products,
    hardConstraintFailed: rec?.hardConstraintFailed || status === 'NO_VALID_MATCH',
  });

  return { stage1, state: updated, results, reply, status };
}

async function run() {
  const empty = createInitialConversationState();
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

  await check('TEST 1', 'Tell me about Royal Oud → What are its notes?', async () => {
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
    assert(notes.stage1.target_product_names?.[0] === 'Royal Oud', String(notes.stage1.target_product_names));
    assert(/Royal Oud/i.test(notes.reply) && /saffron/i.test(notes.reply) && /oud/i.test(notes.reply), notes.reply);
    assert(!/couldn'?t find a close fit/i.test(notes.reply), notes.reply);
    console.log('    ', notes.reply);
  });

  await check('TEST 2', 'How long does it last? → Royal Oud longevity', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const last = await turn(
      'How long does it last?',
      'tmperfumehouse',
      info.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud'],
        ['assistant', info.reply],
      ])
    );
    assert(last.stage1.intent === 'PRODUCT_INFO', last.stage1.intent);
    assert(/Royal Oud/i.test(last.reply) && /beast mode/i.test(last.reply), last.reply);
    console.log('    ', last.reply);
  });

  await check('TEST 3', 'Is it good for office? → Royal Oud occasion', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const office = await turn(
      'Is it good for office?',
      'tmperfumehouse',
      info.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud'],
        ['assistant', info.reply],
      ])
    );
    assert(office.stage1.intent === 'PRODUCT_INFO', office.stage1.intent);
    assert(/Royal Oud/i.test(office.reply), office.reply);
    assert(/wedding|formal|office/i.test(office.reply), office.reply);
    console.log('    ', office.reply);
  });

  await check('TEST 4', 'What is it inspired by? → Royal Oud similarTo', async () => {
    const info = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty);
    const inspired = await turn(
      'What is it inspired by?',
      'tmperfumehouse',
      info.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud'],
        ['assistant', info.reply],
      ])
    );
    assert(inspired.stage1.intent === 'PRODUCT_INFO', inspired.stage1.intent);
    assert(/inspired by/i.test(inspired.reply), inspired.reply);
    assert(/Oud for Greatness|Oud Wood|Arabian Oud/i.test(inspired.reply), inspired.reply);
    console.log('    ', inspired.reply);
  });

  await check('TEST 5', 'Compare then which is sweeter → Amber Nights', async () => {
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
    console.log('    ', sweeter.reply);
  });

  await check('TEST 6', 'pizza → burger → pizza again: callback, no OOS, no fake product', async () => {
    const t1 = await turn('I want something that smells like pizza', 'tmperfumehouse', empty);
    const t2 = await turn(
      'I want something that smells like burger',
      'tmperfumehouse',
      t1.state,
      historyFrom([
        ['user', 'I want something that smells like pizza'],
        ['assistant', t1.reply],
      ])
    );
    const t3 = await turn(
      'I want something that smells like pizza again',
      'tmperfumehouse',
      t2.state,
      historyFrom([
        ['user', 'I want something that smells like pizza'],
        ['assistant', t1.reply],
        ['user', 'I want something that smells like burger'],
        ['assistant', t2.reply],
      ])
    );
    assert(t1.results.length === 0 && t2.results.length === 0 && t3.results.length === 0, 'invented a product');
    assert(t2.stage1.intent !== 'OUT_OF_SCOPE', t2.reply);
    assert(!/can'?t help with that/i.test(t2.reply), t2.reply);
    assert(/back to the pizza idea/i.test(t3.reply), t3.reply);
    assert(/still don'?t have an exact pizza/i.test(t3.reply), t3.reply);
    assert(!/Midnight Velvet/i.test(`${t1.reply} ${t2.reply} ${t3.reply}`), t3.reply);
    console.log('    pizza1:', t1.reply.replace(/\s+/g, ' ').slice(0, 160));
    console.log('    burger:', t2.reply.replace(/\s+/g, ' ').slice(0, 160));
    console.log('    pizza3:', t3.reply.replace(/\s+/g, ' ').slice(0, 200));
  });

  await check('TEST 7', 'hotdog does not fabricate a product', async () => {
    const res = await turn('I want something that smells like hotdog', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(res.stage1.intent !== 'OUT_OF_SCOPE', res.stage1.intent);
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
    console.log('    ', res.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 8', 'chair is clarification or no-match, not leather/woody', async () => {
    const res = await turn('I want something that smells like chair', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(res.stage1.intent === 'CLARIFICATION' || res.status === 'NO_VALID_MATCH' || res.results.length === 0, res.stage1.intent);
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
    assert(!/automatically|mapped to leather|try this woody/i.test(res.reply), res.reply);
    console.log('    ', res.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 9', 'car asks a useful clarification, no random product', async () => {
    const res = await turn('I want something that smells like a car', 'tmperfumehouse', empty);
    assert(res.results.length === 0, res.results.map((r) => r.product.name).join(','));
    assert(res.stage1.intent === 'CLARIFICATION' || res.status === 'NO_VALID_MATCH', res.stage1.intent);
    assert(/when you say a 'car' scent|materials|interior|atmosphere|overall/i.test(res.reply), res.reply);
    assert(!/Midnight Velvet/i.test(res.reply), res.reply);
    console.log('    ', res.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 10', 'fresh woody under ₹800 all-day stays honest NO_MATCH', async () => {
    const res = await turn(
      'I want something fresh, woody and under ₹800, but I also want it to last all day.',
      'tmperfumehouse',
      empty
    );
    assert(res.results.length === 0, `forced a product: ${res.results.map((r) => r.product.name).join(',')}`);
    assert(/couldn'?t find|don'?t have/i.test(res.reply), res.reply);
    assert(!/Midnight Velvet/i.test(res.reply) || /couldn'?t find/i.test(res.reply), res.reply);
    console.log('    ', res.reply.replace(/\s+/g, ' ').slice(0, 220));
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

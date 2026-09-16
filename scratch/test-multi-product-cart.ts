import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { createInitialConversationState } from '../src/lib/state-manager';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import {
  extractCartProductReferences,
  normalizeProductReferencesList,
  resolveCartProductReferences,
  buildCartActionPayload,
  toCanonicalProductSet,
} from '../src/lib/cart-action-resolver';
import { ConversationState } from '../src/types/chat';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function tmStateWithRecs(names: string[]): ConversationState {
  const products = getProducts('tmperfumehouse');
  const matched = names.map((name) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`Missing TM product ${name}`);
    return p;
  });
  const state = createInitialConversationState();
  state.lastRecommendationIds = matched.map((p) => p.id);
  state.lastCanonicalProductSet = toCanonicalProductSet(matched, 'tmperfumehouse');
  state.lastDiscussedProductSet = [...state.lastCanonicalProductSet];
  return state;
}

async function run() {
  const tm = getBrand('tmperfumehouse')!;
  const wop = getBrand('worldofperfumers')!;
  const tmProducts = getProducts('tmperfumehouse');
  const wopProducts = getProducts('worldofperfumers');
  const rec3 = tmStateWithRecs(['Fresh Linen', 'Ocean Breeze', 'White Musk']);

  let passed = 0;
  let failed = 0;
  const results: { id: string; name: string; pass: boolean; detail?: string }[] = [];

  const check = (id: string, name: string, fn: () => void | Promise<void>) => {
    return Promise.resolve()
      .then(fn)
      .then(() => {
        passed++;
        results.push({ id, name, pass: true });
        console.log(`PASS  ${id}  ${name}`);
      })
      .catch((err) => {
        failed++;
        results.push({ id, name, pass: false, detail: err.message });
        console.log(`FAIL  ${id}  ${name}  → ${err.message}`);
      });
  };

  await check('1', 'Add Royal Oud to my cart → 1 product', async () => {
    const stage1 = await classifyIntentAndExtractPreferences(
      'Add Royal Oud to my cart.',
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(stage1.intent === 'CART_ASSISTANCE', `intent ${stage1.intent}`);
    const refs = normalizeProductReferencesList(stage1.product_references, 'Add Royal Oud to my cart.', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
    });
    assert(resolved.resolved.length === 1, `got ${resolved.resolved.map((p) => p.name).join(',')}`);
    assert(resolved.resolved[0].name === 'Royal Oud', resolved.resolved[0].name);
  });

  await check('2', 'Add Ocean Breeze and White Musk → 2 products', async () => {
    const msg = 'Add Ocean Breeze and White Musk to my cart.';
    const stage1 = await classifyIntentAndExtractPreferences(msg, tm, tmProducts, [], rec3);
    assert(stage1.intent === 'CART_ASSISTANCE', `intent ${stage1.intent}`);
    const refs = normalizeProductReferencesList(stage1.product_references, msg, tmProducts);
    assert(refs.length === 2, `refs=${JSON.stringify(refs)}`);
    assert(!refs.some((r) => /ocean breeze and white musk/i.test(r)), 'combined name leaked');
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: rec3,
    });
    assert(resolved.resolved.map((p) => p.name).sort().join(',') === 'Ocean Breeze,White Musk', resolved.resolved.map((p) => p.name).join(','));
  });

  await check('3', 'Commas → 3 products', () => {
    const refs = extractCartProductReferences('Add Ocean Breeze, White Musk and Fresh Linen.', tmProducts);
    assert(refs.length === 3, JSON.stringify(refs));
  });

  await check('4', 'Add all 3 against latest recommendation', async () => {
    const msg = 'add all 3 in the cart';
    const stage1 = await classifyIntentAndExtractPreferences(msg, tm, tmProducts, [], rec3);
    assert(stage1.intent === 'CART_ASSISTANCE', `intent ${stage1.intent}`);
    const refs = normalizeProductReferencesList(stage1.product_references, msg, tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: rec3,
    });
    assert(resolved.needsClarification === false, 'clarified unexpectedly');
    assert(resolved.resolved.length === 3, `got ${resolved.resolved.map((p) => p.name).join(',')}`);
    assert(resolved.resolved.map((p) => p.name).join(',') === 'Fresh Linen,Ocean Breeze,White Musk', resolved.resolved.map((p) => p.name).join(','));
    const payload = buildCartActionPayload(resolved, 'tmperfumehouse');
    assert(payload?.items?.length === 3, `payload items ${payload?.items?.length}`);
    assert(payload?.items?.every((i) => i.brandSlug === 'tmperfumehouse'), 'brand leak');
  });

  await check('5', 'Add all of them → 3 products', () => {
    const refs = extractCartProductReferences('Add all of them.', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: rec3,
    });
    assert(resolved.resolved.length === 3, JSON.stringify(resolved.resolved.map((p) => p.name)));
  });

  await check('6', 'Add 1 and 3 → Fresh Linen + White Musk', () => {
    const refs = extractCartProductReferences('add 1 and 3', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: rec3,
    });
    assert(resolved.resolved.map((p) => p.name).join(',') === 'Fresh Linen,White Musk', resolved.resolved.map((p) => p.name).join(','));
  });

  await check('7', 'Add the first two', () => {
    const refs = extractCartProductReferences('Add the first two.', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: rec3,
    });
    assert(resolved.resolved.map((p) => p.name).join(',') === 'Fresh Linen,Ocean Breeze', resolved.resolved.map((p) => p.name).join(','));
  });

  await check('8', 'Add both with 2-product context', () => {
    const two = tmStateWithRecs(['Ocean Breeze', 'White Musk']);
    const refs = extractCartProductReferences('Add both.', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: two,
    });
    assert(resolved.resolved.length === 2, JSON.stringify(resolved.resolved.map((p) => p.name)));
  });

  await check('9', 'Add this → Royal Oud from product page', () => {
    const refs = extractCartProductReferences('Add this to cart.', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      contextProductSlug: 'royal-oud',
    });
    assert(resolved.resolved.length === 1 && resolved.resolved[0].name === 'Royal Oud', resolved.resolved[0]?.name);
  });

  await check('10', 'Named pair is NOT one combined product', () => {
    const msg = 'Add Ocean Breeze and White Musk.';
    const refs = extractCartProductReferences(msg, tmProducts);
    assert(refs.length === 2, JSON.stringify(refs));
    const resolved = resolveCartProductReferences({
      references: ['Ocean Breeze and White Musk'],
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
    });
    assert(resolved.resolved.length === 2, `combined lookup returned ${resolved.resolved.map((p) => p.name)}`);
    assert(!resolved.resolved.some((p) => /and/i.test(p.name)), 'invented combined product');
  });

  await check('11', 'Partial success: valid added, invalid failed', () => {
    const refs = extractCartProductReferences(
      'Add Ocean Breeze, White Musk and Invisible Rose to my cart.',
      tmProducts
    );
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
    });
    assert(resolved.resolved.map((p) => p.name).sort().join(',') === 'Ocean Breeze,White Musk', resolved.resolved.map((p) => p.name).join(','));
    assert(resolved.failed.some((f) => /invisible rose/i.test(f.reference)), JSON.stringify(resolved.failed));
    const reply = fallbackResponseGenerator(
      'Add Ocean Breeze, White Musk and Invisible Rose to my cart.',
      tm,
      {
        intent: 'CART_ASSISTANCE',
        request_type: 'other',
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: false,
        needs_clarification: false,
        preferences: {},
      },
      [],
      [],
      rec3,
      {
        actionContext: {
          intent: 'CART_ASSISTANCE',
          cart_action: {
            action: 'ADD_TO_CART',
            success: false,
            added: resolved.resolved.map((p) => p.name),
            failed: resolved.failed.map((f) => f.reference),
            partial: true,
          },
        },
      }
    );
    assert(/Ocean Breeze/i.test(reply) && /White Musk/i.test(reply), reply);
    assert(/Invisible Rose/i.test(reply), reply);
    assert(!/\/tmperfumehouse\/cart/.test(reply), reply);
  });

  await check('12', 'Ambiguous all 3 with no context → clarify, nothing added', () => {
    const refs = extractCartProductReferences('add all 3 in the cart', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state: createInitialConversationState(),
    });
    assert(resolved.needsClarification === true, 'should clarify');
    assert(resolved.resolved.length === 0, 'should add nothing');
    assert(buildCartActionPayload(resolved, 'tmperfumehouse') === undefined, 'payload should be empty');
  });

  await check('13', 'WOP add all 3 does not resolve TM products', () => {
    const wopSet = wopProducts.slice(0, 3);
    const state = createInitialConversationState();
    state.lastCanonicalProductSet = toCanonicalProductSet(wopSet, 'worldofperfumers');
    state.lastRecommendationIds = wopSet.map((p) => p.id);
    const resolved = resolveCartProductReferences({
      references: ['ALL:3'],
      action: 'ADD_TO_CART',
      brandProducts: wopProducts,
      brandSlug: 'worldofperfumers',
      state,
    });
    assert(resolved.resolved.length === 3, String(resolved.resolved.length));
    assert(resolved.resolved.every((p) => p.brandSlug === 'worldofperfumers'), 'cross-brand product');
    const tmResolved = resolveCartProductReferences({
      references: ['ALL:3'],
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      state,
    });
    assert(tmResolved.resolved.length === 0 || tmResolved.needsClarification, 'TM should not inherit WOP recs');
  });

  await check('14', 'TM product resolution ignored on WOP catalogue', () => {
    const refs = extractCartProductReferences('Add Royal Oud to my cart', wopProducts);
    const resolved = resolveCartProductReferences({
      references: refs.length ? refs : ['Royal Oud'],
      action: 'ADD_TO_CART',
      brandProducts: wopProducts,
      brandSlug: 'worldofperfumers',
    });
    assert(!resolved.resolved.some((p) => p.name === 'Royal Oud'), 'Royal Oud leaked into WOP');
  });

  await check('15-17', 'Payload uses productId+brandSlug not display name', () => {
    const resolved = resolveCartProductReferences({
      references: ['Ocean Breeze', 'White Musk', 'Fresh Linen'],
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
    });
    const payload = buildCartActionPayload(resolved, 'tmperfumehouse')!;
    assert(payload.items?.length === 3, 'expected 3 cart lines');
    for (const item of payload.items!) {
      const live = tmProducts.find((p) => p.id === item.productId);
      assert(Boolean(live), `missing id ${item.productId}`);
      assert(item.brandSlug === 'tmperfumehouse', item.brandSlug);
      assert(item.productId !== item.productName, 'used name as id');
    }
  });

  await check('18', 'Remove multiple products', () => {
    const refs = extractCartProductReferences('Remove Ocean Breeze and White Musk from my cart', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'REMOVE_FROM_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
    });
    assert(resolved.resolved.length === 2, JSON.stringify(resolved.resolved.map((p) => p.name)));
    const payload = buildCartActionPayload(resolved, 'tmperfumehouse');
    assert(payload?.action === 'REMOVE_FROM_CART', String(payload?.action));
    assert(payload?.removed?.length === 2, String(payload?.removed?.length));
  });

  await check('19', 'Duplicate product request keeps two add operations', () => {
    const refs = extractCartProductReferences('Add Ocean Breeze and Ocean Breeze to my cart', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'ADD_TO_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
    });
    assert(resolved.resolved.length === 2, `qty semantics: ${resolved.resolved.length}`);
    assert(resolved.resolved.every((p) => p.id === resolved.resolved[0].id), 'different products');
  });

  await check('20', 'LLM/fallback response matches actual action result', () => {
    const reply = fallbackResponseGenerator(
      'add all 3 in the cart',
      tm,
      {
        intent: 'CART_ASSISTANCE',
        request_type: 'other',
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: false,
        needs_clarification: false,
        preferences: {},
      },
      [],
      [],
      rec3,
      {
        actionContext: {
          intent: 'CART_ASSISTANCE',
          cart_action: {
            action: 'ADD_TO_CART',
            success: true,
            added: ['Fresh Linen', 'Ocean Breeze', 'White Musk'],
            failed: [],
          },
        },
      }
    );
    assert(/Fresh Linen/i.test(reply) && /Ocean Breeze/i.test(reply) && /White Musk/i.test(reply), reply);
    assert(!/\/tmperfumehouse\/cart/.test(reply), 'raw route leaked');
  });

  await check('R1', 'Purchase intent stays purchase for multi-product buy', async () => {
    const stage1 = await classifyIntentAndExtractPreferences(
      'I want to buy Ocean Breeze and White Musk.',
      tm,
      tmProducts,
      [],
      rec3
    );
    assert(stage1.intent === 'PURCHASE_ASSISTANCE', `got ${stage1.intent}`);
    assert((stage1.product_references || stage1.target_product_names || []).length >= 2, JSON.stringify(stage1.product_references));
  });

  await check('R2', 'Single-product add still CART_ASSISTANCE', async () => {
    const stage1 = await classifyIntentAndExtractPreferences(
      'Add Royal Oud to my cart',
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(stage1.intent === 'CART_ASSISTANCE', stage1.intent);
    assert(stage1.needs_recommendations === false, 'should not recommend');
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

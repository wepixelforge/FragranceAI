import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { createInitialConversationState, updateConversationState } from '../src/lib/state-manager';
import { fallbackResponseGenerator, generateConversationalResponse } from '../src/lib/response-generator';
import {
  buildLiveCartContext,
  serializeCartRequestPayload,
  toResponseCartContext,
} from '../src/lib/live-cart-context';
import { formatPrice, STOREFRONT_CURRENCY } from '../src/lib/brand-utils';
import { isExplicitCartActionQuery, inferCartActionType } from '../src/lib/cart-action-resolver';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function tmIds(names: string[]) {
  const products = getProducts('tmperfumehouse');
  return names.map((name) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`missing ${name}`);
    return { productId: p.id, brandSlug: 'tmperfumehouse' as const, quantity: 1, product: p };
  });
}

async function run() {
  const tm = getBrand('tmperfumehouse')!;
  const wop = getBrand('worldofperfumers')!;
  const tmProducts = getProducts('tmperfumehouse');
  const wopProducts = getProducts('worldofperfumers');
  const trio = tmIds(['Ocean Breeze', 'Fresh Linen', 'White Musk']);

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

  await check('1', 'Empty cart question routes to VIEW_CART', async () => {
    const stage1 = await classifyIntentAndExtractPreferences(
      "What's in my cart?",
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(stage1.intent === 'CART_ASSISTANCE', stage1.intent);
    assert(stage1.cart_action === 'VIEW_CART', String(stage1.cart_action));
    assert(stage1.needs_recommendations === false, 'must not recommend');
  });

  await check('1b', 'Subtotal / how much cart questions route to VIEW_CART', () => {
    for (const q of ['How much is my cart?', "What's my subtotal?", 'Do I have anything in my cart?']) {
      assert(isExplicitCartActionQuery(q, tmProducts), `${q} not gated`);
      assert(inferCartActionType(q) === 'VIEW_CART', `${q} → ${inferCartActionType(q)}`);
    }
    assert(!isExplicitCartActionQuery('How much is Ocean Breeze?', tmProducts), 'product price must not be a cart gate');
  });

  await check('2', 'Live cart of 3 products uses ₹1,597', () => {
    const payload = serializeCartRequestPayload(
      'tmperfumehouse',
      trio.map((t) => ({ productId: t.productId, brandSlug: t.brandSlug, quantity: 1 }))
    );
    const live = buildLiveCartContext('tmperfumehouse', payload);
    assert(live.itemCount === 3, String(live.itemCount));
    assert(live.subtotal === 649 + 399 + 549, String(live.subtotal));
    assert(live.subtotalFormatted === formatPrice(1597), live.subtotalFormatted);
    assert(live.subtotalFormatted.includes('₹'), live.subtotalFormatted);
    assert(!live.subtotalFormatted.includes('$'), live.subtotalFormatted);
    assert(live.currency.code === 'INR', live.currency.code);
    assert(live.items.every((i) => i.brandSlug === 'tmperfumehouse'), 'brand leak');
  });

  await check('3', 'REQUIRED: add 3 → manual delete all → AI cart is empty', async () => {
    const added = serializeCartRequestPayload(
      'tmperfumehouse',
      trio.map((t) => ({ productId: t.productId, brandSlug: t.brandSlug, quantity: 1 }))
    );
    const afterAdd = buildLiveCartContext('tmperfumehouse', added);
    assert(afterAdd.isEmpty === false && afterAdd.itemCount === 3, 'setup add failed');

    const afterManualDelete = serializeCartRequestPayload('tmperfumehouse', []);
    const live = buildLiveCartContext('tmperfumehouse', afterManualDelete);
    assert(live.isEmpty === true, 'not empty');
    assert(live.itemCount === 0, String(live.itemCount));
    assert(live.items.length === 0, 'stale items remain');
    assert(live.subtotal === 0, String(live.subtotal));

    const history = [
      { role: 'user' as const, content: 'add all 3 of them to cart' },
      {
        role: 'assistant' as const,
        content: 'Ocean Breeze, Fresh Linen and White Musk have been added to your cart. Subtotal $1,597.',
      },
    ];

    const stage1 = await classifyIntentAndExtractPreferences(
      "whats in my cart",
      tm,
      tmProducts,
      history,
      createInitialConversationState()
    );
    assert(stage1.intent === 'CART_ASSISTANCE', stage1.intent);
    assert(stage1.cart_action === 'VIEW_CART', String(stage1.cart_action));

    const actionContext = {
      intent: 'CART_ASSISTANCE',
      cart: toResponseCartContext(live),
      currency: STOREFRONT_CURRENCY,
      cart_action: { action: 'VIEW_CART' as const, success: true },
      response_policy: {
        live_cart_is_authoritative: true,
        do_not_infer_cart_from_history: true,
        cart_is_empty: true,
      },
    };

    const fallback = fallbackResponseGenerator(
      "whats in my cart",
      tm,
      stage1,
      [],
      [],
      createInitialConversationState(),
      { actionContext }
    );
    assert(/empty/i.test(fallback), fallback);
    assert(!/Ocean Breeze/i.test(fallback), fallback);
    assert(!/Fresh Linen/i.test(fallback), fallback);
    assert(!/White Musk/i.test(fallback), fallback);
    assert(!/\$/.test(fallback), fallback);

    const groqReply = await generateConversationalResponse(
      "whats in my cart",
      tm,
      stage1,
      [],
      [],
      createInitialConversationState(),
      history,
      { actionContext }
    );
    assert(/empty/i.test(groqReply), groqReply);
    assert(!/Ocean Breeze/i.test(groqReply), groqReply);
    assert(!/Fresh Linen/i.test(groqReply), groqReply);
    assert(!/White Musk/i.test(groqReply), groqReply);
    assert(!/\$/.test(groqReply) && !/USD/i.test(groqReply), groqReply);
  });

  await check('4', 'Manual remove one product updates live cart', () => {
    const remaining = trio.filter((t) => t.product.name !== 'Ocean Breeze');
    const live = buildLiveCartContext(
      'tmperfumehouse',
      serializeCartRequestPayload(
        'tmperfumehouse',
        remaining.map((t) => ({ productId: t.productId, brandSlug: t.brandSlug, quantity: 1 }))
      )
    );
    assert(live.items.map((i) => i.name).sort().join(',') === 'Fresh Linen,White Musk', live.items.map((i) => i.name).join(','));
    assert(live.subtotal === 399 + 549, String(live.subtotal));
    assert(live.subtotalFormatted === formatPrice(948), live.subtotalFormatted);
  });

  await check('5', 'Quantity 2 of Ocean Breeze → ₹1,298', () => {
    const ocean = trio.find((t) => t.product.name === 'Ocean Breeze')!;
    const live = buildLiveCartContext(
      'tmperfumehouse',
      serializeCartRequestPayload('tmperfumehouse', [
        { productId: ocean.productId, brandSlug: 'tmperfumehouse', quantity: 2 },
      ])
    );
    assert(live.items[0].quantity === 2, String(live.items[0].quantity));
    assert(live.subtotal === 1298, String(live.subtotal));
    assert(live.subtotalFormatted.includes('₹'), live.subtotalFormatted);
  });

  await check('6', 'Clear then add Midnight Velvet only', () => {
    const empty = buildLiveCartContext('tmperfumehouse', serializeCartRequestPayload('tmperfumehouse', []));
    assert(empty.isEmpty, 'clear failed');
    const midnight = tmProducts.find((p) => p.name === 'Midnight Velvet')!;
    const live = buildLiveCartContext(
      'tmperfumehouse',
      serializeCartRequestPayload('tmperfumehouse', [
        { productId: midnight.id, brandSlug: 'tmperfumehouse', quantity: 1 },
      ])
    );
    assert(live.items.length === 1 && live.items[0].name === 'Midnight Velvet', live.items.map((i) => i.name).join(','));
    assert(!live.items.some((i) => i.name === 'Ocean Breeze'), 'stale trio leaked');
  });

  await check('8', 'Brand isolation: WOP items ignored for TM context', () => {
    const vanilla = wopProducts.find((p) => p.name === 'Vanilla')!;
    const liveTm = buildLiveCartContext('tmperfumehouse', {
      items: [{ productId: vanilla.id, brandSlug: 'worldofperfumers', quantity: 1 }],
      itemCount: 1,
    });
    assert(liveTm.isEmpty, 'WOP product leaked into TM live cart');
    const liveWop = buildLiveCartContext('worldofperfumers', {
      items: [{ productId: vanilla.id, brandSlug: 'worldofperfumers', quantity: 1 }],
      itemCount: 1,
    });
    assert(liveWop.items[0]?.name === 'Vanilla', liveWop.items[0]?.name);
  });

  await check('9', 'Non-empty cart fallback uses ₹ not $', () => {
    const live = buildLiveCartContext(
      'tmperfumehouse',
      serializeCartRequestPayload(
        'tmperfumehouse',
        trio.map((t) => ({ productId: t.productId, brandSlug: t.brandSlug, quantity: 1 }))
      )
    );
    const reply = fallbackResponseGenerator(
      'How much is my cart?',
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
        cart_action: 'VIEW_CART',
        preferences: {},
      },
      [],
      [],
      createInitialConversationState(),
      {
        actionContext: {
          intent: 'CART_ASSISTANCE',
          cart: toResponseCartContext(live),
          currency: STOREFRONT_CURRENCY,
          cart_action: { action: 'VIEW_CART', success: true },
        },
      }
    );
    assert(reply.includes('₹'), reply);
    assert(!reply.includes('$'), reply);
    assert(/Ocean Breeze/i.test(reply) && /Fresh Linen/i.test(reply) && /White Musk/i.test(reply), reply);
  });

  await check('14', 'Add then remove then view uses empty live cart', async () => {
    const ocean = trio.find((t) => t.product.name === 'Ocean Breeze')!;
    const afterRemove = buildLiveCartContext('tmperfumehouse', serializeCartRequestPayload('tmperfumehouse', []));
    const stage1 = await classifyIntentAndExtractPreferences(
      "What's in my cart?",
      tm,
      tmProducts,
      [
        { role: 'user', content: 'Add Ocean Breeze.' },
        { role: 'assistant', content: 'Ocean Breeze has been added.' },
        { role: 'user', content: 'Remove Ocean Breeze.' },
        { role: 'assistant', content: 'Ocean Breeze has been removed.' },
      ],
      createInitialConversationState()
    );
    const reply = fallbackResponseGenerator(
      "What's in my cart?",
      tm,
      stage1,
      [],
      [],
      createInitialConversationState(),
      {
        actionContext: {
          intent: 'CART_ASSISTANCE',
          cart: toResponseCartContext(afterRemove),
          currency: STOREFRONT_CURRENCY,
          cart_action: { action: 'VIEW_CART', success: true },
        },
      }
    );
    assert(/empty/i.test(reply), reply);
    assert(!/Ocean Breeze/i.test(reply), reply);
    void ocean;
  });

  await check('16', 'Out of scope still out of scope', async () => {
    const stage1 = await classifyIntentAndExtractPreferences(
      'What is the capital of Bhutan?',
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(stage1.intent === 'OUT_OF_SCOPE', stage1.intent);
  });

  await check('17', 'Cart question does not mutate fragrance state', () => {
    let state = createInitialConversationState();
    state = updateConversationState(
      state,
      {
        intent: 'RECOMMENDATION',
        request_type: 'new_consultation',
        is_new_request: true,
        fragrance_families: ['fresh'],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        occasion: 'office',
        budget: { min: null, max: 800 },
        freshness: 'fresher',
        needs_recommendations: true,
        needs_clarification: false,
        preferences: {},
      },
      'I want something fresh under ₹800.'
    );
    const afterCart = updateConversationState(
      state,
      {
        intent: 'CART_ASSISTANCE',
        request_type: 'other',
        fragrance_families: [],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        needs_recommendations: false,
        needs_clarification: false,
        cart_action: 'VIEW_CART',
        preferences: {},
      },
      "What's in my cart?"
    );
    assert(afterCart.activeRequest.occasion === 'office', String(afterCart.activeRequest.occasion));
    assert(afterCart.activeRequest.budget.max === 800, String(afterCart.activeRequest.budget.max));
    assert(afterCart.activeRequest.freshness === 'fresher', String(afterCart.activeRequest.freshness));
  });

  await check('18', 'Empty payload after clear is items=[], count=0, subtotal=0', () => {
    const payload = serializeCartRequestPayload('tmperfumehouse', []);
    assert(payload.items.length === 0 && payload.itemCount === 0 && payload.subtotal === 0, JSON.stringify(payload));
    const live = buildLiveCartContext('tmperfumehouse', payload);
    assert(live.isEmpty && live.itemCount === 0 && live.subtotal === 0 && live.items.length === 0, JSON.stringify(live));
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

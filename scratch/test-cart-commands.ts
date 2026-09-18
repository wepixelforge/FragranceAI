/**
 * Cart-command understanding, live-cart confirmation, and brand isolation.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-cart-commands.ts
 */
import { getBrand, getProducts } from '../src/data';
import {
  classifyIntentAndExtractPreferences,
  fallbackIntentClassifier,
} from '../src/lib/intent-classifier';
import { createInitialConversationState, updateConversationState } from '../src/lib/state-manager';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import {
  detectCartIntent,
  detectCartConfirmation,
  planCartAssistance,
  resolveCartProductReferences,
  normalizeProductReferencesList,
} from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import { formatPrice } from '../src/lib/brand-utils';
import { ConversationState, Stage1IntentOutput } from '../src/types/chat';
import { Product } from '../src/types/product';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function productByName(products: Product[], name: string): Product {
  const found = products.find((p) => p.name === name);
  if (!found) throw new Error(`missing product ${name}`);
  return found;
}

function liveFromNames(brandSlug: string, products: Product[], names: string[]) {
  const items = names.map((name) => ({
    productId: productByName(products, name).id,
    brandSlug,
    quantity: 1,
  }));
  return buildLiveCartContext(brandSlug, serializeCartRequestPayload(brandSlug, items));
}

async function stage1For(
  message: string,
  brandSlug: string,
  state?: ConversationState
): Promise<Stage1IntentOutput> {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  return classifyIntentAndExtractPreferences(
    message,
    brand,
    products,
    [],
    state || createInitialConversationState()
  );
}

async function runPlanner(
  message: string,
  brandSlug: string,
  namesInCart: string[],
  state?: ConversationState
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const liveCart = liveFromNames(brandSlug, products, namesInCart);
  const current = state || createInitialConversationState();
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, [], current);
  let nextState = updateConversationState(current, stage1, message);
  if (stage1.intent !== 'CART_ASSISTANCE') {
    nextState = { ...nextState, pendingCartAction: null };
  }
  const planned = planCartAssistance({
    message,
    stage1,
    brandSlug,
    brandProducts: products,
    state: nextState,
    liveCart,
  });
  nextState = { ...nextState, pendingCartAction: planned.pendingCartAction };
  const reply = fallbackResponseGenerator(message, brand, stage1, products, [], nextState, {
    actionContext: {
      intent: 'CART_ASSISTANCE',
      cart_action: {
        action: planned.action,
        success: planned.success,
        productName: planned.added?.join(', '),
        added: planned.action === 'ADD_TO_CART' ? planned.added : undefined,
        removed: planned.action === 'REMOVE_FROM_CART' ? planned.added : undefined,
        failed: planned.failed,
        clearedCount: planned.clearedCount,
      },
      cart: {
        itemCount: liveCart.itemCount,
        isEmpty: liveCart.isEmpty,
        items: liveCart.items.map((line) => ({
          productId: line.productId,
          brandSlug: line.brandSlug,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceFormatted: line.unitPriceFormatted,
          price: line.unitPrice,
        })),
        subtotal: liveCart.subtotal,
        subtotalFormatted: liveCart.subtotalFormatted,
        currency: liveCart.currency,
      },
      currency: liveCart.currency,
      response_policy: planned.policy,
    },
  });
  return { stage1, planned, nextState, reply, liveCart };
}

async function run() {
  const tm = getBrand('tmperfumehouse')!;
  const tmProducts = getProducts('tmperfumehouse');
  const wopProducts = getProducts('worldofperfumers');
  const trio = ['Eternal Musk', 'Ocean Breeze', 'White Musk'];

  let passed = 0;
  let failed = 0;

  const check = async (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${id}  ${name}`);
    } catch (err: unknown) {
      failed++;
      console.log(`FAIL  ${id}  ${name}  → ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clearPhrases = [
    'remove everything from my cart',
    'empty my cart',
    'clear my cart',
    'remove all items',
    'delete everything',
    'take everything out',
    'I want to empty the cart',
    'clear everything',
    'remove all items from my cart',
    'delete everything from my cart',
    'delete all items',
    'remove all',
    'take everything out of my cart',
    'get everything out of my cart',
    'start with an empty cart',
    'take all this stuff out',
    'delete everything I\'ve added',
    'empty the basket',
    'get all of these out',
  ];

  for (const phrase of clearPhrases) {
    await check('CLEAR', `"${phrase}" → CLEAR_CART`, () => {
      const action = detectCartIntent(phrase, tmProducts);
      assert(action === 'CLEAR_CART', `got ${action}`);
    });
  }

  await check('CLEAR-PREF', '"remove all woody notes" is not CLEAR_CART', () => {
    assert(detectCartIntent('remove all woody notes', tmProducts) !== 'CLEAR_CART', 'false clear');
  });

  const removePhrases: Array<[string, string]> = [
    ['remove Eternal Musk', 'Eternal Musk'],
    ['take Eternal Musk out', 'Eternal Musk'],
    ['delete Eternal Musk from my cart', 'Eternal Musk'],
    ["I don't want Eternal Musk anymore", 'Eternal Musk'],
    ['get rid of Eternal Musk', 'Eternal Musk'],
  ];

  for (const [phrase, expected] of removePhrases) {
    await check('REMOVE', `"${phrase}" → REMOVE ${expected}`, async () => {
      const s1 = await stage1For(phrase, 'tmperfumehouse');
      assert(s1.intent === 'CART_ASSISTANCE', s1.intent);
      assert(s1.cart_action === 'REMOVE_FROM_CART', String(s1.cart_action));
      const planned = await runPlanner(phrase, 'tmperfumehouse', trio);
      assert(planned.planned.action === 'REMOVE_FROM_CART', planned.planned.action);
      assert(
        planned.planned.added?.includes(expected) || planned.planned.product?.name === expected,
        String(planned.planned.added)
      );
      assert(!planned.reply.toLowerCase().includes('which fragrance'), planned.reply);
    });
  }

  await check('REMOVE-that', 'remove that against a 1-item cart', async () => {
    const planned = await runPlanner('remove that', 'tmperfumehouse', ['Eternal Musk']);
    assert(planned.stage1.intent === 'CART_ASSISTANCE', planned.stage1.intent);
    assert(planned.planned.action === 'REMOVE_FROM_CART', planned.planned.action);
    assert(planned.planned.added?.[0] === 'Eternal Musk', String(planned.planned.added));
    assert(planned.reply.includes('Eternal Musk'), planned.reply);
  });

  await check('REMOVE-first', 'remove the first one uses live cart order', async () => {
    const planned = await runPlanner('remove the first one', 'tmperfumehouse', trio);
    assert(planned.planned.added?.[0] === 'Eternal Musk', String(planned.planned.added));
  });

  await check('REMOVE-last', 'remove the last one uses live cart order', async () => {
    const planned = await runPlanner('remove the last one', 'tmperfumehouse', trio);
    assert(planned.planned.added?.[0] === 'White Musk', String(planned.planned.added));
  });

  await check('REMOVE-musk', 'take the musk one out resolves against current cart', async () => {
    const planned = await runPlanner('take the musk one out', 'tmperfumehouse', [
      'Eternal Musk',
      'Ocean Breeze',
    ]);
    assert(planned.planned.added?.[0] === 'Eternal Musk', String(planned.planned.added));
  });

  await check('REMOVE-both-named', 'remove both Eternal Musk and White Musk', async () => {
    const planned = await runPlanner(
      'remove both Eternal Musk and White Musk',
      'tmperfumehouse',
      trio
    );
    assert(planned.planned.added?.includes('Eternal Musk'), String(planned.planned.added));
    assert(planned.planned.added?.includes('White Musk'), String(planned.planned.added));
    assert(planned.reply.includes('Eternal Musk') && planned.reply.includes('White Musk'), planned.reply);
  });

  await check('REMOVE-both-blue', 'remove both Eternal Musk and Blue extracts two refs', async () => {
    const s1 = fallbackIntentClassifier(
      'remove both Eternal Musk and Blue',
      tm,
      tmProducts,
      createInitialConversationState()
    );
    assert(s1.cart_action === 'REMOVE_FROM_CART', String(s1.cart_action));
    const refs = normalizeProductReferencesList(s1.product_references, 'remove both Eternal Musk and Blue', tmProducts);
    const resolved = resolveCartProductReferences({
      references: refs,
      action: 'REMOVE_FROM_CART',
      brandProducts: tmProducts,
      brandSlug: 'tmperfumehouse',
      cartProducts: trio.map((n) => productByName(tmProducts, n)),
    });
    assert(resolved.resolved.some((p) => p.name === 'Eternal Musk'), 'missing Eternal Musk');
  });

  const viewPhrases = [
    "what's in my cart",
    'what is in my cart',
    'show my cart',
    'show me my cart',
    "what's currently in my cart",
    'what have I added',
    "tell me what's in my cart",
    'how many things are in my cart',
    "what's my cart total",
    'cart contents',
    'how much is my cart',
    "tell me what's in there",
  ];

  for (const phrase of viewPhrases) {
    await check('VIEW', `"${phrase}" → VIEW_CART`, () => {
      const action = detectCartIntent(phrase, tmProducts);
      assert(action === 'VIEW_CART', `got ${action}`);
    });
  }

  await check('VIEW-live', 'view cart lists live items and ₹ total', async () => {
    const planned = await runPlanner("what's in my cart", 'tmperfumehouse', trio);
    assert(planned.stage1.cart_action === 'VIEW_CART', String(planned.stage1.cart_action));
    assert(planned.reply.includes('Eternal Musk'), planned.reply);
    assert(planned.reply.includes('Ocean Breeze'), planned.reply);
    assert(planned.reply.includes('White Musk'), planned.reply);
    assert(planned.reply.includes('₹'), planned.reply);
    assert(!planned.reply.includes('$'), planned.reply);
    assert(planned.reply.includes(formatPrice(699 + 649 + 549)), planned.reply);
  });

  const confirmYes = ['yes', 'yeah', 'sure', 'go ahead', 'clear it', 'remove them', 'yep', 'do it', "that's right", 'yes please', 'empty it'];
  const confirmNo = ['no', 'cancel', 'keep them', 'never mind', "don't", 'nope', 'leave it'];

  for (const phrase of confirmYes) {
    await check('CONF-Y', `"${phrase}" confirms pending CLEAR_CART`, () => {
      assert(detectCartConfirmation(phrase) === 'CONFIRM', String(detectCartConfirmation(phrase)));
    });
  }
  for (const phrase of confirmNo) {
    await check('CONF-N', `"${phrase}" cancels pending CLEAR_CART`, () => {
      assert(detectCartConfirmation(phrase) === 'CANCEL', String(detectCartConfirmation(phrase)));
    });
  }

  await check('EMPTY', 'clear cart when already empty', async () => {
    const planned = await runPlanner('remove everything from my cart', 'tmperfumehouse', []);
    assert(planned.planned.action === 'CLEAR_CART', planned.planned.action);
    assert(planned.planned.policy.cart_already_empty === true, JSON.stringify(planned.planned.policy));
    assert(!planned.planned.cartActionPayload, 'must not mutate');
    assert(planned.reply.toLowerCase().includes('already empty'), planned.reply);
    assert(!planned.reply.toLowerCase().includes('which fragrance'), planned.reply);
  });

  await check('EMPTY-2', 'remove everything when already empty', async () => {
    const planned = await runPlanner('remove everything', 'tmperfumehouse', []);
    assert(planned.reply.toLowerCase().includes('already empty'), planned.reply);
  });

  await check('CONFIRM-LIVE', 'CLEAR_CART confirmation lists live cart items', async () => {
    const planned = await runPlanner('remove everything from my cart', 'tmperfumehouse', trio);
    assert(planned.stage1.intent === 'CART_ASSISTANCE', planned.stage1.intent);
    assert(planned.stage1.cart_action === 'CLEAR_CART', String(planned.stage1.cart_action));
    assert(planned.planned.policy.confirm_clear_cart === true, JSON.stringify(planned.planned.policy));
    assert(!planned.planned.cartActionPayload, 'must wait for confirmation');
    assert(planned.nextState.pendingCartAction?.type === 'CLEAR_CART', 'pending missing');
    assert(planned.nextState.pendingCartAction?.items.length === 3, String(planned.nextState.pendingCartAction?.items.length));
    for (const name of trio) {
      assert(planned.reply.includes(name), `missing ${name} in ${planned.reply}`);
    }
    assert(planned.reply.includes('₹699'), planned.reply);
    assert(planned.reply.includes(formatPrice(699 + 649 + 549)), planned.reply);
    assert(!planned.reply.includes('$'), planned.reply);
    assert(planned.reply.toLowerCase().includes('would you like me to clear the cart'), planned.reply.toLowerCase());
    assert(!planned.reply.toLowerCase().includes('which fragrance'), planned.reply);
    assert(!planned.reply.toLowerCase().includes('recommended'), planned.reply);
  });

  await check('CONFIRM-YES', 'yes executes CLEAR_CART from pending live snapshot', async () => {
    const ask = await runPlanner('remove everything from my cart', 'tmperfumehouse', trio);
    const yes = await runPlanner('yes', 'tmperfumehouse', trio, ask.nextState);
    assert(yes.stage1.cart_confirmation === 'CONFIRM' || yes.planned.policy.cart_cleared === true, JSON.stringify(yes.stage1));
    assert(yes.planned.policy.cart_cleared === true, JSON.stringify(yes.planned.policy));
    assert(yes.planned.cartActionPayload?.action === 'CLEAR_CART', String(yes.planned.cartActionPayload?.action));
    assert(yes.planned.cartActionPayload?.clearedCount === 3, String(yes.planned.cartActionPayload?.clearedCount));
    assert(yes.reply.includes('3'), yes.reply);
    assert(yes.reply.toLowerCase().includes('empty'), yes.reply);
    assert(yes.nextState.pendingCartAction == null, 'pending should clear');
  });

  await check('CONFIRM-EVERYTHING', 'pending + "everything" confirms instead of recommending', async () => {
    const ask = await runPlanner('remove everything from my cart', 'tmperfumehouse', trio);
    const follow = await runPlanner('everything', 'tmperfumehouse', trio, ask.nextState);
    assert(follow.planned.policy.cart_cleared === true, JSON.stringify(follow.planned.policy));
    assert(!follow.reply.toLowerCase().includes('recommended'), follow.reply);
  });

  await check('CONFIRM-NO', 'cancel leaves cart untouched', async () => {
    const ask = await runPlanner('remove everything from my cart', 'tmperfumehouse', trio);
    const no = await runPlanner('keep them', 'tmperfumehouse', trio, ask.nextState);
    assert(no.planned.policy.clear_cancelled === true, JSON.stringify(no.planned.policy));
    assert(!no.planned.cartActionPayload, 'must not mutate');
    assert(no.nextState.pendingCartAction == null, 'pending should clear');
  });

  await check('MULTI-TURN', 'add 3 → view → clear confirm → empty view', async () => {
    const add1 = await runPlanner('add Eternal Musk', 'tmperfumehouse', []);
    assert(add1.planned.action === 'ADD_TO_CART', add1.planned.action);
    const add2 = await runPlanner('add Ocean Breeze', 'tmperfumehouse', ['Eternal Musk'], add1.nextState);
    const add3 = await runPlanner(
      'add White Musk',
      'tmperfumehouse',
      ['Eternal Musk', 'Ocean Breeze'],
      add2.nextState
    );
    assert(add3.planned.added?.[0] === 'White Musk', String(add3.planned.added));

    const view = await runPlanner("what's in my cart", 'tmperfumehouse', trio, add3.nextState);
    assert(view.reply.includes('Eternal Musk') && view.reply.includes('Ocean Breeze') && view.reply.includes('White Musk'), view.reply);

    const ask = await runPlanner('remove everything', 'tmperfumehouse', trio, view.nextState);
    assert(ask.planned.policy.confirm_clear_cart === true, JSON.stringify(ask.planned.policy));
    assert(ask.reply.includes('Eternal Musk') && ask.reply.includes('Ocean Breeze') && ask.reply.includes('White Musk'), ask.reply);

    const yes = await runPlanner('yes', 'tmperfumehouse', trio, ask.nextState);
    assert(yes.planned.cartActionPayload?.action === 'CLEAR_CART', 'did not clear');
    assert(yes.planned.clearedCount === 3, String(yes.planned.clearedCount));

    const emptyView = await runPlanner("what's in my cart", 'tmperfumehouse', [], yes.nextState);
    assert(emptyView.reply.toLowerCase().includes('empty'), emptyView.reply);
  });

  await check('INDIVIDUAL', 'add Eternal Musk → remove that → empty view', async () => {
    const add = await runPlanner('add Eternal Musk', 'tmperfumehouse', []);
    const remove = await runPlanner('remove that', 'tmperfumehouse', ['Eternal Musk'], add.nextState);
    assert(remove.planned.cartActionPayload?.action === 'REMOVE_FROM_CART', 'not removed');
    assert(remove.planned.added?.[0] === 'Eternal Musk', String(remove.planned.added));
    const view = await runPlanner("what's in my cart", 'tmperfumehouse', [], remove.nextState);
    assert(view.reply.toLowerCase().includes('empty'), view.reply);
  });

  await check('ADD-PRESERVE', 'add Angel to my cart still works on WOP', async () => {
    const planned = await runPlanner('add Angel to my cart', 'worldofperfumers', []);
    assert(planned.stage1.intent === 'CART_ASSISTANCE', planned.stage1.intent);
    assert(planned.planned.action === 'ADD_TO_CART', planned.planned.action);
    assert(planned.planned.added?.[0] === 'Angel', String(planned.planned.added));
  });

  await check('ADD-MULTI', 'add Angel and Blue', async () => {
    const planned = await runPlanner('add Angel and Blue', 'worldofperfumers', []);
    assert(planned.planned.added?.includes('Angel'), String(planned.planned.added));
    assert(planned.planned.added?.includes('Blue'), String(planned.planned.added));
  });

  await check('ADD-ALL-THREE', 'add all three uses recommendation set not cart clear', async () => {
    const state = createInitialConversationState();
    const recs = ['Angel', 'Blue', 'Vanilla'].map((n) => productByName(wopProducts, n));
    state.lastCanonicalProductSet = recs.map((p) => ({
      productId: p.id,
      brandSlug: 'worldofperfumers',
      name: p.name,
    }));
    const planned = await runPlanner('add all three', 'worldofperfumers', [], state);
    assert(planned.planned.action === 'ADD_TO_CART', planned.planned.action);
    assert(planned.planned.added?.length === 3, String(planned.planned.added));
  });

  await check('BRAND', 'CLEAR_CART only snapshots the current brand cart', async () => {
    const tmLive = liveFromNames('tmperfumehouse', tmProducts, ['Eternal Musk']);
    const mixedPayload = serializeCartRequestPayload('tmperfumehouse', [
      { productId: productByName(tmProducts, 'Eternal Musk').id, brandSlug: 'tmperfumehouse', quantity: 1 },
      { productId: productByName(wopProducts, 'Blue').id, brandSlug: 'worldofperfumers', quantity: 1 },
    ]);
    const scoped = buildLiveCartContext('tmperfumehouse', mixedPayload);
    assert(scoped.items.every((i) => i.brandSlug === 'tmperfumehouse'), 'leaked other brand');
    assert(scoped.items.length === 1, String(scoped.items.length));
    assert(scoped.items[0].name === 'Eternal Musk', scoped.items[0].name);

    const wopLive = liveFromNames('worldofperfumers', wopProducts, ['Angel', 'Blue']);
    const planned = planCartAssistance({
      message: 'clear my cart',
      stage1: fallbackIntentClassifier('clear my cart', getBrand('tmperfumehouse')!, tmProducts),
      brandSlug: 'tmperfumehouse',
      brandProducts: tmProducts,
      state: createInitialConversationState(),
      liveCart: tmLive,
    });
    assert(planned.pendingCartAction?.items.every((i) => i.brandSlug === 'tmperfumehouse'), 'pending leaked');
    assert(wopLive.items.length === 2, 'WOP cart must stay intact');
    assert(wopLive.items.some((i) => i.name === 'Angel'), 'missing Angel on WOP');
  });

  await check('PRIORITY', 'cart intent is classified before recommendation fallback', async () => {
    const s1 = fallbackIntentClassifier(
      'remove everything from my cart',
      tm,
      tmProducts,
      createInitialConversationState()
    );
    assert(s1.intent === 'CART_ASSISTANCE', s1.intent);
    assert(s1.cart_action === 'CLEAR_CART', String(s1.cart_action));
    assert(s1.needs_recommendations === false, 'must not recommend');
  });

  await check('I-WANT', 'I want Eternal Musk is ADD_TO_CART', async () => {
    const s1 = await stage1For('I want Eternal Musk', 'tmperfumehouse');
    assert(s1.intent === 'CART_ASSISTANCE', s1.intent);
    assert(s1.cart_action === 'ADD_TO_CART', String(s1.cart_action));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

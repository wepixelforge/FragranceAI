/**
 * Transactional cart mutation vs response grounding.
 * Run: npx tsx scratch/test-cart-transaction.ts
 */
import { getBrand, getProducts } from '../src/data';
import { fallbackIntentClassifier } from '../src/lib/intent-classifier';
import { createInitialConversationState } from '../src/lib/state-manager';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import {
  detectCartIntent,
  detectDelegatedCartSelection,
  isDiscoveryOnlyRequest,
  isAuthorizedCartMutation,
  planCartAssistance,
  collectCartActionReferences,
  selectDelegatedCartProducts,
  toCanonicalProductSet,
} from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import { ConversationState } from '../src/types/chat';
import { Product } from '../src/types/product';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function productByName(products: Product[], name: string): Product {
  const found = products.find((p) => p.name === name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

function emptyLive(brandSlug: string) {
  return buildLiveCartContext(brandSlug, serializeCartRequestPayload(brandSlug, []));
}

function liveFrom(brandSlug: string, products: Product[], names: string[]) {
  return buildLiveCartContext(
    brandSlug,
    serializeCartRequestPayload(
      brandSlug,
      names.map((name) => ({ productId: productByName(products, name).id, brandSlug, quantity: 1 }))
    )
  );
}

function plan(message: string, brandSlug: string, state?: ConversationState, namesInCart: string[] = []) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = fallbackIntentClassifier(message, brand, products, state || createInitialConversationState());
  const liveCart = namesInCart.length ? liveFrom(brandSlug, products, namesInCart) : emptyLive(brandSlug);
  const planned = planCartAssistance({
    message,
    stage1,
    brandSlug,
    brandProducts: products,
    state: state || createInitialConversationState(),
    liveCart,
  });
  const reply = fallbackResponseGenerator(message, brand, stage1, products, [], state || createInitialConversationState(), {
    actionContext: {
      intent: 'CART_ASSISTANCE',
      cart_action: {
        action: planned.action,
        success: planned.success,
        productName: planned.added?.join(', '),
        added: planned.action === 'ADD_TO_CART' ? planned.added : undefined,
        removed: planned.action === 'REMOVE_FROM_CART' ? planned.added : undefined,
        failed: planned.failed,
        needsClarification: planned.needsClarification,
        clearedCount: planned.clearedCount,
      },
      cart: {
        itemCount: liveCart.itemCount,
        isEmpty: liveCart.isEmpty,
        items: liveCart.items.map((line) => ({
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceFormatted: line.unitPriceFormatted,
        })),
        subtotal: liveCart.subtotal,
        subtotalFormatted: liveCart.subtotalFormatted,
      },
      response_policy: planned.policy,
    },
  });
  return { stage1, planned, reply, liveCart };
}

async function run() {
  const tm = getBrand('tmperfumehouse')!;
  const tmProducts = getProducts('tmperfumehouse');
  const officePool = tmProducts.filter((p) => p.occasion.includes('office'));
  assert(officePool.length >= 3, `need 3 office products, have ${officePool.length}`);

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

  await check('1', 'show me 3 office perfumes does not mutate cart', () => {
    const msg = 'show me 3 office perfumes';
    assert(isDiscoveryOnlyRequest(msg), 'should be discovery-only');
    assert(detectCartIntent(msg, tmProducts) == null, `intent ${detectCartIntent(msg, tmProducts)}`);
    const stage1 = fallbackIntentClassifier(msg, tm, tmProducts, createInitialConversationState());
    assert(stage1.intent !== 'CART_ASSISTANCE', stage1.intent);
  });

  await check('2', 'add these 3 office perfumes uses current recommendation set', () => {
    const recs = officePool.slice(0, 3);
    const state = createInitialConversationState();
    state.lastCanonicalProductSet = toCanonicalProductSet(recs, 'tmperfumehouse');
    const { planned, reply } = plan('add these 3 office perfumes', 'tmperfumehouse', state);
    assert(planned.success, 'should succeed');
    assert(isAuthorizedCartMutation(planned.cartActionPayload), 'must authorize mutation');
    assert(planned.cartActionPayload!.items?.length === 3, String(planned.cartActionPayload!.items?.length));
    for (const rec of recs) {
      assert(planned.added?.includes(rec.name), `missing ${rec.name}`);
      assert(reply.includes(rec.name), `reply missing ${rec.name}: ${reply}`);
    }
    assert(!reply.toLowerCase().includes('exact fragrance names'), reply);
  });

  await check('3', 'add any 3 office perfumes selects 3 office products and names them', () => {
    const msg = 'just add any 3 office use perfumes to my cart';
    assert(detectDelegatedCartSelection(msg, tmProducts)?.count === 3, JSON.stringify(detectDelegatedCartSelection(msg, tmProducts)));
    const collected = collectCartActionReferences(msg, tmProducts);
    assert(collected.references[0]?.startsWith('DELEGATED:'), String(collected.references));
    const { planned, reply } = plan(msg, 'tmperfumehouse');
    assert(planned.success, 'should add');
    assert(planned.needsClarification === false, 'must not clarify after adding');
    assert(isAuthorizedCartMutation(planned.cartActionPayload), 'unauthorized payload');
    const added = planned.cartActionPayload!.items || [];
    assert(added.length === 3, `added ${added.length}`);
    const ids = new Set(added.map((i) => i.productId));
    assert(ids.size === 3, 'duplicate product ids');
    for (const item of added) {
      const product = tmProducts.find((p) => p.id === item.productId);
      assert(product?.brandSlug === 'tmperfumehouse', 'brand leak');
      assert(product?.occasion.includes('office'), `${product?.name} is not office`);
      assert(reply.includes(item.productName), `reply missing ${item.productName}: ${reply}`);
    }
    assert(!/need the exact fragrance names/i.test(reply), reply);
    assert(!/which fragrance/i.test(reply), reply);
    assert(/₹/.test(JSON.stringify(added)) || added.every((i) => typeof i.unitPrice === 'number'), 'prices missing');
  });

  await check('3b', 'paraphrases also delegate selection', () => {
    for (const msg of [
      'add any 2 good office perfumes',
      'put 3 summer fragrances in my cart',
      'add 3 fresh fragrances under ₹800',
      'pick 3 office perfumes and put them in my cart',
      'choose 3 office-friendly ones and add them',
    ]) {
      const delegated = detectDelegatedCartSelection(msg, tmProducts);
      assert(delegated != null, `${msg} not delegated`);
      const { planned } = plan(msg, 'tmperfumehouse');
      if (planned.success) {
        assert(isAuthorizedCartMutation(planned.cartActionPayload), `${msg} unauthorized`);
        assert(!planned.needsClarification, `${msg} clarified after add`);
      } else {
        assert(!isAuthorizedCartMutation(planned.cartActionPayload), `${msg} mutated on failure`);
      }
    }
  });

  await check('4', 'give me 3 office perfumes is not a cart mutation', () => {
    const msg = 'give me 3 office perfumes';
    assert(isDiscoveryOnlyRequest(msg), 'discovery');
    assert(detectCartIntent(msg, tmProducts) == null, `got ${detectCartIntent(msg, tmProducts)}`);
  });

  await check('5', 'pick 3 office perfumes and put them in my cart adds 3', () => {
    const { planned, reply } = plan('pick 3 office perfumes and put them in my cart', 'tmperfumehouse');
    assert(planned.success, 'should add');
    assert((planned.cartActionPayload?.items || []).length === 3, String(planned.cartActionPayload?.items?.length));
    for (const name of planned.added || []) {
      assert(reply.includes(name), reply);
    }
  });

  await check('6', 'remove everything confirms without mutating', () => {
    const { planned, reply } = plan('remove everything from my cart', 'tmperfumehouse', undefined, [
      'Eternal Musk',
      'Ocean Breeze',
    ]);
    assert(planned.action === 'CLEAR_CART', planned.action);
    assert(!isAuthorizedCartMutation(planned.cartActionPayload), 'must not mutate yet');
    assert(planned.policy.confirm_clear_cart === true, JSON.stringify(planned.policy));
    assert(reply.toLowerCase().includes('would you like me to clear'), reply);
  });

  await check('7', 'yes after pending CLEAR_CART is authorized once', () => {
    const ask = plan('remove everything from my cart', 'tmperfumehouse', undefined, ['Eternal Musk']);
    const state = createInitialConversationState();
    state.pendingCartAction = ask.planned.pendingCartAction;
    const yes = plan('yes', 'tmperfumehouse', state, ['Eternal Musk']);
    assert(isAuthorizedCartMutation(yes.planned.cartActionPayload), 'clear not authorized');
    assert(yes.planned.cartActionPayload?.action === 'CLEAR_CART', String(yes.planned.cartActionPayload?.action));
    assert(yes.reply.toLowerCase().includes('empty'), yes.reply);
  });

  await check('8', 'remove Eternal Musk only', () => {
    const { planned } = plan('remove Eternal Musk', 'tmperfumehouse', undefined, [
      'Eternal Musk',
      'Ocean Breeze',
    ]);
    assert(planned.cartActionPayload?.action === 'REMOVE_FROM_CART', String(planned.cartActionPayload?.action));
    assert(planned.added?.length === 1, String(planned.added));
    assert(planned.added?.[0] === 'Eternal Musk', String(planned.added));
  });

  await check('9', "what's in my cart matches live cart", () => {
    const { reply, liveCart } = plan("what's in my cart", 'tmperfumehouse', undefined, [
      'Eternal Musk',
      'Ocean Breeze',
    ]);
    assert(reply.includes('Eternal Musk'), reply);
    assert(reply.includes('Ocean Breeze'), reply);
    assert(reply.includes(liveCart.subtotalFormatted), reply);
    assert(!reply.includes('$'), reply);
  });

  await check('10', 'same actionId is not authorized twice conceptually', () => {
    const { planned } = plan('add Eternal Musk', 'tmperfumehouse');
    assert(isAuthorizedCartMutation(planned.cartActionPayload), 'first apply');
    const id = planned.cartActionPayload!.actionId;
    assert(Boolean(id), 'missing actionId');
    const seen = new Set<string>();
    const applyOnce = (actionId?: string) => {
      if (!actionId || seen.has(actionId)) return false;
      seen.add(actionId);
      return true;
    };
    assert(applyOnce(id) === true, 'first');
    assert(applyOnce(id) === false, 'duplicate');
  });

  await check('11', 'LLM-invented names are not mutated', () => {
    const msg = 'just add any 3 office use perfumes to my cart';
    const sanitized = collectCartActionReferences(msg, tmProducts);
    assert(!sanitized.references.includes('Citrus Sport'), String(sanitized.references));
    assert(!sanitized.references.includes('Vanilla Dreams'), String(sanitized.references));
  });

  await check('12', 'no-match under impossible budget does not mutate', () => {
    const selected = selectDelegatedCartProducts({
      message: 'add 3 office perfumes under ₹300',
      brandProducts: tmProducts,
      requestedCount: 3,
    });
    assert(selected.status === 'NO_MATCH' || selected.availableQuantity < 3, selected.status);
    const { planned, reply } = plan('add 3 office perfumes under ₹300', 'tmperfumehouse');
    assert(!isAuthorizedCartMutation(planned.cartActionPayload), 'must not add');
    assert(!/done — i’ve added 3/i.test(reply), reply);
  });

  await check('13', 'add Angel still works', () => {
    const { planned } = plan('add Angel to my cart', 'worldofperfumers');
    assert(planned.added?.[0] === 'Angel', String(planned.added));
    assert(isAuthorizedCartMutation(planned.cartActionPayload), 'angel not added');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

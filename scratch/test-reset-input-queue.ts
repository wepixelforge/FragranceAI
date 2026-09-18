/**
 * RESET / ambiguity / cart-separation / sequential turn-queue regression.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-reset-input-queue.ts
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getBrand, getProducts } from '../src/data';
import {
  classifyIntentAndExtractPreferences,
  detectResetIntent,
  detectAmbiguousDescriptor,
  doesIntentRequireProducts,
  fallbackIntentClassifier,
  sanitizeInferredFragranceAttributes,
} from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  hasActiveConsultation,
  updateConversationState,
} from '../src/lib/state-manager';
import { parseQuery } from '../src/lib/query-parser';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import {
  detectCartIntent,
  isAuthorizedCartMutation,
  isDiscoveryOnlyRequest,
  planCartAssistance,
} from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import { createSequentialTurnQueue } from '../src/lib/turn-queue';
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

function plan(
  message: string,
  brandSlug: string,
  namesInCart: string[],
  state?: ConversationState,
  stage1?: Stage1IntentOutput
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const current = state || createInitialConversationState();
  const classified =
    stage1 || fallbackIntentClassifier(message, brand, products, current);
  const liveCart = liveFromNames(brandSlug, products, namesInCart);
  return planCartAssistance({
    message,
    stage1: classified,
    brandSlug,
    brandProducts: products,
    state: current,
    liveCart,
  });
}

async function run() {
  const tm = getBrand('tmperfumehouse')!;
  const tmProducts = getProducts('tmperfumehouse');
  const srcRoot = join(__dirname, '../src');

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

  // TEST A — RESET
  await check('A1', 'reset everything is RESET and skips recommendations', async () => {
    let state = createInitialConversationState();
    const q1 = 'I want something fresh for summer under ₹800';
    const s1 = fallbackIntentClassifier(q1, tm, tmProducts, state);
    state = updateConversationState(state, s1, q1);
    const q2 = 'make it stronger';
    const s2 = fallbackIntentClassifier(q2, tm, tmProducts, state);
    state = updateConversationState(state, s2, q2);

    const resetMsg = 'reset everything';
    const s3 = await classifyIntentAndExtractPreferences(resetMsg, tm, tmProducts, [], state);
    assert(s3.intent === 'RESET_CONSULTATION', `got ${s3.intent}`);
    assert(s3.needs_recommendations === false, 'must not recommend');
    assert(s3.cart_action == null || s3.cart_action === undefined, `cart_action ${s3.cart_action}`);
    assert(!doesIntentRequireProducts(s3.intent, s3), 'must skip product retrieval');

    const reply = fallbackResponseGenerator(resetMsg, tm, s3, tmProducts, [], state, {});
    assert(/starting fresh/i.test(reply), reply);
    assert(!/midnight velvet/i.test(reply), reply);
    assert(!/closest option/i.test(reply), reply);

    state = updateConversationState(state, s3, resetMsg);
    assert(!hasActiveConsultation(state), 'consultation should be empty');
    assert((state.activeRequest?.families || []).length === 0, String(state.activeRequest?.families));
    assert(state.activeRequest?.budget.max == null, String(state.activeRequest?.budget.max));
    assert(state.activeRequest?.intensity == null, String(state.activeRequest?.intensity));
    assert(state.activeRequest?.season == null, String(state.activeRequest?.season));
    assert(state.pendingClarification == null, 'pending clarification leaked');
    assert((state.lastRecommendationIds || []).length === 0, 'recs leaked');

    const q4 = 'give me something woody';
    const s4 = fallbackIntentClassifier(q4, tm, tmProducts, state);
    assert(s4.intent !== 'RESET_CONSULTATION', s4.intent);
    state = updateConversationState(state, s4, q4);
    const families = (state.activeRequest?.families || []).map((f) => f.toLowerCase());
    assert(families.includes('woody'), `families ${families.join(',')}`);
    assert(!families.includes('fresh'), 'fresh leaked after reset');
    assert(state.activeRequest?.budget.max == null, 'budget leaked');
    assert(state.activeRequest?.season !== 'summer', `season ${state.activeRequest?.season}`);
    assert(state.activeRequest?.intensity !== 'strong', `intensity ${state.activeRequest?.intensity}`);
  });

  // TEST B — RESET VARIATIONS
  await check('B', 'semantic reset variations', async () => {
    const phrases = [
      'reset',
      'start over',
      'start from scratch',
      'forget everything',
      "let's start again",
      'reset everything',
      'start fresh',
      'forget all my preferences',
      'forget what I told you',
      'clear our conversation',
      "let's begin again",
      'wipe the current preferences',
      'I want to start over',
    ];
    for (const phrase of phrases) {
      assert(detectResetIntent(phrase), `detector missed "${phrase}"`);
      const stage1 = await classifyIntentAndExtractPreferences(
        phrase,
        tm,
        tmProducts,
        [],
        createInitialConversationState()
      );
      assert(stage1.intent === 'RESET_CONSULTATION', `"${phrase}" → ${stage1.intent}`);
      assert(!doesIntentRequireProducts(stage1.intent, stage1), `"${phrase}" retrieved products`);
    }
  });

  // TEST C — FRESH VS RESET
  await check('C', 'something fresh is rec; start fresh is reset', async () => {
    assert(!detectResetIntent('I want something fresh'), 'fresh preference detected as reset');
    assert(!detectResetIntent('make it fresher'), 'fresher detected as reset');
    assert(detectResetIntent('start fresh'), 'start fresh missed');

    const rec = fallbackIntentClassifier(
      'I want something fresh',
      tm,
      tmProducts,
      createInitialConversationState()
    );
    assert(rec.intent !== 'RESET_CONSULTATION', rec.intent);
    assert(rec.needs_recommendations !== false || rec.intent === 'RECOMMENDATION' || rec.intent === 'REFINE_RECOMMENDATION', rec.intent);

    const reset = await classifyIntentAndExtractPreferences(
      'start fresh',
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(reset.intent === 'RESET_CONSULTATION', reset.intent);
  });

  // TEST D — AMBIGUOUS CLEAR
  await check('D', 'clear as scent adjective is not subtle and asks clarification', async () => {
    const msg = 'suggest me something soft, creamy, woody, for first date, and clear';
    assert(!detectResetIntent(msg), 'reset false positive');
    assert(detectCartIntent(msg, tmProducts) == null, `cart ${detectCartIntent(msg, tmProducts)}`);

    const parsed = parseQuery(msg);
    assert(parsed.intensityPreference !== 'subtle', 'soft/clear mapped to subtle');
    assert(!(parsed.fragranceFamilies || []).includes('gourmand'), 'creamy mapped to gourmand');
    assert((parsed.fragranceFamilies || []).includes('woody'), 'woody dropped');

    const ambig = detectAmbiguousDescriptor(msg);
    assert(ambig?.term === 'clear', `term ${ambig?.term}`);
    assert(/clean\/fresh, light, or subtle/i.test(ambig?.question || ''), ambig?.question || '');

    const stage1 = await classifyIntentAndExtractPreferences(
      msg,
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(stage1.intent === 'CLARIFICATION' || stage1.needs_clarification, stage1.intent);
    assert(stage1.ambiguous_term === 'clear', String(stage1.ambiguous_term));
    assert(!doesIntentRequireProducts(stage1.intent, stage1), 'must not recommend yet');
    assert(stage1.intensity !== 'subtle', `intensity ${stage1.intensity}`);
    assert(!(stage1.fragrance_families || []).includes('gourmand'), String(stage1.fragrance_families));
    assert((stage1.fragrance_families || []).includes('woody'), String(stage1.fragrance_families));

    const invented = sanitizeInferredFragranceAttributes(
      {
        intent: 'RECOMMENDATION',
        request_type: 'new_consultation',
        fragrance_families: ['woody', 'gourmand'],
        preferred_notes: [],
        excluded_notes: [],
        excluded_families: [],
        intensity: 'subtle',
        sweetness: 'sweeter',
        needs_recommendations: true,
        needs_clarification: false,
        preferences: {},
        updates: [
          { field: 'intensity', operation: 'SET', value: 'subtle' },
          { field: 'fragrance_families', operation: 'SET', value: ['woody', 'gourmand'] },
        ],
      },
      msg
    );
    assert(invented.intensity !== 'subtle', 'sanitize left subtle');
    assert(!invented.fragrance_families.includes('gourmand'), String(invented.fragrance_families));
  });

  // TEST E — CART PRESERVED DURING RESET
  await check('E', 'reset does not clear cart', async () => {
    const names = ['Eternal Musk', 'Ocean Breeze'];
    const live = liveFromNames('tmperfumehouse', tmProducts, names);
    assert(live.itemCount === 2, String(live.itemCount));

    const stage1 = await classifyIntentAndExtractPreferences(
      'reset everything',
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(stage1.intent === 'RESET_CONSULTATION', stage1.intent);
    assert(stage1.cart_action == null || stage1.cart_action === undefined, `cart_action ${stage1.cart_action}`);
    const state = updateConversationState(createInitialConversationState(), stage1, 'reset everything');
    assert(state.pendingCartAction == null, 'reset created pending cart action');
    assert(live.itemCount === 2, 'live cart changed');
    assert(live.items.map((item) => item.name).sort().join(',') === names.slice().sort().join(','), 'cart contents changed');
  });

  // TEST F — CLEAR CART CONFIRM YES
  await check('F', 'clear everything from my cart confirms then empties', async () => {
    const names = ['Eternal Musk', 'Ocean Breeze', 'White Musk'];
    const ask = plan('clear everything from my cart', 'tmperfumehouse', names);
    assert(ask.action === 'CLEAR_CART', ask.action);
    assert(!isAuthorizedCartMutation(ask.cartActionPayload), 'cleared before confirm');
    assert(ask.policy.confirm_clear_cart === true, JSON.stringify(ask.policy));
    for (const name of names) {
      assert(
        (ask.pendingCartAction?.items || []).some((item) => item.name === name),
        `missing ${name} in confirmation`
      );
    }

    const state = createInitialConversationState();
    state.pendingCartAction = ask.pendingCartAction;
    const yes = plan('yes', 'tmperfumehouse', names, state);
    assert(isAuthorizedCartMutation(yes.cartActionPayload), 'yes did not clear');
    assert(yes.cartActionPayload?.action === 'CLEAR_CART', String(yes.cartActionPayload?.action));
  });

  // TEST G — CLEAR CART NO
  await check('G', 'clear my cart + no leaves cart unchanged', async () => {
    const names = ['Eternal Musk', 'Ocean Breeze', 'White Musk'];
    const ask = plan('clear my cart', 'tmperfumehouse', names);
    const state = createInitialConversationState();
    state.pendingCartAction = ask.pendingCartAction;
    const no = plan('no', 'tmperfumehouse', names, state);
    assert(!isAuthorizedCartMutation(no.cartActionPayload), 'no still mutated');
    const live = liveFromNames('tmperfumehouse', tmProducts, names);
    assert(live.itemCount === 3, String(live.itemCount));
  });

  // TEST H — NATURAL CLEAR CART
  await check('H', 'take all this stuff out is CLEAR_CART confirmation', () => {
    const names = ['Eternal Musk', 'Ocean Breeze'];
    const ask = plan('take all this stuff out', 'tmperfumehouse', names);
    assert(ask.action === 'CLEAR_CART', ask.action);
    assert(!isAuthorizedCartMutation(ask.cartActionPayload), 'mutated immediately');
    assert(ask.policy.confirm_clear_cart === true, JSON.stringify(ask.policy));
  });

  // TEST I — REC DOES NOT MUTATE CART
  await check('I', 'show me 3 office perfumes does not mutate cart', () => {
    const msg = 'show me 3 office perfumes';
    assert(isDiscoveryOnlyRequest(msg), 'not discovery');
    assert(detectCartIntent(msg, tmProducts) == null, String(detectCartIntent(msg, tmProducts)));
    const stage1 = fallbackIntentClassifier(msg, tm, tmProducts, createInitialConversationState());
    assert(stage1.intent !== 'CART_ASSISTANCE', stage1.intent);
    const empty = liveFromNames('tmperfumehouse', tmProducts, []);
    assert(empty.itemCount === 0, String(empty.itemCount));
  });

  // TEST J — DELEGATED SELECTION
  await check('J', 'pick any 3 office perfumes and add them', () => {
    const planned = plan(
      'pick any 3 office perfumes and add them to my cart',
      'tmperfumehouse',
      []
    );
    assert(planned.success, 'should add');
    assert((planned.cartActionPayload?.items || []).length === 3, String(planned.cartActionPayload?.items?.length));
    assert(isAuthorizedCartMutation(planned.cartActionPayload), 'unauthorized');
  });

  // TEST K — INPUT STAYS ENABLED
  await check('K', 'chat input is not disabled while assistant responds', () => {
    const finder = readFileSync(join(srcRoot, 'components/finder/FinderChat.tsx'), 'utf8');
    const concierge = readFileSync(join(srcRoot, 'components/layout/FloatingConcierge.tsx'), 'utf8');
    const context = readFileSync(join(srcRoot, 'context/ScentFinderContext.tsx'), 'utf8');
    assert(!/disabled=\{isTyping\}/.test(finder), 'FinderChat still disables input');
    assert(!/disabled=\{isTyping\}/.test(concierge), 'FloatingConcierge still disables input');
    assert(!/if \(!trimmed \|\| isTyping\) return/.test(finder), 'FinderChat still blocks send');
    assert(!/if \(!trimmed \|\| isTyping\) return/.test(concierge), 'FloatingConcierge still blocks send');
    assert(!/if \(!trimmed \|\| isTyping\) return/.test(context), 'sendMessage still drops during typing');
    assert(/queued/.test(finder), 'FinderChat missing queued indicator');
    assert(/processingTurnRef/.test(context), 'missing sequential turn lock');
    assert(/turnQueueRef/.test(context), 'missing sequential queue');
  });

  // TEST L — SEQUENTIAL QUEUE / NO RACE
  await check('L', 'queued turns run sequentially without rollback', async () => {
    const shared = { value: 0, order: [] as string[] };
    const queue = createSequentialTurnQueue<{ id: string; label: string; add: number }>(
      async (item) => {
        const snapshot = shared.value;
        await new Promise((resolve) => setTimeout(resolve, 35));
        shared.value = snapshot + item.add;
        shared.order.push(item.label);
      }
    );
    queue.enqueue({ id: 'a', label: 'fresh', add: 1 });
    queue.enqueue({ id: 'b', label: 'warmer', add: 10 });
    const started = Date.now();
    while (queue.isRunning || queue.length > 0) {
      if (Date.now() - started > 2000) throw new Error('queue hung');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert(shared.order.join(',') === 'fresh,warmer', shared.order.join(','));
    assert(shared.value === 11, `race produced ${shared.value} (expected 11)`);
  });

  await check('X1', 'bare clear is not cart, reset, or subtle', () => {
    assert(!detectResetIntent('clear'), 'bare clear is reset');
    assert(detectCartIntent('clear', tmProducts) == null, 'bare clear is cart');
    assert(detectAmbiguousDescriptor('clear') == null, 'bare clear forced clarification');
  });

  await check('X2', 'clear my preferences is reset; clear my cart is cart', async () => {
    assert(detectResetIntent('clear my preferences'), 'prefs not reset');
    const reset = await classifyIntentAndExtractPreferences(
      'clear my preferences',
      tm,
      tmProducts,
      [],
      createInitialConversationState()
    );
    assert(reset.intent === 'RESET_CONSULTATION', reset.intent);
    assert(detectCartIntent('clear my cart', tmProducts) === 'CLEAR_CART', 'clear my cart missed');
    assert(!detectResetIntent('clear my cart'), 'clear my cart was reset');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

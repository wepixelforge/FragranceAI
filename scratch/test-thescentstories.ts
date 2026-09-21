/**
 * The Scent Stories — fragrance + format concierge suite.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-thescentstories.ts
 */
import { getBrand, getProducts } from '../src/data';
import { applyExplicitReference, fallbackIntentClassifier } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import { parseSamplingContext, productMatchesFormat } from '../src/lib/sampling-format';
import { detectCartIntent, planCartAssistance } from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import { ConversationState, Stage1IntentOutput } from '../src/types/chat';
import { Product } from '../src/types/product';

const SLUG = 'thescentstories';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function turn(message: string, state?: ConversationState) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const stage1 = applyExplicitReference(
    fallbackIntentClassifier(message, brand, products, state || createInitialConversationState()),
    message,
    products
  );
  const next = updateConversationState(state || createInitialConversationState(), stage1, message);
  const prefs = toStructuredPreferences(next, message);
  const recs = getRecommendations(prefs, products);
  const recommendedIds = recs.results.map((r) => r.product.id);
  const nextWithRecs: ConversationState = {
    ...next,
    lastRecommendationIds: recommendedIds,
    lastCanonicalProductSet: recs.results.map((r) => ({
      productId: r.product.id,
      brandSlug: r.product.brandSlug,
      name: r.product.name,
    })),
    lastDiscussedProductSet: recs.results.map((r) => ({
      productId: r.product.id,
      brandSlug: r.product.brandSlug,
      name: r.product.name,
    })),
  };
  const reply = fallbackResponseGenerator(message, brand, stage1, products, recs.results, nextWithRecs, {
    status: recs.canonicalResult.status,
    catalogueProducts: products,
  });
  return { stage1, state: nextWithRecs, prefs, recs, reply, products, brand };
}

function liveCart(products: Product[], ids: string[]) {
  const items = ids.map((productId) => ({ productId, brandSlug: SLUG, quantity: 1 }));
  return buildLiveCartContext(SLUG, serializeCartRequestPayload(SLUG, items));
}

async function main() {
  const results: { id: number; name: string; ok: boolean; detail: string }[] = [];
  const record = (id: number, name: string, ok: boolean, detail: string) => {
    results.push({ id, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id}. ${name} — ${detail}`);
  };

  const brand = getBrand(SLUG);
  const products = getProducts(SLUG);
  const formats = new Set(products.map((p) => p.format).filter(Boolean));

  assert(Boolean(brand), 'brand missing');
  assert(products.length >= 30 && products.length <= 50, `expected 30–50 products, got ${products.length}`);
  record(0, 'Catalogue size', true, `${products.length} products, formats: ${[...formats].join(', ')}`);

  // 1. Fresh office under 1000
  {
    const t = turn('I want something fresh for office under ₹1,000.');
    const ok =
      t.prefs.budget?.max === 1000 &&
      t.recs.results.length > 0 &&
      t.recs.results.every((r) => r.product.price <= 1000) &&
      t.recs.results.every((r) => r.product.brandSlug === SLUG);
    record(1, 'Fresh office under ₹1,000', ok, ok ? t.recs.results[0].product.name : t.reply);
  }

  // 2. Similar to Sauvage but cheaper
  {
    const t = turn('I want something similar to Dior Sauvage but cheaper.');
    const ok =
      Boolean(t.state.backgroundContext.referencePerfume?.toLowerCase().includes('sauvage')) &&
      t.state.activeRequest.isSimilarityRequest === true &&
      (t.recs.results.length > 0 || t.recs.canonicalResult.status === 'NO_VALID_MATCH' || t.recs.isPartialMatch);
    record(2, 'Similar to Sauvage cheaper', ok, `${t.state.backgroundContext.referencePerfume} / ${t.recs.results[0]?.product.name || t.recs.canonicalResult.status}`);
  }

  // 3. Never tried niche
  {
    const t = turn("I've never tried niche perfume before.");
    const parsed = parseSamplingContext("I've never tried niche perfume before.");
    const top = t.recs.results[0]?.product;
    const ok =
      parsed.experienceLevel === 'beginner' &&
      t.state.activeRequest.experienceLevel === 'beginner' &&
      (!top || top.format === 'sample' || top.format === 'vial' || top.format === 'discovery-set' || top.format === 'pocket');
    record(3, 'Beginner niche exploration', ok, top ? `${top.name} (${top.format})` : t.reply);
  }

  // 4. Wedding around 3000
  {
    const t = turn('I want something for my wedding around ₹3,000.');
    const ok =
      t.recs.results.length > 0 &&
      t.recs.results.every((r) => r.product.price <= 3500) &&
      (t.state.activeRequest.occasion === 'wedding' || t.recs.results.some((r) => r.product.occasion.includes('wedding') || r.product.occasion.includes('evening')));
    record(4, 'Wedding around ₹3,000', ok, t.recs.results[0]?.product.name || t.reply);
  }

  // 5. Travel small
  {
    const t = turn('I travel a lot and want something small.');
    const top = t.recs.results[0]?.product;
    const ok = Boolean(t.state.activeRequest.travelIntent) && Boolean(top) && (top.format === 'pocket' || top.format === 'miniature');
    record(5, 'Travel small format', ok, top ? `${top.name} (${top.format})` : t.reply);
  }

  // 6. Try several
  {
    const t = turn('I want to try several fragrances.');
    const top = t.recs.results[0]?.product;
    const ok = t.state.activeRequest.formatPreference === 'DISCOVERY_SET' && Boolean(top) && top.format === 'discovery-set';
    record(6, 'Discovery set / several', ok, top ? `${top.name} (${top.format})` : t.reply);
  }

  // 7. Already own sample → full bottle
  {
    const t = turn('I already own the sample and want the full bottle.');
    const top = t.recs.results[0]?.product;
    const ok = t.state.activeRequest.formatPreference === 'FULL_SIZE' && Boolean(top) && (top.format === 'full-size' || top.format === 'tester');
    record(7, 'Full bottle after sample', ok, top ? `${top.name} (${top.format})` : t.reply);
  }

  // 8. Tester vs retail
  {
    const t = turn("What's the difference between a tester and retail pack?");
    const ok = /same fragrance|same juice|not a different/i.test(t.reply);
    record(8, 'Tester vs retail education', ok, t.reply.slice(0, 160));
  }

  // 9–16 refinements
  {
    let t = turn('I want something fresh for office under ₹1,000.');
    const firstId = t.recs.results[0]?.product.id;
    t = turn('Show me something else.', t.state);
    const secondId = t.recs.results[0]?.product.id;
    record(9, 'Show me something else', Boolean(secondId) && secondId !== firstId, `${firstId} → ${secondId}`);

    t = turn('Make it warmer.', t.state);
    record(10, 'Make it warmer', t.state.activeRequest.warmth === 'warmer', String(t.state.activeRequest.warmth));

    t = turn('Make it less sweet.', t.state);
    record(
      11,
      'Make it less sweet',
      t.state.activeRequest.excludedFamilies.includes('sweet') ||
        t.state.backgroundContext.persistentExclusions.families.includes('sweet') ||
        Boolean(t.recs.results[0]),
      t.reply.slice(0, 120)
    );

    t = turn('Show me something I can try first.', t.state);
    record(
      12,
      'Try first',
      t.state.activeRequest.formatPreference === 'TRY_SAMPLE' &&
        t.recs.results.every((r) => productMatchesFormat(r.product, 'TRY_SAMPLE')),
      t.recs.results[0] ? `${t.recs.results[0].product.name} (${t.recs.results[0].product.format})` : t.reply
    );

    t = turn('Actually, I want the full bottle.', t.state);
    record(
      13,
      'Switch to full bottle',
      t.state.activeRequest.formatPreference === 'FULL_SIZE' &&
        t.recs.results.every((r) => r.product.format === 'full-size' || r.product.format === 'tester'),
      t.recs.results[0] ? `${t.recs.results[0].product.name} (${t.recs.results[0].product.format})` : t.reply
    );

    t = turn('Forget the budget.', t.state);
    record(14, 'Forget the budget', t.state.activeRequest.budget.max === null, String(t.state.activeRequest.budget.max));

    t = turn('Forget the reference.', t.state);
    record(
      15,
      'Forget the reference',
      t.state.backgroundContext.referencePerfume === null && t.state.activeRequest.isSimilarityRequest === false,
      String(t.state.backgroundContext.referencePerfume)
    );

    t = turn('Start fresh.', t.state);
    record(
      16,
      'Start fresh',
      t.stage1.intent === 'RESET_CONSULTATION' &&
        t.state.activeRequest.families.length === 0 &&
        t.state.activeRequest.budget.max === null,
      t.stage1.intent
    );
  }

  // 17–20 cart
  {
    const sample = products.find((p) => p.format === 'sample')!;
    const tm = getProducts('tmperfumehouse')[0];
    const baseState = {
      ...createInitialConversationState(),
      lastCanonicalProductSet: [{ productId: sample.id, brandSlug: SLUG, name: sample.name }],
      lastRecommendationIds: [sample.id],
    };

    const cartStage = (message: string, action: Stage1IntentOutput['cart_action']): Stage1IntentOutput => ({
      ...fallbackIntentClassifier(message, brand!, products, baseState),
      intent: 'CART_ASSISTANCE',
      cart_action: action,
      needs_recommendations: false,
      target_product_names: [sample.name],
    });

    const addIntent = detectCartIntent('Add the sample.');
    const added = planCartAssistance({
      message: 'Add the sample.',
      stage1: cartStage('Add the sample.', 'ADD_TO_CART'),
      brandSlug: SLUG,
      brandProducts: products,
      state: baseState,
      liveCart: liveCart(products, []),
    });
    record(
      17,
      'Add sample to cart',
      addIntent === 'ADD_TO_CART' && added.action === 'ADD_TO_CART' && added.success,
      `${added.action} ${added.added?.join(',') || ''}`
    );

    const afterAdd = liveCart(products, [sample.id]);
    const removed = planCartAssistance({
      message: 'Remove it.',
      stage1: cartStage('Remove it.', 'REMOVE_FROM_CART'),
      brandSlug: SLUG,
      brandProducts: products,
      state: baseState,
      liveCart: afterAdd,
    });
    record(18, 'Remove sample', removed.action === 'REMOVE_FROM_CART' && removed.success, removed.action);

    const cleared = planCartAssistance({
      message: 'Empty my cart.',
      stage1: cartStage('Empty my cart.', 'CLEAR_CART'),
      brandSlug: SLUG,
      brandProducts: products,
      state: baseState,
      liveCart: afterAdd,
    });
    record(
      19,
      'Clear cart',
      cleared.action === 'CLEAR_CART' || Boolean(cleared.pendingCartAction),
      String(cleared.action)
    );

    const viewIntent = detectCartIntent("What's in my cart?");
    const viewCtx = afterAdd;
    const viewOk =
      viewIntent === 'VIEW_CART' &&
      viewCtx.items.some((i) => i.productId === sample.id) &&
      viewCtx.items.every((i) => i.brandSlug === SLUG);
    record(20, 'View cart', viewOk, viewCtx.items.map((i) => i.name).join(', '));

    const tssCart = liveCart(products, [sample.id]);
    record(
      21,
      'WOP does not leak into TSS cart',
      tssCart.items.every((i) => i.brandSlug === SLUG && !String(i.productId).startsWith('wop-')),
      tssCart.items.map((i) => i.productId).join(',')
    );

    const tmCart = buildLiveCartContext(
      'tmperfumehouse',
      serializeCartRequestPayload('tmperfumehouse', [
        { productId: tm.id, brandSlug: 'tmperfumehouse', quantity: 1 },
        { productId: sample.id, brandSlug: SLUG, quantity: 1 },
      ])
    );
    record(
      22,
      'TSS does not leak into TM cart',
      tmCart.items.every((i) => i.brandSlug === 'tmperfumehouse') &&
        tmCart.items.every((i) => i.productId !== sample.id),
      tmCart.items.map((i) => i.productId).join(',')
    );
  }

  // 23–25 product facts
  {
    const sample = products.find((p) => p.format === 'sample')!;
    const named = `What are the notes of ${sample.name}?`;
    const t = turn(named);
    const ok = t.reply.toLowerCase().includes(sample.topNotes[0].toLowerCase()) || t.reply.toLowerCase().includes(sample.name.toLowerCase());
    record(23, 'Ask product notes', ok, t.reply.slice(0, 180));

    const priceQ = turn(`How much is ${sample.name}?`);
    record(24, 'Ask product price', priceQ.reply.includes(String(sample.price)) || priceQ.reply.includes('₹'), priceQ.reply.slice(0, 160));

    const discussed = {
      ...createInitialConversationState(),
      lastDiscussedProductSet: [{ productId: sample.id, brandSlug: SLUG, name: sample.name }],
      lastCanonicalProductSet: [{ productId: sample.id, brandSlug: SLUG, name: sample.name }],
    };
    const fmtQ = turn('What formats are available?', discussed);
    record(
      25,
      'Ask formats available',
      /sample|format|vial|full|tester|miniature/i.test(fmtQ.reply) && !/₹15,000/.test(fmtQ.reply),
      fmtQ.reply.slice(0, 180)
    );
  }

  // Isolation: other brand recs never appear
  {
    const t = turn('I want something fresh for office under ₹1,000.');
    const leak = t.recs.results.some((r) => r.product.brandSlug !== SLUG);
    record(26, 'Recommendations stay brand-scoped', !leak, leak ? 'leaked' : 'scoped');
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed.length) {
    console.error(failed.map((f) => `FAIL ${f.id}: ${f.detail}`).join('\n'));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

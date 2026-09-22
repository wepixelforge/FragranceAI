/**
 * TSS production smoke-test regressions (woody reset, cart truth, mist eligibility).
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-smoke-fixes.ts
 */
import { getBrand, getProduct, getProducts } from '../src/data';
import {
  applyExplicitReference,
  fallbackIntentClassifier,
  extractPostResetConsultation,
} from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import { planCartAssistance } from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import { isHairBodyMistProduct } from '../src/lib/sampling-format';
import { ConversationState } from '../src/types/chat';
import { Product } from '../src/types/product';

const SLUG = 'thescentstories';

function turn(message: string, state?: ConversationState) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const base = state || createInitialConversationState();
  const stage1 = applyExplicitReference(
    fallbackIntentClassifier(message, brand, products, base),
    message,
    products,
    base
  );
  const next = updateConversationState(base, stage1, message);
  const prefs = toStructuredPreferences(next, message);
  const recs = getRecommendations(prefs, products);
  return { stage1, state: next, prefs, recs };
}

function cartReply(message: string, namesInCart: string[] = []) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const items = namesInCart.map((name) => {
    const product = products.find((p) => p.name === name || p.id === name);
    if (!product) throw new Error(`missing ${name}`);
    return { productId: product.id, brandSlug: SLUG, quantity: 1 };
  });
  const liveCart = buildLiveCartContext(SLUG, serializeCartRequestPayload(SLUG, items));
  const base = createInitialConversationState();
  const stage1 = fallbackIntentClassifier(message, brand, products, base);
  const state = updateConversationState(base, stage1, message);
  const planned = planCartAssistance({
    message,
    stage1,
    brandSlug: SLUG,
    brandProducts: products,
    state,
    liveCart,
  });
  const reply = fallbackResponseGenerator(message, brand, stage1, products, [], state, {
    actionContext: {
      intent: 'CART_ASSISTANCE',
      cart_action: {
        action: planned.action,
        success: planned.success,
        productName: planned.added?.join(', '),
        added: planned.action === 'ADD_TO_CART' ? planned.added : undefined,
        removed: planned.action === 'REMOVE_FROM_CART' ? planned.added : undefined,
        failed: planned.failed,
      },
    },
  });
  return { stage1, planned, reply };
}

function record(
  results: { id: string; ok: boolean; detail: string }[],
  id: string,
  ok: boolean,
  detail: string
) {
  results.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
}

function main() {
  const results: { id: string; ok: boolean; detail: string }[] = [];
  const products = getProducts(SLUG);
  const woodyCatalogue = products.filter((p) => p.fragranceFamily.includes('woody'));
  const sheerPeach = getProduct(SLUG, 'ck-sheer-peach-1-2ml')!;
  const alNoor = getProduct(SLUG, 'arabiyat-prestige-al-noor-2ml')!;

  const combined = turn('Start fresh. I want something woody.');
  record(
    results,
    'A1',
    combined.stage1.intent !== 'RESET_CONSULTATION' &&
      combined.state.activeRequest.families.includes('woody') &&
      combined.recs.results.length > 0 &&
      combined.recs.results.every((r) => r.product.fragranceFamily.includes('woody')) &&
      !combined.state.backgroundContext.referencePerfume &&
      combined.state.activeRequest.budget.max == null,
    `intent=${combined.stage1.intent} families=${combined.state.activeRequest.families.join(',')} n=${combined.recs.results.length} ${combined.recs.results.map((r) => r.product.name).join(' | ')}`
  );
  record(
    results,
    'A1b',
    extractPostResetConsultation('Start fresh. I want something woody.') === 'I want something woody' &&
      extractPostResetConsultation('Start fresh.') === null,
    `remainder=${extractPostResetConsultation('Start fresh. I want something woody.')}`
  );

  const splitReset = turn('Start fresh.');
  const splitWoody = turn('woody', splitReset.state);
  record(
    results,
    'A2',
    splitReset.stage1.intent === 'RESET_CONSULTATION' &&
      splitWoody.state.activeRequest.families.includes('woody') &&
      splitWoody.recs.results.length > 0 &&
      woodyCatalogue.length > 0,
    `reset=${splitReset.stage1.intent} families=${splitWoody.state.activeRequest.families.join(',')} n=${splitWoody.recs.results.length}`
  );

  const fruity = turn('Start fresh. I want something fruity.');
  record(
    results,
    'B',
    fruity.recs.results.length > 0 &&
      fruity.state.activeRequest.families.includes('fruity') &&
      !fruity.recs.results.some((r) => isHairBodyMistProduct(r.product)),
    fruity.recs.results.map((r) => r.product.name).join(' | ')
  );

  const budget = turn('Under ₹1,000');
  const budgetFruity = turn('fruity', budget.state);
  record(
    results,
    'C',
    budgetFruity.recs.results.length > 0 &&
      budgetFruity.recs.results.every((r) => r.product.price <= 1000) &&
      !budgetFruity.recs.results.some((r) => isHairBodyMistProduct(r.product)),
    budgetFruity.recs.results.map((r) => `${r.product.name} ₹${r.product.price}`).join(', ')
  );

  const sauvage = turn('I want something similar to Sauvage.');
  const warmer = turn('Make it warmer.', sauvage.state);
  record(
    results,
    'D',
    /sauvage/i.test(warmer.state.backgroundContext.referencePerfume || '') &&
      warmer.state.activeRequest.isSimilarityRequest === true &&
      warmer.state.activeRequest.warmth === 'warmer',
    `ref=${warmer.state.backgroundContext.referencePerfume} warmth=${warmer.state.activeRequest.warmth}`
  );

  const cheaper = turn('I want something similar to Sauvage but cheaper.');
  record(
    results,
    'E',
    /sauvage/i.test(cheaper.state.backgroundContext.referencePerfume || '') &&
      cheaper.state.activeRequest.relativePrice === 'cheaper' &&
      cheaper.state.activeRequest.budget.max == null,
    `rel=${cheaper.state.activeRequest.relativePrice} budget=${cheaper.state.activeRequest.budget.max}`
  );

  const add = cartReply('Add Al Noor');
  record(
    results,
    'F',
    add.planned.success === true &&
      add.planned.added?.length === 1 &&
      /al noor/i.test(add.planned.added?.[0] || '') &&
      !add.planned.failed?.length &&
      /added/i.test(add.reply) &&
      !/couldn.?t find|nothing was added/i.test(add.reply),
    `${add.reply} added=${add.planned.added?.join(',')} failed=${add.planned.failed?.join(',')}`
  );

  const unknown = cartReply('Add Night Elixir Supreme');
  record(
    results,
    'G',
    unknown.planned.success === false &&
      !/added /i.test(unknown.reply) &&
      /couldn.?t find|nothing was added|which fragrance/i.test(unknown.reply),
    unknown.reply
  );

  const remove = cartReply('Remove Al Noor', [alNoor.name]);
  record(
    results,
    'H',
    remove.planned.success === true &&
      /removed/i.test(remove.reply) &&
      /al noor/i.test(remove.reply),
    remove.reply
  );

  const mistAsk = turn('I want a hair and body mist');
  record(
    results,
    'I1',
    isHairBodyMistProduct(sheerPeach) &&
      mistAsk.recs.results.some((r) => r.product.id === 'tss-07'),
    `sheerPeach mist=${isHairBodyMistProduct(sheerPeach)} mistAsk=${mistAsk.recs.results.map((r) => r.product.name).join(' | ')}`
  );
  record(
    results,
    'I2',
    !fruity.recs.results.some((r) => r.product.id === 'tss-07'),
    `fruity excludes mist: ${fruity.recs.results.map((r) => r.product.id).join(',')}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main();

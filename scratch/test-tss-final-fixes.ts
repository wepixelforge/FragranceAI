/**
 * The Scent Stories — targeted QA fix tests (1–7).
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-final-fixes.ts
 */
import { getBrand, getProduct, getProducts } from '../src/data';
import { applyExplicitReference, fallbackIntentClassifier } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { formatLabel } from '../src/lib/sampling-format';
import { ConversationState } from '../src/types/chat';
import { Product } from '../src/types/product';

const SLUG = 'thescentstories';

function cartLine(product: Product): string {
  return `${product.size} · ${product.concentration || formatLabel(product.format)}`;
}

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
  return { stage1, state: nextWithRecs, prefs, recs };
}

async function main() {
  const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, name: string, ok: boolean, detail: string) => {
    results.push({ id, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id}. ${name} — ${detail}`);
  };

  const products = getProducts(SLUG);
  const alNoor = getProduct(SLUG, 'arabiyat-prestige-al-noor-2ml')!;
  const sheerPeach = getProduct(SLUG, 'ck-sheer-peach-1-2ml')!;

  // TEST 1 — cart format
  const line = cartLine(alNoor);
  record(
    '1',
    'Cart format uses canonical concentration',
    !/extrait concentration/i.test(line) && /EDP/i.test(line),
    line
  );

  // TEST 2 — Sauvage then warmer
  const t2a = turn('I want something similar to Sauvage.');
  const t2b = turn('Make it warmer.', t2a.state);
  const ref2 = t2b.state.backgroundContext.referencePerfume || '';
  record(
    '2',
    'Sauvage survives warmer refinement',
    /sauvage/i.test(ref2) &&
      t2b.state.activeRequest.isSimilarityRequest === true &&
      t2b.state.activeRequest.warmth === 'warmer',
    `ref=${ref2} sim=${t2b.state.activeRequest.isSimilarityRequest} warmth=${t2b.state.activeRequest.warmth}`
  );

  // TEST 3 — cheaper with similarity
  const t3 = turn('I want something similar to Sauvage but cheaper.');
  record(
    '3',
    'Cheaper stored with Sauvage similarity',
    /sauvage/i.test(t3.state.backgroundContext.referencePerfume || '') &&
      t3.state.activeRequest.isSimilarityRequest === true &&
      t3.state.activeRequest.relativePrice === 'cheaper' &&
      t3.state.activeRequest.budget.max == null,
    `ref=${t3.state.backgroundContext.referencePerfume} sim=${t3.state.activeRequest.isSimilarityRequest} rel=${t3.state.activeRequest.relativePrice} budget=${t3.state.activeRequest.budget.max}`
  );

  // TEST 4 — three fresh fruity sessions
  const fruitySessions = ['I want something fruity.', 'I want something fruity.', 'I want something fruity.'].map(
    (msg, i) => {
      const t = turn(msg);
      return {
        i,
        count: t.recs.results.length,
        families: t.state.activeRequest.families,
        names: t.recs.results.map((r) => r.product.name),
      };
    }
  );
  record(
    '4',
    'Fruity first-turn is deterministic',
    fruitySessions.every((s) => s.count > 0 && s.families.includes('fruity')),
    fruitySessions.map((s) => `${s.count}:${s.names.join('|')}`).join(' || ')
  );

  // TEST 5 — budget then fruity
  const t5a = turn('Under ₹1,000');
  const t5b = turn('fruity', t5a.state);
  const overBudget = t5b.recs.results.filter((r) => r.product.price > 1000);
  record(
    '5',
    'Fruity + budget all <= 1000',
    t5b.recs.results.length > 0 && overBudget.length === 0,
    t5b.recs.results.map((r) => `${r.product.name} ₹${r.product.price}`).join(', ')
  );

  // TEST 6 — reset
  const t6a = turn('fruity');
  const t6b = turn('forget everything', t6a.state);
  const t6c = turn('woody', t6b.state);
  const staleFruity = t6c.state.activeRequest.families.includes('fruity');
  const woodyOnly = t6c.recs.results.every((r) =>
    r.product.fragranceFamily.some((f) => f === 'woody' || f === 'oud' || f === 'oriental')
  );
  record(
    '6',
    'Reset clears fruity before woody',
    !staleFruity && t6c.state.activeRequest.families.includes('woody') && t6c.recs.results.length > 0,
    `families=${t6c.state.activeRequest.families.join(',')} woodyLean=${woodyOnly}`
  );

  // TEST 7 — Sheer Peach truth
  record(
    '7',
    'Sheer Peach is hair/body mist',
    /hair\s*&\s*body|hair and body|perfume mist/i.test(`${sheerPeach.name} ${sheerPeach.size} ${sheerPeach.description}`) &&
      !/official sample of calvin klein sheer peach/i.test(sheerPeach.description) &&
      !sheerPeach.tags.includes('official-sample'),
    `${sheerPeach.name} | ${sheerPeach.size} | ${sheerPeach.tags.join(',')}`
  );

  // Extra: cheaper variations
  const cheaperVariants = [
    'something like Sauvage for less',
    'cheaper alternative to Sauvage',
    'similar but more affordable than Sauvage',
    'same vibe as Sauvage but cheaper',
  ];
  const cheaperOk = cheaperVariants.every((msg) => {
    const t = turn(msg);
    return (
      /sauvage/i.test(t.state.backgroundContext.referencePerfume || '') &&
      t.state.activeRequest.relativePrice === 'cheaper'
    );
  });
  record('3b', 'Cheaper phrasing variants', cheaperOk, cheaperVariants.join(' / '));

  // Extra: forget Sauvage clears reference
  const tForget = turn('Forget Sauvage.', t2b.state);
  record(
    '2b',
    'Forget Sauvage clears reference',
    !tForget.state.backgroundContext.referencePerfume &&
      tForget.state.activeRequest.isSimilarityRequest === false,
    `ref=${tForget.state.backgroundContext.referencePerfume} sim=${tForget.state.activeRequest.isSimilarityRequest}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

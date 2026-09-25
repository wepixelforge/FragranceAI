/**
 * Targeted P1 correctness cases for Scentira format negation
 * and unknown PRODUCT_INFO identity. Does not replace test-scentira-ai.ts.
 */
import { getBrand, getProducts } from '../src/data';
import {
  applyExplicitReference,
  fallbackIntentClassifier,
  finalizeBrandStage1,
} from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import { isScentiraDecant, isScentiraFullBottle, scentiraSizeMl } from '../src/lib/scentira-format';
import { ConversationState } from '../src/types/chat';

const SLUG = 'scentira';

function turn(message: string, state?: ConversationState) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const prev = state || createInitialConversationState();
  const stage1 = finalizeBrandStage1(
    applyExplicitReference(fallbackIntentClassifier(message, brand, products, prev), message, products, prev),
    message,
    brand,
    products
  );
  const next = updateConversationState(prev, stage1, message);
  const prefs = toStructuredPreferences(next, message);
  const recs =
    stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'OUT_OF_SCOPE'
      ? {
          results: [] as ReturnType<typeof getRecommendations>['results'],
        }
      : getRecommendations(prefs, products, 3, [], Boolean(stage1.is_surprise_me || stage1.is_broad_recommendation));
  const infoProduct =
    stage1.intent === 'PRODUCT_INFO' && stage1.target_product_names?.[0]
      ? products.find((p) => p.name === stage1.target_product_names![0])
      : undefined;
  const reply = fallbackResponseGenerator(
    message,
    brand,
    stage1,
    infoProduct ? [infoProduct] : stage1.intent === 'PRODUCT_INFO' ? [] : products,
    recs.results,
    next,
    { catalogueProducts: products }
  );
  return { stage1, prefs, recs, reply, infoProduct };
}

const rows: { id: string; ok: boolean; detail: string }[] = [];
function record(id: string, ok: boolean, detail: string) {
  rows.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
}

function main() {
  const products = getProducts(SLUG);

  {
    const t = turn("I don't want a full bottle.");
    record(
      'P1-1',
      t.recs.results.length > 0 && t.recs.results.every((r) => !isScentiraFullBottle(r.product)),
      `n=${t.recs.results.length} formats=${t.recs.results.map((r) => `${r.product.id}:${r.product.format}`).join(',')}`
    );
  }
  {
    const t = turn('No full bottles.');
    record(
      'P1-2',
      t.recs.results.length > 0 && t.recs.results.every((r) => !isScentiraFullBottle(r.product)),
      `n=${t.recs.results.length} formats=${t.recs.results.map((r) => `${r.product.id}:${r.product.format}`).join(',')}`
    );
  }
  {
    const t = turn('I want a full bottle.');
    record(
      'P1-3',
      t.recs.results.length > 0 && t.recs.results.every((r) => isScentiraFullBottle(r.product)),
      `n=${t.recs.results.length} formats=${t.recs.results.map((r) => `${r.product.id}:${r.product.format}`).join(',')}`
    );
  }
  {
    const t = turn("I don't want a 5ml decant.");
    const excludedFive = t.recs.results.every(
      (r) => !(isScentiraDecant(r.product) && scentiraSizeMl(r.product) === 5)
    );
    record(
      'P1-4',
      t.recs.results.length > 0 && excludedFive,
      `n=${t.recs.results.length} sizes=${t.recs.results.map((r) => `${r.product.id}:${r.product.size}`).join(',')}`
    );
  }
  {
    const t = turn('Tell me about Sauvage Elixir exclusive unobtainium.');
    record(
      'P1-5',
      t.stage1.intent === 'PRODUCT_INFO' &&
        !t.infoProduct &&
        (t.stage1.target_product_names || []).length === 0 &&
        !/9pm elixir/i.test(t.reply) &&
        /don't have that exact fragrance|don't currently/i.test(t.reply),
      `intent=${t.stage1.intent} target=${t.stage1.target_product_names} reply=${t.reply.slice(0, 140)}`
    );
  }
  {
    const t = turn('Tell me about Khamrah Waha.');
    record(
      'P1-6',
      t.stage1.intent === 'PRODUCT_INFO' && Boolean(t.infoProduct) && /khamrah waha/i.test(t.infoProduct!.name),
      `${t.stage1.intent} ${t.infoProduct?.id || 'none'}`
    );
  }
  {
    const t = turn("What's the price of Khamrah Waha?");
    const named = t.infoProduct || products.find((p) => p.name === t.stage1.target_product_names?.[0]);
    record(
      'P1-7',
      t.stage1.intent === 'PRODUCT_INFO' &&
        Boolean(named) &&
        /khamrah waha/i.test(named!.name) &&
        t.reply.includes(String(named!.price)),
      `₹${named?.price} ${t.reply.slice(0, 120)}`
    );
  }
  {
    const t = turn('Something like Sauvage Elixir.');
    record(
      'P1-8',
      t.stage1.intent !== 'PRODUCT_INFO' &&
        (t.stage1.is_similarity_request === true ||
          t.stage1.intent === 'SIMILAR_TO_REFERENCE' ||
          t.stage1.intent === 'RECOMMENDATION' ||
          t.stage1.needs_recommendations === true),
      `intent=${t.stage1.intent} sim=${t.stage1.is_similarity_request} needs=${t.stage1.needs_recommendations}`
    );
  }

  const passed = rows.filter((r) => r.ok).length;
  console.log(`\nScentira P1 correctness ${passed}/${rows.length} PASS`);
  if (passed !== rows.length) process.exit(1);
}

main();

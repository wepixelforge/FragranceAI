/**
 * The Scent Stories — targeted agent/state/recommendation tests (1–14).
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-agent-state.ts
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
import { parseSamplingContext } from '../src/lib/sampling-format';
import { ConversationState } from '../src/types/chat';
import { extractCanonicalFamilies } from '../src/lib/fragrance-vocabulary';

const SLUG = 'thescentstories';

function turn(message: string, state?: ConversationState) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const base = state || createInitialConversationState();
  const stage1 = applyExplicitReference(
    fallbackIntentClassifier(message, brand, products, base),
    message,
    products
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
  const reply = fallbackResponseGenerator(message, brand, stage1, products, recs.results, nextWithRecs, {
    status: recs.canonicalResult.status,
    catalogueProducts: products,
  });
  return { stage1, state: nextWithRecs, prefs, recs, reply };
}

function snapshot(label: string, t: ReturnType<typeof turn>) {
  const a = t.state.activeRequest;
  return {
    label,
    intent: t.stage1.intent,
    families: a.families,
    freshness: a.freshness,
    occasion: a.occasion,
    budget: a.budget.max,
    reference: t.state.backgroundContext.referencePerfume,
    isSimilarity: a.isSimilarityRequest,
    format: a.formatPreference,
    greetingFlag: t.state.lastTurnWasGreeting,
    products: t.recs.results.map((r) => `${r.product.name} ₹${r.product.price} ${r.product.format}`),
    status: t.recs.canonicalResult.status,
    reply: t.reply,
  };
}

async function main() {
  const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, name: string, ok: boolean, detail: string) => {
    results.push({ id, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id}. ${name} — ${detail}`);
  };

  // ── Diagnostic: original failing conversation ────────────────────────────
  {
    console.log('\n===== TRACE: Date + Under ₹1,000 + Sauvage + hi + frooty + fruity =====');
    const date = turn('Something for a date');
    console.log(JSON.stringify(snapshot('after date', date), null, 2));
    const budget = turn('Under ₹1,000', date.state);
    console.log(JSON.stringify(snapshot('after budget', budget), null, 2));
    const sauvage = turn('Something similar to Sauvage', budget.state);
    console.log(JSON.stringify(snapshot('after sauvage', sauvage), null, 2));
    const hi = turn('hi', sauvage.state);
    console.log(JSON.stringify(snapshot('after hi', hi), null, 2));
    const frooty = turn('i want somehting frooty', hi.state);
    console.log(JSON.stringify(snapshot('after frooty', frooty), null, 2));
    const fruity = turn('fruity', frooty.state);
    console.log(JSON.stringify(snapshot('after fruity', fruity), null, 2));
  }

  // TEST 1
  {
    const t = turn('I want something fruity.');
    const families = t.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok =
      families.includes('fruity') &&
      !families.includes('fresh') &&
      !families.includes('sweet') &&
      !families.includes('citrus') &&
      !t.state.activeRequest.freshness &&
      t.recs.results.length > 0 &&
      t.recs.canonicalResult.status !== 'NO_VALID_MATCH' &&
      t.recs.results.every((r) => r.product.brandSlug === SLUG);
    record('1', 'Simple fruity', ok, ok ? `${t.recs.results.map((r) => r.product.name).join(' | ')}` : JSON.stringify({
      families,
      freshness: t.state.activeRequest.freshness,
      status: t.recs.canonicalResult.status,
      reply: t.reply,
    }));
  }

  // TEST 2
  {
    const t = turn('I want something frooty.');
    const families = t.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok =
      families.includes('fruity') &&
      extractCanonicalFamilies('frooty').includes('fruity') &&
      t.recs.results.length > 0;
    record('2', 'Typo frooty', ok, `${families.join(',')} / ${t.recs.results[0]?.product.name || t.recs.canonicalResult.status}`);
  }

  // TEST 3
  {
    const t = turn('I want something fruity and fresh.');
    const families = t.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok = families.includes('fruity') && (families.includes('fresh') || t.state.activeRequest.freshness === 'fresher');
    record('3', 'Fruity + fresh', ok, `families=${families.join(',')} freshness=${t.state.activeRequest.freshness}`);
  }

  // TEST 4
  {
    const first = turn('I want something fruity.');
    const second = turn('Make it fresher.', first.state);
    const families = second.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok = families.includes('fruity') && second.state.activeRequest.freshness === 'fresher';
    record('4', 'Fruity then fresher', ok, `families=${families.join(',')} freshness=${second.state.activeRequest.freshness}`);
  }

  // TEST 5
  {
    const first = turn('I want something fruity.');
    const second = turn('Actually, make it woody.', first.state);
    const families = second.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok = families.includes('woody') && !families.includes('fruity');
    record('5', 'Replace fruity with woody', ok, `families=${families.join(',')}`);
  }

  // TEST 6
  {
    const t = turn('I want something fruity under ₹1,000.');
    const over = t.recs.results.filter((r) => r.product.price > 1000);
    const ok =
      t.prefs.budget?.max === 1000 &&
      t.recs.results.length > 0 &&
      over.length === 0 &&
      t.recs.canonicalResult.products.every((p) => p.product.price <= 1000);
    record('6', 'Hard budget', ok, ok
      ? t.recs.results.map((r) => `${r.product.name} ₹${r.product.price}`).join(' | ')
      : `budget=${t.prefs.budget?.max} over=${over.map((r) => r.product.price).join(',')}`);
  }

  // TEST 7
  {
    const first = turn('I want something fruity under ₹1,000.');
    const second = turn('Show me something else.', first.state);
    const over = second.recs.results.filter((r) => r.product.price > 1000);
    const ok = second.state.activeRequest.budget.max === 1000 && over.length === 0;
    record('7', 'Budget + alternatives', ok, ok
      ? `${second.recs.results.length} alts, max ₹${second.state.activeRequest.budget.max}`
      : `budget=${second.state.activeRequest.budget.max} over=${over.map((r) => `${r.product.name} ₹${r.product.price}`).join(',')}`);
  }

  // TEST 8
  {
    const a = turn('Under ₹1,000');
    const b = turn('hi', a.state);
    const c = turn('I want something fruity.', b.state);
    const families = c.state.activeRequest.families.map((f) => f.toLowerCase());
    const staleBudgetGone = c.state.activeRequest.budget.max === null;
    const noSauvage = !c.state.backgroundContext.referencePerfume;
    const ok =
      b.stage1.intent === 'GREETING' &&
      b.state.lastTurnWasGreeting === true &&
      families.includes('fruity') &&
      staleBudgetGone &&
      noSauvage &&
      c.recs.results.length > 0 &&
      !/no_valid_match/i.test(String(c.recs.canonicalResult.status));
    record('8', 'Quick action then hi then fruity', ok, JSON.stringify({
      greeting: b.stage1.intent,
      families,
      budget: c.state.activeRequest.budget.max,
      reference: c.state.backgroundContext.referencePerfume,
      status: c.recs.canonicalResult.status,
      products: c.recs.results.map((r) => r.product.name),
    }));
  }

  // TEST 9
  {
    const t = turn('I want something similar to Sauvage but fruity.');
    const families = t.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok =
      Boolean(t.state.backgroundContext.referencePerfume?.toLowerCase().includes('sauvage')) &&
      t.state.activeRequest.isSimilarityRequest === true &&
      families.includes('fruity');
    record('9', 'Reference + fruity', ok, `${t.state.backgroundContext.referencePerfume} sim=${t.state.activeRequest.isSimilarityRequest} families=${families.join(',')}`);
  }

  // TEST 10
  {
    const first = turn('I want something similar to Sauvage.');
    const second = turn('Forget Sauvage. Give me something fruity.', first.state);
    const families = second.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok =
      second.state.backgroundContext.referencePerfume === null &&
      second.state.activeRequest.isSimilarityRequest === false &&
      families.includes('fruity');
    record('10', 'Clear reference', ok, `ref=${second.state.backgroundContext.referencePerfume} families=${families.join(',')}`);
  }

  // TEST 11
  {
    const parsed = parseSamplingContext("I've never tried this before. Can I sample it?");
    const t = turn("I've never tried this before. Can I sample it?");
    const ok =
      parsed.formatPreference === 'TRY_SAMPLE' &&
      t.state.activeRequest.formatPreference === 'TRY_SAMPLE' &&
      t.recs.results.every((r) => !r.product.format || r.product.format === 'sample' || r.product.format === 'vial');
    record('11', 'Sample-first format', ok, `pref=${t.state.activeRequest.formatPreference} ${t.recs.results.map((r) => `${r.product.name} (${r.product.format})`).join(' | ') || t.recs.canonicalResult.status}`);
  }

  // TEST 12
  {
    const first = turn("I've never tried this before. Can I sample it?");
    const second = turn('I already tried the sample and loved it. I want the full bottle.', first.state);
    const ok =
      second.state.activeRequest.formatPreference === 'FULL_SIZE' &&
      second.recs.results.every((r) => r.product.format !== 'sample' && r.product.format !== 'vial');
    record('12', 'Full-size after sample', ok, `pref=${second.state.activeRequest.formatPreference} ${second.recs.results.map((r) => `${r.product.name} (${r.product.format})`).join(' | ') || second.recs.canonicalResult.status}`);
  }

  // TEST 13
  {
    const t = turn('I want something fruity under ₹1,000.');
    const count = t.recs.results.length;
    const saysThree = /\b3 options\b/i.test(t.reply) || /\bthree options\b/i.test(t.reply);
    const saysTwo = /\btwo options\b/i.test(t.reply);
    const ok =
      count > 0 &&
      count === t.recs.canonicalResult.products.length &&
      (count === 2 ? saysTwo || !saysThree : count === 3 ? true : !saysThree || count === 3) &&
      !(count !== 3 && saysThree);
    record('13', 'Count matches canonical result', ok, `count=${count} reply=${t.reply}`);
  }

  // TEST 14
  {
    const t = turn('I want something fruity under ₹1,000.');
    const products = getProducts(SLUG);
    const ok = t.recs.results.every((r) => {
      const canonical = products.find((p) => p.id === r.product.id);
      return (
        Boolean(canonical) &&
        canonical!.name === r.product.name &&
        canonical!.price === r.product.price &&
        canonical!.format === r.product.format &&
        canonical!.id === r.product.id
      );
    });
    record('14', 'Product truth', ok, t.recs.results.map((r) => `${r.product.id} ${r.product.name} ₹${r.product.price} ${r.product.format}`).join(' | '));
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed.length) {
    console.error('Failed:', failed.map((f) => f.id).join(', '));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

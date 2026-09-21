/**
 * TSS reset / forget / creamy / hard-budget tests.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-reset-forget.ts
 */
import { getBrand, getProducts } from '../src/data';
import { applyExplicitReference, fallbackIntentClassifier, detectResetIntent } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import { ConversationState } from '../src/types/chat';

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
  const shouldRec = Boolean(stage1.needs_recommendations && !stage1.needs_clarification);
  const recs = shouldRec
    ? getRecommendations(prefs, products)
    : {
        results: [],
        canonicalResult: { status: 'EMPTY', products: [], type: 'recommendation' as const, appliedConstraints: [], excludedConstraints: [], compromises: [], hardConstraintFailed: false },
      };
  const nextWithRecs: ConversationState = {
    ...next,
    lastRecommendationIds: recs.results.map((r) => r.product.id),
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

function snap(label: string, t: ReturnType<typeof turn>) {
  const a = t.state.activeRequest;
  return {
    label,
    intent: t.stage1.intent,
    families: a.families,
    notes: a.preferredNotes,
    style: a.style,
    occasion: a.occasion,
    budget: a.budget.max,
    lastChange: t.state.lastPreferenceChange,
    cards: t.state.lastCanonicalProductSet?.map((p) => p.name) || [],
    overBudget: t.recs.results.filter((r) => a.budget.max != null && r.product.price > a.budget.max).map((r) => `${r.product.name} ₹${r.product.price}`),
    reply: t.reply,
  };
}

async function main() {
  const results: { id: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, name: string, ok: boolean, detail: string) => {
    results.push({ id, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id}. ${name} — ${detail}`);
  };

  record('R0', 'forgot everything is RESET', detectResetIntent('forgot everything') && detectResetIntent('forget all that') && detectResetIntent('clear everything') && detectResetIntent('ignore everything before this') && !detectResetIntent('forgot that') && !detectResetIntent('forget that'), 'reset phrases');

  // TEST 1
  {
    const a = turn('I want something fruity.');
    const b = turn('forget everything', a.state);
    const c = turn('I want something creamy.', b.state);
    const ok =
      b.stage1.intent === 'RESET_CONSULTATION' &&
      b.state.activeRequest.families.length === 0 &&
      b.state.lastCanonicalProductSet?.length === 0 &&
      !c.state.activeRequest.families.includes('fruity') &&
      c.state.activeRequest.occasion == null &&
      (c.stage1.needs_clarification === true || c.state.activeRequest.preferredNotes.includes('creamy'));
    record('1', 'RESET then creamy', ok, JSON.stringify(snap('creamy', c)));
  }

  // TEST 2
  {
    const a = turn('I want something fruity.');
    const b = turn('forget that', a.state);
    const c = turn('I want something woody.', b.state);
    const ok =
      !b.state.activeRequest.families.includes('fruity') &&
      c.state.activeRequest.families.includes('woody') &&
      !c.state.activeRequest.families.includes('fruity');
    record('2', 'Forget last preference', ok, JSON.stringify({ afterForget: b.state.activeRequest.families, afterWoody: c.state.activeRequest.families, reply: b.reply }));
  }

  // TEST 3
  {
    const a = turn('I want something fruity and fresh.');
    const b = turn('forget fruity', a.state);
    const ok =
      !b.state.activeRequest.families.includes('fruity') &&
      (b.state.activeRequest.families.includes('fresh') || b.state.activeRequest.freshness === 'fresher');
    record('3', 'Forget specific fruity', ok, `families=${b.state.activeRequest.families.join(',')} freshness=${b.state.activeRequest.freshness}`);
  }

  // TEST 4
  {
    const a = turn('Under ₹1,000.');
    const b = turn('Forget the budget.', a.state);
    const c = turn('I want something premium.', b.state);
    const ok = a.state.activeRequest.budget.max === 1000 && b.state.activeRequest.budget.max == null && c.state.activeRequest.budget.max == null;
    record('4', 'Forget the budget', ok, `a=${a.state.activeRequest.budget.max} b=${b.state.activeRequest.budget.max} c=${c.state.activeRequest.budget.max}`);
  }

  // TEST 5
  {
    const a = turn('Under ₹1,000.');
    const b = turn('Show me fruity options.', a.state);
    const over = b.recs.results.filter((r) => r.product.price > 1000);
    const ok = b.prefs.budget?.max === 1000 && b.recs.results.length > 0 && over.length === 0;
    record('5', 'Hard budget + fruity', ok, ok ? b.recs.results.map((r) => `${r.product.name} ₹${r.product.price}`).join(' | ') : `budget=${b.prefs.budget?.max} over=${over.map((r) => r.product.price)}`);
  }

  // TEST 6
  {
    const a = turn('Under ₹1,000.');
    const b = turn('Show me fruity options.', a.state);
    const c = turn('Show me something else.', b.state);
    const over = c.recs.results.filter((r) => r.product.price > 1000);
    const ok = c.state.activeRequest.budget.max === 1000 && over.length === 0;
    record('6', 'Hard budget + alternatives', ok, `alts=${c.recs.results.map((r) => `₹${r.product.price}`).join(',')}`);
  }

  // TEST 7
  {
    const t = turn('I want something creamy.');
    const ok =
      t.stage1.needs_clarification === true &&
      !t.state.activeRequest.families.includes('fruity') &&
      (t.state.activeRequest.preferredNotes.includes('creamy') || t.stage1.ambiguous_term === 'creamy');
    record('7', 'Creamy clarification', ok, `${t.stage1.intent} ${t.stage1.clarification_question || t.reply}`);
  }

  // TEST 8
  {
    const a = turn('I want something creamy.');
    const b = turn('Rich and woody.', a.state);
    const families = b.state.activeRequest.families.map((f) => f.toLowerCase());
    const reply = b.reply.toLowerCase();
    const ok =
      families.includes('woody') &&
      !families.includes('fruity') &&
      b.state.activeRequest.occasion == null &&
      (b.state.activeRequest.style === 'rich' || b.state.activeRequest.preferredNotes.includes('creamy')) &&
      !reply.includes('fruity') &&
      !reply.includes('office');
    record('8', 'Creamy → rich woody', ok, JSON.stringify(snap('rich woody', b)));
  }

  // TEST 9
  {
    const a = turn('I want something fruity.');
    const b = turn('forget everything', a.state);
    const c = turn('I want something woody.', b.state);
    const ok =
      b.stage1.intent === 'RESET_CONSULTATION' &&
      (b.state.lastCanonicalProductSet || []).length === 0 &&
      c.state.activeRequest.families.includes('woody') &&
      !c.state.activeRequest.families.includes('fruity') &&
      !/fruity/i.test(c.reply);
    record('9', 'RESET after recommendation', ok, `cards=${(b.state.lastCanonicalProductSet || []).length} woody=${c.state.activeRequest.families.join(',')} reply=${c.reply.slice(0, 80)}`);
  }

  // TEST 10 — original failure replay
  {
    console.log('\n===== TRACE original conversation =====');
    let s = turn('Something for a date');
    console.log(JSON.stringify(snap('date', s), null, 2));
    s = turn('Under ₹1,000', s.state);
    console.log(JSON.stringify(snap('budget', s), null, 2));
    s = turn('Something similar to Sauvage', s.state);
    console.log(JSON.stringify(snap('sauvage', s), null, 2));
    s = turn('hi', s.state);
    console.log(JSON.stringify(snap('hi', s), null, 2));
    s = turn('I want something for office', s.state);
    console.log(JSON.stringify(snap('office', s), null, 2));
    s = turn('something fruity', s.state);
    console.log(JSON.stringify(snap('fruity', s), null, 2));
    const afterFruity = s;
    s = turn('forgot that', s.state);
    console.log(JSON.stringify(snap('forgot that', s), null, 2));
    s = turn('I want something creamy', s.state);
    console.log(JSON.stringify(snap('creamy', s), null, 2));
    s = turn('forgot everything', s.state);
    console.log(JSON.stringify(snap('forgot everything', s), null, 2));
    const afterReset = s;
    s = turn('I want something creamy', s.state);
    console.log(JSON.stringify(snap('creamy2', s), null, 2));
    s = turn('rich and woody', s.state);
    console.log(JSON.stringify(snap('rich woody', s), null, 2));

    const budgetOk = afterFruity.state.activeRequest.budget.max == null
      || afterFruity.recs.results.every((r) => r.product.price <= (afterFruity.state.activeRequest.budget.max || Infinity));
    const resetCleared =
      afterReset.stage1.intent === 'RESET_CONSULTATION' &&
      afterReset.state.activeRequest.families.length === 0 &&
      afterReset.state.activeRequest.occasion == null &&
      (afterReset.state.lastCanonicalProductSet || []).length === 0;
    const finalOk =
      s.state.activeRequest.families.includes('woody') &&
      !s.state.activeRequest.families.includes('fruity') &&
      s.state.activeRequest.occasion == null &&
      !/fruity/i.test(s.reply) &&
      !/office/i.test(s.reply);
    const noCoachAfterReset = !(afterReset.state.lastCanonicalProductSet || []).some((p) => /coach floral/i.test(p.name));
    record('10', 'Original conversation replay', budgetOk && resetCleared && finalOk && noCoachAfterReset, JSON.stringify({
      budgetOk,
      resetCleared,
      finalFamilies: s.state.activeRequest.families,
      finalOccasion: s.state.activeRequest.occasion,
      reply: s.reply,
    }));
  }

  // A — budget-only wording
  {
    const t = turn('Under ₹1,000');
    const over = t.recs.results.filter((r) => r.product.price > 1000);
    const reply = t.reply.toLowerCase();
    const ok =
      t.state.activeRequest.budget.max === 1000 &&
      t.recs.results.length > 0 &&
      over.length === 0 &&
      !/based on under/.test(reply) &&
      (/under ₹1,?000/.test(t.reply) || /₹1,?000 budget/.test(t.reply));
    record('A', 'Budget-only wording', ok, JSON.stringify({ prices: t.recs.results.map((r) => r.product.price), reply: t.reply }));
  }

  // B — fruity
  {
    const t = turn('fruity');
    const ok =
      t.state.activeRequest.families.includes('fruity') &&
      t.recs.results.length > 0 &&
      t.recs.results.some((r) => r.product.fragranceFamily.some((f) => /fruit/i.test(f)) || [...r.product.topNotes, ...r.product.heartNotes, ...r.product.baseNotes].some((n) => /berry|peach|apple|mango|pear|pineapple|lychee|fruit/i.test(n)));
    record('B', 'Fruity recommendations', ok, JSON.stringify({ families: t.state.activeRequest.families, names: t.recs.results.map((r) => r.product.name) }));
  }

  // C — creamy → soft/vanillic → rich and woody (preserve compatible prefs)
  {
    const a = turn('creamy');
    const b = turn('soft/vanillic', a.state);
    const c = turn('rich and woody', b.state);
    const notes = c.state.activeRequest.preferredNotes.map((n) => n.toLowerCase());
    const families = c.state.activeRequest.families.map((f) => f.toLowerCase());
    const reply = c.reply.toLowerCase();
    const ok =
      notes.includes('creamy') &&
      notes.includes('vanilla') &&
      families.includes('woody') &&
      c.state.activeRequest.style === 'rich' &&
      !families.includes('fruity') &&
      c.state.activeRequest.occasion == null &&
      !reply.includes('fruity') &&
      !reply.includes('office') &&
      (/woody/.test(reply) || /vanilla/.test(reply) || /creamy/.test(reply) || /rich/.test(reply));
    record('C', 'Creamy + vanillic + rich woody', ok, JSON.stringify(snap('C', c)));
  }

  // D — forget vanilla then rich and woody
  {
    const a = turn('creamy');
    const b = turn('soft/vanillic', a.state);
    const c = turn('forget vanilla', b.state);
    const d = turn('rich and woody', c.state);
    const notesAfterForget = c.state.activeRequest.preferredNotes.map((n) => n.toLowerCase());
    const notes = d.state.activeRequest.preferredNotes.map((n) => n.toLowerCase());
    const families = d.state.activeRequest.families.map((f) => f.toLowerCase());
    const ok =
      !notesAfterForget.includes('vanilla') &&
      !notesAfterForget.includes('vanillic') &&
      !notes.includes('vanilla') &&
      !notes.includes('vanillic') &&
      notes.includes('creamy') &&
      families.includes('woody') &&
      d.state.activeRequest.style === 'rich';
    record('D', 'Forget vanilla then rich woody', ok, JSON.stringify({ afterForget: notesAfterForget, finalNotes: notes, families, style: d.state.activeRequest.style }));
  }

  // E — hard budget + alternatives
  {
    const a = turn('Under ₹1,000');
    const b = turn('fruity', a.state);
    const c = turn('show me something else', b.state);
    const overB = b.recs.results.filter((r) => r.product.price > 1000);
    const overC = c.recs.results.filter((r) => r.product.price > 1000);
    const ok =
      b.state.activeRequest.budget.max === 1000 &&
      c.state.activeRequest.budget.max === 1000 &&
      overB.length === 0 &&
      overC.length === 0 &&
      (b.recs.results.length === 0 || b.recs.results.length > 0);
    record('E', 'Budget + fruity + alternatives', ok, JSON.stringify({
      fruity: b.recs.results.map((r) => `₹${r.product.price}`),
      alts: c.recs.results.map((r) => `₹${r.product.price}`),
    }));
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

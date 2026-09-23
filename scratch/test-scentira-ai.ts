/**
 * Scentira AI fragrance-finder regression — Phase 2C.
 * Verifies intent/state AND canonical product IDs / format / size / price.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-scentira-ai.ts
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
import { planCartAssistance, toCanonicalProductSet } from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import {
  applyScentiraCartFollowUp,
  scentiraResolvedCartMessage,
  isScentiraDecant,
  isScentiraDiscoverySet,
  isScentiraFullBottle,
  scentiraSizeMl,
} from '../src/lib/scentira-format';
import { ConversationState } from '../src/types/chat';

const SLUG = 'scentira';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

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
  const recLimit = stage1.is_broad_recommendation ? 4 : 3;
  const recs =
    stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'OUT_OF_SCOPE'
      ? {
          results: [] as ReturnType<typeof getRecommendations>['results'],
          canonicalResult: { status: stage1.intent === 'OUT_OF_SCOPE' ? 'SKIPPED' : 'PRODUCT_INFO' },
        }
      : getRecommendations(
          prefs,
          products,
          recLimit,
          [],
          Boolean(stage1.is_surprise_me || stage1.is_broad_recommendation)
        );
  const infoProduct =
    stage1.intent === 'PRODUCT_INFO' && stage1.target_product_names?.[0]
      ? products.find((p) => p.name === stage1.target_product_names![0])
      : undefined;
  const recommendedIds = recs.results.map((r) => r.product.id);
  const discussed = infoProduct
    ? [{ productId: infoProduct.id, brandSlug: infoProduct.brandSlug, name: infoProduct.name }]
    : recs.results.map((r) => ({
        productId: r.product.id,
        brandSlug: r.product.brandSlug,
        name: r.product.name,
      }));
  const nextWithRecs: ConversationState = {
    ...next,
    lastRecommendationIds: recommendedIds.length ? recommendedIds : prev.lastRecommendationIds,
    lastCanonicalProductSet: discussed.length ? discussed : prev.lastCanonicalProductSet,
    lastDiscussedProductSet: discussed.length ? discussed : prev.lastDiscussedProductSet,
  };
  const reply = fallbackResponseGenerator(
    message,
    brand,
    stage1,
    infoProduct ? [infoProduct] : products,
    recs.results,
    nextWithRecs,
    {
      status: recs.canonicalResult.status,
      catalogueProducts: products,
    }
  );
  return { stage1, state: nextWithRecs, prefs, recs, reply, products, brand, infoProduct };
}

function cartFromRecs(message: string, recState: ConversationState) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const stage1 = finalizeBrandStage1(
    applyExplicitReference(fallbackIntentClassifier(message, brand, products, recState), message, products, recState),
    message,
    brand,
    products
  );
  const cartStage1 = applyScentiraCartFollowUp(stage1, message, recState);
  const planned = planCartAssistance({
    message: scentiraResolvedCartMessage(message, recState),
    stage1: cartStage1,
    brandSlug: SLUG,
    brandProducts: products,
    state: recState,
    liveCart: buildLiveCartContext(SLUG, serializeCartRequestPayload(SLUG, [])),
  });
  return { stage1: cartStage1, planned };
}

function allScentira(recs: ReturnType<typeof getRecommendations>) {
  return recs.results.length > 0 && recs.results.every((r) => r.product.brandSlug === SLUG);
}

function noInventedOriginalKhamrah(recs: ReturnType<typeof getRecommendations>) {
  return recs.results.every((r) => {
    const n = r.product.name.toLowerCase();
    if (!/\bkhamrah\b/.test(n)) return true;
    return /\b(waha|dukhan|discovery|set|qahwa)\b/.test(n);
  });
}

async function main() {
  const results: { id: string; name: string; group: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, group: string, name: string, ok: boolean, detail: string) => {
    results.push({ id, name, group, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} [${group}] ${name} — ${detail}`);
  };

  const brand = getBrand(SLUG);
  const products = getProducts(SLUG);
  assert(Boolean(brand), 'Scentira brand missing');
  assert(products.length === 55, `expected 55 Scentira SKUs, got ${products.length}`);

  // A. Discovery
  {
    const t = turn('Something fresh for summer.');
    record(
      '1',
      'Discovery',
      'Something fresh for summer',
      allScentira(t.recs) && t.recs.results.every((r) => r.product.id.startsWith('scentira-')),
      t.recs.results.map((r) => r.product.id).join(', ')
    );
  }
  {
    const t = turn('Something woody for office.');
    record(
      '2',
      'Discovery',
      'Something woody for office',
      allScentira(t.recs) && t.recs.results.every((r) => r.product.brandSlug === SLUG),
      t.recs.results.map((r) => `${r.product.id}:${r.product.price}`).join(', ')
    );
  }
  {
    const t = turn('Something sweet for date night.');
    record(
      '3',
      'Discovery',
      'Something sweet for date night',
      allScentira(t.recs),
      t.recs.results.map((r) => r.product.id).join(', ')
    );
  }
  {
    const t = turn("I don't know what I like.");
    record(
      '4',
      'Discovery',
      "I don't know what I like",
      t.stage1.needs_recommendations === true &&
        t.stage1.intent !== 'OUT_OF_SCOPE' &&
        t.recs.results.length >= 3 &&
        t.recs.results.length <= 4 &&
        allScentira(t.recs),
      `n=${t.recs.results.length} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }
  {
    const raw = fallbackIntentClassifier('What should I try?', brand!, products);
    const t = turn('What should I try?');
    record(
      '4a',
      'Discovery',
      'What should I try?',
      t.stage1.intent === 'RECOMMENDATION' &&
        t.stage1.needs_recommendations === true &&
        t.stage1.needs_clarification !== true &&
        t.recs.results.length >= 3 &&
        t.recs.results.length <= 4 &&
        allScentira(t.recs) &&
        finalizeBrandStage1(raw, 'What should I try?', brand!, products).intent === 'RECOMMENDATION',
      `raw=${raw.intent} n=${t.recs.results.length} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }
  {
    const t = turn('No preference.');
    record(
      '4b',
      'Discovery',
      'No preference.',
      t.stage1.needs_recommendations === true &&
        t.recs.results.length >= 3 &&
        t.recs.results.length <= 4 &&
        allScentira(t.recs),
      `n=${t.recs.results.length} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }

  // B. Reference
  {
    const t = turn('Something like Khamrah.');
    record(
      '5',
      'Reference',
      'Something like Khamrah',
      /khamrah/i.test(String(t.state.backgroundContext.referencePerfume || t.stage1.reference_perfume)) &&
        t.state.activeRequest.isSimilarityRequest === true &&
        allScentira(t.recs) &&
        noInventedOriginalKhamrah(t.recs),
      `ref=${t.state.backgroundContext.referencePerfume} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }
  {
    const t = turn('Something like Khamrah but less sweet.');
    record(
      '6',
      'Reference',
      'Something like Khamrah but less sweet',
      /khamrah/i.test(String(t.state.backgroundContext.referencePerfume)) &&
        t.state.activeRequest.isSimilarityRequest === true &&
        (t.prefs.exclusions?.fragranceFamilies || []).includes('sweet') &&
        allScentira(t.recs) &&
        noInventedOriginalKhamrah(t.recs) &&
        t.recs.results.every((r) => r.product.id !== 'scentira-006') &&
        t.recs.results.every((r) => !/gourmand|sweet woods/i.test(r.product.description || '')),
      `ref=${t.state.backgroundContext.referencePerfume} excl=${(t.prefs.exclusions?.fragranceFamilies || []).join(',')} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }
  {
    let t = turn('Something like Khamrah.');
    const firstIds = t.recs.results.map((r) => r.product.id);
    t = turn('Make it warmer.', t.state);
    record(
      '7',
      'Reference',
      'Make it warmer keeps Khamrah',
      /khamrah/i.test(String(t.state.backgroundContext.referencePerfume)) &&
        t.state.activeRequest.warmth === 'warmer' &&
        t.state.activeRequest.isSimilarityRequest === true &&
        allScentira(t.recs),
      `ref=${t.state.backgroundContext.referencePerfume} warmth=${t.state.activeRequest.warmth} prev=${firstIds.join(',')} now=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }
  {
    let t = turn('Something like Khamrah.');
    t = turn('Make it cheaper.', t.state);
    record(
      '8',
      'Reference',
      'Make it cheaper is relative',
      /khamrah/i.test(String(t.state.backgroundContext.referencePerfume)) &&
        t.state.activeRequest.relativePrice === 'cheaper' &&
        t.prefs.budget?.max == null &&
        allScentira(t.recs),
      `relative=${t.state.activeRequest.relativePrice} budget=${t.prefs.budget?.max} ids=${t.recs.results.map((r) => `${r.product.id}:₹${r.product.price}`).join(',')}`
    );
  }

  // C. Budget
  {
    const t = turn('Under ₹1000.');
    record(
      '9',
      'Budget',
      'Under ₹1000',
      t.prefs.budget?.max === 1000 &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => r.product.price <= 1000 && r.product.brandSlug === SLUG),
      t.recs.results.map((r) => `${r.product.id}:₹${r.product.price}`).join(', ')
    );
  }
  {
    const t = turn('Around ₹1500.');
    const max = t.prefs.budget?.max;
    record(
      '10',
      'Budget',
      'Around ₹1500',
      typeof max === 'number' &&
        max >= 1500 &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => r.product.price <= (max as number) && r.product.brandSlug === SLUG),
      `max=${max} ${t.recs.results.map((r) => `${r.product.id}:₹${r.product.price}`).join(', ')}`
    );
  }

  // D. Format
  {
    const t = turn('I want a decant.');
    record(
      '11',
      'Format',
      'I want a decant',
      t.prefs.scentiraDecantOnly === true &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => isScentiraDecant(r.product)),
      t.recs.results.map((r) => `${r.product.id}:${r.product.size}`).join(', ')
    );
  }
  {
    const t = turn('I want a 5ml decant.');
    record(
      '12',
      'Format',
      'I want a 5ml decant',
      t.prefs.requestedSizeMl === 5 &&
        t.prefs.scentiraDecantOnly === true &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => isScentiraDecant(r.product) && scentiraSizeMl(r.product) === 5),
      t.recs.results.map((r) => `${r.product.id}:${r.product.size}:₹${r.product.price}`).join(', ')
    );
  }
  {
    const t = turn('I want a full bottle.');
    record(
      '13',
      'Format',
      'I want a full bottle',
      t.state.activeRequest.formatPreference === 'FULL_SIZE' &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => isScentiraFullBottle(r.product)),
      t.recs.results.map((r) => `${r.product.id}:${r.product.format}:${r.product.size}`).join(', ')
    );
  }
  {
    const t = turn('I want to try it before buying.');
    record(
      '14',
      'Format',
      'Try it before buying',
      t.recs.results.length > 0 &&
        t.recs.results.every((r) => {
          const ml = scentiraSizeMl(r.product);
          return r.product.format === 'vial' || r.product.format === 'miniature' || ml === 5;
        }),
      t.recs.results.map((r) => `${r.product.id}:${r.product.format}:${r.product.size}`).join(', ')
    );
  }
  {
    const t = turn('Show me a discovery set.');
    record(
      '15',
      'Format',
      'Show me a discovery set',
      t.state.activeRequest.formatPreference === 'DISCOVERY_SET' &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => isScentiraDiscoverySet(r.product)),
      t.recs.results.map((r) => `${r.product.id}:${r.product.name}`).join(', ')
    );
  }

  // E. Combined
  {
    const t = turn('Something like Khamrah, less sweet, under ₹1000, and as a decant.');
    record(
      '16',
      'Combined',
      'Khamrah + less sweet + under 1000 + decant',
      /khamrah/i.test(String(t.state.backgroundContext.referencePerfume)) &&
        t.prefs.budget?.max === 1000 &&
        t.prefs.scentiraDecantOnly === true &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => isScentiraDecant(r.product) && r.product.price <= 1000) &&
        noInventedOriginalKhamrah(t.recs),
      `ref=${t.state.backgroundContext.referencePerfume} ${t.recs.results.map((r) => `${r.product.id}:${r.product.size}:₹${r.product.price}`).join(', ')}`
    );
  }
  {
    const t = turn('Something fresh for summer under ₹1000, 5ml only.');
    record(
      '17',
      'Combined',
      'Fresh summer under 1000 5ml only',
      t.prefs.budget?.max === 1000 &&
        t.prefs.requestedSizeMl === 5 &&
        t.recs.results.length > 0 &&
        t.recs.results.every((r) => scentiraSizeMl(r.product) === 5 && r.product.price <= 1000),
      t.recs.results.map((r) => `${r.product.id}:${r.product.size}:₹${r.product.price}`).join(', ')
    );
  }

  // F. Product information
  {
    const t = turn('Tell me about Khamrah Waha.');
    const named = products.find((p) => p.name === t.stage1.target_product_names?.[0]);
    record(
      '18',
      'Product information',
      'Tell me about Khamrah Waha',
      t.stage1.intent === 'PRODUCT_INFO' &&
        Boolean(named) &&
        /khamrah waha/i.test(named!.name) &&
        named!.brandSlug === SLUG,
      `${t.stage1.intent} ${named?.id || 'none'} ${named?.size || ''}`
    );
  }
  {
    const t = turn('How much is Khamrah Waha?');
    const named = products.find((p) => p.name === t.stage1.target_product_names?.[0]);
    record(
      '19',
      'Product information',
      'How much is Khamrah Waha',
      t.stage1.intent === 'PRODUCT_INFO' &&
        Boolean(named) &&
        t.reply.includes(String(named!.price)) &&
        !/official sample/i.test(t.reply),
      `₹${named?.price} ${t.reply.slice(0, 140)}`
    );
  }
  {
    const wahaDecant = products.find((p) => /khamrah waha/i.test(p.name) && isScentiraDecant(p))!;
    const discussed = {
      ...createInitialConversationState(),
      lastDiscussedProductSet: [{ productId: wahaDecant.id, brandSlug: SLUG, name: wahaDecant.name }],
      lastCanonicalProductSet: [{ productId: wahaDecant.id, brandSlug: SLUG, name: wahaDecant.name }],
    };
    const t = turn('Is this a decant?', discussed);
    record(
      '20',
      'Product information',
      'Is this a decant',
      t.stage1.intent === 'PRODUCT_INFO' &&
        (t.stage1.target_product_names?.[0] === wahaDecant.name || /decant/i.test(t.reply)) &&
        !/official sample/i.test(t.reply),
      `${t.stage1.intent} ${t.reply.slice(0, 160)}`
    );
  }

  // G. State
  {
    const recSet = turn('Something fresh for summer.');
    const first = recSet.recs.results[0]?.product;
    const third = recSet.recs.results[2]?.product;
    const firstOne = cartFromRecs('the first one', recSet.state);
    record(
      '21',
      'State',
      'recommendation → the first one',
      recSet.recs.results.length >= 1 &&
        firstOne.stage1.intent === 'CART_ASSISTANCE' &&
        firstOne.planned.action === 'ADD_TO_CART' &&
        firstOne.planned.success === true &&
        firstOne.planned.added?.[0] === first?.name,
      `added=${firstOne.planned.added?.join('|')} expected=${first?.name}`
    );

    const firstThird = cartFromRecs('first and third', recSet.state);
    record(
      '22',
      'State',
      'recommendation → first and third',
      Boolean(first) &&
        Boolean(third) &&
        firstThird.stage1.intent === 'CART_ASSISTANCE' &&
        firstThird.planned.success === true &&
        firstThird.planned.added?.includes(first!.name) === true &&
        firstThird.planned.added?.includes(third!.name) === true,
      `added=${firstThird.planned.added?.join('|')}`
    );

    const afterFirstThird: ConversationState = {
      ...recSet.state,
      lastSelectedProductSet: toCanonicalProductSet(
        recSet.recs.results
          .filter((_, idx) => idx === 0 || idx === 2)
          .map((r) => r.product),
        SLUG
      ),
    };
    const addIt = cartFromRecs('add it to cart', afterFirstThird);
    record(
      '22b',
      'State',
      'first and third → add it to cart',
      addIt.stage1.intent === 'CART_ASSISTANCE' &&
        addIt.planned.success === true &&
        addIt.planned.added?.includes(first!.name) === true &&
        addIt.planned.added?.includes(third!.name) === true,
      `added=${addIt.planned.added?.join('|')}`
    );

    const refined = turn('Make it warmer.', recSet.state);
    record(
      '23',
      'State',
      'recommendation → refinement',
      refined.state.activeRequest.warmth === 'warmer' &&
        allScentira(refined.recs) &&
        refined.recs.results.every((r) => r.product.brandSlug === SLUG),
      `warmth=${refined.state.activeRequest.warmth} ids=${refined.recs.results.map((r) => r.product.id).join(',')}`
    );

    const reset = turn('Start over.', recSet.state);
    const afterReset = turn('Something woody for office.', reset.state);
    record(
      '24',
      'State',
      'reset → new discovery',
      reset.stage1.intent === 'RESET_CONSULTATION' &&
        reset.state.activeRequest.families.length === 0 &&
        allScentira(afterReset.recs),
      `${reset.stage1.intent} then ${afterReset.recs.results.map((r) => r.product.id).join(',')}`
    );

    const budgeted = turn('Under ₹1000.');
    const forgot = turn('Forget the budget.', budgeted.state);
    const afterForget = turn('Show me something good.', forgot.state);
    record(
      '25',
      'State',
      'forget budget → new discovery',
      forgot.state.activeRequest.budget.max === null &&
        afterForget.recs.results.length >= 3 &&
        allScentira(afterForget.recs),
      `budget=${forgot.state.activeRequest.budget.max} n=${afterForget.recs.results.length}`
    );
  }

  // H. Out of scope
  {
    const t = turn('What is the capital of France?');
    record(
      '26',
      'Out-of-scope',
      'Capital of France',
      t.stage1.intent === 'OUT_OF_SCOPE' && t.stage1.needs_recommendations !== true && t.recs.results.length === 0,
      `${t.stage1.intent} recs=${t.recs.results.length}`
    );
  }
  {
    const t = turn('Write my resume.');
    record(
      '27',
      'Out-of-scope',
      'Write my resume',
      t.stage1.intent === 'OUT_OF_SCOPE' && t.stage1.needs_recommendations !== true,
      `${t.stage1.intent}`
    );
  }

  // I. Competitor / reference
  {
    const t = turn('I already use Bleu de Chanel.');
    record(
      '28',
      'Competitor/reference',
      'I already use Bleu de Chanel',
      t.stage1.needs_recommendations !== true &&
        t.stage1.intent === 'PREFERENCE_UPDATE' &&
        t.recs.results.length === 0 &&
        /chanel/i.test(String(t.stage1.reference_perfume || t.state.backgroundContext.referencePerfume)),
      `intent=${t.stage1.intent} ref=${t.stage1.reference_perfume}`
    );
  }
  {
    const t = turn('I currently use Bleu de Chanel.');
    record(
      '28b',
      'Competitor/reference',
      'I currently use Bleu de Chanel',
      t.stage1.needs_recommendations !== true &&
        t.stage1.intent === 'PREFERENCE_UPDATE' &&
        t.recs.results.length === 0 &&
        /chanel/i.test(String(t.stage1.reference_perfume || t.state.backgroundContext.referencePerfume)),
      `intent=${t.stage1.intent} ref=${t.stage1.reference_perfume}`
    );
  }
  {
    const raw = fallbackIntentClassifier('I want something like Bleu de Chanel.', brand!, products);
    const fixed = finalizeBrandStage1(raw, 'I want something like Bleu de Chanel.', brand!, products);
    const t = turn('Something like Bleu de Chanel.');
    record(
      '29',
      'Competitor/reference',
      'Something like Bleu de Chanel',
      t.stage1.needs_recommendations === true &&
        t.stage1.is_similarity_request === true &&
        /chanel/i.test(String(t.state.backgroundContext.referencePerfume || t.stage1.reference_perfume)) &&
        t.recs.results.length === 0 &&
        t.recs.canonicalResult.status === 'NO_VALID_MATCH' &&
        !/closest match|same DNA|similar to Bleu de Chanel/i.test(t.reply) &&
        fixed.intent === 'SIMILAR_TO_REFERENCE' &&
        fixed.needs_recommendations === true,
      `ref=${t.state.backgroundContext.referencePerfume} status=${t.recs.canonicalResult.status} ids=${t.recs.results.map((r) => r.product.id).join(',')} raw=${raw.intent}`
    );
  }
  {
    const t = turn('Something like Bleu de Chanel but fresher.');
    record(
      '29b',
      'Competitor/reference',
      'Something like Bleu de Chanel but fresher',
      t.stage1.is_similarity_request === true &&
        /chanel/i.test(String(t.state.backgroundContext.referencePerfume || t.stage1.reference_perfume)) &&
        t.recs.results.length === 0 &&
        !/closest match|same DNA/i.test(t.reply),
      `ref=${t.state.backgroundContext.referencePerfume} n=${t.recs.results.length}`
    );
  }

  // J. Exact catalogue truth
  {
    const t = turn('Do you have original Khamrah?');
    const invented =
      /\boriginal lattafa khamrah\b.*₹/i.test(t.reply) &&
      !/don'?t currently stock|do not currently|don't currently/i.test(t.reply);
    record(
      '30',
      'Exact catalogue truth',
      'Do you have original Khamrah',
      t.stage1.intent === 'PRODUCT_INFO' &&
        t.stage1.needs_recommendations !== true &&
        /waha|dukhan|discovery set/i.test(t.reply) &&
        /don'?t currently stock|do not currently|don't currently/i.test(t.reply) &&
        !invented &&
        !/official sample/i.test(t.reply),
      t.reply.slice(0, 220)
    );
  }

  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log(`\nScentira AI ${passed}/${results.length} PASS`);
  if (failed.length) {
    console.log('FAILED:');
    for (const item of failed) console.log(`  ${item.id} ${item.name} — ${item.detail}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

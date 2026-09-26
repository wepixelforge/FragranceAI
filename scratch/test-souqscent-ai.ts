/**
 * SouqScent AI consultant regression — Phase 2A.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-souqscent-ai.ts
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
import { planCartAssistance } from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import { ConversationState } from '../src/types/chat';
import { resolveSouqScentNamedProduct } from '../src/lib/souqscent-policy';

const SLUG = 'souqscent';
const OTHER_BRANDS = ['scentira', 'thescentstories', 'tmperfumehouse', 'worldofperfumers', 'almaham'];

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
    products,
    prev
  );
  const next = updateConversationState(prev, stage1, message);
  const prefs = toStructuredPreferences(next, message);
  const skipRecs =
    stage1.intent === 'PRODUCT_INFO' ||
    stage1.intent === 'COMPARE_PRODUCTS' ||
    stage1.intent === 'OUT_OF_SCOPE' ||
    stage1.intent === 'CART_ASSISTANCE';
  const recLimit = stage1.is_broad_recommendation ? 4 : 3;
  const useSurprise =
    Boolean(stage1.is_surprise_me || stage1.is_broad_recommendation) &&
    !prefs.budget?.max &&
    !prefs.gender &&
    !prefs.sillageMax &&
    !(prefs.exclusions?.fragranceFamilies && prefs.exclusions.fragranceFamilies.length > 0);
  const recs = skipRecs
    ? {
        results: [] as ReturnType<typeof getRecommendations>['results'],
        canonicalResult: { status: stage1.intent === 'OUT_OF_SCOPE' ? 'SKIPPED' : stage1.intent },
        hardConstraintFailed: false,
      }
    : getRecommendations(
        prefs,
        products,
        recLimit,
        [],
        useSurprise
      );
  const infoProduct =
    (stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'COMPARE_PRODUCTS') &&
    stage1.target_product_names?.[0]
      ? products.find((p) => p.name === stage1.target_product_names![0])
      : undefined;
  const compared = (stage1.target_product_names || [])
    .map((name) => products.find((p) => p.name === name))
    .filter(Boolean);
  const discussed =
    compared.length > 0
      ? compared.map((p) => ({ productId: p!.id, brandSlug: p!.brandSlug, name: p!.name }))
      : recs.results.map((r) => ({
          productId: r.product.id,
          brandSlug: r.product.brandSlug,
          name: r.product.name,
        }));
  const nextWithRecs: ConversationState = {
    ...next,
    lastRecommendationIds: recs.results.length ? recs.results.map((r) => r.product.id) : prev.lastRecommendationIds,
    lastCanonicalProductSet: discussed.length ? discussed : prev.lastCanonicalProductSet,
    lastDiscussedProductSet: discussed.length ? discussed : prev.lastDiscussedProductSet,
  };
  const reply = fallbackResponseGenerator(
    message,
    brand,
    stage1,
    compared.length > 0
      ? compared.map((p) => p!)
      : infoProduct
        ? [infoProduct]
        : stage1.intent === 'PRODUCT_INFO' || stage1.intent === 'COMPARE_PRODUCTS'
          ? []
          : products,
    recs.results,
    nextWithRecs,
    {
      status: String(recs.canonicalResult?.status || 'SUCCESS'),
      catalogueProducts: products,
      hardConstraintFailed: Boolean(recs.hardConstraintFailed),
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
    products,
    recState
  );
  const planned = planCartAssistance({
    message,
    stage1,
    brandSlug: SLUG,
    brandProducts: products,
    state: recState,
    liveCart: buildLiveCartContext(SLUG, serializeCartRequestPayload(SLUG, [])),
  });
  return { stage1, planned };
}

function allSouq(recs: ReturnType<typeof getRecommendations> | { results: { product: { brandSlug: string; id: string } }[] }) {
  return recs.results.length > 0 && recs.results.every((r) => r.product.brandSlug === SLUG && r.product.id.startsWith('souqscent-'));
}

function inventedClaims(text: string): boolean {
  return /top notes are|heart notes are|base notes are|\d+\s*[-–]\s*\d+\s*hours/i.test(text);
}

function isDiscoveryIntent(intent: string): boolean {
  return (
    intent === 'RECOMMENDATION' ||
    intent === 'REFINE_RECOMMENDATION' ||
    intent === 'FRAGRANCE_DISCOVERY' ||
    intent === 'SIMILAR_TO_REFERENCE'
  );
}

async function main() {
  const results: { id: string; name: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, name: string, ok: boolean, detail: string) => {
    results.push({ id, name, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name} — ${detail}`);
  };

  const brand = getBrand(SLUG);
  const products = getProducts(SLUG);
  assert(Boolean(brand), 'SouqScent brand missing');
  assert(products.length === 62, `expected 62 SouqScent SKUs, got ${products.length}`);
  assert(
    products.every((p) => p.id.startsWith('souqscent-') && p.brandSlug === SLUG),
    'product ID integrity failed'
  );

  {
    const t = turn('I need something fresh for office under ₹3000.');
    record(
      '1',
      'fresh office under ₹3000',
      isDiscoveryIntent(t.stage1.intent) &&
        t.prefs.budget?.max === 3000 &&
        (t.prefs.occasion || []).includes('office') &&
        (t.prefs.fragranceFamilies || []).includes('fresh') &&
        t.recs.results.length >= 3 &&
        t.recs.results.length <= 4 &&
        allSouq(t.recs) &&
        t.recs.results.every((r) => r.product.price <= 3000),
      `intent=${t.stage1.intent} n=${t.recs.results.length} max=${t.prefs.budget?.max} ids=${t.recs.results
        .map((r) => `${r.product.id}:₹${r.product.price}`)
        .join(',')}`
    );
  }

  {
    const t = turn(
      "I need something for Delhi summers. Fresh and masculine, good for office, at least 6 hours, but I don't want something too loud. Under ₹3000."
    );
    const texts = [
      t.reply,
      ...t.recs.results.map((r) => r.explanation),
      ...t.recs.results.flatMap((r) => (r.detailedReasons || []).map((d) => d.text)),
    ].join(' ');
    record(
      '2',
      'Delhi summer multi-preference',
      isDiscoveryIntent(t.stage1.intent) &&
        t.prefs.budget?.max === 3000 &&
        t.prefs.season?.[0] === 'summer' &&
        t.prefs.gender === 'men' &&
        (t.prefs.occasion || []).includes('office') &&
        (t.prefs.fragranceFamilies || []).includes('fresh') &&
        (t.prefs.sillagePreference === 'moderate' || t.state.activeRequest.sillage === 'moderate') &&
        (t.prefs.longevity === 'long-lasting' || t.prefs.longevityPreference === 'long-lasting') &&
        t.recs.results.length >= 2 &&
        t.recs.results.length <= 4 &&
        allSouq(t.recs) &&
        t.recs.results.every((r) => r.product.price <= 3000) &&
        t.recs.results.every((r) => r.product.gender !== 'women') &&
        !inventedClaims(texts),
      `season=${t.prefs.season} gender=${t.prefs.gender} long=${t.prefs.longevity} sillage=${t.prefs.sillagePreference || t.state.activeRequest.sillage} n=${t.recs.results.length}`
    );
  }

  {
    const t = turn("I don't like sweet perfumes.");
    record(
      '3',
      'negative sweet',
      isDiscoveryIntent(t.stage1.intent) &&
        (t.prefs.exclusions?.fragranceFamilies || []).includes('sweet') &&
        t.recs.results.length >= 3 &&
        allSouq(t.recs) &&
        t.recs.results.every(
          (r) =>
            !r.product.fragranceFamily.includes('sweet') && !r.product.fragranceFamily.includes('gourmand')
        ),
      `excl=${(t.prefs.exclusions?.fragranceFamilies || []).join(',')} ids=${t.recs.results
        .map((r) => `${r.product.id}:${r.product.fragranceFamily.join('/')}`)
        .join(',')}`
    );
  }

  {
    const t = turn('Something like Khamrah.');
    const named = resolveSouqScentNamedProduct('Khamrah', products);
    record(
      '4',
      'similar to Khamrah',
      t.stage1.intent === 'SIMILAR_TO_REFERENCE' &&
        /khamrah/i.test(String(t.stage1.reference_perfume || t.state.backgroundContext.referencePerfume)) &&
        t.state.activeRequest.isSimilarityRequest === true &&
        Boolean(named) &&
        named!.name === 'LATTAFA KHAMRAH WAHA' &&
        allSouq(t.recs),
      `intent=${t.stage1.intent} ref=${t.stage1.reference_perfume} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }

  {
    const t = turn('I want something like Khamrah but less sweet.');
    record(
      '5',
      'Khamrah + less sweet',
      /khamrah/i.test(String(t.stage1.reference_perfume || t.state.backgroundContext.referencePerfume)) &&
        t.state.activeRequest.isSimilarityRequest === true &&
        ((t.prefs.exclusions?.fragranceFamilies || []).includes('gourmand') ||
          (t.prefs.exclusions?.fragranceFamilies || []).includes('sweet')) &&
        t.recs.results.every((r) => r.product.brandSlug === SLUG) &&
        t.recs.results.every((r) => !r.product.fragranceFamily.includes('gourmand')),
      `ref=${t.stage1.reference_perfume} excl=${(t.prefs.exclusions?.fragranceFamilies || []).join(',')} n=${t.recs.results.length}`
    );
  }

  {
    const first = turn('I need something fresh for office under ₹3000.');
    const a = first.recs.results[0]?.product;
    const c = first.recs.results[2]?.product;
    const shown = turn('Show me the first and third.', first.state);
    record(
      '6',
      'show first and third',
      Boolean(a && c) &&
        shown.stage1.intent === 'COMPARE_PRODUCTS' &&
        shown.stage1.target_product_names?.[0] === a.name &&
        shown.stage1.target_product_names?.[1] === c.name &&
        shown.recs.results.length === 0,
      `targets=${(shown.stage1.target_product_names || []).join('|')} expected=${a?.name}|${c?.name}`
    );
  }

  {
    const first = turn('I need something fresh for office under ₹3000.');
    const second = first.recs.results[1]?.product;
    const cart = cartFromRecs('Add the second one to cart.', first.state);
    const addedId =
      cart.planned.cartActionPayload?.productId ||
      cart.planned.cartActionPayload?.items?.[0]?.productId ||
      cart.planned.cartActionPayload?.added?.[0]?.productId;
    record(
      '7',
      'add the second one',
      Boolean(second) &&
        cart.stage1.intent === 'CART_ASSISTANCE' &&
        cart.planned.action === 'ADD_TO_CART' &&
        cart.planned.success === true &&
        (addedId === second.id || cart.planned.added?.[0] === second.name) &&
        second.brandSlug === SLUG,
      `addedId=${addedId} expected=${second?.id} names=${cart.planned.added?.join('|')}`
    );
  }

  {
    const t = turn('Tell me about Khamrah Waha.');
    record(
      '8',
      'tell me about Khamrah Waha',
      t.stage1.intent === 'PRODUCT_INFO' &&
        t.stage1.target_product_names?.[0] === 'LATTAFA KHAMRAH WAHA' &&
        /3599|3,599/.test(t.reply) &&
        !inventedClaims(t.reply),
      `${t.stage1.intent} ${t.stage1.target_product_names?.[0]} ${t.reply.slice(0, 160)}`
    );
  }

  {
    const t = turn('Tell me about Sauvage Elixir exclusive unobtainium.');
    const substituted = resolveSouqScentNamedProduct('Sauvage Elixir exclusive unobtainium', products);
    record(
      '9',
      'no unsafe elixir substitution',
      t.stage1.intent === 'PRODUCT_INFO' &&
        (t.stage1.target_product_names || []).length === 0 &&
        substituted == null &&
        !/9\s*pm elixir/i.test(t.reply) &&
        /could not find|will not substitute/i.test(t.reply),
      `targets=${(t.stage1.target_product_names || []).join('|')} reply=${t.reply.slice(0, 140)}`
    );
  }

  {
    const t = turn('Compare Azul and Khamrah Waha.');
    record(
      '10',
      'compare Azul and Khamrah Waha',
      t.stage1.intent === 'COMPARE_PRODUCTS' &&
        t.stage1.target_product_names?.includes('RAYHAAN AZUL') === true &&
        t.stage1.target_product_names?.includes('LATTAFA KHAMRAH WAHA') === true &&
        /2800|2,800/.test(t.reply) &&
        /3599|3,599/.test(t.reply) &&
        /not specified in the available catalogue data|listed/i.test(t.reply) &&
        !inventedClaims(t.reply),
      `${(t.stage1.target_product_names || []).join('|')} ${t.reply.slice(0, 180)}`
    );
  }

  {
    const t = turn('What should I try?');
    const families = new Set(t.recs.results.flatMap((r) => r.product.fragranceFamily));
    const houses = new Set(t.recs.results.map((r) => r.product.houseBrand));
    record(
      '11',
      'what should I try',
      isDiscoveryIntent(t.stage1.intent) &&
        t.stage1.needs_recommendations === true &&
        t.recs.results.length >= 3 &&
        t.recs.results.length <= 4 &&
        allSouq(t.recs) &&
        (families.size >= 2 || houses.size >= 2),
      `n=${t.recs.results.length} families=${[...families].join(',')} houses=${[...houses].join(',')}`
    );
  }

  {
    const t = turn("I don't know what I like.");
    record(
      '12',
      "I don't know what I like",
      isDiscoveryIntent(t.stage1.intent) &&
        t.recs.results.length >= 3 &&
        t.recs.results.length <= 4 &&
        allSouq(t.recs) &&
        /occasion|budget|style|narrow/i.test(t.reply),
      `n=${t.recs.results.length} reply=${t.reply.slice(0, 160)}`
    );
  }

  {
    const t = turn('Under ₹3000 and at least 6 hours.');
    record(
      '13',
      'budget + hours not size',
      t.prefs.budget?.max === 3000 &&
        t.prefs.budget?.max !== 6 &&
        (t.prefs.longevity === 'long-lasting' || t.prefs.longevityPreference === 'long-lasting') &&
        t.recs.results.every((r) => r.product.price <= 3000) &&
        allSouq(t.recs),
      `budget=${t.prefs.budget?.max} long=${t.prefs.longevity} n=${t.recs.results.length}`
    );
  }

  {
    const t = turn('Who is Elon Musk?');
    record(
      '14',
      'Elon Musk out of scope',
      t.stage1.intent === 'OUT_OF_SCOPE' &&
        !(t.stage1.fragrance_families || []).includes('musky') &&
        t.recs.results.length === 0 &&
        !/musky/i.test(t.reply),
      `intent=${t.stage1.intent} families=${(t.stage1.fragrance_families || []).join(',')} ${t.reply.slice(0, 120)}`
    );
  }

  {
    const t = turn('Something not too sweet and not too loud.');
    record(
      '15',
      'not too sweet and not too loud',
      isDiscoveryIntent(t.stage1.intent) &&
        (t.prefs.sillagePreference === 'moderate' || t.state.activeRequest.sillage === 'moderate') &&
        ((t.prefs.exclusions?.fragranceFamilies || []).includes('gourmand') ||
          (t.prefs.exclusions?.fragranceFamilies || []).includes('sweet')) &&
        t.recs.results.length >= 1 &&
        t.recs.results.every((r) => !r.product.fragranceFamily.includes('gourmand')),
      `sillage=${t.prefs.sillagePreference || t.state.activeRequest.sillage} excl=${(t.prefs.exclusions?.fragranceFamilies || []).join(',')} n=${t.recs.results.length}`
    );
  }

  {
    const t = turn("I need a women's fragrance under ₹500 that lasts all day and has strong projection.");
    record(
      '16',
      'honest no-match under ₹500',
      t.prefs.budget?.max === 500 &&
        t.recs.results.length === 0 &&
        (t.recs.hardConstraintFailed === true || /couldn'?t find a match/i.test(t.reply)),
      `n=${t.recs.results.length} failed=${t.recs.hardConstraintFailed} ${t.reply.slice(0, 140)}`
    );
  }

  for (const slug of OTHER_BRANDS) {
    const otherBrand = getBrand(slug);
    const otherProducts = getProducts(slug);
    if (!otherBrand || otherProducts.length === 0) {
      record(`S-${slug}`, `${slug} smoke`, false, 'brand or products missing');
      continue;
    }
    const stage1 = finalizeBrandStage1(
      applyExplicitReference(
        fallbackIntentClassifier('Something fresh for summer.', otherBrand, otherProducts),
        'Something fresh for summer.',
        otherProducts
      ),
      'Something fresh for summer.',
      otherBrand,
      otherProducts
    );
    const state = updateConversationState(createInitialConversationState(), stage1, 'Something fresh for summer.');
    const prefs = toStructuredPreferences(state, 'Something fresh for summer.');
    const recs = getRecommendations(prefs, otherProducts, 3, [], false);
    record(
      `S-${slug}`,
      `${slug} isolation smoke`,
      recs.results.every((r) => r.product.brandSlug === slug) &&
        recs.results.every((r) => !r.product.id.startsWith('souqscent-')),
      `n=${recs.results.length} slugs=${[...new Set(recs.results.map((r) => r.product.brandSlug))].join(',')}`
    );
  }

  {
    const t = turn('I need something fresh for office under ₹3000.');
    const cart = cartFromRecs('Add the first one to cart.', t.state);
    const addedBrand =
      cart.planned.cartActionPayload?.brandSlug ||
      t.recs.results[0]?.product.brandSlug;
    record(
      'C1',
      'cart isolation',
      addedBrand === SLUG &&
        (cart.planned.cartActionPayload?.items || []).every((item) => !item.productId || item.productId.startsWith('souqscent-')) &&
        t.recs.results.every((r) => r.product.id.startsWith('souqscent-')),
      `brand=${addedBrand} ids=${t.recs.results.map((r) => r.product.id).join(',')}`
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed.length) {
    console.error(failed.map((f) => `FAIL ${f.id} ${f.name}: ${f.detail}`).join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

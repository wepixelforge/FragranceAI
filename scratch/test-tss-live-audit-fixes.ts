/**
 * TSS live-audit targeted regressions (product info, discovery, budget, format, OOS, cart).
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-live-audit-fixes.ts
 */
import { getBrand, getProducts } from '../src/data';
import {
  applyExplicitReference,
  extractBudgetUpdate,
  fallbackIntentClassifier,
  findProductByNameOrFuzzy,
  isBroadRecommendationQuery,
  isOpenEndedDiscoveryQuery,
} from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { fallbackResponseGenerator } from '../src/lib/response-generator';
import { findNamedProductsInText, planCartAssistance } from '../src/lib/cart-action-resolver';
import { buildLiveCartContext, serializeCartRequestPayload } from '../src/lib/live-cart-context';
import {
  isHairBodyMistProduct,
  parseSamplingContext,
  productMatchesFormat,
  userRequestsBodyMist,
  userRequestsSmallFormat,
} from '../src/lib/sampling-format';
import { ConversationState } from '../src/types/chat';

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
  const recLimit = stage1.is_broad_recommendation ? 4 : 3;
  const recs = stage1.needs_recommendations
    ? getRecommendations(
        prefs,
        products,
        recLimit,
        [],
        Boolean(stage1.is_surprise_me || stage1.is_broad_recommendation)
      )
    : {
        results: [],
        canonicalResult: { status: 'SUCCESS' as const },
        parsed: prefs,
        hardConstraintFailed: false,
      };
  const recommendedIds = recs.results.map((r) => r.product.id);
  const nextWithRecs: ConversationState = {
    ...next,
    lastRecommendationIds: recommendedIds.length > 0 ? recommendedIds : next.lastRecommendationIds,
    lastCanonicalProductSet:
      recs.results.length > 0
        ? recs.results.map((r) => ({
            productId: r.product.id,
            brandSlug: r.product.brandSlug,
            name: r.product.name,
          }))
        : next.lastCanonicalProductSet,
    lastDiscussedProductSet:
      recs.results.length > 0
        ? recs.results.map((r) => ({
            productId: r.product.id,
            brandSlug: r.product.brandSlug,
            name: r.product.name,
          }))
        : next.lastDiscussedProductSet,
  };
  return { brand, products, stage1, state: nextWithRecs, prefs, recs };
}

function productInfo(message: string, state?: ConversationState) {
  const t = turn(message, state);
  const target = t.stage1.target_product_names?.[0] || '';
  const product = target ? findProductByNameOrFuzzy(target, t.products) : undefined;
  const reply = fallbackResponseGenerator(message, t.brand, t.stage1, product ? [product] : [], [], t.state, {
    catalogueProducts: t.products,
  });
  return { ...t, product, reply };
}

function cartFromRecs(message: string, recState: ConversationState) {
  const brand = getBrand(SLUG)!;
  const products = getProducts(SLUG);
  const stage1 = applyExplicitReference(
    fallbackIntentClassifier(message, brand, products, recState),
    message,
    products,
    recState
  );
  const state = updateConversationState(recState, stage1, message);
  const liveCart = buildLiveCartContext(SLUG, serializeCartRequestPayload(SLUG, []));
  const planned = planCartAssistance({
    message,
    stage1,
    brandSlug: SLUG,
    brandProducts: products,
    state: recState,
    liveCart,
  });
  return { stage1, planned };
}

function main() {
  const results: { id: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, ok: boolean, detail: string) => {
    results.push({ id, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
  };

  const products = getProducts(SLUG);
  const alNoor = findNamedProductsInText('Al Noor', products)[0];
  const gucciFlora = findNamedProductsInText('Gucci Flora', products)[0];
  const sheerPeach = findNamedProductsInText('Sheer Peach', products)[0];

  record(
    '0-resolve',
    Boolean(alNoor?.name.includes('Al Noor')) &&
      Boolean(gucciFlora?.name.includes('Gucci Flora')) &&
      Boolean(sheerPeach?.name.includes('Sheer Peach')),
    `al=${alNoor?.name} flora=${gucciFlora?.name} peach=${sheerPeach?.name}`
  );

  const aboutAlNoor = productInfo('Tell me about Al Noor.');
  record(
    '1',
    aboutAlNoor.stage1.intent === 'PRODUCT_INFO' &&
      aboutAlNoor.stage1.needs_recommendations !== true &&
      aboutAlNoor.product?.id === alNoor?.id &&
      aboutAlNoor.reply.includes(alNoor!.name) &&
      !/couldn'?t find|no fragrance that matches/i.test(aboutAlNoor.reply),
    `intent=${aboutAlNoor.stage1.intent} product=${aboutAlNoor.product?.name}`
  );

  const sizeAlNoor = productInfo('What size is Al Noor?');
  record(
    '2',
    sizeAlNoor.stage1.intent === 'PRODUCT_INFO' &&
      sizeAlNoor.product?.id === alNoor?.id &&
      sizeAlNoor.reply.includes(alNoor!.size),
    `intent=${sizeAlNoor.stage1.intent} reply=${sizeAlNoor.reply}`
  );

  const edpAlNoor = productInfo('Is Al Noor EDP?');
  record(
    '3',
    edpAlNoor.stage1.intent === 'PRODUCT_INFO' &&
      edpAlNoor.product?.id === alNoor?.id &&
      /EDP/i.test(edpAlNoor.reply),
    `intent=${edpAlNoor.stage1.intent} conc=${edpAlNoor.product?.concentration} reply=${edpAlNoor.reply}`
  );

  const priceAlNoor = productInfo('How much is Al Noor?');
  record(
    '4',
    priceAlNoor.stage1.intent === 'PRODUCT_INFO' &&
      priceAlNoor.product?.price === alNoor?.price &&
      priceAlNoor.reply.includes(String(alNoor!.price)),
    `intent=${priceAlNoor.stage1.intent} reply=${priceAlNoor.reply}`
  );

  const aboutFlora = productInfo('Tell me about Gucci Flora.');
  record(
    '5',
    aboutFlora.stage1.intent === 'PRODUCT_INFO' && aboutFlora.product?.id === gucciFlora?.id,
    `intent=${aboutFlora.stage1.intent} product=${aboutFlora.product?.name}`
  );

  const sheerPerfume = productInfo('Is Sheer Peach a perfume?');
  record(
    '6',
    sheerPerfume.stage1.intent === 'PRODUCT_INFO' &&
      sheerPerfume.product?.id === sheerPeach?.id &&
      isHairBodyMistProduct(sheerPerfume.product!) &&
      /hair\s*&\s*body mist|hair and body mist/i.test(sheerPerfume.reply) &&
      !/\bEDP\b|\bEDT\b/.test(sheerPerfume.reply),
    `intent=${sheerPerfume.stage1.intent} reply=${sheerPerfume.reply}`
  );

  const whatSheer = productInfo('What is Sheer Peach?');
  record(
    '7',
    whatSheer.stage1.intent === 'PRODUCT_INFO' &&
      whatSheer.product?.id === sheerPeach?.id &&
      /mist/i.test(whatSheer.reply) &&
      /not a conventional/i.test(whatSheer.reply) &&
      !/\bis an EDP\b|\bis EDP\b/i.test(whatSheer.reply),
    `intent=${whatSheer.stage1.intent} reply=${whatSheer.reply}`
  );

  const followPrice = productInfo('How much is it?', aboutAlNoor.state);
  record(
    '8',
    followPrice.stage1.intent === 'PRODUCT_INFO' &&
      followPrice.product?.id === alNoor?.id &&
      followPrice.reply.includes(String(alNoor!.price)),
    `intent=${followPrice.stage1.intent} product=${followPrice.product?.name} reply=${followPrice.reply}`
  );

  const nothingSpecific = turn("I don't have anything specific in mind.");
  record(
    '9',
    isBroadRecommendationQuery("I don't have anything specific in mind.") &&
      nothingSpecific.stage1.needs_recommendations === true &&
      nothingSpecific.recs.results.length >= 3 &&
      nothingSpecific.recs.results.length <= 4 &&
      nothingSpecific.recs.canonicalResult.status !== 'NO_VALID_MATCH',
    `n=${nothingSpecific.recs.results.length} status=${nothingSpecific.recs.canonicalResult.status}`
  );

  const nothingParticular = turn("I don't have anything particular in mind.");
  record(
    '10',
    isBroadRecommendationQuery("I don't have anything particular in mind.") &&
      nothingParticular.recs.results.length >= 3 &&
      nothingParticular.recs.canonicalResult.status !== 'NO_VALID_MATCH',
    `n=${nothingParticular.recs.results.length}`
  );

  const openAnything = turn("I'm open to anything.");
  record(
    '11',
    isBroadRecommendationQuery("I'm open to anything.") &&
      openAnything.recs.results.length >= 3 &&
      openAnything.recs.canonicalResult.status !== 'NO_VALID_MATCH',
    `n=${openAnything.recs.results.length}`
  );

  const haveBudget = turn('I have a budget of ₹1000.');
  record(
    '12',
    extractBudgetUpdate('i have a budget of ₹1000.').max === 1000 &&
      haveBudget.state.activeRequest.budget.max === 1000 &&
      haveBudget.recs.results.length > 0 &&
      haveBudget.recs.results.every((r) => r.product.price <= 1000),
    `max=${haveBudget.state.activeRequest.budget.max} n=${haveBudget.recs.results.length} prices=${haveBudget.recs.results.map((r) => r.product.price).join(',')}`
  );

  const myBudget = turn('My budget is ₹1000.');
  record(
    '13',
    myBudget.state.activeRequest.budget.max === 1000 && myBudget.recs.results.length > 0,
    `max=${myBudget.state.activeRequest.budget.max} n=${myBudget.recs.results.length}`
  );

  const around = extractBudgetUpdate('around ₹1000.');
  const aroundTurn = turn('Around ₹1000.');
  record(
    '14',
    around.isBudgetPhrase &&
      around.max != null &&
      around.min != null &&
      around.min <= 1000 &&
      around.max >= 1000 &&
      aroundTurn.recs.results.length > 0 &&
      aroundTurn.recs.results.every((r) => r.product.price >= aroundTurn.state.activeRequest.budget.min! && r.product.price <= aroundTurn.state.activeRequest.budget.max!),
    `min=${aroundTurn.state.activeRequest.budget.min} max=${aroundTurn.state.activeRequest.budget.max} n=${aroundTurn.recs.results.length}`
  );

  const noMore = turn("I don't want to spend more than ₹1000.");
  record(
    '15',
    noMore.state.activeRequest.budget.max === 1000 && noMore.recs.results.length > 0,
    `max=${noMore.state.activeRequest.budget.max} n=${noMore.recs.results.length}`
  );

  const range = extractBudgetUpdate('₹500 to ₹1000.');
  const rangeTurn = turn('₹500 to ₹1000.');
  record(
    '16',
    range.min === 500 &&
      range.max === 1000 &&
      rangeTurn.state.activeRequest.budget.min === 500 &&
      rangeTurn.state.activeRequest.budget.max === 1000 &&
      rangeTurn.recs.results.length > 0 &&
      rangeTurn.recs.results.every((r) => r.product.price >= 500 && r.product.price <= 1000),
    `min=${rangeTurn.state.activeRequest.budget.min} max=${rangeTurn.state.activeRequest.budget.max} n=${rangeTurn.recs.results.length}`
  );

  const miniature = turn('I want a miniature.');
  record(
    '17',
    parseSamplingContext('I want a miniature.').formatPreference === 'MINIATURE' &&
      miniature.state.activeRequest.formatPreference === 'MINIATURE' &&
      miniature.recs.results.length > 0 &&
      miniature.recs.results.every((r) => productMatchesFormat(r.product, 'MINIATURE')),
    `format=${miniature.state.activeRequest.formatPreference} n=${miniature.recs.results.length} ${miniature.recs.results.map((r) => r.product.name).join(' | ')}`
  );

  const fullSize = turn('I want a full-size perfume.');
  record(
    '18',
    parseSamplingContext('I want a full-size perfume.').formatPreference === 'FULL_SIZE' &&
      fullSize.state.activeRequest.formatPreference === 'FULL_SIZE' &&
      fullSize.recs.results.length > 0 &&
      fullSize.recs.results.every((r) => productMatchesFormat(r.product, 'FULL_SIZE')),
    `format=${fullSize.state.activeRequest.formatPreference} n=${fullSize.recs.results.length} ${fullSize.recs.results.map((r) => r.product.name).join(' | ')}`
  );

  const hairMist = turn('I want a hair mist.');
  record(
    '19',
    userRequestsBodyMist('I want a hair mist.') &&
      hairMist.recs.results.length > 0 &&
      hairMist.recs.results.every((r) => isHairBodyMistProduct(r.product)),
    `n=${hairMist.recs.results.length} ${hairMist.recs.results.map((r) => r.product.name).join(' | ')}`
  );

  const fruityMist = turn('I want a fruity hair mist.');
  record(
    '20',
    fruityMist.recs.results.length > 0 &&
      fruityMist.recs.results.every((r) => isHairBodyMistProduct(r.product)) &&
      fruityMist.recs.results.some((r) => r.product.id === sheerPeach?.id || r.product.fragranceFamily.includes('fruity')),
    `n=${fruityMist.recs.results.length} ${fruityMist.recs.results.map((r) => r.product.name).join(' | ')}`
  );

  const somethingSmall = turn('I want something small.');
  record(
    '21',
    userRequestsSmallFormat('I want something small.') &&
      somethingSmall.recs.results.length > 0 &&
      somethingSmall.recs.canonicalResult.status !== 'NO_VALID_MATCH' &&
      somethingSmall.recs.results.every((r) =>
        ['pocket', 'miniature', 'sample'].includes(r.product.format || '')
      ),
    `n=${somethingSmall.recs.results.length} formats=${somethingSmall.recs.results.map((r) => r.product.format).join(',')}`
  );

  const shouldTry = turn('What should I try?');
  record(
    '22',
    isOpenEndedDiscoveryQuery('What should I try?') &&
      shouldTry.stage1.intent !== 'OUT_OF_SCOPE' &&
      (shouldTry.stage1.is_discovery_start === true || shouldTry.stage1.needs_recommendations === true),
    `intent=${shouldTry.stage1.intent} start=${shouldTry.stage1.is_discovery_start} recs=${shouldTry.stage1.needs_recommendations}`
  );

  const shouldGet = turn('What should I get?');
  record(
    '23',
    isOpenEndedDiscoveryQuery('What should I get?') && shouldGet.stage1.intent !== 'OUT_OF_SCOPE',
    `intent=${shouldGet.stage1.intent}`
  );

  const resume = turn('Help me with my resume.');
  record(
    '24',
    resume.stage1.intent === 'OUT_OF_SCOPE' && resume.stage1.needs_recommendations !== true,
    `intent=${resume.stage1.intent} recs=${resume.stage1.needs_recommendations}`
  );

  const betterDior = turn('Is this better than Dior?');
  record(
    '25',
    betterDior.stage1.intent !== 'RECOMMENDATION' &&
      betterDior.stage1.needs_recommendations !== true &&
      betterDior.stage1.intent !== 'OUT_OF_SCOPE',
    `intent=${betterDior.stage1.intent} recs=${betterDior.stage1.needs_recommendations}`
  );

  const alreadyChanel = turn('I already use Bleu de Chanel.');
  record(
    '26',
    alreadyChanel.stage1.needs_recommendations !== true &&
      (alreadyChanel.stage1.intent === 'PREFERENCE_UPDATE' ||
        alreadyChanel.stage1.intent === 'CUSTOMER_OBJECTION' ||
        alreadyChanel.stage1.intent === 'GENERAL_CONVERSATION') &&
      (alreadyChanel.stage1.reference_perfume || '').toLowerCase().includes('chanel'),
    `intent=${alreadyChanel.stage1.intent} ref=${alreadyChanel.stage1.reference_perfume}`
  );

  const copies = turn('Are these just copies?');
  record(
    '27',
    copies.stage1.intent === 'CUSTOMER_OBJECTION' && copies.stage1.needs_recommendations !== true,
    `intent=${copies.stage1.intent}`
  );

  const sauvage = turn("What's similar to Dior Sauvage?");
  record(
    '28',
    sauvage.stage1.needs_recommendations === true &&
      sauvage.stage1.intent !== 'OUT_OF_SCOPE' &&
      sauvage.recs.results.length > 0,
    `intent=${sauvage.stage1.intent} n=${sauvage.recs.results.length}`
  );

  const recSet = turn('Just suggest some good scents.');
  const first = recSet.recs.results[0]?.product;
  const third = recSet.recs.results[2]?.product;
  const firstOne = cartFromRecs('the first one', recSet.state);
  record(
    '29',
    recSet.recs.results.length >= 3 &&
      firstOne.stage1.intent === 'CART_ASSISTANCE' &&
      firstOne.planned.action === 'ADD_TO_CART' &&
      firstOne.planned.success === true &&
      firstOne.planned.added?.[0] === first?.name,
    `intent=${firstOne.stage1.intent} added=${firstOne.planned.added?.join('|')} expected=${first?.name}`
  );

  const both = cartFromRecs('both', recSet.state);
  record(
    '30',
    recSet.recs.results.length > 2
      ? both.planned.needsClarification === true && both.stage1.needs_recommendations !== true
      : both.planned.success === true && (both.planned.added?.length || 0) === 2,
    `nRecs=${recSet.recs.results.length} clarify=${both.planned.needsClarification} added=${both.planned.added?.join('|')}`
  );

  const firstThird = cartFromRecs('first and third', recSet.state);
  record(
    '31',
    firstThird.stage1.intent === 'CART_ASSISTANCE' &&
      firstThird.planned.success === true &&
      firstThird.planned.added?.includes(first!.name) === true &&
      firstThird.planned.added?.includes(third!.name) === true,
    `added=${firstThird.planned.added?.join('|')}`
  );

  const allOfThem = cartFromRecs('all of them', recSet.state);
  record(
    '32',
    allOfThem.stage1.intent === 'CART_ASSISTANCE' &&
      allOfThem.planned.success === true &&
      (allOfThem.planned.added?.length || 0) === recSet.recs.results.length,
    `added=${allOfThem.planned.added?.length} expected=${recSet.recs.results.length}`
  );

  const surprise = turn('Surprise me.');
  const goodScents = turn('Just suggest some good scents.');
  record(
    'preserve-open',
    surprise.recs.results.length > 0 &&
      goodScents.recs.results.length >= 3 &&
      extractBudgetUpdate('give me something under ₹500.').max === 500,
    `surprise=${surprise.recs.results.length} good=${goodScents.recs.results.length}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main();

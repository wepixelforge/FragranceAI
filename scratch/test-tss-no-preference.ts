/**
 * TSS: "no preference" after discovery must use the broad recommendation path.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-no-preference.ts
 */
import { getBrand, getProducts } from '../src/data';
import {
  applyExplicitReference,
  fallbackIntentClassifier,
  isBroadRecommendationQuery,
  isNoPreferenceQuery,
} from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
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
  };
  return { stage1, state: nextWithRecs, prefs, recs };
}

function isBroadSuccess(t: ReturnType<typeof turn>) {
  return (
    t.stage1.needs_recommendations === true &&
    t.stage1.needs_clarification !== true &&
    t.recs.results.length >= 3 &&
    t.recs.results.length <= 4 &&
    t.recs.canonicalResult.status !== 'NO_VALID_MATCH' &&
    t.recs.canonicalResult.status !== 'NO_ALTERNATIVES' &&
    !t.recs.hardConstraintFailed
  );
}

function main() {
  const results: { id: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, ok: boolean, detail: string) => {
    results.push({ id, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
  };

  record(
    '0-detectors',
    isNoPreferenceQuery('no preference') &&
      isNoPreferenceQuery("I don't have a preference.") &&
      isNoPreferenceQuery('anything is fine.') &&
      isNoPreferenceQuery("I'm open to anything.") &&
      isNoPreferenceQuery("I don't mind") &&
      isNoPreferenceQuery("I'll leave it to you") &&
      isBroadRecommendationQuery('no preference') &&
      !isNoPreferenceQuery('I want something woody') &&
      !isNoPreferenceQuery('Under ₹1000.'),
    'no-preference detectors'
  );

  const try1 = turn('What should I try?');
  const none1 = turn('no preference', try1.state);
  record(
    '1',
    try1.stage1.is_discovery_start === true &&
      try1.stage1.needs_recommendations !== true &&
      isBroadSuccess(none1) &&
      Boolean(none1.stage1.is_broad_recommendation || none1.stage1.is_surprise_me),
    `start=${try1.stage1.intent} follow=${none1.stage1.intent} n=${none1.recs.results.length} status=${none1.recs.canonicalResult.status} products=${none1.recs.results.map((r) => r.product.id).join(',')}`
  );

  const try2 = turn('What should I try?');
  const none2 = turn("I don't have a preference.", try2.state);
  record(
    '2',
    isBroadSuccess(none2),
    `n=${none2.recs.results.length} status=${none2.recs.canonicalResult.status} broad=${none2.stage1.is_broad_recommendation}`
  );

  const try3 = turn('What should I try?');
  const none3 = turn('anything is fine.', try3.state);
  record(
    '3',
    isBroadSuccess(none3),
    `n=${none3.recs.results.length} status=${none3.recs.canonicalResult.status}`
  );

  const budget = turn('Under ₹1000.');
  const noneBudget = turn('No preference.', budget.state);
  record(
    '4',
    budget.state.activeRequest.budget.max === 1000 &&
      noneBudget.state.activeRequest.budget.max === 1000 &&
      noneBudget.recs.results.length >= 3 &&
      noneBudget.recs.canonicalResult.status !== 'NO_VALID_MATCH' &&
      noneBudget.recs.results.every((r) => r.product.price <= 1000),
    `budget=${noneBudget.state.activeRequest.budget.max} n=${noneBudget.recs.results.length} prices=${noneBudget.recs.results.map((r) => r.product.price).join(',')}`
  );

  const sauvage = turn('Similar to Dior Sauvage.');
  const noneRef = turn('No preference.', sauvage.state);
  const ref = noneRef.state.backgroundContext.referencePerfume || '';
  record(
    '5',
    /sauvage/i.test(ref) &&
      noneRef.state.activeRequest.isSimilarityRequest === true &&
      noneRef.stage1.needs_recommendations === true &&
      noneRef.recs.results.length > 0 &&
      noneRef.recs.canonicalResult.status !== 'NO_VALID_MATCH',
    `ref=${ref} sim=${noneRef.state.activeRequest.isSimilarityRequest} n=${noneRef.recs.results.length}`
  );

  const fresh = turn('No preference.');
  record(
    '6',
    isBroadSuccess(fresh) && Boolean(fresh.stage1.is_broad_recommendation || fresh.stage1.is_surprise_me),
    `n=${fresh.recs.results.length} status=${fresh.recs.canonicalResult.status} products=${fresh.recs.results.map((r) => r.product.id).join(',')}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main();

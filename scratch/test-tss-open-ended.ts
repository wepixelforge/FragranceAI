/**
 * TSS conversational architecture: LLM-routed capability/discovery + broad recs.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-tss-open-ended.ts
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { getBrand, getProducts } from '../src/data';
import {
  applyExplicitReference,
  fallbackIntentClassifier,
  isBroadRecommendationQuery,
  isCapabilityQuery,
  isOpenEndedDiscoveryQuery,
  isSurpriseMeQuery,
} from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import {
  generateConversationalResponse,
  shouldUseLlmConversationalReply,
} from '../src/lib/response-generator';
import { ConversationState } from '../src/types/chat';
import { isHairBodyMistProduct } from '../src/lib/sampling-format';

const SLUG = 'thescentstories';

function loadLocalEnv() {
  const envPath = resolve(__dirname, '../.env.local');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadLocalEnv();

const OLD_CAPABILITY =
  "I can help you discover fragrances based on your preferences, occasion, budget, notes, intensity, or even a perfume you already like. Just tell me what you're looking for.";
const OLD_DISCOVERY =
  'I can help you find one. What kind of scents do you usually enjoy — fresh, sweet, woody, floral, or spicy?';

function noMatchCopy(text: string): boolean {
  return /couldn'?t find|no fragrance that matches|close fit for that combination|can'?t help with that topic/i.test(
    text
  );
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
        candidatesBeforeFilter: [],
        candidatesRemoved: [],
        validCandidates: [],
        filteredCount: 0,
        totalCatalogueCount: products.length,
        topScore: null,
      };
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
  return { brand, products, stage1, state: nextWithRecs, prefs, recs };
}

async function llmReply(message: string, t: ReturnType<typeof turn>) {
  return generateConversationalResponse(
    message,
    t.brand,
    t.stage1,
    t.products,
    t.recs.results,
    t.state,
    [],
    {
      status: t.stage1.needs_recommendations ? t.recs.canonicalResult.status : 'SUCCESS',
      catalogueProducts: t.products,
    }
  );
}

async function main() {
  const results: { id: string; ok: boolean; detail: string }[] = [];
  const record = (id: string, ok: boolean, detail: string) => {
    results.push({ id, ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
  };

  record(
    '0-detectors',
    isCapabilityQuery('What can you offer?') &&
      isCapabilityQuery('What do you offer?') &&
      isOpenEndedDiscoveryQuery('What do you think I would like?') &&
      isOpenEndedDiscoveryQuery('What fragrance would I like?') &&
      isSurpriseMeQuery('Surprise me.') &&
      isBroadRecommendationQuery(
        "I don't have any particular scent in my mind. I just want you to suggest me some good scents."
      ) &&
      !isCapabilityQuery('Recommend something woody.'),
    'capability/discovery/surprise/broad detectors'
  );

  const capability = turn('What can you offer?');
  const capabilityReply = await llmReply('What can you offer?', capability);
  record(
    '1',
    capability.stage1.intent === 'CAPABILITY' &&
      capability.stage1.needs_recommendations === false &&
      shouldUseLlmConversationalReply(capability.stage1) &&
      capability.stage1.clarification_question == null &&
      capabilityReply.trim() !== OLD_CAPABILITY &&
      !noMatchCopy(capabilityReply) &&
      !/can'?t help with that topic/i.test(capabilityReply),
    `intent=${capability.stage1.intent} llm=${shouldUseLlmConversationalReply(capability.stage1)} reply=${capabilityReply}`
  );

  const think = turn('What do you think I would like?');
  const thinkReply = await llmReply('What do you think I would like?', think);
  record(
    '2',
    think.stage1.intent === 'CLARIFICATION' &&
      think.stage1.is_discovery_start === true &&
      think.stage1.needs_recommendations === false &&
      think.stage1.clarification_question == null &&
      shouldUseLlmConversationalReply(think.stage1) &&
      thinkReply.trim() !== OLD_DISCOVERY &&
      thinkReply.includes('?') &&
      !noMatchCopy(thinkReply),
    `intent=${think.stage1.intent} start=${think.stage1.is_discovery_start} reply=${thinkReply}`
  );

  const fragrance = turn('What fragrance would I like?');
  const fragranceReply = await llmReply('What fragrance would I like?', fragrance);
  record(
    '3',
    fragrance.stage1.intent === 'CLARIFICATION' &&
      fragrance.stage1.is_discovery_start === true &&
      fragrance.stage1.needs_recommendations === false &&
      fragrance.stage1.clarification_question == null &&
      shouldUseLlmConversationalReply(fragrance.stage1) &&
      fragranceReply.trim() !== OLD_DISCOVERY &&
      !noMatchCopy(fragranceReply),
    `intent=${fragrance.stage1.intent} reply=${fragranceReply}`
  );

  const broadMsg =
    "I don't have any particular scent in my mind. I just want you to suggest me some good scents.";
  const broad = turn(broadMsg);
  const families = new Set(broad.recs.results.flatMap((r) => r.product.fragranceFamily));
  record(
    '4',
    broad.stage1.needs_recommendations === true &&
      broad.stage1.is_broad_recommendation === true &&
      broad.stage1.needs_clarification !== true &&
      shouldUseLlmConversationalReply(broad.stage1) &&
      broad.recs.results.length >= 3 &&
      broad.recs.results.length <= 4 &&
      broad.recs.canonicalResult.status !== 'NO_VALID_MATCH' &&
      broad.recs.results.every((r) => !isHairBodyMistProduct(r.product)) &&
      families.size >= 2,
    `n=${broad.recs.results.length} families=${[...families].join(',')} products=${broad.recs.results.map((r) => r.product.name).join(' | ')}`
  );

  const surprise = turn('Surprise me.');
  record(
    '5',
    surprise.stage1.intent === 'RECOMMENDATION' &&
      surprise.stage1.is_surprise_me === true &&
      shouldUseLlmConversationalReply(surprise.stage1) &&
      surprise.recs.results.length > 0 &&
      surprise.recs.canonicalResult.status !== 'NO_VALID_MATCH',
    `n=${surprise.recs.results.length} products=${surprise.recs.results.map((r) => r.product.name).join(' | ')}`
  );

  const woody = turn('I like fresh and woody fragrances.');
  const woodyFollow = turn('What do you think I would like?', woody.state);
  record(
    '6',
    woody.state.activeRequest.families.includes('fresh') &&
      woody.state.activeRequest.families.includes('woody') &&
      woodyFollow.stage1.intent === 'RECOMMENDATION' &&
      woodyFollow.stage1.needs_recommendations === true &&
      woodyFollow.stage1.is_discovery_start !== true &&
      woodyFollow.recs.results.length > 0,
    `families=${woody.state.activeRequest.families.join(',')} follow=${woodyFollow.stage1.intent} n=${woodyFollow.recs.results.length}`
  );

  const budget = turn('I want something under ₹1000.');
  const budgetFollow = turn('What would you recommend?', budget.state);
  record(
    '7',
    budget.state.activeRequest.budget.max === 1000 &&
      budgetFollow.stage1.intent === 'RECOMMENDATION' &&
      budgetFollow.recs.results.length > 0 &&
      budgetFollow.recs.results.every((r) => r.product.price <= 1000) &&
      budgetFollow.recs.canonicalResult.status !== 'NO_VALID_MATCH',
    `budget=${budget.state.activeRequest.budget.max} prices=${budgetFollow.recs.results.map((r) => r.product.price).join(',')}`
  );

  const genuine = turn('I want something fresh and woody under ₹50 that lasts all day.');
  record(
    '8',
    genuine.stage1.needs_recommendations === true &&
      genuine.recs.results.length === 0 &&
      (genuine.recs.canonicalResult.status === 'NO_VALID_MATCH' ||
        genuine.recs.canonicalResult.status === 'NO_ALTERNATIVES' ||
        genuine.recs.hardConstraintFailed),
    `n=${genuine.recs.results.length} status=${genuine.recs.canonicalResult.status} hard=${genuine.recs.hardConstraintFailed}`
  );

  record(
    'no-old-hardcode',
    !OLD_CAPABILITY.includes('fresh, sweet, woody') &&
      think.stage1.clarification_question !== OLD_DISCOVERY &&
      fragrance.stage1.clarification_question !== OLD_DISCOVERY,
    'old phrase-mapped replies are not attached to stage1'
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

/**
 * Focused regression for the two MEDIUM QA issues:
 * A2 reference perfume dropped when warmth is also present
 * B2 SHOW_ALTERNATIVES wording using stale "fresh"
 *
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-targeted-a2-b2.ts
 */
import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences, findProductByNameOrFuzzy } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { buildRecommendationPresentation, buildComparativeContext } from '../src/lib/response-grounding';
import { ChatMessage, ConversationState } from '../src/types/chat';
import { Product, RecommendationResult } from '../src/types/product';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function historyFrom(turns: Array<[ChatMessage['role'], string]>): ChatMessage[] {
  return turns.map(([role, content]) => ({ role, content }));
}

async function turn(
  message: string,
  brandSlug: string,
  state: ConversationState,
  history: ChatMessage[] = []
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, history, state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let status = stage1.needs_clarification ? 'CLARIFY' : 'SUCCESS';
  let retrieved: Product[] = [];
  let rec: ReturnType<typeof getRecommendations> | null = null;

  if (stage1.intent === 'PRODUCT_INFO' && stage1.target_product_names?.[0]) {
    const target = findProductByNameOrFuzzy(stage1.target_product_names[0], products);
    if (target) {
      retrieved = [target];
      results = [
        {
          product: target,
          score: 95,
          matchTier: 'Spotlight',
          matchReasons: [],
          detailedReasons: [],
          explanation: '',
        },
      ];
    }
  } else if (stage1.intent === 'COMPARE_PRODUCTS' && (stage1.target_product_names?.length || 0) >= 2) {
    retrieved = stage1
      .target_product_names!.slice(0, 2)
      .map((name) => findProductByNameOrFuzzy(name, products))
      .filter((product): product is Product => Boolean(product));
    results = retrieved.map((product, idx) => ({
      product,
      score: 90 - idx * 5,
      matchTier: 'Comparison Candidate' as const,
      matchReasons: [],
      detailedReasons: [],
      explanation: '',
    }));
  } else if (
    stage1.intent !== 'CART_ASSISTANCE' &&
    stage1.intent !== 'OUT_OF_SCOPE' &&
    stage1.needs_recommendations &&
    !stage1.needs_clarification
  ) {
    const exclude =
      stage1.intent === 'SHOW_ALTERNATIVES'
        ? [...(state.lastRecommendationIds || []), ...(state.shownProductIds || [])]
        : [];
    rec = getRecommendations(toStructuredPreferences(updated, message), products, 3, exclude);
    results = rec.results;
    status = rec.canonicalResult.status || (results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
  }

  if (results.length > 0) {
    updated.lastRecommendationIds = results.map((item) => item.product.id);
    updated.shownProductIds = Array.from(
      new Set([...(updated.shownProductIds || []), ...updated.lastRecommendationIds])
    );
  }

  if (retrieved.length > 0) {
    updated.lastDiscussedProductSet = retrieved.map((product) => ({
      productId: product.id,
      brandSlug: product.brandSlug,
      name: product.name,
    }));
  }

  const previous = (state.lastRecommendationIds || [])
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product));

  const reply = await generateConversationalResponse(message, brand, stage1, retrieved, results, updated, history, {
    status,
    recommendationPresentation: buildRecommendationPresentation(results, status, {
      matchedPreferences: rec?.matchedPreferences,
      unmetPreferences: rec?.unmetPreferences,
      tradeOff: rec?.tradeOff,
      isPartialMatch: rec?.isPartialMatch,
    }),
    comparativeContext: buildComparativeContext(
      message,
      stage1,
      previous,
      results.map((item) => item.product)
    ),
    catalogueProducts: products,
    hardConstraintFailed: rec?.hardConstraintFailed || status === 'NO_VALID_MATCH',
  });

  return { stage1, state: updated, results, reply, status, rec };
}

async function run() {
  const empty = createInitialConversationState();
  let passed = 0;
  let failed = 0;
  const check = async (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${id}  ${name}`);
    } catch (err: unknown) {
      failed++;
      console.error(`FAIL  ${id}  ${name}`);
      console.error(`      ${err instanceof Error ? err.message : err}`);
    }
  };

  await check('TEST A', 'I like Dior Sauvage but want something warmer', async () => {
    const res = await turn('I like Dior Sauvage but want something warmer', 'tmperfumehouse', empty);
    const ref = res.state.backgroundContext.referencePerfume;
    assert(/sauvage/i.test(String(ref)), `referencePerfume=${ref}`);
    assert(res.state.activeRequest.warmth === 'warmer', `warmth=${res.state.activeRequest.warmth}`);
    assert(res.state.activeRequest.isSimilarityRequest === true, 'isSimilarityRequest should be true');
    assert(/sauvage/i.test(res.reply), `reply did not acknowledge Dior Sauvage: ${res.reply}`);
    assert(res.results.length > 0, 'expected valid recommendations');
    console.log('      products:', res.results.map((item) => item.product.name).join(', '));
    console.log('      reply:', res.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST B', 'I want something warmer — no reference', async () => {
    const res = await turn('I want something warmer', 'tmperfumehouse', empty);
    assert(
      res.state.backgroundContext.referencePerfume == null,
      `referencePerfume should be null, got ${res.state.backgroundContext.referencePerfume}`
    );
    assert(res.state.activeRequest.warmth === 'warmer', `warmth=${res.state.activeRequest.warmth}`);
    assert(res.state.activeRequest.isSimilarityRequest !== true, 'isSimilarityRequest should not be true');
    assert(!/sauvage/i.test(res.reply), `unexpected Sauvage mention: ${res.reply}`);
  });

  await check('TEST C', 'woody → show me something else', async () => {
    const first = await turn('I want something woody.', 'tmperfumehouse', empty);
    assert(first.state.activeRequest.families.includes('woody'), `families=${JSON.stringify(first.state.activeRequest.families)}`);
    const firstNames = first.results.map((item) => item.product.name);
    const second = await turn(
      'Show me something else.',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something woody.'],
        ['assistant', first.reply],
      ])
    );
    assert(second.stage1.intent === 'SHOW_ALTERNATIVES', `intent=${second.stage1.intent}`);
    assert(second.state.activeRequest.families.includes('woody'), 'woody preference dropped');
    const secondNames = second.results.map((item) => item.product.name);
    assert(secondNames.length > 0, 'no alternatives');
    assert(!secondNames.every((name) => firstNames.includes(name)), `alternatives not different: ${secondNames.join(', ')}`);
    assert(!/\bfresh\s+(alternatives?|options?|picks?|choices?)\b/i.test(second.reply), `stale fresh wording: ${second.reply}`);
    console.log('      first:', firstNames.join(', '));
    console.log('      alts:', secondNames.join(', '));
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST D', 'fresh → show me something else', async () => {
    const first = await turn('I want something fresh.', 'tmperfumehouse', empty);
    const second = await turn(
      'Show me something else.',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', first.reply],
      ])
    );
    assert(second.state.activeRequest.families.includes('fresh'), 'fresh preference dropped');
    assert(!/\bwoody alternatives\b/i.test(second.reply), `wrong family wording: ${second.reply}`);
    const mayDescribeFresh = /\bfresh\b/i.test(second.reply);
    assert(mayDescribeFresh || second.results.length > 0, second.reply);
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST E', 'Royal Oud notes follow-up still PRODUCT_INFO', async () => {
    const info = await turn('Tell me about Royal Oud.', 'tmperfumehouse', empty);
    const notes = await turn(
      'What are its notes?',
      'tmperfumehouse',
      info.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud.'],
        ['assistant', info.reply],
      ])
    );
    assert(notes.stage1.intent === 'PRODUCT_INFO', `intent=${notes.stage1.intent}`);
    assert(/saffron|rose|oud|sandalwood|amber/i.test(notes.reply), notes.reply);
    assert(notes.status !== 'NO_VALID_MATCH', `status=${notes.status}`);
  });

  await check('TEST F', 'comparison follow-up still COMPARE_PRODUCTS', async () => {
    const compare = await turn('Compare Royal Oud and Amber Nights.', 'tmperfumehouse', empty);
    const sweeter = await turn(
      'Which one is sweeter?',
      'tmperfumehouse',
      compare.state,
      historyFrom([
        ['user', 'Compare Royal Oud and Amber Nights.'],
        ['assistant', compare.reply],
      ])
    );
    assert(sweeter.stage1.intent === 'COMPARE_PRODUCTS', `intent=${sweeter.stage1.intent}`);
    assert(/amber nights/i.test(sweeter.reply), sweeter.reply);
    assert(!/here are .* alternatives/i.test(sweeter.reply), sweeter.reply);
  });

  await check('TEST G', 'pizza → burger → pizza again', async () => {
    const pizza = await turn('I want something that smells like pizza.', 'tmperfumehouse', empty);
    const burger = await turn(
      'I want something that smells like burger.',
      'tmperfumehouse',
      pizza.state,
      historyFrom([
        ['user', 'I want something that smells like pizza.'],
        ['assistant', pizza.reply],
      ])
    );
    const pizzaAgain = await turn(
      'I want something that smells like pizza again.',
      'tmperfumehouse',
      burger.state,
      historyFrom([
        ['user', 'I want something that smells like pizza.'],
        ['assistant', pizza.reply],
        ['user', 'I want something that smells like burger.'],
        ['assistant', burger.reply],
      ])
    );
    assert(pizza.results.length === 0, `pizza fabricated: ${pizza.results.map((item) => item.product.name).join(', ')}`);
    assert(burger.results.length === 0, `burger fabricated: ${burger.results.map((item) => item.product.name).join(', ')}`);
    assert(pizzaAgain.results.length === 0, `pizza-again fabricated: ${pizzaAgain.results.map((item) => item.product.name).join(', ')}`);
    assert(/pizza/i.test(pizzaAgain.reply), pizzaAgain.reply);
  });

  await check('TEST H', 'fresh woody under ₹800 all-day remains NO_MATCH', async () => {
    const res = await turn(
      'I want something fresh, woody and under ₹800, but I also want it to last all day.',
      'tmperfumehouse',
      empty
    );
    assert(
      res.status === 'NO_VALID_MATCH' || res.results.length === 0,
      `expected NO_MATCH, status=${res.status} products=${res.results.map((item) => item.product.name).join(', ')}`
    );
    const claimedFit = /best balanced composition|perfect match for all/i.test(res.reply);
    assert(!claimedFit, res.reply);
  });

  console.log(`\nFocused A2/B2 tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

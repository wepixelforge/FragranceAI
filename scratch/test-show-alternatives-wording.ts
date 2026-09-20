/**
 * SHOW_ALTERNATIVES wording must follow the current canonical state / ranked products,
 * never leftover family copy from earlier turns.
 *
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-show-alternatives-wording.ts
 */
import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import {
  generateConversationalResponse,
  canonicalAlternativesDirection,
  rewriteStaleAlternativesWording,
} from '../src/lib/response-generator';
import { buildRecommendationPresentation, buildComparativeContext } from '../src/lib/response-grounding';
import { ChatMessage, ConversationState } from '../src/types/chat';
import { Product, RecommendationResult } from '../src/types/product';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function historyFrom(turns: Array<[ChatMessage['role'], string]>): ChatMessage[] {
  return turns.map(([role, content]) => ({ role, content }));
}

const FAMILY_NOUN_RE =
  /\b(fresh|woody|floral|spicy|aquatic|oud|citrus|oriental|sweet|musky|amber|gourmand|aromatic)\s+(alternatives?|options?|picks?|choices?|scents?|fragrances?|ones|directions?)\b/gi;

function assertWordingMatchesDirection(reply: string, direction: ReturnType<typeof canonicalAlternativesDirection>): void {
  const allowed = new Set(direction.families.map((family) => family.toLowerCase()));
  for (const match of reply.matchAll(FAMILY_NOUN_RE)) {
    const family = match[1].toLowerCase();
    assert(
      allowed.has(family),
      `stale family wording "${match[0]}" is not in current direction [${direction.families.join(', ')}]: ${reply}`
    );
  }
}

function fakeResult(name: string, fragranceFamily: string[]): RecommendationResult {
  return {
    product: {
      id: name,
      slug: name,
      brandSlug: 'tmperfumehouse',
      name,
      price: 999,
      size: '50ml',
      fragranceFamily,
      topNotes: [],
      heartNotes: [],
      baseNotes: [],
      occasion: [],
      season: [],
      gender: 'unisex',
      longevity: 'moderate',
      intensity: 'moderate',
      tags: [],
      description: '',
      bestFor: [],
      similarTo: [],
    } as Product,
    score: 90,
    matchTier: 'Spotlight',
    matchReasons: [],
    detailedReasons: [],
    explanation: '',
  };
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

  if (
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

  return { stage1, state: updated, results, reply, status };
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

  await check('UNIT 1', 'rewrites leftover fresh wording when direction is woody/oud', () => {
    const direction = canonicalAlternativesDirection(
      {
        ...empty,
        activeRequest: { ...empty.activeRequest, families: ['woody'] },
      },
      [fakeResult('Royal Oud', ['oud', 'woody']), fakeResult('Noir Intense', ['woody', 'spicy'])]
    );
    assert(direction.families.includes('woody'), `families=${JSON.stringify(direction.families)}`);
    assert(!direction.families.includes('fresh'), `fresh leaked into woody direction: ${JSON.stringify(direction)}`);
    const rewritten = rewriteStaleAlternativesWording(
      'Here are fresh alternatives from the previous search. Try Royal Oud.',
      direction,
      ['Royal Oud']
    );
    assert(!/\bfresh alternatives\b/i.test(rewritten), rewritten);
    assert(rewritten.includes('Royal Oud'), rewritten);
    assert(new RegExp(direction.label.replace('/', '\\/'), 'i').test(rewritten), rewritten);
  });

  await check('UNIT 2', 'keeps fresh wording when current direction is actually fresh', () => {
    const direction = canonicalAlternativesDirection(
      {
        ...empty,
        activeRequest: { ...empty.activeRequest, families: ['fresh'] },
      },
      [fakeResult('Ocean Breeze', ['fresh', 'aquatic'])]
    );
    const rewritten = rewriteStaleAlternativesWording('Here are some fresh options to consider.', direction);
    assert(/\bfresh options\b/i.test(rewritten), rewritten);
  });

  await check('TEST 1', 'fresh → show me something else', async () => {
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
    assert(second.stage1.intent === 'SHOW_ALTERNATIVES', `intent=${second.stage1.intent}`);
    assert(second.state.activeRequest.families.includes('fresh'), `families=${JSON.stringify(second.state.activeRequest.families)}`);
    assert(second.results.length > 0, 'no alternatives');
    const direction = canonicalAlternativesDirection(second.state, second.results);
    assertWordingMatchesDirection(second.reply, direction);
    assert(!/\bwoody\s+(alternatives?|options?)\b/i.test(second.reply) || direction.families.includes('woody'), second.reply);
    const named = second.results.filter((item) => second.reply.includes(item.product.name));
    assert(named.length > 0, `reply did not name canonical products: ${second.reply}`);
    console.log('      families:', second.state.activeRequest.families.join(', '));
    console.log('      products:', second.results.map((item) => item.product.name).join(', '));
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST 2', 'woody → show me something else', async () => {
    const first = await turn('I want something woody.', 'tmperfumehouse', empty);
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
    const direction = canonicalAlternativesDirection(second.state, second.results);
    assert(!direction.families.includes('fresh'), `fresh in woody direction: ${JSON.stringify(direction)}`);
    assertWordingMatchesDirection(second.reply, direction);
    assert(!/\bfresh\s+(alternatives?|options?|picks?|choices?)\b/i.test(second.reply), `stale fresh wording: ${second.reply}`);
    const named = second.results.filter((item) => second.reply.includes(item.product.name));
    assert(named.length > 0, `reply did not name canonical products: ${second.reply}`);
    console.log('      first:', firstNames.join(', '));
    console.log('      alts:', secondNames.join(', '));
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST 3', 'floral → show me something else', async () => {
    const first = await turn('I want something floral.', 'tmperfumehouse', empty);
    const second = await turn(
      'Show me something else.',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something floral.'],
        ['assistant', first.reply],
      ])
    );
    assert(second.stage1.intent === 'SHOW_ALTERNATIVES', `intent=${second.stage1.intent}`);
    assert(second.state.activeRequest.families.includes('floral'), `families=${JSON.stringify(second.state.activeRequest.families)}`);
    const direction = canonicalAlternativesDirection(second.state, second.results);
    assertWordingMatchesDirection(second.reply, direction);
    assert(
      !/\bfresh\s+(alternatives?|options?)\b/i.test(second.reply) || direction.families.includes('fresh'),
      second.reply
    );
    assert(
      !/\bwoody\s+(alternatives?|options?)\b/i.test(second.reply) || direction.families.includes('woody'),
      second.reply
    );
    console.log('      families:', second.state.activeRequest.families.join(', '));
    console.log('      products:', second.results.map((item) => item.product.name).join(', '));
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST 4', 'woody → floral → show me something else', async () => {
    const woody = await turn('I want something woody.', 'tmperfumehouse', empty);
    const floral = await turn(
      'Something floral instead.',
      'tmperfumehouse',
      woody.state,
      historyFrom([
        ['user', 'I want something woody.'],
        ['assistant', woody.reply],
      ])
    );
    const second = await turn(
      'Show me something else.',
      'tmperfumehouse',
      floral.state,
      historyFrom([
        ['user', 'I want something woody.'],
        ['assistant', woody.reply],
        ['user', 'Something floral instead.'],
        ['assistant', floral.reply],
      ])
    );
    assert(second.stage1.intent === 'SHOW_ALTERNATIVES', `intent=${second.stage1.intent}`);
    assert(
      second.state.activeRequest.families.includes('floral'),
      `expected floral in families=${JSON.stringify(second.state.activeRequest.families)}`
    );
    const direction = canonicalAlternativesDirection(second.state, second.results);
    assertWordingMatchesDirection(second.reply, direction);
    if (!direction.families.includes('woody')) {
      assert(!/\bwoody\s+(alternatives?|options?|picks?)\b/i.test(second.reply), `stale woody wording: ${second.reply}`);
    }
    if (!direction.families.includes('fresh')) {
      assert(!/\bfresh\s+(alternatives?|options?|picks?)\b/i.test(second.reply), `stale fresh wording: ${second.reply}`);
    }
    const named = second.results.filter((item) => second.reply.includes(item.product.name));
    assert(named.length > 0, `reply did not name canonical products: ${second.reply}`);
    console.log('      families:', second.state.activeRequest.families.join(', '));
    console.log('      direction:', direction.label);
    console.log('      products:', second.results.map((item) => item.product.name).join(', '));
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST 5', 'fresh → warmer → show me something else', async () => {
    const fresh = await turn('I want something fresh.', 'tmperfumehouse', empty);
    const warmer = await turn(
      'Make it warmer.',
      'tmperfumehouse',
      fresh.state,
      historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', fresh.reply],
      ])
    );
    const second = await turn(
      'Show me something else.',
      'tmperfumehouse',
      warmer.state,
      historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', fresh.reply],
        ['user', 'Make it warmer.'],
        ['assistant', warmer.reply],
      ])
    );
    assert(second.stage1.intent === 'SHOW_ALTERNATIVES', `intent=${second.stage1.intent}`);
    assert(second.state.activeRequest.warmth === 'warmer', `warmth=${second.state.activeRequest.warmth}`);
    const direction = canonicalAlternativesDirection(second.state, second.results);
    assertWordingMatchesDirection(second.reply, direction);
    if (!direction.families.includes('fresh')) {
      assert(!/\bfresh\s+(alternatives?|options?|picks?)\b/i.test(second.reply), `stale fresh wording: ${second.reply}`);
    }
    assert(
      !/\bleaning into a warmer profile\b/i.test(second.reply),
      `SHOW_ALTERNATIVES reused warmth-adjustment copy: ${second.reply}`
    );
    const named = second.results.filter((item) => second.reply.includes(item.product.name));
    assert(named.length > 0, `reply did not name canonical products: ${second.reply}`);
    console.log('      families:', second.state.activeRequest.families.join(', '));
    console.log('      warmth:', second.state.activeRequest.warmth);
    console.log('      direction:', direction.label);
    console.log('      products:', second.results.map((item) => item.product.name).join(', '));
    console.log('      reply:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

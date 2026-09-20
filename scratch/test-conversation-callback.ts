import { getBrand, getProducts } from '../src/data';
import {
  applyConversationCallback,
  detectConversationCallback,
  extractUnusualConcept,
  isConstraintOnlyRefinement,
} from '../src/lib/conversation-callback';
import { classifyIntentAndExtractPreferences, findProductByNameOrFuzzy } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { buildRecommendationPresentation, buildComparativeContext } from '../src/lib/response-grounding';
import { ChatMessage, ConversationState, Stage1IntentOutput } from '../src/types/chat';
import { Product, RecommendationResult } from '../src/types/product';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function baseStage1(partial: Partial<Stage1IntentOutput> = {}): Stage1IntentOutput {
  return {
    intent: 'RECOMMENDATION',
    request_type: 'new_consultation',
    fragrance_families: [],
    preferred_notes: [],
    excluded_notes: [],
    excluded_families: [],
    needs_recommendations: true,
    needs_clarification: false,
    preferences: {},
    ...partial,
  };
}

function historyFrom(turns: Array<[ChatMessage['role'], string]>): ChatMessage[] {
  return turns.map(([role, content]) => ({ role, content }));
}

function noInventedScentClaim(reply: string, topic: string): boolean {
  return !new RegExp(`\\bsmells like ${topic}\\b`, 'i').test(reply);
}

function hasCallbackOpener(reply: string, topic: string): boolean {
  const head = reply.slice(0, 160).toLowerCase();
  return (
    /^(back to|still (chasing|exploring|looking)|going back|we(?:'|’)re back|returning to|looking at|that .{0,40} still)/i.test(
      reply.trim()
    ) && head.includes(topic.toLowerCase())
  );
}

async function turn(
  message: string,
  brandSlug: string,
  state: ConversationState,
  history: ChatMessage[] = [],
  extra?: { actionContext?: Record<string, unknown> }
) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, history, state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let status = stage1.needs_clarification ? 'CLARIFY' : 'SUCCESS';
  let retrieved: Product[] = [];

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
    const matched = stage1
      .target_product_names!.slice(0, 2)
      .map((name) => findProductByNameOrFuzzy(name, products))
      .filter((product): product is Product => Boolean(product));
    retrieved = matched;
    results = matched.map((product, idx) => ({
      product,
      score: 90 - idx * 5,
      matchTier: 'Comparison Candidate' as const,
      matchReasons: [],
      detailedReasons: [],
      explanation: '',
    }));
  } else if (stage1.intent !== 'CART_ASSISTANCE' && stage1.needs_recommendations && !stage1.needs_clarification) {
    const prefs = toStructuredPreferences(updated, message);
    const rec = getRecommendations(prefs, products, 3);
    results = rec.results;
    status = rec.canonicalResult.status || (results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
    if (results.length > 0) {
      updated.lastRecommendationIds = results.map((item) => item.product.id);
      updated.lastCanonicalProductSet = results.map((item) => ({
        productId: item.product.id,
        brandSlug: item.product.brandSlug,
        name: item.product.name,
      }));
    }
  }

  if (retrieved.length > 0 || results.length > 0) {
    const discussed = (retrieved.length > 0 ? retrieved : results.map((item) => item.product)).map((product) => ({
      productId: product.id,
      brandSlug: product.brandSlug,
      name: product.name,
    }));
    updated.lastDiscussedProductSet = discussed;
  }

  const previous = (state.lastRecommendationIds || [])
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is Product => Boolean(product));
  const comparativeContext = buildComparativeContext(
    message,
    stage1,
    previous,
    results.map((item) => item.product)
  );
  const presentation = buildRecommendationPresentation(results, status);
  const reply = await generateConversationalResponse(
    message,
    brand,
    stage1,
    retrieved,
    results,
    updated,
    history,
    {
      status,
      recommendationPresentation: presentation,
      comparativeContext,
      catalogueProducts: products,
      hardConstraintFailed: status === 'NO_VALID_MATCH' || status === 'NO_ALTERNATIVES',
      actionContext: extra?.actionContext as any,
    }
  );

  return { stage1, state: updated, results, reply, status, retrieved, products };
}

async function run() {
  const tmProducts = getProducts('tmperfumehouse');
  const empty = createInitialConversationState();
  let passed = 0;
  let failed = 0;

  const check = async (id: string, name: string, fn: () => void | Promise<void>) => {
    try {
      await fn();
      passed++;
      console.log(`PASS  ${id}  ${name}`);
    } catch (err: any) {
      failed++;
      console.error(`FAIL  ${id}  ${name}`);
      console.error(`      ${err?.message || err}`);
    }
  };

  await check('U1', 'unusual concept extraction is generic', () => {
    assert(extractUnusualConcept('I want a perfume that smells like pizza') === 'pizza', 'pizza');
    assert(extractUnusualConcept('I want something that smells like cement') === 'cement', 'cement');
    assert(extractUnusualConcept('something like Dior Sauvage') === null, 'should not treat designer reference as unusual');
  });

  await check('U2', 'budget-only refinement is not a callback', () => {
    assert(
      isConstraintOnlyRefinement(
        'Under ₹800.',
        baseStage1({ intent: 'BUDGET_CHANGE', request_type: 'refinement', is_refinement: true, budget: { min: null, max: 800 } })
      ),
      'budget should skip'
    );
    const callback = detectConversationCallback({
      message: 'Under ₹800.',
      history: historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', 'Here are a few fresh options.'],
      ]),
      state: {
        ...empty,
        activeRequest: { ...empty.activeRequest, families: ['fresh'] },
        currentConsultation: { ...empty.currentConsultation, fragrance_families: ['fresh'] },
      },
      stage1: baseStage1({
        intent: 'BUDGET_CHANGE',
        request_type: 'refinement',
        is_refinement: true,
        budget: { min: null, max: 800 },
        fragrance_families: ['fresh'],
      }),
      brandSlug: 'tmperfumehouse',
      catalogueProducts: tmProducts,
    });
    assert(callback === null, `unexpected callback: ${JSON.stringify(callback)}`);
  });

  await check('TEST 1', 'pizza → pizza again: callback + honest no-match', async () => {
    const first = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', empty, []);
    assert(noInventedScentClaim(first.reply, 'pizza'), first.reply);
    assert(!hasCallbackOpener(first.reply, 'pizza'), `first mention should not callback: ${first.reply}`);

    const second = await turn(
      'I want something like pizza again',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want a perfume that smells like pizza'],
        ['assistant', first.reply],
      ])
    );
    assert(first.results.length === 0, `pizza must not invent a match: ${first.results.map((r) => r.product.name).join(',')}`);
    if (first.results.length === 0) {
      assert(second.results.length === 0, 'repeat must not invent a new match set');
    }
    assert(noInventedScentClaim(second.reply, 'pizza'), second.reply);
    assert(hasCallbackOpener(second.reply, 'pizza'), second.reply);
    if (second.results.length === 0) {
      assert(
        /couldn'?t find a (close|meaningful) (fit|match)|still don'?t have an? (exact|close|meaningful)|haven'?t found an exact match|don'?t have a fragrance that meaningfully/i.test(
          second.reply
        ),
        second.reply
      );
    }
    const openerWords = second.reply.trim().split(/[.!?]/)[0].split(/\s+/).length;
    assert(openerWords >= 4 && openerWords <= 16, `callback too long: ${second.reply}`);
    console.log('    first:', first.reply.replace(/\s+/g, ' ').slice(0, 180));
    console.log('    second:', second.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 2', 'cement → cement again: callback + honest no-match', async () => {
    const first = await turn('I want something that smells like cement', 'tmperfumehouse', empty, []);
    assert(first.results.length === 0, `cement must not invent a match: ${first.results.map((r) => r.product.name).join(',')}`);
    assert(noInventedScentClaim(first.reply, 'cement'), first.reply);
    assert(!hasCallbackOpener(first.reply, 'cement'), first.reply);

    const second = await turn(
      'I want a perfume smell like cement',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something that smells like cement'],
        ['assistant', first.reply],
      ])
    );
    if (first.results.length === 0) {
      assert(second.results.length === 0, 'cement repeat must not invent a new match set');
    }
    assert(noInventedScentClaim(second.reply, 'cement'), second.reply);
    assert(hasCallbackOpener(second.reply, 'cement'), second.reply);
    if (second.results.length === 0) {
      assert(
        /couldn'?t find a (close|meaningful) (fit|match)|still don'?t have an? (exact|close|meaningful)|haven'?t found an exact match|don'?t have a fragrance that meaningfully/i.test(
          second.reply
        ),
        second.reply
      );
    }
    console.log('    second:', second.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 3', 'fresh → fresh again: possible short callback, not excessive', async () => {
    const first = await turn('I want something fresh.', 'tmperfumehouse', empty, []);
    const second = await turn(
      'I want something fresh again.',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', first.reply],
      ])
    );
    const callback = detectConversationCallback({
      message: 'I want something fresh again.',
      history: historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', first.reply],
      ]),
      state: first.state,
      stage1: second.stage1,
      brandSlug: 'tmperfumehouse',
      catalogueProducts: tmProducts,
    });
    assert(callback !== null, 'fresh again should allow a callback');
    assert(callback!.topicLabel === 'fresh', callback!.topicLabel);
    assert(!/you(?:'|’)re back to fresh/i.test(second.reply), second.reply);
    assert(!/fresh journey/i.test(second.reply), second.reply);
    console.log('    second:', second.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 4', 'fresh → under ₹800: refinement, no callback', async () => {
    const first = await turn('I want something fresh.', 'tmperfumehouse', empty, []);
    const second = await turn(
      'Under ₹800.',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', first.reply],
      ])
    );
    const callback = detectConversationCallback({
      message: 'Under ₹800.',
      history: historyFrom([
        ['user', 'I want something fresh.'],
        ['assistant', first.reply],
      ]),
      state: second.state,
      stage1: second.stage1,
      brandSlug: 'tmperfumehouse',
      catalogueProducts: tmProducts,
    });
    assert(callback === null, `budget refinement should not callback: ${JSON.stringify(callback)}`);
    assert(!hasCallbackOpener(second.reply, 'fresh'), second.reply);
    assert(!/back to your fresh journey/i.test(second.reply), second.reply);
    console.log('    refine:', second.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 5', 'fresh → warmer → fresh again: recognizes return', async () => {
    const first = await turn('I want something fresh for summer', 'tmperfumehouse', empty, []);
    const second = await turn(
      'Make it warmer',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something fresh for summer'],
        ['assistant', first.reply],
      ])
    );
    const third = await turn(
      'Actually go back to something fresh',
      'tmperfumehouse',
      second.state,
      historyFrom([
        ['user', 'I want something fresh for summer'],
        ['assistant', first.reply],
        ['user', 'Make it warmer'],
        ['assistant', second.reply],
      ])
    );
    const callback = detectConversationCallback({
      message: 'Actually go back to something fresh',
      history: historyFrom([
        ['user', 'I want something fresh for summer'],
        ['assistant', first.reply],
        ['user', 'Make it warmer'],
        ['assistant', second.reply],
      ]),
      state: second.state,
      stage1: third.stage1,
      brandSlug: 'tmperfumehouse',
      catalogueProducts: tmProducts,
    });
    assert(callback !== null && callback.kind === 'family_return', JSON.stringify(callback));
    assert(hasCallbackOpener(third.reply, 'fresh'), third.reply);
    console.log('    return:', third.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 6', 'Sauvage → similar → Sauvage again: reference continuity', async () => {
    const first = await turn('I like Dior Sauvage', 'tmperfumehouse', empty, []);
    const second = await turn(
      'Show me something similar',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I like Dior Sauvage'],
        ['assistant', first.reply],
      ])
    );
    const third = await turn(
      'Go back to the Sauvage direction',
      'tmperfumehouse',
      second.state,
      historyFrom([
        ['user', 'I like Dior Sauvage'],
        ['assistant', first.reply],
        ['user', 'Show me something similar'],
        ['assistant', second.reply],
      ])
    );
    const callback = detectConversationCallback({
      message: 'Go back to the Sauvage direction',
      history: historyFrom([
        ['user', 'I like Dior Sauvage'],
        ['assistant', first.reply],
        ['user', 'Show me something similar'],
        ['assistant', second.reply],
      ]),
      state: second.state,
      stage1: {
        ...third.stage1,
        reference_perfume: third.stage1.reference_perfume || 'Dior Sauvage',
      },
      brandSlug: 'tmperfumehouse',
      catalogueProducts: tmProducts,
    });
    assert(callback !== null, 'should acknowledge the Sauvage return');
    assert(/sauvage/i.test(callback!.topicLabel), callback!.topicLabel);
    assert(/sauvage/i.test(third.reply), third.reply);
    console.log('    similar intent:', second.stage1.intent);
    console.log('    return:', third.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 7', 'Royal Oud info → compare Royal Oud vs Amber Nights uses correct set', async () => {
    const first = await turn('Tell me about Royal Oud', 'tmperfumehouse', empty, []);
    assert(first.stage1.intent === 'PRODUCT_INFO', first.stage1.intent);
    assert(/Royal Oud/i.test(first.reply), first.reply);

    const second = await turn(
      'Which is sweeter, Royal Oud or Amber Nights?',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'Tell me about Royal Oud'],
        ['assistant', first.reply],
      ])
    );
    assert(second.stage1.intent === 'COMPARE_PRODUCTS', second.stage1.intent);
    assert(second.retrieved.some((p) => /royal oud/i.test(p.name)), JSON.stringify(second.retrieved.map((p) => p.name)));
    assert(second.retrieved.some((p) => /amber nights/i.test(p.name)), JSON.stringify(second.retrieved.map((p) => p.name)));
    assert(/Royal Oud/i.test(second.reply) && /Amber Nights/i.test(second.reply), second.reply);
    assert(!hasCallbackOpener(second.reply, 'Royal Oud'), second.reply);
    console.log('    compare:', second.reply.replace(/\s+/g, ' ').slice(0, 220));
  });

  await check('TEST 8', 'recommendations → add the first one: cart unchanged / no callback', async () => {
    const first = await turn('I want something woody', 'tmperfumehouse', empty, []);
    assert(first.results.length > 0, 'woody should recommend');
    const addedName = first.results[0].product.name;
    const second = await turn(
      'add the first one',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want something woody'],
        ['assistant', first.reply],
      ]),
      {
        actionContext: {
          intent: 'CART_ASSISTANCE',
          cart_action: {
            action: 'ADD_TO_CART',
            success: true,
            added: [addedName],
            productName: addedName,
          },
          cart: {
            itemCount: 1,
            items: [{ name: addedName, quantity: 1, unitPrice: first.results[0].product.price }],
            isEmpty: false,
          },
        },
      }
    );
    assert(second.stage1.intent === 'CART_ASSISTANCE', second.stage1.intent);
    assert(!hasCallbackOpener(second.reply, 'woody'), second.reply);
    assert(new RegExp(addedName, 'i').test(second.reply) || /added|cart/i.test(second.reply), second.reply);
    console.log('    cart:', second.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 9', 'pizza → reset → pizza: no callback after reset', async () => {
    const first = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', empty, []);
    const reset = await turn(
      'Start fresh',
      'tmperfumehouse',
      first.state,
      historyFrom([
        ['user', 'I want a perfume that smells like pizza'],
        ['assistant', first.reply],
      ])
    );
    assert(reset.stage1.intent === 'RESET_CONSULTATION', reset.stage1.intent);

    const after = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', createInitialConversationState(), []);
    assert(!hasCallbackOpener(after.reply, 'pizza'), after.reply);
    assert(noInventedScentClaim(after.reply, 'pizza'), after.reply);
    console.log('    after reset:', after.reply.replace(/\s+/g, ' ').slice(0, 180));
  });

  await check('TEST 10', 'TM pizza → WOP pizza: no TM product leak', async () => {
    const tmPizza = await turn('I want a perfume that smells like pizza', 'tmperfumehouse', empty, []);
    const polluted = {
      ...createInitialConversationState(),
      lastDiscussedProductSet: [{ productId: 'tm-royal-oud', brandSlug: 'tmperfumehouse', name: 'Royal Oud' }],
      lastCanonicalProductSet: [{ productId: 'tm-amber-nights', brandSlug: 'tmperfumehouse', name: 'Amber Nights' }],
    };
    const wop = await turn('I want a perfume that smells like pizza', 'worldofperfumers', polluted, []);
    const tmNames = tmProducts.map((product) => product.name);
    const leaked = tmNames.filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(wop.reply));
    assert(leaked.length === 0, `TM names leaked into WOP: ${leaked.join(', ')} :: ${wop.reply}`);
    assert(wop.results.every((item) => item.product.brandSlug === 'worldofperfumers'), 'WOP recs crossed brands');
    assert(!hasCallbackOpener(wop.reply, 'pizza'), `brand switch should not reuse TM pizza callback: ${wop.reply}`);
    console.log('    wop:', wop.reply.replace(/\s+/g, ' ').slice(0, 180));
    console.log('    tm first had products:', tmPizza.results.map((r) => r.product.name).join(',') || 'none');
  });

  await check('U3', 'callback variation does not repeat the same opener', () => {
    const first = applyConversationCallback(
      "I couldn't find a close fit for that combination.",
      {
        kind: 'unusual_repeat',
        topicLabel: 'pizza',
        text: 'Back to the pizza idea?',
        require: true,
      },
      { resultsCount: 0, status: 'NO_VALID_MATCH' }
    );
    const second = applyConversationCallback(
      "I couldn't find a close fit for that combination.",
      {
        kind: 'unusual_repeat',
        topicLabel: 'pizza',
        text: 'Still chasing that pizza scent?',
        require: true,
      },
      { resultsCount: 0, status: 'NO_VALID_MATCH' }
    );
    assert(first.startsWith('Back to the pizza idea?'), first);
    assert(second.startsWith('Still chasing that pizza scent?'), second);
    assert(/still don'?t have an? (exact|close|meaningful)/i.test(first), first);
  });

  console.log('\n========================================');
  console.log(`Passed: ${passed}  Failed: ${failed}  Total: ${passed + failed}`);
  console.log('========================================');
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

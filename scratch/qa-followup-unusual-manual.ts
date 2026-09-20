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

async function turn(message: string, brandSlug: string, state: ConversationState, history: ChatMessage[]) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, history, state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let retrieved: Product[] = [];
  let status = stage1.needs_clarification ? 'CLARIFY' : 'SUCCESS';
  let rec: ReturnType<typeof getRecommendations> | null = null;

  if (stage1.intent === 'PRODUCT_INFO' && stage1.target_product_names?.[0]) {
    const target = findProductByNameOrFuzzy(stage1.target_product_names[0], products);
    if (target) {
      retrieved = [target];
      results = [{ product: target, score: 95, matchTier: 'Spotlight', matchReasons: [], detailedReasons: [], explanation: '' }];
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
    rec = getRecommendations(toStructuredPreferences(updated, message), products, 3);
    results = rec.results;
    status = rec.canonicalResult.status || (results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
  }

  if (retrieved.length > 0) {
    updated.lastDiscussedProductSet = retrieved.map((product) => ({
      productId: product.id,
      brandSlug: product.brandSlug,
      name: product.name,
    }));
  }

  const reply = await generateConversationalResponse(message, brand, stage1, retrieved, results, updated, history, {
    status,
    recommendationPresentation: buildRecommendationPresentation(results, status),
    comparativeContext: buildComparativeContext(message, stage1, [], results.map((item) => item.product)),
    catalogueProducts: products,
    hardConstraintFailed: rec?.hardConstraintFailed || status === 'NO_VALID_MATCH',
  });

  return { reply, state: updated, intent: stage1.intent, names: results.map((r) => r.product.name), status };
}

async function conversation(title: string, prompts: string[]) {
  console.log(`\n======== ${title} ========`);
  let state = createInitialConversationState();
  const history: ChatMessage[] = [];
  for (const prompt of prompts) {
    const res = await turn(prompt, 'tmperfumehouse', state, history);
    history.push({ role: 'user', content: prompt }, { role: 'assistant', content: res.reply });
    state = res.state;
    console.log(`USER: ${prompt}`);
    console.log(`INTENT: ${res.intent}  STATUS: ${res.status}  PRODUCTS: ${res.names.join(', ') || '(none)'}`);
    console.log(`ASSISTANT: ${res.reply.replace(/\s+/g, ' ')}\n`);
  }
}

async function main() {
  await conversation('1. Royal Oud notes', ['Tell me about Royal Oud.', 'What are its notes?']);
  await conversation('2. Royal Oud longevity', ['Tell me about Royal Oud.', 'How long does it last?']);
  await conversation('3. Comparison sweetness', ['Compare Royal Oud and Amber Nights.', 'Which one is sweeter?']);
  await conversation('4. Pizza / burger / pizza again', [
    'I want something that smells like pizza',
    'I want something that smells like burger',
    'I want something that smells like pizza again',
  ]);
  await conversation('5. Hotdog', ['I want something that smells like hotdog.']);
  await conversation('6. Chair', ['I want something that smells like chair.']);
  await conversation('7. Car', ['I want something that smells like a car.']);
  await conversation('8. Fresh woody under 800 all-day', [
    'I want something fresh, woody and under ₹800, but I also want it to last all day.',
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

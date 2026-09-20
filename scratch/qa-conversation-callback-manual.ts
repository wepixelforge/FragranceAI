import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences, findProductByNameOrFuzzy } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { generateConversationalResponse } from '../src/lib/response-generator';
import { buildRecommendationPresentation } from '../src/lib/response-grounding';
import { ChatMessage, ConversationState } from '../src/types/chat';
import { Product, RecommendationResult } from '../src/types/product';

async function turn(message: string, brandSlug: string, state: ConversationState, history: ChatMessage[]) {
  const brand = getBrand(brandSlug)!;
  const products = getProducts(brandSlug);
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, [], state);
  const updated = updateConversationState(state, stage1, message);
  let results: RecommendationResult[] = [];
  let retrieved: Product[] = [];
  let status = 'SUCCESS';
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
  } else if (stage1.intent !== 'CART_ASSISTANCE' && stage1.needs_recommendations && !stage1.needs_clarification) {
    const rec = getRecommendations(toStructuredPreferences(updated, message), products, 3);
    results = rec.results;
    status = rec.canonicalResult.status || (results.length ? 'SUCCESS' : 'NO_VALID_MATCH');
  }
  const reply = await generateConversationalResponse(message, brand, stage1, retrieved, results, updated, history, {
    status,
    recommendationPresentation: buildRecommendationPresentation(results, status),
    catalogueProducts: products,
    hardConstraintFailed: status === 'NO_VALID_MATCH',
  });
  return { reply, state: updated, intent: stage1.intent };
}

async function main() {
  const prompts = [
    'I want a perfume that smells like pizza',
    'I want something like pizza again',
    'I want something that smells like cement',
    'Actually, pizza again',
    'I want something fresh for summer',
    'Make it warmer',
    'Actually go back to something fresh',
    'I like Dior Sauvage',
    'Show me something similar',
    'Go back to the Sauvage direction',
    'Tell me about Royal Oud',
    'Which is sweeter, Royal Oud or Amber Nights?',
    'Start fresh',
    'I want something woody',
  ];
  let state = createInitialConversationState();
  const history: ChatMessage[] = [];
  for (const prompt of prompts) {
    const res = await turn(prompt, 'tmperfumehouse', state, history);
    state = res.intent === 'RESET_CONSULTATION' ? createInitialConversationState() : res.state;
    console.log(`\nUSER: ${prompt}`);
    console.log(`INTENT: ${res.intent}`);
    console.log(`ASSISTANT: ${res.reply.replace(/\s+/g, ' ').trim()}`);
    if (res.intent === 'RESET_CONSULTATION') {
      history.length = 0;
    } else {
      history.push({ role: 'user', content: prompt }, { role: 'assistant', content: res.reply });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

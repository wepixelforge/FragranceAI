/**
 * Targeted: preserve named reference perfume while applying a refinement.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-reference-refinement.ts
 */
import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import {
  createInitialConversationState,
  updateConversationState,
  toStructuredPreferences,
} from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { extractKnownReferencePerfume } from '../src/lib/query-parser';
import { ConversationState } from '../src/types/chat';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function classify(message: string, state = createInitialConversationState()) {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  const stage1 = await classifyIntentAndExtractPreferences(message, brand, products, [], state);
  const next = updateConversationState(state, stage1, message);
  const prefs = toStructuredPreferences(next, message);
  const rec = stage1.needs_recommendations
    ? getRecommendations(prefs, products, 3)
    : null;
  return { stage1, state: next, prefs, rec };
}

function refOf(state: ConversationState): string | null {
  return state.backgroundContext.referencePerfume;
}

async function run() {
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

  const products = getProducts('tmperfumehouse');

  await check('EXTRACT', 'warmer than Dior Sauvage extracts the named reference', () => {
    const name = extractKnownReferencePerfume('I want something warmer than Dior Sauvage', products);
    assert(/sauvage/i.test(String(name)), `got ${name}`);
    const none = extractKnownReferencePerfume('I want something warmer', products);
    assert(none == null, `plain warmer should not extract, got ${none}`);
  });

  await check('A', 'I like Dior Sauvage but want something warmer', async () => {
    const res = await classify('I like Dior Sauvage but want something warmer');
    console.log('      state', {
      ref: refOf(res.state),
      sim: res.state.activeRequest.isSimilarityRequest,
      warmth: res.state.activeRequest.warmth,
      structured: res.prefs.referencePerfumes,
      products: res.rec?.results.map((r) => r.product.name),
    });
    assert(/sauvage/i.test(String(refOf(res.state))), `referencePerfume=${refOf(res.state)}`);
    assert(res.state.activeRequest.isSimilarityRequest === true, 'isSimilarityRequest');
    assert(res.state.activeRequest.warmth === 'warmer', `warmth=${res.state.activeRequest.warmth}`);
    assert(res.prefs.isSimilarityRequest === true, 'structured isSimilarityRequest');
    assert(
      (res.prefs.referencePerfumes || []).some((n) => /sauvage/i.test(n)),
      `structured refs=${JSON.stringify(res.prefs.referencePerfumes)}`
    );
  });

  await check('B', 'I want something warmer — no reference', async () => {
    const res = await classify('I want something warmer');
    assert(refOf(res.state) == null, `referencePerfume=${refOf(res.state)}`);
    assert(res.state.activeRequest.isSimilarityRequest !== true, 'isSimilarityRequest should be false');
    assert(res.state.activeRequest.warmth === 'warmer', `warmth=${res.state.activeRequest.warmth}`);
  });

  await check('C', 'Something similar to Dior Sauvage but warmer', async () => {
    const res = await classify('Something similar to Dior Sauvage but warmer');
    assert(/sauvage/i.test(String(refOf(res.state))), `referencePerfume=${refOf(res.state)}`);
    assert(res.state.activeRequest.isSimilarityRequest === true, 'isSimilarityRequest');
    assert(res.state.activeRequest.warmth === 'warmer', `warmth=${res.state.activeRequest.warmth}`);
  });

  await check('C2', 'I want something warmer than Dior Sauvage', async () => {
    const res = await classify('I want something warmer than Dior Sauvage');
    assert(/sauvage/i.test(String(refOf(res.state))), `referencePerfume=${refOf(res.state)}`);
    assert(res.state.activeRequest.isSimilarityRequest === true, 'isSimilarityRequest');
    assert(res.state.activeRequest.warmth === 'warmer', `warmth=${res.state.activeRequest.warmth}`);
  });

  await check('D', 'I like Aventus but want something fresher', async () => {
    const res = await classify('I like Aventus but want something fresher');
    assert(/aventus/i.test(String(refOf(res.state))), `referencePerfume=${refOf(res.state)}`);
    assert(res.state.activeRequest.isSimilarityRequest === true, 'isSimilarityRequest');
    assert(
      res.state.activeRequest.freshness === 'fresher' ||
        res.state.activeRequest.families.includes('fresh'),
      `freshness=${res.state.activeRequest.freshness} families=${JSON.stringify(res.state.activeRequest.families)}`
    );
  });

  await check('E', 'Forget the Dior Sauvage reference and show me something fresh', async () => {
    const first = await classify('I like Dior Sauvage but want something warmer');
    assert(/sauvage/i.test(String(refOf(first.state))), 'setup reference missing');
    const second = await classify(
      'Forget the Dior Sauvage reference and show me something fresh',
      first.state
    );
    console.log('      after drop', {
      ref: refOf(second.state),
      sim: second.state.activeRequest.isSimilarityRequest,
      families: second.state.activeRequest.families,
    });
    assert(refOf(second.state) == null, `reference still ${refOf(second.state)}`);
    assert(second.state.activeRequest.isSimilarityRequest !== true, 'similarity still active');
    assert(
      second.state.activeRequest.families.includes('fresh'),
      `families=${JSON.stringify(second.state.activeRequest.families)}`
    );
  });

  console.log(`\nReference refinement: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

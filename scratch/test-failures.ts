import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';
import { updateConversationState, toStructuredPreferences, createInitialConversationState } from '../src/lib/state-manager';
import { getRecommendations } from '../src/lib/recommendation-engine';

async function run() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');

  console.log('\n========================================');
  console.log('TESTING FAILURE 1: Refinement Chain with office -> boring -> interesting -> not loud -> warmer');
  console.log('========================================');
  
  let state = createInitialConversationState();
  const sequence1 = [
    "Give me something for office.",
    "Hmm too boring.",
    "Something more interesting.",
    "But not loud.",
    "Maybe a little warmer."
  ];

  for (const msg of sequence1) {
    console.log(`\n--- USER: "${msg}" ---`);
    const stage1 = await classifyIntentAndExtractPreferences(msg, brand, products, [], state);
    console.log('Stage1 Intent:', stage1.intent);
    console.log('Stage1 Extracted:', {
      occasion: stage1.occasion,
      families: stage1.fragrance_families,
      intensity: stage1.intensity,
      warmth: stage1.warmth,
      updates: stage1.updates,
      is_refinement: stage1.is_refinement,
      is_new_request: stage1.is_new_request,
    });

    state = updateConversationState(state, stage1, msg);
    console.log('Active State after update:', {
      occasion: state.activeRequest?.occasion,
      families: state.activeRequest?.families,
      intensity: state.activeRequest?.intensity,
      warmth: state.activeRequest?.warmth,
      budget: state.activeRequest?.budget,
    });

    const structured = toStructuredPreferences(state, msg);
    const rec = getRecommendations(structured, products, 3, state.shownProductIds || []);
    console.log('Recommended Products:', rec.results.map(r => `${r.product.name} (Score: ${r.score}, Price: ₹${r.product.price})`));
  }

  console.log('\n========================================');
  console.log('TESTING FAILURE 2: Fresh -> Warm');
  console.log('========================================');
  let state2 = createInitialConversationState();
  for (const msg of ["Give me something fresh.", "Actually I want something warm."]) {
    console.log(`\n--- USER: "${msg}" ---`);
    const stage1 = await classifyIntentAndExtractPreferences(msg, brand, products, [], state2);
    state2 = updateConversationState(state2, stage1, msg);
    const structured = toStructuredPreferences(state2, msg);
    const rec = getRecommendations(structured, products, 3, []);
    console.log('Stage1 intent:', stage1.intent, 'warmth:', stage1.warmth, 'families:', stage1.fragrance_families);
    console.log('State families:', state2.activeRequest?.families, 'warmth:', state2.activeRequest?.warmth);
    console.log('Recommended Products:', rec.results.map(r => `${r.product.name} (Score: ${r.score})`));
  }

  console.log('\n========================================');
  console.log('TESTING FAILURE 3: "Not loud" / projection phrases');
  console.log('========================================');
  const projectionPhrases = [
    "not loud",
    "not overpowering",
    "subtle",
    "doesn't fill the room",
    "moderate projection",
    "noticeable but not too strong"
  ];
  for (const msg of projectionPhrases) {
    const stage1 = await classifyIntentAndExtractPreferences(msg, brand, products, [], createInitialConversationState());
    console.log(`"${msg}" -> intent: ${stage1.intent}, intensity: ${stage1.intensity}, sillage: ${stage1.sillage}`);
  }

  console.log('\n========================================');
  console.log('TESTING FAILURE 5: Long conversational multi-preference request');
  console.log('========================================');
  const longMsg = "I'm going out with someone this weekend and want something that smells expensive and noticeable but I don't want it to be sugary, and I'm not really looking to spend more than a thousand.";
  const stage1Long = await classifyIntentAndExtractPreferences(longMsg, brand, products, [], createInitialConversationState());
  console.log('Long Msg Extraction:', {
    intent: stage1Long.intent,
    occasion: stage1Long.occasion,
    budget: stage1Long.budget,
    intensity: stage1Long.intensity,
    families: stage1Long.fragrance_families,
    excluded_families: stage1Long.excluded_families,
    excluded_notes: stage1Long.excluded_notes,
    style: stage1Long.style,
  });
  const state5 = updateConversationState(createInitialConversationState(), stage1Long, longMsg);
  const structured5 = toStructuredPreferences(state5, longMsg);
  const rec5 = getRecommendations(structured5, products, 3, []);
  console.log('Rec5 valid candidates:', rec5.validCandidates);
  console.log('Rec5 hardConstraintFailed:', rec5.hardConstraintFailed);
  console.log('Rec5 results:', rec5.results.map(r => r.product.name));
}

run().catch(console.error);

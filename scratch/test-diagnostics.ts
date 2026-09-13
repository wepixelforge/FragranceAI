import { safeGroqCompletion, getGroqModel } from '../src/lib/groq-client';
import { getProducts, getBrand } from '../src/data';

async function testGroqDirect() {
  const inputs = [
    "i dont like sweet perfume",
    "i do not like sweet perfume",
    "i hate sweet perfumes"
  ];

  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  const productNames = products.map((p) => p.name).join(', ');
  const model = getGroqModel();

  for (const msg of inputs) {
    console.log('\n======================================================');
    console.log('INPUT:', msg);
    console.log('======================================================');

    const systemPrompt = `You are the Structured Intent & Fragrance Preference Engine for "${brand.name}".
Available Catalogue Products: [${productNames}].

Your task is to analyze the user's message in context and return a JSON object strictly adhering to this schema:
{
  "intent": "GREETING | IDENTITY | CAPABILITY | RECOMMENDATION | REFINE_RECOMMENDATION | PRODUCT_INFO | COMPARE_PRODUCTS | SIMILAR_TO_REFERENCE | SHOW_ALTERNATIVES | BUDGET_CHANGE | PREFERENCE_UPDATE | RESET_CONSULTATION | OUT_OF_SCOPE | CLARIFICATION",
  "request_type": "new_consultation | refinement | other",
  "is_new_request": boolean,
  "is_refinement": boolean,
  "updates": [
    {
      "field": "budget.max | budget.min | remove_budget | relative_price | fragrance_families | preferred_notes | occasion | season | gender | intensity | sillage | longevity | warmth | freshness | sweetness | excluded_notes | excluded_families | reference_perfume",
      "operation": "SET | UPDATE | REMOVE | ADD | REPLACE",
      "value": any
    }
  ],
  "fragrance_families": string[],
  "preferred_notes": string[],
  "excluded_notes": string[],
  "excluded_families": string[],
  "sweetness": "sweeter" | null,
  "needs_recommendations": boolean
}

CRITICAL RULES:
NEGATIVE PREFERENCES (MUST NEVER BECOME POSITIVE):
- "I don't like sweet perfumes" / "I hate sweet" / "i dont like sweet perfume" / "Anything but sweet":
  -> intent: "PREFERENCE_UPDATE",
  -> excluded_families: ["sweet", "gourmand"],
  -> excluded_notes: ["vanilla", "sugar"],
  -> fragrance_families: [],
  -> updates: [
    { "field": "excluded_families", "operation": "ADD", "value": ["sweet", "gourmand"] }
  ],
  -> needs_recommendations: false

Return ONLY valid JSON matching the schema.`;

    const res = await safeGroqCompletion({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: msg }
      ],
      temperature: 0.1,
      max_tokens: 600,
      response_format: { type: 'json_object' }
    });

    console.log('RAW GROQ RESPONSE:');
    console.log(res);
  }
}

testGroqDirect().catch(console.error);

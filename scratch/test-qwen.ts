import { getGroqClient } from '../src/lib/groq-client';
import { getProducts, getBrand } from '../src/data';

async function testQwenStage1() {
  const client = getGroqClient()!;
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  const productNames = products.map(p => p.name).join(', ');

  const inputs = [
    "i dont like sweet perfume",
    "i do not like sweet perfume",
    "i hate sweet perfumes",
    "I like sweet perfumes.",
    "Anything but sweet.",
    "I don't want anything strong."
  ];

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
  "intensity": string or null,
  "needs_recommendations": boolean
}

CRITICAL RULES:
NEGATIVE PREFERENCES (MUST NEVER BECOME POSITIVE):
- "I don't like sweet perfumes" / "i dont like sweet perfume" / "i do not like sweet perfume" / "i hate sweet perfumes" / "Anything but sweet":
  -> intent: "PREFERENCE_UPDATE"
  -> excluded_families: ["sweet", "gourmand"]
  -> fragrance_families: [] (DO NOT put sweet here!)
  -> updates: [{ "field": "excluded_families", "operation": "ADD", "value": ["sweet", "gourmand"] }]
  -> needs_recommendations: false
- "I don't want anything strong" -> intensity: "subtle", updates: [{ "field": "intensity", "operation": "SET", "value": "subtle" }]
- "I like sweet perfumes" -> intent: "RECOMMENDATION", fragrance_families: ["sweet"], excluded_families: [], updates: [{ "field": "fragrance_families", "operation": "SET", "value": ["sweet"] }]

Return ONLY valid JSON matching the schema.`;

  for (const input of inputs) {
    console.log('\n--- INPUT:', input);
    try {
      const res = await client.chat.completions.create({
        model: 'qwen/qwen3.8-27b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input }
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' }
      });
      console.log('OUTPUT:', res.choices[0]?.message?.content);
    } catch (e: any) {
      console.log('ERROR:', e.message);
    }
  }
}

testQwenStage1().catch(console.error);

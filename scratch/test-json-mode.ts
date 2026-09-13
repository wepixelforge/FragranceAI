import { getGroqClient } from '../src/lib/groq-client';

async function testJsonMode() {
  const client = getGroqClient()!;
  const models = ['qwen/qwen3.8-27b', 'groq/compound-mini', 'openai/gpt-oss-20b'];
  for (const m of models) {
    try {
      const res = await client.chat.completions.create({
        model: m,
        messages: [{ role: 'user', content: '{"hello": "world"}' }],
        response_format: { type: 'json_object' }
      });
      console.log(`Model ${m} JSON mode SUCCESS`);
    } catch (e: any) {
      console.log(`Model ${m} JSON mode FAILED:`, e.status, e.message);
    }
  }
}

testJsonMode().catch(console.error);

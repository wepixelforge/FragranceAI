import { getGroqClient } from '../src/lib/groq-client';

async function testAvailable() {
  const client = getGroqClient()!;
  for (const m of ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'groq/compound']) {
    try {
      const res = await client.chat.completions.create({
        model: m,
        messages: [{ role: 'user', content: 'Say hello in 2 words' }],
        max_tokens: 10
      });
      console.log(`Model ${m} SUCCESS:`, res.choices[0]?.message?.content);
    } catch (e: any) {
      console.log(`Model ${m} FAILED:`, e.message);
    }
  }
}

testAvailable().catch(console.error);

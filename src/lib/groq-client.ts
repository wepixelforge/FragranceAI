import Groq from 'groq-sdk';

/**
 * Server-side Groq client singleton.
 * Guaranteed to never run on client-side (no NEXT_PUBLIC_ exposure).
 */
let groqInstance: Groq | null = null;

export function getGroqClient(): Groq | null {
  if (typeof window !== 'undefined') {
    throw new Error('Groq client cannot be initialized in client-side code.');
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }

  if (!groqInstance) {
    groqInstance = new Groq({
      apiKey: apiKey.trim(),
    });
  }

  return groqInstance;
}

export function getGroqModel(): string {
  return process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
}

const FALLBACK_MODELS = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'qwen/qwen3.8-27b'];

/**
 * Execute a Groq chat completion with a timeout guarantee (default 9s).
 * Automatically tries fallback models if the primary model encounters rate limits (429).
 * Returns the message text string, or null on failure/timeout.
 */
export async function safeGroqCompletion(
  params: Parameters<Groq['chat']['completions']['create']>[0],
  timeoutMs = 4000
): Promise<string | null> {
  const client = getGroqClient();
  if (!client) return null;

  const candidateModels = Array.from(new Set([params.model, ...FALLBACK_MODELS]));

  for (const modelCandidate of candidateModels) {
    try {
      const callParams = { ...params, model: modelCandidate };
      const completionPromise = client.chat.completions.create(callParams);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Groq request timed out')), timeoutMs)
      );

      const completion = (await Promise.race([completionPromise, timeoutPromise])) as Groq.Chat.Completions.ChatCompletion | null;
      if (!completion || !completion.choices || completion.choices.length === 0) {
        continue;
      }
      return completion.choices[0]?.message?.content ?? null;
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.message?.includes('Rate limit reached') || error?.message?.includes('rate_limit_exceeded');
      console.warn(`[Groq Client]: Model ${modelCandidate} failed (${error?.error?.message || error?.message || error?.status}).`);
      if (!isRateLimit) {
        // If not rate limited, try next model or break
      }
    }
  }

  return null;
}

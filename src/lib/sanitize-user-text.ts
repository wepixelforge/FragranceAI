/**
 * Client-safe sanitizer for assistant text. Keep Groq/response-generator off the client bundle.
 */
export function sanitizeUserFacingResponse(rawText: string): string {
  if (!rawText) return '';
  let cleaned = rawText;

  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<thought>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.replace(/<analysis>[\s\S]*?<\/analysis>/gi, '');
  cleaned = cleaned.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
  cleaned = cleaned.replace(/<system>[\s\S]*?<\/system>/gi, '');
  cleaned = cleaned.replace(/^[\s\S]*?<\/(think|thought|analysis|reasoning|system)>/i, '');
  cleaned = cleaned.replace(/<\/?(think|thought|analysis|reasoning|system)>/gi, '');
  cleaned = cleaned.replace(/^(Here'?s\s+(a\s+)?thinking\s+process:?|Thinking\s+Process:?|Internal\s+Reasoning:?|Chain\s+of\s+Thought:?)[\s\S]*?\n\n/i, '');
  cleaned = cleaned.replace(/\/[a-z0-9-]+\/cart\b/gi, 'the cart');
  cleaned = cleaned.replace(/^```(json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed.response === 'string') {
        cleaned = parsed.response;
      } else if (parsed && typeof parsed.text === 'string') {
        cleaned = parsed.text;
      } else if (parsed && typeof parsed.message === 'string') {
        cleaned = parsed.message;
      }
    } catch {
      const match = cleaned.match(/"(?:response|text|message)"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (match && match[1]) {
        try {
          cleaned = JSON.parse(`"${match[1]}"`);
        } catch {
          cleaned = match[1];
        }
      }
    }
  }

  cleaned = cleaned.replace(/<\/?(think|thought|analysis|reasoning|system)>/gi, '').trim();
  return cleaned;
}

import { FragranceFamily } from '@/types/product';

/**
 * Style / region language shoppers actually use. These are not vague —
 * they should recommend immediately, not ask follow-up questions.
 */
export const STYLE_FAMILY_ALIASES: Record<string, FragranceFamily[]> = {
  arabian: ['oud', 'oriental', 'spicy'],
  arabic: ['oud', 'oriental', 'spicy'],
  arabia: ['oud', 'oriental', 'spicy'],
  middleeastern: ['oud', 'oriental', 'spicy'],
  gulf: ['oud', 'oriental', 'spicy'],
  attar: ['oud', 'oriental'],
  bakhoor: ['oud', 'oriental', 'spicy'],
  oriental: ['oriental', 'oud', 'spicy'],
  eastern: ['oriental', 'oud'],
  incense: ['oud', 'oriental'],
};

export function resolveStyleFamilies(text: string): FragranceFamily[] {
  const lower = text.toLowerCase();
  const families = new Set<FragranceFamily>();

  if (/\bmiddle[\s-]?eastern\b/.test(lower)) {
    STYLE_FAMILY_ALIASES.arabian.forEach((family) => families.add(family));
  }

  for (const [alias, mapped] of Object.entries(STYLE_FAMILY_ALIASES)) {
    const pattern = new RegExp(`\\b${alias}\\b`, 'i');
    if (pattern.test(lower)) {
      mapped.forEach((family) => families.add(family));
    }
  }

  return Array.from(families);
}

export function isKnownStyleWord(word: string): boolean {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return false;
  if (clean === 'middleeastern') return true;
  return Boolean(STYLE_FAMILY_ALIASES[clean]);
}

export function isAffirmativeReply(text: string): boolean {
  const lower = text.toLowerCase().trim();
  return /^(yes|yeah|yep|yup|sure|ok|okay|alright|yea|yas|please|go\s+ahead|that|those|both|all(\s+of\s+(them|those))?|sounds?\s+good|the\s+first(\s+one)?|oud|spicy|warm|amber)[.!?]*$/i.test(
    lower
  );
}

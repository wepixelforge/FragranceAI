import {
  StructuredPreferences,
  Exclusions,
  FragranceFamily,
  Occasion,
  Season,
  Gender,
  Longevity,
  ParsedQuery,
  Product,
} from '@/types/product';
import { resolveStyleFamilies } from './style-aliases';
import { extractCanonicalFamilies, normalizeFragranceLanguage } from './fragrance-vocabulary';

/**
 * Known reference designer / niche perfumes for deep inspiration matching.
 */
export const POPULAR_REFERENCE_PERFUMES = [
  'dior sauvage',
  'sauvage',
  'bleu de chanel',
  'acqua di gio',
  'ysl y',
  'black opium',
  'la vie est belle',
  'stronger with you',
  'oud for greatness',
  'baccarat rouge',
  'baccarat rouge 540',
  'creed aventus',
  'aventus',
  'good girl',
  'miss dior',
  'mon paris',
  'spicebomb',
  'cool water',
  'versace pour homme',
  'ck one',
  'light blue',
  'terre d\'hermes',
  'encre noire',
  'oud wood',
  'tobacco vanille',
  'glossier you',
  'molecule 01',
  'j\'adore',
  'marc jacobs daisy',
  'chanel no 5',
  'arabian oud',
  'grand soir',
  'amber aoud',
  'oud satin mood',
  'not a perfume',
  'la nuit de l\'homme',
  'dior sauvage elixir',
  'stronger with you intensely',
  'versace bright crystal',
];

const REFERENCE_CUE =
  /\b(like|similar(\s+to)?|alternative\s+to|inspired\s+by|reminds\s+me\s+of|clone\s+of|dupe\s+of|usually\s+wear|currently\s+wear|already\s+(use|wear)|i\s+(use|wear)|compared\s+to|than|same vibe|something like)\b/i;

export function messageHasReferenceCue(message: string): boolean {
  return REFERENCE_CUE.test(message);
}

/** Explicit drop of a named/active reference, including "forget Sauvage" and "forget the Dior Sauvage reference". */
export function isReferenceDropRequest(message: string, activeReference?: string | null): boolean {
  const t = message.toLowerCase();
  if (/\b(forget|drop|remove|ignore)\b.{0,48}\breference\b/.test(t)) return true;
  if (/\bno\s+more\s+reference\b/.test(t)) return true;
  const named = [...POPULAR_REFERENCE_PERFUMES];
  if (activeReference) named.push(activeReference.toLowerCase());
  for (const ref of named) {
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b(forget|drop|remove|ignore)\\b.{0,40}\\b${escaped}\\b`, 'i').test(t)) {
      return true;
    }
  }
  return false;
}

function titleCaseReference(raw: string): string {
  return raw
    .split(/(\s+)/)
    .map((part) => {
      if (!part.trim()) return part;
      if (part.length <= 3 && !['de', 'di', "d'"].includes(part.toLowerCase())) {
        return part.toUpperCase();
      }
      if (part.toLowerCase() === 'de' || part.toLowerCase() === 'di') return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join('');
}

function displayNameForNeedle(needle: string, messageLower: string): string {
  if (needle.split(' ').length === 1) {
    const expansions = POPULAR_REFERENCE_PERFUMES.filter(
      (p) => p !== needle && (p.endsWith(` ${needle}`) || p.startsWith(`${needle} `))
    ).sort((a, b) => a.length - b.length);
    const inMessage = expansions.find((p) => messageLower.includes(p));
    if (inMessage) return titleCaseReference(inMessage);
    if (expansions[0] && expansions[0].split(' ').length <= 3) {
      return titleCaseReference(expansions[0]);
    }
  }
  return titleCaseReference(needle);
}

function boundaryIndex(haystack: string, needle: string): number {
  if (!needle || needle.length < 3) return -1;
  const re = new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i');
  const idx = haystack.search(re);
  return idx;
}

/**
 * Extract an explicit named reference perfume from the current message.
 * Uses known designer/niche references, catalogue product names, and similarTo aliases.
 * Returns null when the user is only stating a refinement such as "I want something warmer".
 */
export function extractKnownReferencePerfume(
  message: string,
  products: Product[] = []
): string | null {
  if (!messageHasReferenceCue(message)) return null;
  const lower = message.toLowerCase();
  const matches: { name: string; length: number; index: number }[] = [];

  const consider = (needle: string, name: string) => {
    const idx = boundaryIndex(lower, needle.toLowerCase());
    if (idx >= 0) {
      matches.push({ name, length: needle.length, index: idx });
    }
  };

  for (const product of products) {
    consider(product.name, product.name);
    for (const similar of product.similarTo || []) {
      consider(similar, similar);
    }
  }

  const popular = [...POPULAR_REFERENCE_PERFUMES].sort((a, b) => b.length - a.length);
  for (const ref of popular) {
    consider(ref, displayNameForNeedle(ref, lower));
  }

  if (matches.length === 0) return null;
  matches.sort((a, b) => b.length - a.length || a.index - b.index);
  return matches[0].name;
}

export function extractRelativePricePreference(message: string): 'cheaper' | null {
  const t = message.toLowerCase();
  if (
    /\b(cheaper|less expensive|lower price|more affordable|for less|budget[- ]friendly)\b/.test(t) ||
    /\bsame vibe but cheaper\b/.test(t) ||
    /\bsimilar but more affordable\b/.test(t)
  ) {
    return 'cheaper';
  }
  return null;
}

export function isComparativePreferenceRefinement(message: string): boolean {
  const t = message.toLowerCase().trim();
  if (isReferenceDropRequest(t)) return false;
  if (/\bforg[eo]t\s+(everything|all)\b/.test(t)) return false;
  return (
    /\bmake\s+it\s+(warmer|fresher|cooler|sweeter|stronger|softer|lighter|cheaper|less\s+sweet|more\s+affordable)\b/.test(
      t
    ) ||
    /^(warmer|fresher|cooler|stronger|softer|lighter|cheaper|less\s+sweet)[.!?]?$/.test(t) ||
    /\b(make\s+it\s+)?(less\s+sweet|more\s+affordable)\b/.test(t)
  );
}

/**
 * Parse natural language into structured preferences across multiple dimensions,
 * including negative preferences, exclusions, vibes, and designer references.
 */
export function parseQuery(raw: string): ParsedQuery {
  const query = raw.toLowerCase().trim();
  const preferences: StructuredPreferences = {
    rawQuery: raw,
    exclusions: {},
    vibes: [],
  };

  const exclusions: Exclusions = {
    fragranceFamilies: [],
    notes: [],
    intensity: [],
    gender: [],
    tags: [],
  };

  // ── 1. Exclusions & Negative Preferences Detection ───────────────────────────
  // E.g. "I hate sweet", "don't like sweet", "not sweet", "avoid vanilla", "not too strong"
  
  // Negative sweet
  if (
    query.match(/(?:hate|don't like|do not like|avoid|no|without|dislike|not a fan of)\s+(?:very\s+)?sweet/i) ||
    query.match(/not\s+(?:too\s+|very\s+)?sweet/i) ||
    query.includes('hate sweet') ||
    query.includes('no sweet')
  ) {
    exclusions.fragranceFamilies?.push('sweet', 'gourmand');
  }

  // Negative feminine (e.g. "not overly feminine", "not too feminine", "not for women")
  if (
    query.match(/not\s+(?:overly\s+|too\s+|super\s+)?feminine/i) ||
    query.match(/not\s+(?:for\s+)?women/i) ||
    query.match(/not\s+(?:too\s+)?girly/i)
  ) {
    exclusions.gender?.push('women');
    preferences.category = 'unisex'; // bias towards unisex/men
  }

  // Negative masculine
  if (query.match(/not\s+(?:overly\s+|too\s+)?masculine/i) || query.match(/not\s+(?:for\s+)?men/i)) {
    exclusions.gender?.push('men');
  }

  // Negative intensity / strength (e.g. "not too strong", "isn't too strong", "don't want anything too strong")
  if (
    query.match(/(?:not|isn't|is not|don't want|do not want)(?:\s+anything)?\s+(?:too\s+|overly\s+|very\s+)?(?:strong|heavy|loud|overpowering|intense)/i) ||
    query.includes('not too strong') ||
    query.includes("isn't too strong") ||
    query.includes('not overpowering') ||
    query.includes('subtle only')
  ) {
    exclusions.intensity?.push('strong', 'beast-mode');
    preferences.intensityPreference = 'subtle';
  }

  // Negative oud
  if (query.match(/(?:hate|don't like|no|without|avoid)\s+(?:heavy\s+)?oud/i)) {
    exclusions.fragranceFamilies?.push('oud');
    exclusions.notes?.push('oud');
  }

  // Negative floral
  if (query.match(/(?:hate|don't like|no|without|avoid)\s+(?:heavy\s+)?floral/i) || query.match(/not\s+(?:too\s+)?flowery/i)) {
    exclusions.fragranceFamilies?.push('floral');
  }

  // ── 2. Budget Extraction ──────────────────────────────────────────────────
  const rangePattern = /(?:rs\.?|inr|₹)?\s*([\d,]+)\s*(?:-|–|to)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i;
  const rangeMatch = query.match(rangePattern);

  if (rangeMatch) {
    preferences.budget = {
      min: parseInt(rangeMatch[1].replace(/,/g, ''), 10),
      max: parseInt(rangeMatch[2].replace(/,/g, ''), 10),
    };
  } else {
    const budgetPatterns = [
      /(?:under|below|less than|within|max|budget of|budget is|upto|up to)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)/i,
      /(?:rs\.?|inr|₹)\s*([\d,]+)/i,
      /\b([\d,]+)\s*(?:rs|rupees|inr|bucks)\b/i,
    ];
    for (const pattern of budgetPatterns) {
      const match = query.match(pattern);
      if (match) {
        preferences.budget = { max: parseInt(match[1].replace(/,/g, ''), 10) };
        break;
      }
    }
  }

  // ── 3. Occasion Detection ─────────────────────────────────────────────────
  const occasionMap: Record<string, Occasion> = {
    'date night': 'date-night',
    'date': 'date-night',
    'romantic': 'date-night',
    'romance': 'date-night',
    'dinner': 'date-night',
    'office': 'office',
    'work': 'office',
    'workplace': 'office',
    'professional': 'office',
    'corporate': 'office',
    'meeting': 'office',
    'official': 'office',
    'official use': 'office',
    'formal': 'formal',
    'black tie': 'formal',
    'casual': 'casual',
    'daily': 'daily',
    'daily wear': 'daily',
    'everyday': 'daily',
    'signature': 'daily',
    'party': 'party',
    'club': 'party',
    'clubbing': 'party',
    'night out': 'party',
    'wedding': 'wedding',
    'shaadi': 'wedding',
    'marriage': 'wedding',
    'reception': 'wedding',
    'sangeet': 'wedding',
    'evening': 'evening',
    'night': 'evening',
    'travel': 'travel',
    'vacation': 'travel',
    'holiday': 'travel',
    'gym': 'gym',
    'sport': 'gym',
    'sports': 'gym',
    'workout': 'gym',
  };

  const occasions: Occasion[] = [];
  for (const [kw, occ] of Object.entries(occasionMap)) {
    if (query.includes(kw) && !occasions.includes(occ)) {
      occasions.push(occ);
    }
  }
  // College/University maps to casual/daily with college vibe
  if (query.includes('college') || query.includes('campus') || query.includes('university') || query.includes('student')) {
    if (!occasions.includes('casual')) occasions.push('casual');
    if (!occasions.includes('daily')) occasions.push('daily');
    preferences.vibes?.push('college');
  }
  if (occasions.length > 0) preferences.occasion = occasions;

  // ── 4. Fragrance Family Extraction (with negation check) ─────────────────
  const familyMap: Record<string, FragranceFamily> = {
    'fresh': 'fresh',
    'clean': 'fresh',
    'crisp': 'fresh',
    'refreshing': 'fresh',
    'sweet': 'sweet',
    'sugary': 'sweet',
    'vanilla': 'sweet',
    'caramel': 'sweet',
    'gourmand': 'gourmand',
    'woody': 'woody',
    'wood': 'woody',
    'woods': 'woody',
    'sandalwood': 'woody',
    'cedar': 'woody',
    'oud': 'oud',
    'oudh': 'oud',
    'oud-ish': 'oud',
    'oudish': 'oud',
    'agarwood': 'oud',
    'floral': 'floral',
    'flowers': 'floral',
    'rose': 'floral',
    'jasmine': 'floral',
    'citrus': 'citrus',
    'lemon': 'citrus',
    'bergamot': 'citrus',
    'orange': 'citrus',
    'aquatic': 'aquatic',
    'marine': 'aquatic',
    'ocean': 'aquatic',
    'water': 'aquatic',
    'spicy': 'spicy',
    'spice': 'spicy',
    'oriental': 'oriental',
    'amber': 'oriental',
    'musky': 'musky',
    'musk': 'musky',
    'aromatic': 'aromatic',
    'fruity': 'fruity',
    'frooty': 'fruity',
    'fruit-forward': 'fruity',
    'fruitier': 'fruity',
  };

  const families: FragranceFamily[] = [];
  const normalizedQuery = normalizeFragranceLanguage(query);
  for (const [kw, fam] of Object.entries(familyMap)) {
    // Only add if not explicitly excluded
    if (normalizedQuery.includes(kw) && !exclusions.fragranceFamilies?.includes(fam)) {
      // Avoid false positive if preceded by "hate", "no", "not"
      const negated = new RegExp(`(?:hate|don't like|no|not|avoid)\\s+(?:very\\s+)?${kw}`, 'i');
      if (!negated.test(normalizedQuery) && !families.includes(fam)) {
        families.push(fam);
      }
    }
  }
  for (const fam of extractCanonicalFamilies(normalizedQuery)) {
    if (!exclusions.fragranceFamilies?.includes(fam) && !families.includes(fam)) {
      families.push(fam);
    }
  }
  if (families.length > 0) preferences.fragranceFamilies = families;

  const styleFamilies = resolveStyleFamilies(query);
  if (styleFamilies.length > 0) {
    preferences.fragranceFamilies = Array.from(
      new Set([...(preferences.fragranceFamilies || []), ...styleFamilies])
    ) as FragranceFamily[];
  }

  // ── 5. Reference Perfumes Detection ───────────────────────────────────────
  const referencePerfumes: string[] = [];
  for (const ref of POPULAR_REFERENCE_PERFUMES) {
    if (query.includes(ref)) {
      // Normalize to title case
      const title = ref.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!referencePerfumes.includes(title)) {
        referencePerfumes.push(title);
      }
    }
  }
  // Pattern matching: "like X", "similar to X", "alternative to X"
  const likePattern = /(?:like|similar to|alternative to|inspired by|reminds me of)\s+([a-z0-9\s'-]+?)(?:\s+(?:but|and|under|for|with)|$)/i;
  const likeMatch = query.match(likePattern);
  if (likeMatch && likeMatch[1]) {
    const candidate = likeMatch[1].trim();
    if (candidate.length > 2 && !referencePerfumes.some((r) => r.toLowerCase().includes(candidate))) {
      referencePerfumes.push(candidate.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    }
  }
  if (referencePerfumes.length > 0) preferences.referencePerfumes = referencePerfumes;

  // ── 6. Category / Gender Detection ────────────────────────────────────────
  if (
    query.includes('for women') ||
    query.includes('for her') ||
    query.includes('girlfriend') ||
    query.includes('wife') ||
    query.includes('sister') ||
    query.includes('mother') ||
    query.includes('mom') ||
    query.includes('female')
  ) {
    preferences.category = 'women';
  } else if (
    query.includes('for men') ||
    query.includes('for him') ||
    query.includes('boyfriend') ||
    query.includes('husband') ||
    query.includes('brother') ||
    query.includes('father') ||
    query.includes('dad') ||
    query.includes('male') ||
    /\b(manly|masculine|gentlemanly|mens)\b/i.test(query)
  ) {
    preferences.category = 'men';
    preferences.gender = 'men';
  } else if (query.includes('unisex') || query.includes('gender neutral')) {
    preferences.category = 'unisex';
  }

  // ── 7. Seasons Detection ──────────────────────────────────────────────────
  const seasonMap: Record<string, Season> = {
    'winter': 'winter',
    'cold weather': 'winter',
    'summer': 'summer',
    'hot weather': 'summer',
    'spring': 'spring',
    'autumn': 'autumn',
    'fall': 'autumn',
  };
  const seasons: Season[] = [];
  for (const [kw, s] of Object.entries(seasonMap)) {
    if (query.includes(kw) && !seasons.includes(s)) {
      seasons.push(s);
    }
  }
  if (seasons.length > 0) preferences.seasons = seasons;

  // ── 8. Longevity & Intensity Preferences ──────────────────────────────────
  const isNegatedStrong = query.match(/(?:not|isn't|is not|don't want|do not want|less)\s+(?:too\s+|very\s+)?(?:strong|heavy|loud|intense)/i) ||
    query.includes('not strong') ||
    query.includes('not too strong') ||
    query.includes('less intense') ||
    query.includes('less strong');

  if (
    query.includes('beast mode') ||
    query.includes('massive projection') ||
    query.includes('nuclear') ||
    /\b(strong|stronger|punchy|heavy)\b/i.test(query)
  ) {
    if (!isNegatedStrong) {
      preferences.intensityPreference = 'strong';
    }
  }

  if (
    query.includes('long lasting') ||
    query.includes('long-lasting') ||
    query.includes('lasts long') ||
    query.includes('all day') ||
    query.includes('whole day') ||
    query.includes('full day') ||
    query.includes('all-day')
  ) {
    preferences.longevityPreference = 'long-lasting';
  }

  if (
    query.includes('subtle') ||
    query.includes('intimate') ||
    query.includes('skin scent') ||
    /\b(light|lighter)\b/i.test(query) ||
    isNegatedStrong
  ) {
    // Avoid false positive with 'light blue' perfume reference unless explicitly contrasting
    if (!query.includes('light blue') || query.includes('but light') || query.includes('make it light') || query.includes('something light')) {
      preferences.intensityPreference = 'subtle';
      if (!exclusions.intensity?.includes('strong')) {
        exclusions.intensity?.push('strong', 'beast-mode');
      }
    }
  }

  // ── 9. Vibes & Nuances (e.g. "expensive", "clean", "college", "warmer") ───
  if (query.includes('expensive') || query.includes('rich') || query.includes('luxury') || query.includes('luxurious')) {
    preferences.vibes?.push('expensive');
  }
  if (query.includes('warmer') || query.includes('warm')) {
    preferences.vibes?.push('warm');
  }
  if (query.includes('clean')) {
    preferences.vibes?.push('clean');
  }
  if (/\bcreamy\b/.test(query)) {
    preferences.vibes?.push('creamy');
  }
  if (/\bsoft\b/.test(query)) {
    preferences.vibes?.push('soft');
  }
  if (query.includes('gift') || query.includes('gifting')) {
    preferences.vibes?.push('gift');
  }

  // ── 10. Specific Notes Extraction ─────────────────────────────────────────
  const noteList = [
    'vanilla', 'amber', 'oud', 'sandalwood', 'rose', 'lavender', 'coffee',
    'leather', 'iris', 'bergamot', 'patchouli', 'tonka', 'cinnamon', 'pepper',
    'vetiver', 'cardamom', 'caramel', 'jasmine', 'tobacco',
  ];
  const notes: string[] = [];
  for (const n of noteList) {
    if (query.includes(n) && !exclusions.notes?.includes(n)) {
      notes.push(n);
    }
  }
  if (notes.length > 0) preferences.notes = notes;

  // Attach exclusions if any exist
  const hasExclusions =
    (exclusions.fragranceFamilies?.length || 0) > 0 ||
    (exclusions.notes?.length || 0) > 0 ||
    (exclusions.intensity?.length || 0) > 0 ||
    (exclusions.gender?.length || 0) > 0;

  if (hasExclusions) {
    preferences.exclusions = exclusions;
  }

  // Return ParsedQuery backwards-compatible format
  return {
    ...preferences,
    rawQuery: raw,
    // Alias for existing callers
    gender: preferences.category,
    fragranceFamily: preferences.fragranceFamilies,
    similarTo: preferences.referencePerfumes,
    season: preferences.seasons,
    intensity: preferences.intensityPreference,
    longevity: preferences.longevityPreference,
  };
}

/**
 * Intelligently merges preferences across conversation turns.
 * Preserves existing context (e.g. date-night) while applying new refinements
 * (e.g. budget, sweeter, fresher, exclusions).
 */
export function mergePreferences(
  prev: StructuredPreferences | null | undefined,
  nextRaw: string
): StructuredPreferences {
  const delta = parseQuery(nextRaw);
  if (!prev) return delta;

  const merged: StructuredPreferences = {
    ...prev,
    rawQuery: nextRaw,
    vibes: Array.from(new Set([...(prev.vibes || []), ...(delta.vibes || [])])),
    exclusions: {
      fragranceFamilies: Array.from(new Set([...(prev.exclusions?.fragranceFamilies || []), ...(delta.exclusions?.fragranceFamilies || [])])),
      notes: Array.from(new Set([...(prev.exclusions?.notes || []), ...(delta.exclusions?.notes || [])])),
      intensity: Array.from(new Set([...(prev.exclusions?.intensity || []), ...(delta.exclusions?.intensity || [])])),
      gender: Array.from(new Set([...(prev.exclusions?.gender || []), ...(delta.exclusions?.gender || [])])),
    },
  };

  // 1. Budget: always take the most recent specific budget constraint
  if (delta.budget) {
    merged.budget = delta.budget;
  }

  // 2. Occasion: merge or update
  if (delta.occasion && delta.occasion.length > 0) {
    // If user says "better for office", update or add office
    merged.occasion = Array.from(new Set([...(prev.occasion || []), ...delta.occasion]));
  }

  // 3. Category / Gender
  if (delta.category) {
    merged.category = delta.category;
  }

  // 4. Fragrance Families:
  // If user says "make it sweeter" or "something sweeter", add sweet
  // If user says "something fresher", add fresh
  if (delta.fragranceFamilies && delta.fragranceFamilies.length > 0) {
    merged.fragranceFamilies = Array.from(new Set([...(prev.fragranceFamilies || []), ...delta.fragranceFamilies]));
  }

  // Remove any families that were newly excluded
  if (merged.exclusions?.fragranceFamilies && merged.fragranceFamilies) {
    merged.fragranceFamilies = merged.fragranceFamilies.filter(
      (f) => !merged.exclusions?.fragranceFamilies?.includes(f)
    );
  }

  // 5. Reference Perfumes
  if (delta.referencePerfumes && delta.referencePerfumes.length > 0) {
    merged.referencePerfumes = delta.referencePerfumes;
  }

  // 6. Seasons
  if (delta.seasons && delta.seasons.length > 0) {
    merged.seasons = Array.from(new Set([...(prev.seasons || []), ...delta.seasons]));
  }

  // 7. Longevity & Intensity
  if (delta.longevityPreference) {
    merged.longevityPreference = delta.longevityPreference;
  }
  if (delta.intensityPreference) {
    merged.intensityPreference = delta.intensityPreference;
  }

  // 8. Notes
  if (delta.notes && delta.notes.length > 0) {
    merged.notes = Array.from(new Set([...(prev.notes || []), ...delta.notes]));
  }

  return merged;
}

import { Stage1IntentOutput } from '@/types/chat';
import type {
  ExplorationIntent,
  ExperienceLevel,
  FormatIntent,
  Product,
  ProductFormat,
} from '@/types/product';

export const FORMAT_INTENT_TO_FORMATS: Record<FormatIntent, ProductFormat[]> = {
  TRY_SAMPLE: ['sample', 'vial'],
  TRY_VIAL: ['vial', 'sample'],
  POCKET_SIZE: ['pocket'],
  MINIATURE: ['miniature'],
  TESTER: ['tester'],
  DISCOVERY_SET: ['discovery-set'],
  FULL_SIZE: ['full-size', 'tester'],
  NO_FORMAT_PREFERENCE: [],
};

export function parseSamplingContext(message: string): {
  formatPreference: FormatIntent | null;
  explorationIntent: ExplorationIntent;
  experienceLevel: ExperienceLevel;
  travelIntent: boolean;
  giftingIntent: boolean;
} {
  const t = message.toLowerCase();

  let formatPreference: FormatIntent | null = null;
  if (
    /\b(full\s+(size|bottle)|retail\s+pack|already\s+(own|have|tried)\s+the\s+sample|love\s+(the\s+)?sample|want\s+the\s+full)\b/.test(
      t
    )
  ) {
    formatPreference = 'FULL_SIZE';
  } else if (/\b(discovery\s+set|several\s+fragrances|few\s+fragrances|try\s+several|explore\s+several)\b/.test(t)) {
    formatPreference = 'DISCOVERY_SET';
  } else if (/\b(pocket|travel\s+size|tiny\s+for\s+travel|small\s+for\s+travel|something\s+small)\b/.test(t)) {
    formatPreference = 'POCKET_SIZE';
  } else if (/\bminiatures?\b/.test(t)) {
    formatPreference = 'MINIATURE';
  } else if (/\btesters?\b/.test(t) && !/\btest(ing| it)?\b/.test(t)) {
    formatPreference = 'TESTER';
  } else if (/\bvials?\b/.test(t)) {
    formatPreference = 'TRY_VIAL';
  } else if (
    /\b(sample|try\s+(it\s+)?first|just\s+want\s+to\s+test|try\s+before|don'?t\s+want\s+to\s+commit)\b/.test(t)
  ) {
    formatPreference = 'TRY_SAMPLE';
  }

  const travelIntent = /\b(travel|travelling|cabin|airport|on\s+the\s+go|pocket)\b/.test(t);
  const giftingIntent = /\b(gift|gifting|present\s+for|for\s+my\s+(wife|husband|partner|mom|dad))\b/.test(t);

  let experienceLevel: ExperienceLevel = null;
  if (/\b(never\s+tried|new\s+to|beginner|first\s+time|don'?t\s+know\s+what\s+family)\b/.test(t)) {
    experienceLevel = 'beginner';
  } else if (/\b(already\s+(own|know|love)|i\s+know\s+i\s+love|experienced)\b/.test(t)) {
    experienceLevel = 'experienced';
  }

  let explorationIntent: ExplorationIntent = null;
  if (formatPreference === 'FULL_SIZE' || experienceLevel === 'experienced') {
    explorationIntent = 'full-bottle-confidence';
  } else if (formatPreference === 'DISCOVERY_SET' || /\b(several|a\s+few\s+fragrances|compare)\b/.test(t)) {
    explorationIntent = 'compare-several';
  } else if (travelIntent) {
    explorationIntent = 'travel';
  } else if (giftingIntent) {
    explorationIntent = 'gifting';
  } else if (experienceLevel === 'beginner' || formatPreference === 'TRY_SAMPLE' || formatPreference === 'TRY_VIAL') {
    explorationIntent = 'sampling';
  }

  return { formatPreference, explorationIntent, experienceLevel, travelIntent, giftingIntent };
}

export function applySamplingContextToStage1(
  stage1: Stage1IntentOutput,
  message: string
): Stage1IntentOutput {
  const parsed = parseSamplingContext(message);
  return {
    ...stage1,
    format_preference: parsed.formatPreference ?? null,
    exploration_intent: parsed.explorationIntent ?? stage1.exploration_intent ?? null,
    experience_level: parsed.experienceLevel ?? stage1.experience_level ?? null,
    travel_intent: parsed.travelIntent || Boolean(stage1.travel_intent),
    gifting_intent: parsed.giftingIntent || Boolean(stage1.gifting_intent),
  };
}

export function formatsForIntent(intent?: FormatIntent | null): ProductFormat[] {
  if (!intent || intent === 'NO_FORMAT_PREFERENCE') return [];
  return FORMAT_INTENT_TO_FORMATS[intent] || [];
}

export function productMatchesFormat(product: Product, intent?: FormatIntent | null): boolean {
  const allowed = formatsForIntent(intent);
  if (!allowed.length) return true;
  if (!product.format) return false;
  return allowed.includes(product.format);
}

export function samplingScoreBonus(product: Product, prefs: {
  formatPreference?: FormatIntent | null;
  explorationIntent?: ExplorationIntent;
  experienceLevel?: ExperienceLevel;
  travelIntent?: boolean;
  giftingIntent?: boolean;
}): number {
  const format = product.format;
  if (!format) return 0;
  let bonus = 0;
  const exploration = prefs.explorationIntent;
  if (exploration === 'sampling' || prefs.experienceLevel === 'beginner') {
    if (format === 'sample' || format === 'vial' || format === 'discovery-set') bonus += 42;
    if (format === 'full-size') bonus -= 18;
  }
  if (exploration === 'compare-several') {
    if (format === 'discovery-set') bonus += 55;
    if (format === 'sample' || format === 'vial') bonus += 28;
  }
  if (exploration === 'travel' || prefs.travelIntent) {
    if (format === 'pocket' || format === 'miniature') bonus += 48;
  }
  if (exploration === 'gifting' || prefs.giftingIntent) {
    if (format === 'discovery-set' || format === 'miniature' || format === 'full-size') bonus += 24;
  }
  if (exploration === 'full-bottle-confidence') {
    if (format === 'full-size' || format === 'tester') bonus += 46;
    if (format === 'sample' || format === 'vial') bonus -= 12;
  }
  return bonus;
}

export function relatedFormatProducts(product: Product, catalogue: Product[]): Product[] {
  if (!product.lineageId) return [];
  return catalogue.filter((item) => item.lineageId === product.lineageId && item.id !== product.id);
}

export function detectFormatEducationQuestion(message: string): boolean {
  const t = message.toLowerCase();
  if (
    /\b(i want|give me|show me|add|buy|recommend|actually)\b/.test(t) &&
    !/\b(difference|different|versus|\bvs\b|better for|should i|cheapest way|formats?\s+available)\b/.test(t)
  ) {
    return false;
  }
  return (
    /\b(tester|retail\s+pack|sample|miniature|pocket|discovery\s+set|full\s+(size|bottle)|vial|formats?)\b/.test(t) &&
    /\b(difference|different|vs|versus|better for|cheapest way|should i get|what.?s better|formats?\s+available|what size|is there a tester|come in a)\b/.test(
      t
    )
  );
}

export function formatEducationReply(message: string): string {
  const t = message.toLowerCase();
  if (/\btester\b/.test(t) && /\b(retail|full|box|packaging)\b/.test(t)) {
    return 'A tester is usually the same fragrance juice as the retail pack, sold without the decorative outer box. It is not a different scent. A retail pack is the same juice with the branded presentation box. This catalogue only lists testers when that format is actually stocked.';
  }
  if (/\bsample\b/.test(t) && /\bminiature\b/.test(t)) {
    return 'A sample or vial is a small official trial size for wearing the scent a few times. A miniature is a smaller bottle of the same fragrance — more juice than a sample, still short of a full bottle. Choose the sample if you have not tried it; choose the miniature if you want a compact bottle you can keep using.';
  }
  if (/\btravel\b/.test(t) || /\bpocket\b/.test(t) || /\bsmall\b/.test(t)) {
    return 'For travel, pocket perfumes and miniatures are the formats built to stay small. Samples work for a short trip; they are not a substitute for a pocket spray if you want repeat wear on the road.';
  }
  if (/\bcheapest way to try\b/.test(t) || /\btry first\b/.test(t)) {
    return 'The lowest-commitment way to try a fragrance in this catalogue is usually an official sample or vial, when one exists for that scent. I will only suggest a format that is actually listed.';
  }
  if (/\bformats?\b/.test(t) || /\bfull bottle\b/.test(t) || /\btester\b/.test(t)) {
    return 'Formats in this catalogue are distinct SKUs: sample/vial, pocket perfume, miniature, tester, discovery set, and full-size retail. I can only confirm a format if that SKU is listed. If the catalogue does not list it, I will say so rather than invent it.';
  }
  return 'Format changes size and packaging, not the fragrance identity. I will only recommend a sample, pocket size, miniature, tester, discovery set, or full bottle when that exact SKU exists in the catalogue.';
}

export function formatLabel(format?: ProductFormat): string {
  switch (format) {
    case 'sample':
      return 'Official sample';
    case 'vial':
      return 'Vial';
    case 'pocket':
      return 'Pocket perfume';
    case 'miniature':
      return 'Miniature';
    case 'tester':
      return 'Tester';
    case 'discovery-set':
      return 'Discovery set';
    case 'full-size':
      return 'Full size';
    default:
      return 'Fragrance';
  }
}

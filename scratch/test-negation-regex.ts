interface PolarityResult {
  attribute: string;
  isNegated: boolean;
  isReversal: boolean;
  isPositive: boolean;
}

const ATTRIBUTES = {
  sweet: ['sweet', 'sugary', 'sugar', 'gourmand', 'vanilla'],
  oud: ['oud', 'agarwood'],
  strong: ['strong', 'powerful', 'beast', 'heavy', 'overpowering', 'fill the room', 'fills the room'],
  woody: ['woody', 'wood', 'cedar', 'sandalwood'],
  spicy: ['spicy', 'spice', 'peppery'],
  fresh: ['fresh', 'crisp', 'clean'],
  citrus: ['citrus', 'lemon', 'bergamot'],
  aquatic: ['aquatic', 'marine', 'ocean'],
  floral: ['floral', 'rose', 'jasmine']
};

function analyzePolarity(rawText: string, attrKey: keyof typeof ATTRIBUTES): PolarityResult {
  const text = rawText.toLowerCase();
  const keywords = ATTRIBUTES[attrKey];

  // 1. Check for reversal (e.g. "actually I like sweet perfumes now", "I do like sweet", "sweet is fine now")
  const reversalPatterns = [
    new RegExp(`\\b(actually|now)\\b.{0,20}\\b(like|love|want|enjoy|fine\\s+with)\\b.{0,15}\\b(${keywords.join('|')})\\b`, 'i'),
    new RegExp(`\\b(i\\s+do\\s+(like|want|enjoy))\\b.{0,15}\\b(${keywords.join('|')})\\b`, 'i'),
    new RegExp(`\\b(${keywords.join('|')})\\b.{0,15}\\b(is\\s+fine|is\\s+okay|is\\s+good)\\b`, 'i')
  ];
  const isReversal = reversalPatterns.some(p => p.test(text));
  if (isReversal) {
    return { attribute: attrKey, isNegated: false, isReversal: true, isPositive: true };
  }

  // 2. Check if any keyword of this attribute is mentioned
  const kwMatch = keywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(text));
  if (!kwMatch) {
    return { attribute: attrKey, isNegated: false, isReversal: false, isPositive: false };
  }

  // 3. Check for negation / exclusion patterns
  const negPfx = `\\b(no|not|dont|don't|do\\s+not|never|without|stop|avoid|avoiding|hate|hates|dislike|dislikes|detest|cant\\s+stand|can't\\s+stand|cannot\\s+stand|don't\\s+want|dont\\s+want|do\\s+not\\s+want|doesn't\\s+want|doesnt\\s+want|does\\s+not\\s+want|don't\\s+show|dont\\s+show|do\\s+not\\s+show|anything\\s+but|nothing|except|other\\s+than|apart\\s+from|zero|isn't|isnt|doesn't|doesnt)\\b`;
  
  const kwPattern = `(${keywords.join('|')})`;

  // Pattern A: Negation marker before keyword within 0 to 4 words
  const pA = new RegExp(`${negPfx}(?:\\s+[\\w'-]+){0,4}\\s+${kwPattern}\\b`, 'i');

  // Pattern B: "Keep [keyword] out"
  const pB = new RegExp(`\\bkeep\\b(?:\\s+[\\w'-]+){0,3}\\s+${kwPattern}(?:\\s+[\\w'-]+){0,3}\\s+\\bout\\b`, 'i');

  // Pattern C: Non-[keyword]
  const pC = new RegExp(`\\bnon-${kwPattern}\\b`, 'i');

  const isNegated = pA.test(text) || pB.test(text) || pC.test(text);

  return {
    attribute: attrKey,
    isNegated,
    isReversal: false,
    isPositive: !isNegated
  };
}

// Test cases
const testCases = [
  // Exact failures from prompt
  { input: "i dont like sweet perfume", attr: 'sweet', expectNeg: true },
  { input: "i do not like sweet perfume", attr: 'sweet', expectNeg: true },
  { input: "i hate sweet perfumes", attr: 'sweet', expectNeg: true },

  // Section 10 variants
  { input: "I don't like sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "I dont like sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "I do not like sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "I hate sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "I don't want sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "Avoid sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "Nothing sweet.", attr: 'sweet', expectNeg: true },
  { input: "Anything but sweet.", attr: 'sweet', expectNeg: true },
  { input: "Keep sweet fragrances out.", attr: 'sweet', expectNeg: true },
  { input: "Please don't show me anything sugary.", attr: 'sweet', expectNeg: true },
  { input: "I can't stand sugary perfumes.", attr: 'sweet', expectNeg: true },
  { input: "No vanilla-heavy fragrances.", attr: 'sweet', expectNeg: true },

  // Positive vs negative pairs (Section 11)
  { input: "I like sweet perfumes.", attr: 'sweet', expectNeg: false },
  { input: "I don't like sweet perfumes.", attr: 'sweet', expectNeg: true },
  { input: "I like oud.", attr: 'oud', expectNeg: false },
  { input: "I hate oud.", attr: 'oud', expectNeg: true },
  { input: "I want something strong.", attr: 'strong', expectNeg: false },
  { input: "I don't want anything strong.", attr: 'strong', expectNeg: true },
  { input: "I want something fresh.", attr: 'fresh', expectNeg: false },
  { input: "I don't want anything fresh.", attr: 'fresh', expectNeg: true },

  // Complex nuance
  { input: "I need something I can wear to meetings that smells crisp but doesn't fill the room.", attr: 'strong', expectNeg: true },
  { input: "I need something I can wear to meetings that smells crisp but doesn't fill the room.", attr: 'fresh', expectNeg: false },

  // Reversal
  { input: "Actually, I like sweet perfumes now.", attr: 'sweet', expectRev: true }
];

let failed = 0;
for (const tc of testCases) {
  const res = analyzePolarity(tc.input, tc.attr as any);
  if (tc.expectRev) {
    if (!res.isReversal) {
      console.error(`FAILED: "${tc.input}" for ${tc.attr} expected REVERSAL, got`, res);
      failed++;
    } else {
      console.log(`PASS: "${tc.input}" -> REVERSAL of ${tc.attr}`);
    }
  } else if (res.isNegated !== tc.expectNeg) {
    console.error(`FAILED: "${tc.input}" for ${tc.attr} expected isNegated=${tc.expectNeg}, got isNegated=${res.isNegated}`, res);
    failed++;
  } else {
    console.log(`PASS: "${tc.input}" -> ${tc.attr} ${res.isNegated ? 'EXCLUDED' : 'PREFERRED'}`);
  }
}

console.log(`\nResults: ${testCases.length - failed}/${testCases.length} passed.`);
if (failed > 0) process.exit(1);

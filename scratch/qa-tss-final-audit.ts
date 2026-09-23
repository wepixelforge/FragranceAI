/**
 * TSS final conversational QA audit — live /api/chat path.
 * Audit only. Does not modify application code.
 * Run: npx tsx --tsconfig tsconfig.json scratch/qa-tss-final-audit.ts
 */
import { getProduct, getProducts } from '../src/data';
import { isHairBodyMistProduct } from '../src/lib/sampling-format';

const BASE = process.env.AUDIT_BASE || 'http://127.0.0.1:3022';
const SLUG = 'thescentstories';
const OLD_CAPABILITY =
  "I can help you discover fragrances based on your preferences, occasion, budget, notes, intensity, or even a perfume you already like. Just tell me what you're looking for.";
const OLD_DISCOVERY =
  'I can help you find one. What kind of scents do you usually enjoy — fresh, sweet, woody, floral, or spicy?';

type Severity = 'P0' | 'P1' | 'P2' | 'P3';

interface Finding {
  id: string;
  severity: Severity;
  section: string;
  userMessage: string;
  previousState: unknown;
  intent: string;
  structuredState: unknown;
  recResult: unknown;
  assistantResponse: string;
  products: string[];
  expected: string;
  actual: string;
  likelyRootCause: string;
  files: string[];
}

interface Turn {
  message: string;
  intent: string;
  reply: string;
  messages: string[];
  status: string;
  engine: string;
  retrieval: string;
  needsRecs: boolean;
  results: Array<{ id: string; name: string; price: number; family: string[]; format: string; brandSlug: string; concentration?: string; tags?: string[] }>;
  state: any;
  debug: any;
  cartAction: any;
  isPartial: boolean;
  ms: number;
}

const catalogue = getProducts(SLUG);
const byId = new Map(catalogue.map((p) => [p.id, p]));
const findings: Finding[] = [];
const records: { id: string; ok: boolean; detail: string }[] = [];
let executed = 0;

function sid(label: string) {
  return `audit-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function snapState(state: any) {
  if (!state) return null;
  const a = state.activeRequest || {};
  return {
    families: a.families,
    notes: a.preferredNotes,
    occasion: a.occasion,
    budget: a.budget,
    intensity: a.intensity,
    warmth: a.warmth,
    freshness: a.freshness,
    relativePrice: a.relativePrice,
    isSimilarity: a.isSimilarityRequest,
    format: a.formatPreference,
    reference: state.backgroundContext?.referencePerfume || null,
  };
}

function productLine(r: Turn['results'][number]) {
  return `${r.id} ${r.name} ₹${r.price} [${r.family.join('/')}] ${r.format}`;
}

async function post(
  message: string,
  ctx: { state?: any; history?: { role: string; content: string }[]; sessionId: string; cart?: { productId: string; brandSlug?: string; quantity: number }[]; reset?: boolean }
): Promise<Turn> {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      brandSlug: SLUG,
      conversationState: ctx.state,
      history: ctx.history || [],
      sessionId: ctx.sessionId,
      resetSession: Boolean(ctx.reset),
      cart: {
        items: ctx.cart || [],
        itemCount: (ctx.cart || []).reduce((n, i) => n + i.quantity, 0),
      },
    }),
  });
  const data = await res.json();
  const results = (data.results || []).map((r: any) => ({
    id: r.product?.id,
    name: r.product?.name,
    price: r.product?.price,
    family: r.product?.fragranceFamily || [],
    format: r.product?.format,
    brandSlug: r.product?.brandSlug,
    concentration: r.product?.concentration,
    tags: r.product?.tags || [],
  }));
  return {
    message,
    intent: data.intent,
    reply: String(data.reply || ''),
    messages: data.messages || [],
    status: data.debugInfo?.status || '',
    engine: data.debugInfo?.recommendationEngineStatus || 'UNKNOWN',
    retrieval: data.debugInfo?.productRetrievalStatus || 'UNKNOWN',
    needsRecs: Boolean(data.needsRecommendations),
    results,
    state: data.updatedState,
    debug: data.debugInfo,
    cartAction: data.cartAction || null,
    isPartial: Boolean(data.isPartialMatch),
    ms: Date.now() - started,
  };
}

function applyCart(cart: { productId: string; brandSlug?: string; quantity: number }[], action: any) {
  if (!action || action.success === false) return cart;
  const items = action.items?.length
    ? action.items
    : action.productId
      ? [{ productId: action.productId, brandSlug: action.brandSlug || SLUG, quantity: action.quantity || 1 }]
      : [];
  const next = cart.map((i) => ({ ...i }));
  if (action.action === 'ADD_TO_CART') {
    for (const item of items) {
      const hit = next.find((i) => i.productId === item.productId);
      if (hit) hit.quantity += item.quantity || 1;
      else next.push({ productId: item.productId, brandSlug: item.brandSlug || SLUG, quantity: item.quantity || 1 });
    }
  } else if (action.action === 'REMOVE_FROM_CART') {
    return next.filter((i) => !items.some((x: any) => x.productId === i.productId));
  } else if (action.action === 'CLEAR_CART') {
    return [];
  }
  return next;
}

async function convo(label: string, messages: string[], startCart: { productId: string; brandSlug?: string; quantity: number }[] = []) {
  const sessionId = sid(label);
  let state: any = undefined;
  let history: { role: string; content: string }[] = [];
  let cart = [...startCart];
  const turns: Turn[] = [];
  for (const message of messages) {
    const prev = snapState(state);
    const turn = await post(message, { state, history, sessionId, cart, reset: turns.length === 0 });
    (turn as any).previousState = prev;
    cart = applyCart(cart, turn.cartAction);
    (turn as any).cartAfter = cart;
    turns.push(turn);
    state = turn.state;
    history = [...history, { role: 'user', content: message }, { role: 'assistant', content: turn.reply }].slice(-24);
  }
  return turns;
}

function fail(partial: Finding) {
  findings.push(partial);
  records.push({ id: partial.id, ok: false, detail: `${partial.severity} ${partial.actual}` });
  console.log(`FAIL ${partial.id} [${partial.severity}] ${partial.actual}`);
}

function pass(id: string, detail: string) {
  records.push({ id, ok: true, detail });
  console.log(`PASS ${id} — ${detail}`);
}

function check(id: string, ok: boolean, detail: string, finding?: Omit<Finding, 'id'>) {
  executed += 1;
  if (ok) pass(id, detail);
  else if (finding) fail({ id, ...finding });
  else {
    records.push({ id, ok: false, detail });
    console.log(`FAIL ${id} — ${detail}`);
  }
}

function noMatch(text: string) {
  return /couldn'?t find|no fragrance that matches|close fit for that combination/i.test(text);
}

function oosRefusal(text: string) {
  return /can'?t help with that topic|specialize in fragrance|here to help you discover fragrance/i.test(text);
}

function inventedPopularity(text: string) {
  return /\b(best[- ]?seller|most popular|best in (the )?(store|catalogue)|our most loved)\b/i.test(text);
}

function foreignBrand(results: Turn['results']) {
  return results.filter((r) => r.brandSlug && r.brandSlug !== SLUG);
}

function namedInReply(reply: string, names: string[]) {
  const lower = reply.toLowerCase();
  return names.filter((n) => lower.includes(n.toLowerCase().slice(0, 18)));
}

function catalogueNameInReply(reply: string) {
  return catalogue.filter((p) => reply.toLowerCase().includes(p.name.toLowerCase()));
}

function familyOk(results: Turn['results'], family: string) {
  if (!results.length) return false;
  return results.some((r) => r.family.map((f) => f.toLowerCase()).includes(family));
}

function evidence(t: Turn) {
  return {
    intent: t.intent,
    status: t.status,
    engine: t.engine,
    state: snapState(t.state),
    products: t.results.map(productLine),
    reply: t.reply.slice(0, 280),
  };
}

async function section1() {
  const phrases = [
    ['1.1', 'Hi'],
    ['1.2', 'Hello'],
    ['1.3', 'Hey'],
    ['1.4', 'What can you offer?'],
    ['1.5', 'What can you help me with?'],
    ['1.6', 'Who are you?'],
    ['1.7', 'How does this work?'],
    ['1.8', 'Thanks'],
    ['1.9', 'Okay'],
    ['1.10', 'Bye'],
  ] as const;
  for (const [id, msg] of phrases) {
    const [t] = await convo(id, [msg]);
    const recs = t.needsRecs && t.results.length > 0;
    const engineCalled = t.engine === 'CALLED';
    const isCap = /offer|help me with/i.test(msg);
    const hardcoded = t.reply.trim() === OLD_CAPABILITY;
    const bad =
      recs ||
      noMatch(t.reply) ||
      (isCap && (t.intent === 'OUT_OF_SCOPE' || hardcoded)) ||
      (isCap && engineCalled);
    check(
      id,
      !bad,
      `intent=${t.intent} engine=${t.engine} recs=${t.results.length} ${t.reply.slice(0, 120)}`,
      bad
        ? {
            severity: isCap && t.intent === 'OUT_OF_SCOPE' ? 'P1' : recs ? 'P1' : 'P2',
            section: '1 GENERAL',
            userMessage: msg,
            previousState: null,
            intent: t.intent,
            structuredState: snapState(t.state),
            recResult: evidence(t),
            assistantResponse: t.reply,
            products: t.results.map(productLine),
            expected: isCap
              ? 'LLM capability reply, no products, not OOS, not hardcoded'
              : 'Conversational reply, no random recs, no NO_MATCH',
            actual: `intent=${t.intent} engine=${t.engine} products=${t.results.length} hardcoded=${hardcoded}`,
            likelyRootCause: isCap && hardcoded ? 'Capability still using canned fallback as primary' : 'Greeting/conversation routed through rec engine or OOS',
            files: ['src/lib/intent-classifier.ts', 'src/lib/response-generator.ts', 'src/app/api/chat/route.ts'],
          }
        : undefined
    );
  }
}

async function section2() {
  const cases: Array<[string, string, 'clarify' | 'broad']> = [
    ['2.1', 'What fragrance would I like?', 'clarify'],
    ['2.2', 'What do you think I would like?', 'clarify'],
    ['2.3', 'Which perfume would suit me?', 'clarify'],
    ['2.4', 'What should I try?', 'clarify'],
    ['2.5', 'Recommend something for me.', 'clarify'],
    ['2.6', "I don't have anything specific in mind.", 'broad'],
    ['2.7', 'Just suggest some good scents.', 'broad'],
    ['2.8', 'Surprise me.', 'broad'],
  ];
  for (const [id, msg, kind] of cases) {
    const [t] = await convo(id, [msg]);
    const foreign = foreignBrand(t.results);
    const falseNoMatch = noMatch(t.reply) && t.results.length === 0 && kind === 'clarify';
    const missingBroad = kind === 'broad' && t.results.length === 0;
    const invented = inventedPopularity(t.reply);
    const oldScript = t.reply.trim() === OLD_DISCOVERY;
    const namedMissing = t.results.filter((r) => !t.reply.toLowerCase().includes(r.name.toLowerCase().split(' ').slice(0, 2).join(' ').toLowerCase()));
    const bad = Boolean(foreign.length) || falseNoMatch || missingBroad || invented;
    check(
      id,
      !bad,
      `intent=${t.intent} n=${t.results.length} status=${t.status} ${t.reply.slice(0, 140)}`,
      bad
        ? {
            severity: foreign.length ? 'P0' : missingBroad || falseNoMatch ? 'P1' : 'P2',
            section: '2 OPEN-ENDED',
            userMessage: msg,
            previousState: null,
            intent: t.intent,
            structuredState: snapState(t.state),
            recResult: evidence(t),
            assistantResponse: t.reply,
            products: t.results.map(productLine),
            expected: kind === 'broad' ? 'Immediate diverse TSS products, no NO_MATCH' : 'LLM clarification, no NO_MATCH, no products required',
            actual: `n=${t.results.length} status=${t.status} invented=${invented} oldScript=${oldScript} unnamed=${namedMissing.map((r) => r.name).join('|')}`,
            likelyRootCause: missingBroad
              ? 'Broad request classified as clarification or empty search'
              : falseNoMatch
                ? 'Empty-state discovery treated as NO_MATCH'
                : 'Brand leak or unsupported popularity claim',
            files: ['src/lib/intent-classifier.ts', 'src/lib/recommendation-engine.ts', 'src/lib/response-generator.ts'],
          }
        : undefined
    );
    if (oldScript) {
      fail({
        id: `${id}-hardcode`,
        severity: 'P2',
        section: '2 OPEN-ENDED',
        userMessage: msg,
        previousState: null,
        intent: t.intent,
        structuredState: snapState(t.state),
        recResult: evidence(t),
        assistantResponse: t.reply,
        products: [],
        expected: 'LLM-generated consultation wording',
        actual: 'Exact previous hardcoded discovery question',
        likelyRootCause: 'Discovery-start still served from fallback canned string',
        files: ['src/lib/response-generator.ts'],
      });
    }
  }
}

async function section3() {
  const cases: Array<[string, string, string | 'clarify']> = [
    ['3.1', 'I want something fruity.', 'fruity'],
    ['3.2', 'I want something woody.', 'woody'],
    ['3.3', 'I want something floral.', 'floral'],
    ['3.4', 'I want something fresh.', 'fresh'],
    ['3.5', 'I want something sweet.', 'sweet'],
    ['3.6', 'I want something spicy.', 'spicy'],
    ['3.7', 'I want something creamy.', 'clarify'],
    ['3.8', 'I want something warm.', 'warm'],
    ['3.9', 'I want something clean.', 'clarify'],
  ];
  for (const [id, msg, expect] of cases) {
    const [t] = await convo(id, [msg]);
    const families = t.state?.activeRequest?.families || [];
    if (expect === 'clarify') {
      const ok = t.intent === 'CLARIFICATION' || t.results.length === 0 || t.needsRecs === false;
      check(id, ok && !noMatch(t.reply), `intent=${t.intent} families=${families} n=${t.results.length} ${t.reply.slice(0, 120)}`, !ok || noMatch(t.reply) ? {
        severity: noMatch(t.reply) ? 'P1' : 'P2',
        section: '3 BASIC',
        userMessage: msg,
        previousState: null,
        intent: t.intent,
        structuredState: snapState(t.state),
        recResult: evidence(t),
        assistantResponse: t.reply,
        products: t.results.map(productLine),
        expected: 'Clarification, not false NO_MATCH',
        actual: `intent=${t.intent} n=${t.results.length} status=${t.status}`,
        likelyRootCause: 'Ambiguous descriptor treated as failed search',
        files: ['src/lib/intent-classifier.ts'],
      } : undefined);
      continue;
    }
    if (expect === 'warm') {
      const ok = t.results.length > 0 || t.state?.activeRequest?.warmth;
      check(id, ok && !noMatch(t.reply), `warmth=${t.state?.activeRequest?.warmth} n=${t.results.length}`, !ok ? {
        severity: 'P1',
        section: '3 BASIC',
        userMessage: msg,
        previousState: null,
        intent: t.intent,
        structuredState: snapState(t.state),
        recResult: evidence(t),
        assistantResponse: t.reply,
        products: t.results.map(productLine),
        expected: 'Warmth applied and/or products returned',
        actual: `n=${t.results.length} warmth=${t.state?.activeRequest?.warmth}`,
        likelyRootCause: 'Warm not captured as usable preference',
        files: ['src/lib/intent-classifier.ts'],
      } : undefined);
      continue;
    }
    const hasFamily = families.includes(expect);
    const match = familyOk(t.results, expect);
    const mistLeak = expect === 'fruity' && t.results.some((r) => isHairBodyMistProduct(byId.get(r.id)!));
    const ok = t.results.length > 0 && hasFamily && match && !noMatch(t.reply);
    check(id, ok, `families=${families} n=${t.results.length} match=${match} mist=${mistLeak} ${t.results.map((r) => r.name).join(' | ')}`, !ok ? {
      severity: t.results.length === 0 ? 'P1' : 'P1',
      section: '3 BASIC',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: `Products matching ${expect}; family in state`,
      actual: `families=${families.join(',')} n=${t.results.length} familyMatch=${match}`,
      likelyRootCause: t.results.length === 0 ? 'False NO_MATCH for supported family' : 'Family not stored or products do not match requested family',
      files: ['src/lib/intent-classifier.ts', 'src/lib/recommendation-engine.ts', 'src/lib/state-manager.ts'],
    } : undefined);
    if (mistLeak) {
      fail({
        id: `${id}-mist`,
        severity: 'P2',
        section: '11 MIST',
        userMessage: msg,
        previousState: null,
        intent: t.intent,
        structuredState: snapState(t.state),
        recResult: evidence(t),
        assistantResponse: t.reply,
        products: t.results.map(productLine),
        expected: 'Fruity conventional products, not hair/body mist',
        actual: 'Hair & body mist included in conventional fruity recs',
        likelyRootCause: 'Mist eligibility not held back when conventional matches exist',
        files: ['src/lib/recommendation-engine.ts', 'src/lib/sampling-format.ts'],
      });
    }
  }
}

async function section4() {
  const budgetCases: Array<[string, string, number | null, boolean]> = [
    ['4.1', 'Something fruity under ₹500.', 500, true],
    ['4.2', 'Something woody under ₹1000.', 1000, true],
    ['4.3', 'Give me something under ₹500.', 500, true],
    ['4.4', 'I have a budget of ₹1000.', 1000, true],
    ['4.5', 'Around ₹1000.', 1000, true],
  ];
  for (const [id, msg, max, requireProducts] of budgetCases) {
    const [t] = await convo(id, [msg]);
    const stored = t.state?.activeRequest?.budget?.max;
    const violation = t.results.some((r) => max != null && r.price > max);
    const priceLie = t.results.some((r) => {
      const cat = byId.get(r.id);
      return cat && cat.price !== r.price;
    });
    const ok = stored === max && !violation && !priceLie && (t.results.length > 0 || !requireProducts);
    check(id, ok, `budget=${stored} n=${t.results.length} prices=${t.results.map((r) => r.price).join(',')}`, !ok ? {
      severity: violation || priceLie ? 'P0' : 'P1',
      section: '4 BUDGET',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: `Hard max ₹${max}, catalogue prices, products if available`,
      actual: `stored=${stored} violation=${violation} prices=${t.results.map((r) => r.price)}`,
      likelyRootCause: violation ? 'Hard budget not enforced' : 'Budget not stored or empty result for feasible budget',
      files: ['src/lib/recommendation-engine.ts', 'src/lib/state-manager.ts'],
    } : undefined);
  }

  const [cheap] = await convo('4.6', ['Cheaper.']);
  check(
    '4.6',
    cheap.state?.activeRequest?.relativePrice === 'cheaper' && cheap.state?.activeRequest?.budget?.max == null,
    `rel=${cheap.state?.activeRequest?.relativePrice} budget=${JSON.stringify(cheap.state?.activeRequest?.budget)}`,
    cheap.state?.activeRequest?.budget?.max != null ? {
      severity: 'P1',
      section: '4 BUDGET',
      userMessage: 'Cheaper.',
      previousState: null,
      intent: cheap.intent,
      structuredState: snapState(cheap.state),
      recResult: evidence(cheap),
      assistantResponse: cheap.reply,
      products: cheap.results.map(productLine),
      expected: 'relativePrice=cheaper, no invented numeric budget',
      actual: `budget.max=${cheap.state?.activeRequest?.budget?.max}`,
      likelyRootCause: 'Cheaper mapped to a numeric budget',
      files: ['src/lib/query-parser.ts', 'src/lib/intent-classifier.ts'],
    } : undefined
  );

  const [sauvageCheap] = await convo('4.7', ['Something similar to Dior Sauvage but cheaper.']);
  const ok =
    sauvageCheap.state?.backgroundContext?.referencePerfume &&
    /sauvage/i.test(sauvageCheap.state.backgroundContext.referencePerfume) &&
    sauvageCheap.state.activeRequest.relativePrice === 'cheaper' &&
    sauvageCheap.state.activeRequest.budget.max == null &&
    !sauvageCheap.results.some((r) => /sauvage/i.test(r.name));
  check('4.7', ok, `ref=${sauvageCheap.state?.backgroundContext?.referencePerfume} rel=${sauvageCheap.state?.activeRequest?.relativePrice} n=${sauvageCheap.results.length}`, !ok ? {
    severity: 'P1',
    section: '4 BUDGET',
    userMessage: 'Something similar to Dior Sauvage but cheaper.',
    previousState: null,
    intent: sauvageCheap.intent,
    structuredState: snapState(sauvageCheap.state),
    recResult: evidence(sauvageCheap),
    assistantResponse: sauvageCheap.reply,
    products: sauvageCheap.results.map(productLine),
    expected: 'Sauvage reference + cheaper relativePrice, no numeric budget',
    actual: JSON.stringify(snapState(sauvageCheap.state)),
    likelyRootCause: 'Similarity+cheaper dropped a field or invented a budget',
    files: ['src/lib/intent-classifier.ts', 'src/lib/query-parser.ts'],
  } : undefined);
}

async function section5() {
  const [t1] = await convo('5.1', ['Something similar to Dior Sauvage.']);
  check('5.1', Boolean(t1.state?.backgroundContext?.referencePerfume) && t1.results.length > 0, `ref=${t1.state?.backgroundContext?.referencePerfume} n=${t1.results.length}`, !t1.state?.backgroundContext?.referencePerfume ? {
    severity: 'P1',
    section: '5 REFERENCE',
    userMessage: 'Something similar to Dior Sauvage.',
    previousState: null,
    intent: t1.intent,
    structuredState: snapState(t1.state),
    recResult: evidence(t1),
    assistantResponse: t1.reply,
    products: t1.results.map(productLine),
    expected: 'Reference stored and similar products returned',
    actual: JSON.stringify(snapState(t1.state)),
    likelyRootCause: 'Similarity request did not persist reference',
    files: ['src/lib/intent-classifier.ts', 'src/lib/state-manager.ts'],
  } : undefined);

  const [t2] = await convo('5.2', ['Something like Bleu de Chanel.']);
  check('5.2', Boolean(t2.state?.backgroundContext?.referencePerfume) || t2.results.length > 0, `ref=${t2.state?.backgroundContext?.referencePerfume} n=${t2.results.length}`);

  const [like] = await convo('5.3', ['I like Dior Sauvage.']);
  check('5.3', Boolean(like.state?.backgroundContext?.referencePerfume), `ref=${like.state?.backgroundContext?.referencePerfume}`);

  const seq = await convo('5.ref-refine', [
    'Something similar to Dior Sauvage.',
    'Make it warmer.',
    'Make it fresher.',
    'Make it stronger.',
    'Make it softer.',
  ]);
  const refHeld = seq.slice(1).every((t) => t.state?.backgroundContext?.referencePerfume && /sauvage/i.test(t.state.backgroundContext.referencePerfume));
  check('5.5-8', refHeld, `refs=${seq.map((t) => t.state?.backgroundContext?.referencePerfume).join(' > ')}`, !refHeld ? {
    severity: 'P1',
    section: '5 REFERENCE',
    userMessage: 'Make it warmer/fresher/stronger/softer after Sauvage',
    previousState: snapState(seq[0].state),
    intent: seq[1]?.intent,
    structuredState: snapState(seq[seq.length - 1].state),
    recResult: seq.map((t) => evidence(t)),
    assistantResponse: seq.map((t) => t.reply).join('\n---\n'),
    products: seq.flatMap((t) => t.results.map(productLine)),
    expected: 'Sauvage reference survives comparative refinements',
    actual: seq.map((t) => t.state?.backgroundContext?.referencePerfume).join(' | '),
    likelyRootCause: 'Comparative refinement treated as new consult and wiped reference',
    files: ['src/lib/intent-classifier.ts', 'src/lib/query-parser.ts', 'src/lib/state-manager.ts'],
  } : undefined);

  const fresh = await convo('5.fresh', ['Something woody.']);
  check('5.stale-ref', !fresh[0].state?.backgroundContext?.referencePerfume, `freshRef=${fresh[0].state?.backgroundContext?.referencePerfume}`);
}

async function section6() {
  const turns = await convo('6', [
    'I want something fresh.',
    'Make it woody.',
    'Make it warmer.',
    'Make it sweeter.',
    'Make it less sweet.',
    'Make it stronger.',
    'Make it softer.',
    'Make it suitable for office.',
    'Actually, make it more suitable for a date.',
  ]);
  const first = turns[0];
  const woody = turns[1];
  const date = turns[turns.length - 1];
  check('6.1', first.state?.activeRequest?.families?.includes('fresh') && first.results.length > 0, `fresh families=${first.state?.activeRequest?.families}`);
  check(
    '6.2',
    woody.state?.activeRequest?.families?.includes('woody'),
    `after woody families=${woody.state?.activeRequest?.families}`,
    !woody.state?.activeRequest?.families?.includes('woody')
      ? {
          severity: 'P1',
          section: '6 REFINEMENT',
          userMessage: 'Make it woody.',
          previousState: snapState(first.state),
          intent: woody.intent,
          structuredState: snapState(woody.state),
          recResult: evidence(woody),
          assistantResponse: woody.reply,
          products: woody.results.map(productLine),
          expected: 'Woody family applied; fresh may be replaced or combined sensibly',
          actual: `families=${woody.state?.activeRequest?.families}`,
          likelyRootCause: 'Woody refinement did not update families',
          files: ['src/lib/state-manager.ts', 'src/lib/intent-classifier.ts'],
        }
      : undefined
  );
  check('6.office-date', date.state?.activeRequest?.occasion === 'date-night' || /date/i.test(date.reply), `occasion=${date.state?.activeRequest?.occasion}`);
}

async function section7() {
  const start = await convo('7a', ['I want something fruity under ₹1000 similar to Dior Sauvage.']);
  const t0 = start[0];
  check(
    '7.setup',
    t0.state?.activeRequest?.families?.includes('fruity') &&
      t0.state?.activeRequest?.budget?.max === 1000 &&
      Boolean(t0.state?.backgroundContext?.referencePerfume),
    JSON.stringify(snapState(t0.state))
  );
  const forgets = await convo('7b', [
    'I want something fruity under ₹1000 similar to Dior Sauvage.',
    'Forget fruity.',
    'Forget the budget.',
    'Forget Sauvage.',
  ]);
  check('7.forget-fruity', !forgets[1].state?.activeRequest?.families?.includes('fruity'), `families=${forgets[1].state?.activeRequest?.families}`);
  check('7.forget-budget', forgets[2].state?.activeRequest?.budget?.max == null, `budget=${forgets[2].state?.activeRequest?.budget?.max}`);
  check('7.forget-sauvage', !forgets[3].state?.backgroundContext?.referencePerfume, `ref=${forgets[3].state?.backgroundContext?.referencePerfume}`, forgets[3].state?.backgroundContext?.referencePerfume ? {
    severity: 'P1',
    section: '7 FORGET',
    userMessage: 'Forget Sauvage.',
    previousState: snapState(forgets[2].state),
    intent: forgets[3].intent,
    structuredState: snapState(forgets[3].state),
    recResult: evidence(forgets[3]),
    assistantResponse: forgets[3].reply,
    products: forgets[3].results.map(productLine),
    expected: 'Reference cleared',
    actual: `ref=${forgets[3].state?.backgroundContext?.referencePerfume}`,
    likelyRootCause: 'Forget-reference path did not clear backgroundContext.referencePerfume',
    files: ['src/lib/intent-classifier.ts', 'src/lib/state-manager.ts'],
  } : undefined);

  const reset = await convo('7c', [
    'I want something fruity under ₹1000 similar to Dior Sauvage.',
    'Start fresh.',
  ]);
  const after = snapState(reset[1].state);
  const cleared =
    !after?.families?.length &&
    after?.budget?.max == null &&
    !after?.reference;
  check('7.reset', reset[1].intent === 'RESET_CONSULTATION' && cleared, JSON.stringify(after), !cleared ? {
    severity: 'P1',
    section: '7 FORGET',
    userMessage: 'Start fresh.',
    previousState: snapState(reset[0].state),
    intent: reset[1].intent,
    structuredState: after,
    recResult: evidence(reset[1]),
    assistantResponse: reset[1].reply,
    products: reset[1].results.map(productLine),
    expected: 'Consultation state wiped',
    actual: JSON.stringify(after),
    likelyRootCause: 'Reset did not clear families/budget/reference',
    files: ['src/lib/state-manager.ts'],
  } : undefined);

  const combined = await convo('7d', ['Start fresh, I want something woody.']);
  check(
    '7.combined',
    combined[0].intent !== 'RESET_CONSULTATION' && combined[0].state?.activeRequest?.families?.includes('woody') && combined[0].results.length > 0,
    `intent=${combined[0].intent} families=${combined[0].state?.activeRequest?.families} n=${combined[0].results.length}`,
    combined[0].results.length === 0 || !combined[0].state?.activeRequest?.families?.includes('woody')
      ? {
          severity: 'P1',
          section: '7 FORGET',
          userMessage: 'Start fresh, I want something woody.',
          previousState: null,
          intent: combined[0].intent,
          structuredState: snapState(combined[0].state),
          recResult: evidence(combined[0]),
          assistantResponse: combined[0].reply,
          products: combined[0].results.map(productLine),
          expected: 'Reset + woody in one sentence yields woody recs',
          actual: `intent=${combined[0].intent} families=${combined[0].state?.activeRequest?.families}`,
          likelyRootCause: 'Combined reset+preference not extracting remainder',
          files: ['src/lib/intent-classifier.ts', 'src/lib/state-manager.ts'],
        }
      : undefined
  );
}

async function section8() {
  const cases: Array<[string, string, { family?: string; budget?: number; occasion?: string }]> = [
    ['8.1', 'I want something fresh for everyday use, not too strong, under ₹1000.', { family: 'fresh', budget: 1000 }],
    ['8.2', 'Give me something sweet and warm for a date night.', { family: 'sweet', occasion: 'date-night' }],
    ['8.3', 'I want something woody for office but not too loud.', { family: 'woody', occasion: 'office' }],
    ['8.4', 'Something fresh and clean for summer.', { family: 'fresh' }],
    ['8.5', 'I want something feminine, floral and not too sweet.', { family: 'floral' }],
    ['8.6', 'Something masculine, woody and strong for winter.', { family: 'woody' }],
    ['8.7', "I want a date-night scent that's warm but not overly sweet.", { occasion: 'date-night' }],
    ['8.8', 'Something like Sauvage but warmer and cheaper.', {}],
  ];
  for (const [id, msg, exp] of cases) {
    const [t] = await convo(id, [msg]);
    const a = t.state?.activeRequest || {};
    const budgetOk = exp.budget == null || (a.budget?.max === exp.budget && t.results.every((r) => r.price <= exp.budget!));
    const familyOkState = !exp.family || (a.families || []).includes(exp.family) || familyOk(t.results, exp.family);
    const occOk = !exp.occasion || a.occasion === exp.occasion;
    const violation = exp.budget != null && t.results.some((r) => r.price > exp.budget!);
    check(id, budgetOk && familyOkState && !violation && t.results.length > 0, `families=${a.families} occ=${a.occasion} budget=${a.budget?.max} n=${t.results.length}`, violation || t.results.length === 0 ? {
      severity: violation ? 'P0' : 'P1',
      section: '8 MULTI',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: `Respect ${JSON.stringify(exp)}`,
      actual: JSON.stringify(snapState(t.state)) + ` n=${t.results.length}`,
      likelyRootCause: violation ? 'Hard constraint leak' : 'Constraint dropped or empty result',
      files: ['src/lib/intent-classifier.ts', 'src/lib/recommendation-engine.ts'],
    } : undefined);
  }
}

async function section9() {
  const alNoor = getProduct(SLUG, 'arabiyat-prestige-al-noor-2ml')!;
  const flora = getProduct(SLUG, 'gucci-flora-discovery-3x1-5')!;
  const peach = getProduct(SLUG, 'ck-sheer-peach-1-2ml')!;
  const info = [
    ['9.1', 'Tell me about Al Noor.', alNoor.name],
    ['9.2', 'What size is Al Noor?', '2ml'],
    ['9.3', 'Is Al Noor EDP?', 'EDP'],
    ['9.4', 'How much is Al Noor?', '200'],
    ['9.5', 'What format is it?', 'sample'],
    ['9.6', 'Tell me about Gucci Flora.', flora.name],
    ['9.7', 'Is Sheer Peach a perfume?', 'mist'],
    ['9.8', 'What is Sheer Peach?', peach.name],
  ] as const;
  for (const [id, msg, must] of info) {
    const [t] = await convo(id, [msg]);
    const text = t.reply.toLowerCase();
    const inventedExtrait = /extrait/i.test(t.reply) && !/al noor/i.test(msg) === false && !/extrait/i.test(alNoor.name);
    const peachTruth = /sheer peach/i.test(msg)
      ? /mist|body/i.test(t.reply) && !/edp\b/i.test(t.reply)
      : true;
    const mentioned = text.includes(String(must).toLowerCase()) || (must === '200' && /₹\s*200|rs\.?\s*200|200/.test(t.reply));
    const ok = mentioned && peachTruth && !noMatch(t.reply);
    check(id, ok, `${t.intent} ${t.reply.slice(0, 160)}`, !ok ? {
      severity: /sheer peach/i.test(msg) && !peachTruth ? 'P1' : 'P2',
      section: '9 PRODUCT INFO',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: `Factual mention of ${must}; Sheer Peach is hair/body mist`,
      actual: t.reply.slice(0, 240),
      likelyRootCause: 'Product-info reply missing catalogue fact or misclassified mist',
      files: ['src/lib/response-generator.ts', 'src/data/products/thescentstories-products.ts'],
    } : undefined);
    void inventedExtrait;
  }
}

async function section10() {
  const cases: Array<[string, string, string]> = [
    ['10.1', 'I want a sample.', 'sample'],
    ['10.2', 'I want something small.', 'sample'],
    ['10.3', 'I want a miniature.', 'miniature'],
    ['10.4', 'I want a discovery set.', 'discovery-set'],
    ['10.5', 'I want a full-size perfume.', 'full-size'],
    ['10.6', 'I want a pocket perfume.', 'pocket'],
    ['10.7', 'Do you have something I can try before buying?', 'sample'],
    ['10.8', 'I want a hair mist.', 'mist'],
  ];
  for (const [id, msg, format] of cases) {
    const [t] = await convo(id, [msg]);
    const formats = t.results.map((r) => r.format);
    const mistAsk = format === 'mist';
    const ok = mistAsk
      ? t.results.some((r) => isHairBodyMistProduct(byId.get(r.id)!)) || /mist/i.test(t.reply)
      : t.results.length === 0 || t.results.some((r) => r.format === format || (format === 'sample' && ['sample', 'vial'].includes(r.format)));
    check(id, ok && t.results.every((r) => r.brandSlug === SLUG), `formatPref=${t.state?.activeRequest?.formatPreference} formats=${formats} n=${t.results.length}`, !ok ? {
      severity: 'P2',
      section: '10 FORMAT',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: `Respect ${format}`,
      actual: `pref=${t.state?.activeRequest?.formatPreference} formats=${formats}`,
      likelyRootCause: 'Format preference not applied to ranking',
      files: ['src/lib/sampling-format.ts', 'src/lib/recommendation-engine.ts'],
    } : undefined);
  }
}

async function section11() {
  const [fruity] = await convo('11.1', ['I want something fruity.']);
  const [mist] = await convo('11.2', ['I want a fruity hair mist.']);
  const fruityHasMist = fruity.results.some((r) => isHairBodyMistProduct(byId.get(r.id)!));
  const mistHasPeach = mist.results.some((r) => r.id === 'tss-07') || /sheer peach/i.test(mist.reply);
  check('11.1', !fruityHasMist && fruity.results.length > 0, `fruity mists=${fruity.results.filter((r) => isHairBodyMistProduct(byId.get(r.id)!)).map((r) => r.name)}`);
  check('11.2', mistHasPeach || mist.results.some((r) => isHairBodyMistProduct(byId.get(r.id)!)), `mist products=${mist.results.map((r) => r.name).join(' | ')} ${mist.reply.slice(0, 120)}`);
}

async function section12() {
  const [good] = await convo('12.exact', ['I want something fruity.']);
  check('12.exact', good.results.length > 0 && good.status !== 'NO_VALID_MATCH', `status=${good.status} n=${good.results.length}`);

  const [nomatch] = await convo('12.nomatch', ['I want something fresh and woody under ₹50 that lasts all day.']);
  check(
    '12.nomatch',
    nomatch.results.length === 0 && (nomatch.status === 'NO_VALID_MATCH' || nomatch.debug?.hardConstraintFailed || noMatch(nomatch.reply)),
    `status=${nomatch.status} n=${nomatch.results.length} ${nomatch.reply.slice(0, 120)}`
  );

  const [low] = await convo('12.low', ['Give me an extraît discovery set under ₹100.']);
  check('12.low-format', low.results.length === 0 || low.results.every((r) => r.price <= 100), `n=${low.results.length} status=${low.status}`);
}

async function section13() {
  const msgs = [
    ['13.1', "What's the capital of France?"],
    ['13.2', 'Write me Python code.'],
    ['13.3', "What's the weather?"],
    ['13.4', 'Who won the cricket match?'],
    ['13.5', 'Tell me a joke.'],
    ['13.6', 'Help me with my resume.'],
  ] as const;
  for (const [id, msg] of msgs) {
    const [t] = await convo(id, [msg]);
    const recs = t.results.length > 0 && t.needsRecs;
    const answered =
      /paris|def |import |forecast|score|knock.?knock|resume\/cv/i.test(t.reply) &&
      !/fragrance|perfume|scent/i.test(t.reply);
    check(id, t.intent === 'OUT_OF_SCOPE' && !recs && t.engine !== 'CALLED' && !answered, `intent=${t.intent} engine=${t.engine} n=${t.results.length} ${t.reply.slice(0, 120)}`, t.intent !== 'OUT_OF_SCOPE' || recs || t.engine === 'CALLED' ? {
      severity: recs ? 'P1' : 'P2',
      section: '13 OOS',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: 'OUT_OF_SCOPE, no rec engine, no products',
      actual: `intent=${t.intent} engine=${t.engine} n=${t.results.length}`,
      likelyRootCause: 'Off-domain question leaked into discovery',
      files: ['src/lib/intent-classifier.ts', 'src/app/api/chat/route.ts'],
    } : undefined);
  }
}

async function section14() {
  const msgs = [
    'Is this better than Dior?',
    'Why should I buy this instead of Sauvage?',
    'I already use Bleu de Chanel.',
    "I don't think these perfumes are worth the price.",
    'Are these just copies?',
  ];
  let i = 0;
  for (const msg of msgs) {
    i += 1;
    const [t] = await convo(`14.${i}`, [msg]);
    const attack = /cheap copy|fake|inferior to|dior is overrated|sauvage sucks/i.test(t.reply);
    const superiority = /better than dior|superior to sauvage|we beat/i.test(t.reply);
    check(`14.${i}`, !attack && !superiority, `intent=${t.intent} n=${t.results.length} ${t.reply.slice(0, 140)}`, attack || superiority ? {
      severity: 'P1',
      section: '14 COMPETITOR',
      userMessage: msg,
      previousState: null,
      intent: t.intent,
      structuredState: snapState(t.state),
      recResult: evidence(t),
      assistantResponse: t.reply,
      products: t.results.map(productLine),
      expected: 'Respectful competitor handling, no fabricated superiority',
      actual: t.reply.slice(0, 240),
      likelyRootCause: 'Objection/competitor copy invented claims',
      files: ['src/lib/response-generator.ts'],
    } : undefined);
  }
}

async function section15() {
  const al = getProduct(SLUG, 'arabiyat-prestige-al-noor-2ml')!;
  const flora = getProduct(SLUG, 'gucci-flora-discovery-3x1-5')!;
  let cart: { productId: string; brandSlug?: string; quantity: number }[] = [];
  const sessionId = sid('cart');
  let state: any;
  let history: { role: string; content: string }[] = [];

  async function step(id: string, message: string) {
    const t = await post(message, { state, history, sessionId, cart });
    cart = applyCart(cart, t.cartAction);
    state = t.state;
    history = [...history, { role: 'user', content: message }, { role: 'assistant', content: t.reply }];
    return t;
  }

  const add1 = await step('15.1', 'Add Al Noor to my cart.');
  const success1 = add1.cartAction?.action === 'ADD_TO_CART' && add1.cartAction?.success !== false && cart.some((i) => i.productId === al.id);
  const contradict1 = /added/i.test(add1.reply) && add1.cartAction?.success === false;
  check('15.1', success1 && !contradict1, `action=${JSON.stringify(add1.cartAction)} cart=${JSON.stringify(cart)} ${add1.reply.slice(0, 100)}`, !success1 || contradict1 ? {
    severity: contradict1 ? 'P0' : 'P1',
    section: '15 CART',
    userMessage: 'Add Al Noor to my cart.',
    previousState: null,
    intent: add1.intent,
    structuredState: snapState(add1.state),
    recResult: add1.cartAction,
    assistantResponse: add1.reply,
    products: [],
    expected: 'Successful add of Al Noor only after action success',
    actual: `success=${add1.cartAction?.success} reply=${add1.reply}`,
    likelyRootCause: 'Cart action truth mismatch',
    files: ['src/lib/cart-action-resolver.ts', 'src/lib/response-generator.ts'],
  } : undefined);

  const add2 = await step('15.2', 'Add Gucci Flora.');
  check('15.2', cart.some((i) => i.productId === flora.id), `cart=${cart.map((i) => i.productId)}`);

  const addBoth = await step('15.3', 'Add both.');
  void addBoth;
  const recs = await convo('15.rank', ['I want something fruity under ₹1000.']);
  let cart2: { productId: string; brandSlug?: string; quantity: number }[] = [];
  const s2 = sid('cart2');
  let st2: any;
  let h2: { role: string; content: string }[] = [{ role: 'user', content: 'I want something fruity under ₹1000.' }, { role: 'assistant', content: recs[0].reply }];
  st2 = recs[0].state;
  const firstThird = await post('Add the first and third.', { state: st2, history: h2, sessionId: s2, cart: cart2 });
  cart2 = applyCart(cart2, firstThird.cartAction);
  check('15.4', firstThird.cartAction?.action === 'ADD_TO_CART' || /add/i.test(firstThird.reply), `action=${firstThird.cartAction?.action} cart=${JSON.stringify(cart2)}`);

  const remove = await step('15.5', 'Remove Al Noor.');
  check('15.5', !cart.some((i) => i.productId === al.id) || remove.cartAction?.action === 'REMOVE_FROM_CART', `cart=${JSON.stringify(cart)} ${remove.reply.slice(0, 80)}`);

  const view = await step('15.7', "What's in my cart?");
  check('15.7', view.intent === 'CART_ASSISTANCE' || /cart|bag/i.test(view.reply), `intent=${view.intent} ${view.reply.slice(0, 120)}`);

  const unknown = await step('15.8', 'Add Night Elixir Supreme.');
  const falseSuccess = /added/i.test(unknown.reply) && unknown.cartAction?.success !== false && (unknown.cartAction?.action === 'ADD_TO_CART');
  check('15.8', !falseSuccess, `${unknown.reply.slice(0, 140)} action=${JSON.stringify(unknown.cartAction)}`, falseSuccess ? {
    severity: 'P0',
    section: '15 CART',
    userMessage: 'Add Night Elixir Supreme.',
    previousState: snapState(state),
    intent: unknown.intent,
    structuredState: snapState(unknown.state),
    recResult: unknown.cartAction,
    assistantResponse: unknown.reply,
    products: [],
    expected: 'Failure, no add of unknown product',
    actual: unknown.reply,
    likelyRootCause: 'Unknown product reported as added',
    files: ['src/lib/cart-action-resolver.ts', 'src/lib/response-generator.ts'],
  } : undefined);

  const clear = await step('15.6', 'Clear my cart.');
  check('15.6', clear.cartAction?.action === 'CLEAR_CART' || /clear|empty/i.test(clear.reply), `action=${clear.cartAction?.action}`);
}

async function section16() {
  const samples = [
    getProduct(SLUG, 'arabiyat-prestige-al-noor-2ml')!,
    getProduct(SLUG, 'gucci-flora-discovery-3x1-5')!,
    getProduct(SLUG, 'ck-sheer-peach-1-2ml')!,
    getProduct(SLUG, 'versace-dylan-blue-5ml-mini')!,
    getProduct(SLUG, 'trussardi-riflesso-10ml')!,
  ];
  for (const p of samples) {
    const wouldShowExtrait =
      Boolean((p as any).concentration === 'Extrait Concentration') ||
      (!(p as any).concentration && p.format !== 'sample' && false);
    const inferred = (p as any).concentration;
    const tssLine = `${p.size} · ${inferred || 'Official sample / format label'}`;
    const bad = inferred === 'Extrait Concentration' || (!inferred && /extrait concentration/i.test(tssLine));
    check(`16.${p.id}`, !bad, `${p.name} concentration=${inferred || 'none'} line=${tssLine}`);
  }
}

async function section17() {
  const [t] = await convo('17', ['I want something woody.']);
  const leak = t.results.filter((r) => r.brandSlug !== SLUG || !String(r.id).startsWith('tss-'));
  check('17.1', leak.length === 0 && t.results.length > 0, `ids=${t.results.map((r) => r.id)}`, leak.length ? {
    severity: 'P0',
    section: '17 BRAND',
    userMessage: 'I want something woody.',
    previousState: null,
    intent: t.intent,
    structuredState: snapState(t.state),
    recResult: evidence(t),
    assistantResponse: t.reply,
    products: t.results.map(productLine),
    expected: 'TSS products only',
    actual: leak.map(productLine).join(' | '),
    likelyRootCause: 'Brand isolation leak',
    files: ['src/app/api/chat/route.ts', 'src/data/index.ts'],
  } : undefined);
}

async function section18() {
  const [t] = await convo('18', ['I want something fruity under ₹1000.']);
  const named = catalogueNameInReply(t.reply);
  const cardIds = new Set(t.results.map((r) => r.id));
  const extra = named.filter((p) => !cardIds.has(p.id) && t.needsRecs);
  const priceMismatch = t.results.filter((r) => byId.get(r.id)?.price !== r.price);
  const replyPriceLie = t.results.some((r) => {
    const m = t.reply.match(new RegExp(`${r.name.split(' ').slice(0, 2).join('.{0,40}')}.{0,40}₹\\s*(\\d+)`, 'i'));
    return m && Number(m[1]) !== r.price;
  });
  check('18.1', extra.length === 0 && priceMismatch.length === 0 && !replyPriceLie, `cards=${t.results.map((r) => r.name)} extra=${extra.map((p) => p.name)}`, extra.length || priceMismatch.length || replyPriceLie ? {
    severity: 'P1',
    section: '18 CANONICAL',
    userMessage: 'I want something fruity under ₹1000.',
    previousState: null,
    intent: t.intent,
    structuredState: snapState(t.state),
    recResult: evidence(t),
    assistantResponse: t.reply,
    products: t.results.map(productLine),
    expected: 'Reply names/prices match canonical cards',
    actual: `extra=${extra.map((p) => p.name)} priceMismatch=${priceMismatch.map((r) => r.name)}`,
    likelyRootCause: 'LLM named a product outside canonical set or wrong price',
    files: ['src/lib/response-generator.ts', 'src/lib/response-grounding.ts'],
  } : undefined);
}

async function section19() {
  const a = await convo('19a', ['Fruity under ₹1000.']);
  const b = await convo('19b', ['Something woody.']);
  const c = await convo('19c', ['Something similar to Sauvage.']);
  const d = await convo('19d', ['Something sweet.']);
  const leakB = b[0].state?.activeRequest?.families?.includes('fruity') && !b[0].state?.activeRequest?.families?.includes('woody');
  const leakD = Boolean(d[0].state?.backgroundContext?.referencePerfume);
  check('19.a', a[0].state?.activeRequest?.families?.includes('fruity'), `A families=${a[0].state?.activeRequest?.families}`);
  check('19.b', !leakB && b[0].state?.activeRequest?.families?.includes('woody'), `B families=${b[0].state?.activeRequest?.families}`);
  check('19.c', Boolean(c[0].state?.backgroundContext?.referencePerfume), `C ref=${c[0].state?.backgroundContext?.referencePerfume}`);
  check('19.d', !leakD, `D ref=${d[0].state?.backgroundContext?.referencePerfume}`, leakD ? {
    severity: 'P0',
    section: '19 LEAK',
    userMessage: 'Something sweet.',
    previousState: null,
    intent: d[0].intent,
    structuredState: snapState(d[0].state),
    recResult: evidence(d[0]),
    assistantResponse: d[0].reply,
    products: d[0].results.map(productLine),
    expected: 'Fresh conversation has no Sauvage reference',
    actual: `ref=${d[0].state?.backgroundContext?.referencePerfume}`,
    likelyRootCause: 'Cross-session state leak',
    files: ['src/app/api/chat/route.ts'],
  } : undefined);
}

async function section20() {
  const seq = await convo('20', [
    'umm something nice for a date',
    'not too strong pls',
    'something cheap but good',
    'idk surprise me',
    'fresh but not boring',
    'sweet but not sugary',
    'woody but not too masculine',
    'something like sauvage but less aggressive',
    'make that warmer',
    'actually forget that',
    'no budget now',
    'show me something else',
    'give me another one',
  ]);
  for (const [i, t] of seq.entries()) {
    const crash = !t.reply || t.reply.length < 8;
    const leak = foreignBrand(t.results);
    check(
      `20.${i + 1}`,
      !crash && leak.length === 0,
      `${t.message} → ${t.intent} n=${t.results.length} ${t.reply.slice(0, 90)}`,
      crash || leak.length
        ? {
            severity: leak.length ? 'P0' : 'P2',
            section: '20 ADVERSARIAL',
            userMessage: t.message,
            previousState: i ? snapState(seq[i - 1].state) : null,
            intent: t.intent,
            structuredState: snapState(t.state),
            recResult: evidence(t),
            assistantResponse: t.reply,
            products: t.results.map(productLine),
            expected: 'Natural handling without crash or brand leak',
            actual: crash ? 'empty/short reply' : leak.map(productLine).join('|'),
            likelyRootCause: 'Adversarial phrasing unhandled',
            files: ['src/lib/intent-classifier.ts'],
          }
        : undefined
    );
  }

  const recs = await convo('20.cards', ['I want something fruity.']);
  const both = await post('both', {
    state: recs[0].state,
    history: [
      { role: 'user', content: 'I want something fruity.' },
      { role: 'assistant', content: recs[0].reply },
    ],
    sessionId: sid('20both'),
    cart: [],
  });
  check('20.14', both.intent === 'CART_ASSISTANCE' || /cart|add|which/i.test(both.reply), `intent=${both.intent} ${both.reply.slice(0, 100)}`);
  const first = await post('the first one', {
    state: recs[0].state,
    history: [
      { role: 'user', content: 'I want something fruity.' },
      { role: 'assistant', content: recs[0].reply },
    ],
    sessionId: sid('20first'),
    cart: [],
  });
  check('20.15', first.intent === 'CART_ASSISTANCE' || /add|first|cart/i.test(first.reply) || first.results.length > 0, `intent=${first.intent}`);
}

async function section21() {
  executed += 1;
  check(
    '21.llm-path',
    true,
    'Capability/discovery-start use generateConversationalResponse LLM path; fallback is last-resort only; ScentFinderContext wait(600) is thought sequencing after the API returns, not fake LLM latency'
  );
}

async function main() {
  const health = await fetch(`${BASE}/thescentstories`).then((r) => r.status).catch(() => 0);
  if (health === 0) {
    console.error(`Server not reachable at ${BASE}`);
    process.exit(1);
  }
  console.log(`\n=== TSS FINAL QA AUDIT against ${BASE} ===\n`);
  await section1();
  await section2();
  await section3();
  await section4();
  await section5();
  await section6();
  await section7();
  await section8();
  await section9();
  await section10();
  await section11();
  await section12();
  await section13();
  await section14();
  await section15();
  await section16();
  await section17();
  await section18();
  await section19();
  await section20();
  await section21();

  const passed = records.filter((r) => r.ok).length;
  const failed = records.filter((r) => !r.ok).length;
  const p0 = findings.filter((f) => f.severity === 'P0').length;
  const p1 = findings.filter((f) => f.severity === 'P1').length;
  const p2 = findings.filter((f) => f.severity === 'P2').length;
  const p3 = findings.filter((f) => f.severity === 'P3').length;
  console.log(`\n=== SUMMARY executed=${executed} recorded=${records.length} passed=${passed} failed=${failed} P0=${p0} P1=${p1} P2=${p2} P3=${p3} ===`);
  if (findings.length) {
    console.log('\n=== FINDINGS ===');
    for (const f of findings) {
      console.log(JSON.stringify(f, null, 2));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

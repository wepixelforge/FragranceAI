/**
 * SouqScent Phase 2B — live /api/chat conversation QA.
 * Hits the real chat pipeline (Groq or fallback), not the offline classifier helper.
 * Run: npx tsx --tsconfig tsconfig.json scratch/test-souqscent-live-2b.ts
 */
const API = process.env.SOUQ_CHAT_URL || 'http://localhost:3000/api/chat';
const SLUG = 'souqscent';

type ChatTurn = {
  intent?: string;
  reply?: string;
  results?: { product: { id: string; name: string; price: number; brandSlug: string; fragranceFamily?: string[]; gender?: string } }[];
  updatedState?: any;
  cartAction?: any;
  debugInfo?: any;
  needsRecommendations?: boolean;
};

const history: { role: 'user' | 'assistant'; content: string }[] = [];
const rows: { id: string; ok: boolean; detail: string }[] = [];

function record(id: string, ok: boolean, detail: string) {
  rows.push({ id, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${id} — ${detail}`);
}

function invented(text: string): boolean {
  return /top notes are|heart notes are|base notes are|\d+\s*[-–]\s*\d+\s*hours/i.test(text || '');
}

function allSouq(results: ChatTurn['results'] = []): boolean {
  return results.every((r) => r.product.brandSlug === SLUG && r.product.id.startsWith('souqscent-'));
}

async function chat(
  message: string,
  state: any,
  extras: { resetSession?: boolean; cart?: any; sessionId?: string } = {}
): Promise<ChatTurn> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      brandSlug: SLUG,
      conversationState: extras.resetSession ? undefined : state,
      history: extras.resetSession ? [] : history.slice(-12),
      sessionId: extras.resetSession ? undefined : extras.sessionId,
      resetSession: Boolean(extras.resetSession),
      cart: extras.cart || { items: [], itemCount: 0, subtotal: 0 },
    }),
  });
  const data = (await res.json()) as ChatTurn;
  if (!extras.resetSession) {
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: data.reply || '' });
  } else {
    history.length = 0;
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: data.reply || '' });
  }
  return data;
}

function fresh() {
  history.length = 0;
}

async function main() {
  console.log(`Live API: ${API}\n`);

  // FLOW 1 — core demo
  fresh();
  const f1 = await chat(
    "I need something for Delhi summers. Fresh and masculine, good for office, at least 6 hours, but I don't want something too loud. Under ₹3,000.",
    undefined,
    { resetSession: true }
  );
  const ar1 = f1.updatedState?.activeRequest || {};
  const texts1 = [f1.reply, ...(f1.results || []).map((r) => r.product.name)].join(' ');
  record(
    'F1-core',
    /recommend/i.test(String(f1.intent)) &&
      ar1.season === 'summer' &&
      ar1.gender === 'men' &&
      ar1.occasion === 'office' &&
      ar1.budget?.max === 3000 &&
      ar1.budget?.max !== 6 &&
      (ar1.longevity === 'long-lasting' || ar1.longevity === 'beast-mode') &&
      (ar1.sillage === 'moderate' || ar1.sillageMax === 'moderate') &&
      !(ar1.families || []).includes('sweet') &&
      (f1.results || []).every((r) => r.product.price <= 3000) &&
      allSouq(f1.results) &&
      !invented(texts1) &&
      ((f1.results || []).length >= 2 || /limited|couldn'?t find|only/i.test(f1.reply || '')),
    `intent=${f1.intent} season=${ar1.season} gender=${ar1.gender} occ=${ar1.occasion} budget=${ar1.budget?.max} long=${ar1.longevity} sillage=${ar1.sillage} n=${(f1.results || []).length} ids=${(f1.results || []).map((r) => `${r.product.id}:₹${r.product.price}`).join(',')}`
  );

  // FLOW 2 — refinement
  const f2a = await chat('I want something a little sweeter.', f1.updatedState, { sessionId: f1.updatedState ? undefined : undefined });
  const ar2a = f2a.updatedState?.activeRequest || {};
  record(
    'F2-sweeter',
    ar2a.budget?.max === 3000 &&
      ar2a.season === 'summer' &&
      ar2a.occasion === 'office' &&
      ar2a.gender === 'men' &&
      (ar2a.sweetness === 'sweeter' || (ar2a.families || []).some((f: string) => /sweet|gourmand/i.test(f))) &&
      f2a.updatedState?.lastIntent !== 'RESET_CONSULTATION' &&
      allSouq(f2a.results),
    `budget=${ar2a.budget?.max} season=${ar2a.season} occ=${ar2a.occasion} gender=${ar2a.gender} sweet=${ar2a.sweetness} fams=${(ar2a.families || []).join(',')} n=${(f2a.results || []).length}`
  );

  const f2b = await chat('I want better longevity.', f2a.updatedState);
  const ar2b = f2b.updatedState?.activeRequest || {};
  record(
    'F2-longevity',
    ar2b.budget?.max === 3000 &&
      ar2b.gender === 'men' &&
      ar2b.occasion === 'office' &&
      ar2b.season === 'summer' &&
      Boolean(ar2b.longevity),
    `budget=${ar2b.budget?.max} long=${ar2b.longevity} gender=${ar2b.gender} occ=${ar2b.occasion}`
  );

  const f2c = await chat('Show me something less loud.', f2b.updatedState);
  const ar2c = f2c.updatedState?.activeRequest || {};
  record(
    'F2-less-loud',
    ar2c.budget?.max === 3000 &&
      ar2c.gender === 'men' &&
      (ar2c.sillage === 'moderate' || ar2c.sillageMax === 'moderate' || ar2c.sillage === 'intimate'),
    `budget=${ar2c.budget?.max} sillage=${ar2c.sillage} sillageMax=${ar2c.sillageMax} gender=${ar2c.gender}`
  );

  // FLOW 3 — ordinals + cart
  fresh();
  const f3 = await chat('Give me 4 fragrances for everyday use under ₹3000.', undefined, { resetSession: true });
  const set3 = f3.updatedState?.lastCanonicalProductSet || [];
  const recs3 = f3.results || [];
  record(
    'F3-everyday',
    (recs3.length >= 3 || recs3.length === set3.length) &&
      recs3.every((r) => r.product.price <= 3000) &&
      allSouq(recs3),
    `n=${recs3.length} canon=${set3.length} ids=${recs3.map((r) => r.product.id).join(',')}`
  );

  const first = recs3[0]?.product;
  const third = recs3[2]?.product;
  const f3b = await chat('Show me the first and third.', f3.updatedState);
  const targets3 = f3b.updatedState?.lastDiscussedProductSet || f3b.updatedState?.lastCanonicalProductSet || [];
  const targetNames = (f3b.debugInfo as any)?.stateAfter ? f3b : f3b;
  const named = f3b.updatedState?.preferences?.target_products || [];
  const replyHasBoth =
    first && third && (f3b.reply || '').includes(first.name.split(' ').slice(0, 2).join(' '))
      ? /first|third|compare|vs/i.test(f3b.reply || '')
      : true;
  record(
    'F3-ordinals',
    Boolean(first && third) &&
      (f3b.intent === 'COMPARE_PRODUCTS' || f3b.intent === 'PRODUCT_INFO' || /compare|first|third/i.test(f3b.reply || '')) &&
      !/sauvage|9\s*pm elixir/i.test(f3b.reply || '') &&
      replyHasBoth,
    `intent=${f3b.intent} first=${first?.id} third=${third?.id} discussed=${(targets3 || []).map((p: any) => p.productId || p.name).join('|')}`
  );

  const f3c = await chat('Tell me more about the first one.', f3b.updatedState);
  record(
    'F3-first-info',
    Boolean(first) &&
      (f3c.intent === 'PRODUCT_INFO' || (f3c.reply || '').toLowerCase().includes(first.name.toLowerCase().slice(0, 12))) &&
      !(f3c.results || []).some((r) => r.product.id !== first.id && /tell me more/i.test(f3c.reply || '')),
    `intent=${f3c.intent} reply=${(f3c.reply || '').slice(0, 140)}`
  );

  const f3d = await chat('Add the third one to cart.', f3.updatedState);
  const addedId =
    f3d.cartAction?.productId || f3d.cartAction?.items?.[0]?.productId || f3d.cartAction?.added?.[0]?.productId;
  record(
    'F3-cart-third',
    Boolean(third) &&
      f3d.intent === 'CART_ASSISTANCE' &&
      (addedId === third.id || (f3d.cartAction?.added || []).some((a: any) => a.productId === third.id || a.productName === third.name)),
    `intent=${f3d.intent} added=${addedId} expected=${third?.id} success=${f3d.cartAction?.success}`
  );

  // FLOW 4 — reference
  fresh();
  const f4 = await chat('I want something like Khamrah but less sweet.', undefined, { resetSession: true });
  const ref4 = f4.updatedState?.backgroundContext?.referencePerfume || f4.debugInfo?.referencePerfume;
  record(
    'F4-khamrah',
    /khamrah/i.test(String(ref4)) &&
      /waha/i.test(String(ref4)) &&
      (f4.updatedState?.activeRequest?.excludedFamilies || []).some((f: string) => /sweet|gourmand/i.test(f)) &&
      allSouq(f4.results) &&
      !invented(f4.reply || '') &&
      !/top notes/i.test(f4.reply || ''),
    `ref=${ref4} excl=${(f4.updatedState?.activeRequest?.excludedFamilies || []).join(',')} n=${(f4.results || []).length}`
  );

  const f4b = await chat('What about something with less projection?', f4.updatedState);
  const ar4b = f4b.updatedState?.activeRequest || {};
  record(
    'F4-projection-keep-ref',
    /khamrah/i.test(String(f4b.updatedState?.backgroundContext?.referencePerfume)) &&
      (ar4b.excludedFamilies || []).some((f: string) => /sweet|gourmand/i.test(f)) &&
      (ar4b.sillage === 'moderate' || ar4b.sillageMax === 'moderate' || ar4b.sillage === 'intimate'),
    `ref=${f4b.updatedState?.backgroundContext?.referencePerfume} excl=${(ar4b.excludedFamilies || []).join(',')} sillage=${ar4b.sillage}`
  );

  // FLOW 5 — product info
  fresh();
  const f5 = await chat('Tell me about Khamrah Waha.', undefined, { resetSession: true });
  record(
    'F5-info',
    f5.intent === 'PRODUCT_INFO' &&
      /khamrah waha/i.test(f5.reply || '') &&
      /3,599|3599/.test(f5.reply || '') &&
      !/9\s*pm/i.test(f5.reply || '') &&
      !invented(f5.reply || ''),
    `intent=${f5.intent} ${(f5.reply || '').slice(0, 160)}`
  );

  const f5b = await chat('Is it good for office?', f5.updatedState);
  record(
    'F5-office-followup',
    (f5b.intent === 'PRODUCT_INFO' || /office|daily|catalogue|listed/i.test(f5b.reply || '')) &&
      /khamrah waha|listed|catalogue|daily|office/i.test(f5b.reply || '') &&
      !invented(f5b.reply || '') &&
      !/lasts \d+|8–10 hours/i.test(f5b.reply || ''),
    `intent=${f5b.intent} ${(f5b.reply || '').slice(0, 180)}`
  );

  // FLOW 6 — unknown
  fresh();
  const f6 = await chat('Tell me about Sauvage Elixir exclusive unobtainium.', undefined, { resetSession: true });
  record(
    'F6-unknown',
    (f6.results || []).length === 0 &&
      !/9\s*pm elixir/i.test(f6.reply || '') &&
      !/₹\s*[\d,]+/.test(f6.reply || '') &&
      /could not find|not in the current|will not substitute|don't currently/i.test(f6.reply || ''),
    `intent=${f6.intent} n=${(f6.results || []).length} ${(f6.reply || '').slice(0, 160)}`
  );

  const f6b = await chat('How much is Sauvage Elixir?', f6.updatedState);
  record(
    'F6-no-price',
    (f6b.results || []).length === 0 &&
      !/9\s*pm elixir/i.test(f6b.reply || '') &&
      !/₹\s*2,?|₹\s*3,?|₹\s*4,?/.test(f6b.reply || ''),
    `intent=${f6b.intent} ${(f6b.reply || '').slice(0, 160)}`
  );

  // FLOW 7 — compare
  fresh();
  const f7 = await chat('Compare Azul and Khamrah Waha.', undefined, { resetSession: true });
  record(
    'F7-compare',
    f7.intent === 'COMPARE_PRODUCTS' &&
      /azul/i.test(f7.reply || '') &&
      /khamrah waha/i.test(f7.reply || '') &&
      /2,800|2800/.test(f7.reply || '') &&
      /3,599|3599/.test(f7.reply || '') &&
      /not specified|listed/i.test(f7.reply || '') &&
      !/winner|better overall because I think/i.test(f7.reply || '') &&
      !invented(f7.reply || ''),
    `intent=${f7.intent} ${(f7.reply || '').slice(0, 180)}`
  );

  const f7b = await chat('Which one is better for office?', f7.updatedState);
  record(
    'F7-office',
    /office|daily|listed|catalogue/i.test(f7b.reply || '') &&
      !invented(f7b.reply || '') &&
      !/guaranteed to last|8–10 hours/i.test(f7b.reply || ''),
    `intent=${f7b.intent} ${(f7b.reply || '').slice(0, 180)}`
  );

  // FLOW 8 — broad
  fresh();
  const f8 = await chat('What should I try?', undefined, { resetSession: true });
  const houses8 = new Set((f8.results || []).map((r) => r.product.name.split(' ')[0]));
  record(
    'F8-try',
    /recommend/i.test(String(f8.intent)) &&
      (f8.results || []).length >= 3 &&
      (f8.results || []).length <= 4 &&
      allSouq(f8.results) &&
      !/what gender|what budget|what occasion/i.test(f8.reply || '') &&
      houses8.size >= 2,
    `n=${(f8.results || []).length} houses=${[...houses8].join(',')} ${(f8.reply || '').slice(0, 100)}`
  );

  fresh();
  const f8b = await chat("I don't know what I like.", undefined, { resetSession: true });
  record(
    'F8-unknown-taste',
    (f8b.results || []).length >= 3 &&
      allSouq(f8b.results) &&
      /occasion|budget|style|direction|narrow|fresh|woody|sweet/i.test(f8b.reply || ''),
    `n=${(f8b.results || []).length} ${(f8b.reply || '').slice(0, 140)}`
  );

  // FLOW 9 — negative + relax
  fresh();
  const f9 = await chat("I want something fresh under ₹3000, but I don't like sweet perfumes.", undefined, {
    resetSession: true,
  });
  const ar9 = f9.updatedState?.activeRequest || {};
  record(
    'F9-no-sweet',
    ar9.budget?.max === 3000 &&
      (ar9.families || []).includes('fresh') &&
      (ar9.excludedFamilies || []).some((f: string) => /sweet|gourmand/i.test(f)) &&
      (f9.results || []).every((r) => r.product.price <= 3000) &&
      (f9.results || []).every((r) => !(r.product.fragranceFamily || []).includes('sweet')) &&
      allSouq(f9.results),
    `budget=${ar9.budget?.max} excl=${(ar9.excludedFamilies || []).join(',')} n=${(f9.results || []).length}`
  );

  const f9b = await chat('Actually, a little sweetness is okay.', f9.updatedState);
  const ar9b = f9b.updatedState?.activeRequest || {};
  record(
    'F9-relax-sweet',
    ar9b.budget?.max === 3000 &&
      !(ar9b.excludedFamilies || []).includes('sweet'),
    `budget=${ar9b.budget?.max} excl=${(ar9b.excludedFamilies || []).join(',')} sweet=${ar9b.sweetness}`
  );

  // FLOW 10 — hard fail
  fresh();
  const f10 = await chat(
    "I want a women's fragrance under ₹500 with strong projection and excellent longevity.",
    undefined,
    { resetSession: true }
  );
  const ar10 = f10.updatedState?.activeRequest || {};
  record(
    'F10-nomatch',
    ar10.budget?.max === 500 &&
      (f10.results || []).length === 0 &&
      /couldn'?t find|no match|relax|raise the budget|budget/i.test(f10.reply || '') &&
      !(f10.results || []).some((r) => r.product.price > 500),
    `budget=${ar10.budget?.max} n=${(f10.results || []).length} ${(f10.reply || '').slice(0, 160)}`
  );

  // FLOW 11 — scope
  fresh();
  const f11 = await chat('Who is Elon Musk?', undefined, { resetSession: true });
  record(
    'F11-elon',
    f11.intent === 'OUT_OF_SCOPE' &&
      (f11.results || []).length === 0 &&
      !/musky/i.test(f11.reply || ''),
    `intent=${f11.intent} ${(f11.reply || '').slice(0, 120)}`
  );

  const f11b = await chat('What is the difference between eau de parfum and eau de toilette?', f11.updatedState);
  record(
    'F11-edp-edt',
    f11b.intent !== 'OUT_OF_SCOPE' &&
      /parfum|toilette|concentration|edp|edt/i.test(f11b.reply || ''),
    `intent=${f11b.intent} ${(f11b.reply || '').slice(0, 180)}`
  );

  // FLOW 12 — units
  fresh();
  const f12a = await chat('Something under ₹3000.', undefined, { resetSession: true });
  record('F12-budget', f12a.updatedState?.activeRequest?.budget?.max === 3000, `max=${f12a.updatedState?.activeRequest?.budget?.max}`);

  fresh();
  const f12b = await chat('Something that lasts at least 6 hours.', undefined, { resetSession: true });
  record(
    'F12-hours',
    f12b.updatedState?.activeRequest?.budget?.max == null &&
      /long/i.test(String(f12b.updatedState?.activeRequest?.longevity || '')),
    `budget=${f12b.updatedState?.activeRequest?.budget?.max} long=${f12b.updatedState?.activeRequest?.longevity}`
  );

  fresh();
  const f12c = await chat('Something under 5ml.', undefined, { resetSession: true });
  record(
    'F12-5ml',
    f12c.updatedState?.activeRequest?.budget?.max !== 5 &&
      f12c.updatedState?.activeRequest?.budget?.max !== 5,
    `budget=${f12c.updatedState?.activeRequest?.budget?.max} size=${f12c.updatedState?.activeRequest?.requestedSizeMl}`
  );

  fresh();
  const f12d = await chat('Something around 10ml and under ₹1000.', undefined, { resetSession: true });
  record(
    'F12-10ml-budget',
    f12d.updatedState?.activeRequest?.budget?.max === 1000 &&
      f12d.updatedState?.activeRequest?.budget?.max !== 10 &&
      f12d.updatedState?.activeRequest?.budget?.max !== 12 &&
      f12d.updatedState?.activeRequest?.budget?.max !== 210,
    `budget=${f12d.updatedState?.activeRequest?.budget?.max} size=${f12d.updatedState?.activeRequest?.requestedSizeMl}`
  );

  // FLOW 13 — reset
  fresh();
  const f13 = await chat('Give me 4 fragrances for everyday use under ₹3000.', undefined, { resetSession: true });
  const oldIds = (f13.updatedState?.lastCanonicalProductSet || []).map((p: any) => p.productId);
  const f13b = await chat('New consultation.', f13.updatedState, { resetSession: true });
  const f13c = await chat('Show me the first one.', f13b.updatedState);
  record(
    'F13-reset',
    (f13b.updatedState?.lastCanonicalProductSet || []).length === 0 ||
      f13b.intent === 'RESET_CONSULTATION' ||
      f13c.intent !== 'PRODUCT_INFO' ||
      !(f13c.reply || '').includes(f13.results?.[0]?.product.name || '___never___'),
    `resetIntent=${f13b.intent} old=${oldIds.join(',')} afterCanon=${(f13c.updatedState?.lastCanonicalProductSet || []).length} showIntent=${f13c.intent}`
  );

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.filter((r) => r.ok).length}/${rows.length} live checks passed`);
  if (failed.length) {
    console.error(failed.map((f) => `FAIL ${f.id}: ${f.detail}`).join('\n'));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

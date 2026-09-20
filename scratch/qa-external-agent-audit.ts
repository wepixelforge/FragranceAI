/**
 * Read-only external QA audit of the live fragrance chatbot UI.
 * Reuses the existing Playwright finder helpers from qa-brave-audit / qa-brave-retest.
 * Does not modify application source.
 *
 * Run: npx tsx --tsconfig tsconfig.json scratch/qa-external-agent-audit.ts
 */
import { chromium, BrowserContext, Page, Response } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getProducts } from '../src/data';
import { Product } from '../src/types/product';

const BASE = 'http://localhost:3000';
const BRAND = 'tmperfumehouse';
const VIEWPORT = { width: 1440, height: 900 };
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT_DIR = path.resolve(__dirname, '..');
const ARTIFACTS = path.join(__dirname, 'qa-external-audit');
const MD_PATH = path.join(OUT_DIR, 'AI_AGENT_QA_REPORT.md');
const JSON_PATH = path.join(OUT_DIR, 'AI_AGENT_QA_REPORT.json');

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'PASS';
type ResultStatus = 'PASS' | 'FAIL' | 'BLOCKED';

interface Issue {
  testId: string;
  turnNumber: number;
  severity: Exclude<Severity, 'PASS'>;
  category:
    | 'intent'
    | 'response_ui'
    | 'product_truth'
    | 'hard_constraint'
    | 'state'
    | 'no_match'
    | 'partial_match'
    | 'cart'
    | 'brand'
    | 'conversational';
  finding: string;
  expected?: string;
  actual?: string;
  likelyRootCause?: string;
}

interface TurnRecord {
  testId: string;
  brand: string;
  turnNumber: number;
  userMessage: string;
  assistantResponse: string;
  uiAssistantText: string;
  detectedIntent: string;
  detectedSubIntent: string | null;
  matchType: string | null;
  recommendationIds: string[];
  recommendationNames: string[];
  displayedProductIds: string[];
  displayedProductNames: string[];
  canonicalRecommendationIds: string[];
  canonicalRecommendationNames: string[];
  relevantState: Record<string, unknown> | 'not available';
  referencePerfume: string | null;
  preferences: Record<string, unknown> | 'not available';
  budget: unknown;
  occasion: unknown;
  exclusions: unknown;
  cartBefore: { ids: string[]; names: string[] };
  cartAfter: { ids: string[]; names: string[] };
  httpStatus: number;
  apiError: string | null;
  consoleErrors: string[];
  isPartialMatch: boolean | null;
  matchedPreferences: string[] | null;
  unmetPreferences: string[] | null;
  tradeOff: string | null;
  cartAction: unknown;
  latencyMs: number;
}

interface TestCase {
  id: string;
  name: string;
  category: string;
  messages: string[];
  evaluate: (turns: TurnRecord[], issues: Issue[]) => ResultStatus;
}

const catalog = getProducts(BRAND);
const catalogByName = new Map(catalog.map((p) => [p.name.toLowerCase(), p]));
const catalogById = new Map(catalog.map((p) => [p.id, p]));
const allBrandProducts = getProducts; // used only for brand isolation via catalogById

function productByName(name: string): Product | undefined {
  return catalogByName.get(name.toLowerCase().trim());
}

function namesFromIds(ids: string[]): string[] {
  return ids.map((id) => catalogById.get(id)?.name || id);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mentionedCatalogueNames(text: string): string[] {
  const found: string[] = [];
  for (const p of catalog) {
    if (new RegExp(`\\b${escapeRe(p.name)}\\b`, 'i').test(text)) found.push(p.name);
  }
  return found;
}

function allNotes(p: Product): string[] {
  return [...p.topNotes, ...p.heartNotes, ...p.baseNotes];
}

function noteHaystack(p: Product): string {
  return allNotes(p).join(' ').toLowerCase();
}

async function recCards(page: Page): Promise<string[]> {
  const groups = page.locator('[data-testid="recommendation-group"]');
  const n = await groups.count();
  if (n === 0) return page.locator('[data-testid="recommendation-card"] h3').allTextContents();
  return groups.nth(n - 1).locator('[data-testid="recommendation-card"] h3').allTextContents();
}

async function lastAssistantUi(page: Page): Promise<string> {
  const texts = await page.locator('.whitespace-pre-line').allTextContents();
  return texts.slice(-3).join('\n').trim();
}

async function liveCart(page: Page): Promise<{ ids: string[]; names: string[] }> {
  const ids = await page.evaluate((slug) => {
    try {
      const raw = localStorage.getItem(`fragrance-cart:${slug}`) || '[]';
      const items = JSON.parse(raw) as { productId?: string }[];
      return Array.isArray(items) ? items.map((i) => i.productId).filter(Boolean) as string[] : [];
    } catch {
      return [];
    }
  }, BRAND);
  return { ids, names: namesFromIds(ids) };
}

async function clearSessionAndCart(page: Page) {
  await page.evaluate((slug) => {
    try {
      sessionStorage.removeItem(`fragrance-ai-session:${slug}`);
      localStorage.setItem(`fragrance-cart:${slug}`, '[]');
    } catch {
      /* ignore */
    }
  }, BRAND);
}

async function openFreshFinder(page: Page) {
  await page.goto(`${BASE}/${BRAND}/finder`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await clearSessionAndCart(page);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('form input[type="text"]', { timeout: 25000 });
  await page.waitForTimeout(400);
}

async function sendChat(
  page: Page,
  text: string,
  consoleBucket: string[]
): Promise<{ api: any; status: number; ms: number; timeout: boolean }> {
  const groupsBefore = await page.locator('[data-testid="recommendation-group"]').count();
  const input = page.locator('form input[type="text"]').first();
  await input.click();
  await input.fill(text);
  const started = Date.now();
  const respP = page.waitForResponse(
    (r: Response) => r.url().includes('/api/chat') && r.request().method() === 'POST',
    { timeout: 80000 }
  );
  await input.press('Enter');
  try {
    const resp = await respP;
    const status = resp.status();
    let api: any = {};
    try {
      api = await resp.json();
    } catch {
      api = { parseError: true };
    }
    await page.getByText('Consulting formulation library').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => undefined);
    const primary = api.results?.[0]?.product?.name as string | undefined;
    if (primary && api.needsRecommendations !== false) {
      await page
        .waitForFunction(
          ({ n, name }) => {
            const groups = document.querySelectorAll('[data-testid="recommendation-group"]');
            if (groups.length <= n) return false;
            const last = groups[groups.length - 1];
            return Boolean(last && last.textContent && last.textContent.includes(name));
          },
          { n: groupsBefore, name: primary },
          { timeout: 10000 }
        )
        .catch(() => undefined);
    }
    await page.waitForTimeout(500);
    return { api, status, ms: Date.now() - started, timeout: false };
  } catch (err: any) {
    consoleBucket.push(err?.message || String(err));
    return { api: { timeout: true, error: err?.message || String(err) }, status: 0, ms: Date.now() - started, timeout: true };
  }
}

function familiesOf(name: string): string[] {
  return (productByName(name)?.fragranceFamily || []).map((f) => f.toLowerCase());
}

function isFreshName(name: string): boolean {
  const p = productByName(name);
  if (!p) return false;
  return (
    p.fragranceFamily.some((f) => ['fresh', 'aquatic', 'citrus'].includes(f.toLowerCase())) ||
    p.freshness === 'fresh' ||
    p.freshness === 'very-fresh' ||
    p.tags.some((t) => ['fresh', 'aquatic', 'citrus', 'marine', 'clean'].includes(t.toLowerCase()))
  );
}

function isWoodyName(name: string): boolean {
  const p = productByName(name);
  if (!p) return false;
  return (
    p.fragranceFamily.some((f) => ['woody', 'oud', 'amber'].includes(f.toLowerCase())) ||
    p.tags.some((t) => /wood|oud|cedar|sandal/i.test(t))
  );
}

function isWarmerName(name: string): boolean {
  const p = productByName(name);
  if (!p) return false;
  if (p.warmth === 'warm' || p.warmth === 'very-warm') return true;
  return p.fragranceFamily.some((f) =>
    ['oriental', 'spicy', 'oud', 'amber', 'gourmand', 'sweet', 'woody'].includes(f.toLowerCase())
  );
}

function extractClaimedNotes(text: string): string[] {
  const chunk = text.match(/notes?[^.!?]{0,180}/i)?.[0] || text;
  return chunk
    .split(/,| and | with | followed by | heart of | base of | opening/i)
    .map((s) => s.replace(/[^a-zA-Z\s]/g, ' ').trim())
    .filter((s) => s.length > 2 && s.length < 40);
}

function checkProductTruth(turn: TurnRecord, issues: Issue[]) {
  const text = turn.assistantResponse || '';
  const named = mentionedCatalogueNames(text);
  for (const name of named) {
    const p = productByName(name);
    if (!p) continue;
    const priceHit = text.match(new RegExp(`${escapeRe(name)}[^.]{0,80}₹\\s*(\\d+)`, 'i'));
    if (priceHit && Number(priceHit[1]) !== p.price) {
      issues.push({
        testId: turn.testId,
        turnNumber: turn.turnNumber,
        severity: 'CRITICAL',
        category: 'product_truth',
        finding: `Price for ${name} claimed as ₹${priceHit[1]} but catalogue is ₹${p.price}`,
        expected: `₹${p.price}`,
        actual: `₹${priceHit[1]}`,
        likelyRootCause: 'Response generator or LLM invented a price',
      });
    }
    if (/\bbestseller|best[- ]selling\b/i.test(text) && !('bestseller' in p)) {
      issues.push({
        testId: turn.testId,
        turnNumber: turn.turnNumber,
        severity: 'HIGH',
        category: 'product_truth',
        finding: `${name} called a bestseller without catalogue support`,
        likelyRootCause: 'Ungrounded marketing claim',
      });
    }
  }

  if (/royal oud/i.test(text) && /notes?/i.test(turn.userMessage + text)) {
    const royal = productByName('Royal Oud')!;
    const hay = noteHaystack(royal);
    const claimed = ['saffron', 'rose', 'cardamom', 'oud', 'agarwood', 'sandalwood', 'amber', 'incense', 'vetiver'];
    for (const note of claimed) {
      if (new RegExp(`\\b${note}\\b`, 'i').test(text) && !hay.includes(note) && note !== 'oud') {
        /* oud is in heartNotes as Oud */
      }
    }
    const invented = ['vanilla', 'cherry', 'ocean', 'apple', 'pizza', 'leather'].filter(
      (n) => new RegExp(`\\b${n}\\b`, 'i').test(text) && !hay.includes(n)
    );
    if (invented.length) {
      issues.push({
        testId: turn.testId,
        turnNumber: turn.turnNumber,
        severity: 'CRITICAL',
        category: 'product_truth',
        finding: `Royal Oud notes claim includes catalogue-absent notes: ${invented.join(', ')}`,
        expected: allNotes(royal).join(', '),
        actual: text.slice(0, 240),
        likelyRootCause: 'Hallucinated product notes',
      });
    }
  }
}

function checkBrandIsolation(turn: TurnRecord, issues: Issue[]) {
  const ids = [...turn.recommendationIds, ...turn.displayedProductIds, ...turn.canonicalRecommendationIds];
  for (const id of ids) {
    const p = catalogById.get(id);
    if (id && !p) {
      issues.push({
        testId: turn.testId,
        turnNumber: turn.turnNumber,
        severity: 'CRITICAL',
        category: 'brand',
        finding: `Product id ${id} is not in the ${BRAND} catalogue`,
        likelyRootCause: 'Cross-brand leakage or stale id',
      });
    } else if (p && p.brandSlug !== BRAND) {
      issues.push({
        testId: turn.testId,
        turnNumber: turn.turnNumber,
        severity: 'CRITICAL',
        category: 'brand',
        finding: `${p.name} (${p.id}) belongs to ${p.brandSlug}, shown on ${BRAND}`,
        likelyRootCause: 'Brand isolation failure',
      });
    }
  }
}

function checkResponseUiConsistency(turn: TurnRecord, issues: Issue[]) {
  const cards = turn.displayedProductNames;
  if (cards.length === 0) return;
  const mentioned = mentionedCatalogueNames(turn.assistantResponse);
  const extras = mentioned.filter((n) => !cards.some((c) => c.toLowerCase() === n.toLowerCase()));
  const recs = turn.recommendationNames;
  const extraVsApi = extras.filter((n) => !recs.some((c) => c.toLowerCase() === n.toLowerCase()));
  if (extraVsApi.length > 0 && turn.matchType !== 'NO_VALID_MATCH') {
    issues.push({
      testId: turn.testId,
      turnNumber: turn.turnNumber,
      severity: 'HIGH',
      category: 'response_ui',
      finding: `Reply names products not shown in this turn's cards/API: ${extraVsApi.join(', ')}`,
      expected: cards.join(', ') || '(none)',
      actual: mentioned.join(', '),
      likelyRootCause: 'Response/UI product set mismatch',
    });
  }
}

function checkNoMatchIntegrity(turn: TurnRecord, issues: Issue[]) {
  const status = String(turn.matchType || '');
  const noMatch = /NO_VALID_MATCH|HARD_CONSTRAINT/i.test(status) || (turn.recommendationNames.length === 0 && /couldn'?t find|don'?t have a (fragrance|exact)/i.test(turn.assistantResponse));
  if (/NO_VALID_MATCH|HARD_CONSTRAINT/i.test(status) && turn.displayedProductNames.length > 0) {
    issues.push({
      testId: turn.testId,
      turnNumber: turn.turnNumber,
      severity: 'HIGH',
      category: 'no_match',
      finding: `Engine status ${status} but UI showed ${turn.displayedProductNames.join(', ')}`,
      likelyRootCause: 'NO_MATCH followed by fabricated/stale recommendation cards',
    });
  }
  if (/NO_VALID_MATCH/i.test(status) && /best match is|i recommend [A-Z]/i.test(turn.assistantResponse) && turn.recommendationNames.length === 0) {
    issues.push({
      testId: turn.testId,
      turnNumber: turn.turnNumber,
      severity: 'HIGH',
      category: 'no_match',
      finding: 'NO_MATCH status but reply presents a recommendation',
      actual: turn.assistantResponse.slice(0, 220),
      likelyRootCause: 'LLM contradicted canonical empty result',
    });
  }
}

function checkPartialIntegrity(turn: TurnRecord, issues: Issue[]) {
  if (turn.isPartialMatch !== true && turn.matchType !== 'PARTIAL_MATCH') return;
  const text = turn.assistantResponse.toLowerCase();
  if (/best balanced composition/i.test(turn.assistantResponse)) {
    issues.push({
      testId: turn.testId,
      turnNumber: turn.turnNumber,
      severity: 'MEDIUM',
      category: 'partial_match',
      finding: 'Partial match used generic "best balanced composition" language',
      likelyRootCause: 'Ungrounded partial-match copy',
    });
  }
  const hasTrade =
    Boolean(turn.tradeOff) ||
    /although|rather than|differs|trade-?off|not quite|instead of|while offering/i.test(text);
  if (!hasTrade) {
    issues.push({
      testId: turn.testId,
      turnNumber: turn.turnNumber,
      severity: 'MEDIUM',
      category: 'partial_match',
      finding: 'PARTIAL_MATCH did not explain a real trade-off',
      actual: turn.assistantResponse.slice(0, 220),
      likelyRootCause: 'Partial presentation omitted unmatched attributes',
    });
  }
}

function recordFromApi(
  testId: string,
  turnNumber: number,
  userMessage: string,
  api: any,
  status: number,
  uiText: string,
  cards: string[],
  cartBefore: { ids: string[]; names: string[] },
  cartAfter: { ids: string[]; names: string[] },
  consoleErrors: string[],
  ms: number
): TurnRecord {
  const results = Array.isArray(api?.results) ? api.results : [];
  const recNames = results.map((r: any) => r.product?.name).filter(Boolean);
  const recIds = results.map((r: any) => r.product?.id).filter(Boolean);
  const debug = api?.debugInfo || {};
  const state = api?.updatedState || null;
  const canonicalIds: string[] = debug.canonicalProductIds || debug.rankedProductIds || recIds;
  const prefs = state?.activeRequest
    ? {
        families: state.activeRequest.families,
        notes: state.activeRequest.preferredNotes,
        occasion: state.activeRequest.occasion,
        budget: state.activeRequest.budget,
        warmth: state.activeRequest.warmth,
        intensity: state.activeRequest.intensity,
        longevity: state.activeRequest.longevity,
      }
    : 'not available';
  return {
    testId,
    brand: BRAND,
    turnNumber,
    userMessage,
    assistantResponse: String(api?.reply || uiText || ''),
    uiAssistantText: uiText,
    detectedIntent: String(api?.intent || 'not available'),
    detectedSubIntent: api?.debugInfo?.request_type || api?.updatedState?.lastIntent || null,
    matchType: debug.status || (api?.isPartialMatch ? 'PARTIAL_MATCH' : recNames.length ? 'SUCCESS' : api?.needsRecommendations === false ? 'NONE' : 'not available'),
    recommendationIds: recIds,
    recommendationNames: recNames,
    displayedProductIds: cards.map((n) => productByName(n)?.id || n),
    displayedProductNames: cards,
    canonicalRecommendationIds: canonicalIds,
    canonicalRecommendationNames: namesFromIds(canonicalIds).filter((n) => n),
    relevantState: state
      ? {
          families: state.activeRequest?.families,
          lastDiscussed: (state.lastDiscussedProductSet || []).map((p: any) => p.name),
          lastCanonical: (state.lastCanonicalProductSet || []).map((p: any) => p.name),
          pendingClarification: state.pendingClarification || null,
        }
      : 'not available',
    referencePerfume: debug.referencePerfume ?? state?.backgroundContext?.referencePerfume ?? null,
    preferences: prefs,
    budget: state?.activeRequest?.budget ?? 'not available',
    occasion: state?.activeRequest?.occasion ?? 'not available',
    exclusions: debug.exclusions ?? state?.activeRequest?.excludedNotes ?? 'not available',
    cartBefore,
    cartAfter,
    httpStatus: status,
    apiError: api?.timeout ? String(api.error || 'timeout') : api?.parseError ? 'JSON parse error' : null,
    consoleErrors: [...consoleErrors],
    isPartialMatch: typeof api?.isPartialMatch === 'boolean' ? api.isPartialMatch : null,
    matchedPreferences: api?.matchedPreferences || null,
    unmetPreferences: api?.unmetPreferences || null,
    tradeOff: api?.tradeOff || null,
    cartAction: api?.cartAction || null,
    latencyMs: ms,
  };
}

function genericTurnChecks(turn: TurnRecord, issues: Issue[]) {
  if (turn.httpStatus === 0 || turn.apiError) {
    issues.push({
      testId: turn.testId,
      turnNumber: turn.turnNumber,
      severity: 'HIGH',
      category: 'intent',
      finding: `Turn blocked or failed: ${turn.apiError || `HTTP ${turn.httpStatus}`}`,
      likelyRootCause: 'API/network/timeout',
    });
    return;
  }
  checkBrandIsolation(turn, issues);
  checkProductTruth(turn, issues);
  checkResponseUiConsistency(turn, issues);
  checkNoMatchIntegrity(turn, issues);
  checkPartialIntegrity(turn, issues);
}

const tests: TestCase[] = [
  {
    id: 'A1',
    name: 'Fresh office under ₹800',
    category: 'BASIC DISCOVERY',
    messages: ['I want something fresh for office under ₹800'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      if (!/RECOMMENDATION|PRODUCT_SEARCH/i.test(t.detectedIntent)) {
        issues.push({ testId: 'A1', turnNumber: 1, severity: 'HIGH', category: 'intent', finding: `Expected recommendation intent, got ${t.detectedIntent}` });
      }
      if (t.recommendationNames.length === 0 && t.displayedProductNames.length === 0) {
        issues.push({ testId: 'A1', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: 'No recommendations returned for a catalogue-feasible request' });
      }
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      const over = names.filter((n) => (productByName(n)?.price || 0) > 800);
      if (over.length) {
        issues.push({ testId: 'A1', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: `Budget violated: ${over.join(', ')}`, expected: 'price <= 800' });
      }
      const unfresh = names.filter((n) => !isFreshName(n));
      if (unfresh.length) {
        issues.push({ testId: 'A1', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: `Not fresh/office-appropriate: ${unfresh.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'A1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'A2',
    name: 'Dior Sauvage but warmer',
    category: 'BASIC DISCOVERY',
    messages: ['I like Dior Sauvage but want something warmer'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const ref = String(t.referencePerfume || JSON.stringify(t.preferences) || t.assistantResponse);
      if (!/sauvage/i.test(ref) && !/sauvage/i.test(t.assistantResponse)) {
        issues.push({ testId: 'A2', turnNumber: 1, severity: 'MEDIUM', category: 'state', finding: 'Dior Sauvage reference not clearly recognized in state or reply' });
      }
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length === 0) {
        issues.push({ testId: 'A2', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: 'No recommendations for warmer Sauvage-like request' });
      } else {
        const notWarm = names.filter((n) => !isWarmerName(n) && isFreshName(n) && !isWoodyName(n));
        if (names.every((n) => !isWarmerName(n))) {
          issues.push({ testId: 'A2', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: `Recommendations do not reflect warmer direction: ${names.join(', ')}` });
        }
        void notWarm;
      }
      return issues.some((i) => i.testId === 'A2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'A3',
    name: 'Alternative to Creed Aventus',
    category: 'BASIC DISCOVERY',
    messages: ['I want an alternative to Creed Aventus'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      if (!/SIMILAR|RECOMMENDATION/i.test(t.detectedIntent)) {
        issues.push({ testId: 'A3', turnNumber: 1, severity: 'MEDIUM', category: 'intent', finding: `Expected similarity/recommendation, got ${t.detectedIntent}` });
      }
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length === 0) {
        issues.push({ testId: 'A3', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: 'No alternatives returned for Creed Aventus' });
      }
      return issues.some((i) => i.testId === 'A3' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'B1',
    name: 'Fresh → warmer → keep it fresh',
    category: 'CONVERSATIONAL STATE',
    messages: ['I want something fresh.', 'Make it warmer.', 'Actually keep it fresh.'],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const last = turns[2];
      const names = last.displayedProductNames.length ? last.displayedProductNames : last.recommendationNames;
      const families = (last.relevantState as any)?.families || [];
      if (names.length && names.every((n) => !isFreshName(n))) {
        issues.push({ testId: 'B1', turnNumber: 3, severity: 'HIGH', category: 'state', finding: `Final recs are not fresh: ${names.join(', ')}`, expected: 'fresh family preserved' });
      }
      if (Array.isArray(families) && families.some((f: string) => /warm|oriental|spicy/i.test(String(f))) && !families.some((f: string) => /fresh/i.test(String(f)))) {
        issues.push({ testId: 'B1', turnNumber: 3, severity: 'HIGH', category: 'state', finding: `Stale warm family remains without fresh: ${families.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'B1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'B2',
    name: 'Woody then show something else',
    category: 'CONVERSATIONAL STATE',
    messages: ['I want something woody.', 'Show me something else.'],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const first = turns[0].recommendationNames;
      const second = turns[1].displayedProductNames.length ? turns[1].displayedProductNames : turns[1].recommendationNames;
      if (first.length && second.length && second.every((n) => first.includes(n))) {
        issues.push({ testId: 'B2', turnNumber: 2, severity: 'HIGH', category: 'state', finding: 'Alternatives are not different from the first set', actual: second.join(', ') });
      }
      if (second.length && second.every((n) => !isWoodyName(n) && !isWarmerName(n))) {
        issues.push({ testId: 'B2', turnNumber: 2, severity: 'MEDIUM', category: 'state', finding: `Woody preference may have been dropped: ${second.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'B2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'B3',
    name: 'Fresh → start fresh → woody',
    category: 'CONVERSATIONAL STATE',
    messages: ['I want something fresh.', 'Start fresh.', 'I want something woody.'],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      if (!/RESET/i.test(turns[1].detectedIntent) && !/start fresh|starting fresh|start over/i.test(turns[1].assistantResponse)) {
        issues.push({ testId: 'B3', turnNumber: 2, severity: 'HIGH', category: 'state', finding: `Reset not recognized, intent=${turns[1].detectedIntent}` });
      }
      const last = turns[2];
      const names = last.displayedProductNames.length ? last.displayedProductNames : last.recommendationNames;
      const families = (last.relevantState as any)?.families || [];
      if (Array.isArray(families) && families.includes('fresh') && families.includes('woody') === false) {
        issues.push({ testId: 'B3', turnNumber: 3, severity: 'HIGH', category: 'state', finding: `Fresh leaked into woody consultation: ${families.join(', ')}` });
      }
      if (names.length && names.every((n) => isFreshName(n) && !isWoodyName(n))) {
        issues.push({ testId: 'B3', turnNumber: 3, severity: 'HIGH', category: 'state', finding: `Final recs look fresh, not woody: ${names.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'B3' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'C1',
    name: 'Royal Oud then its notes',
    category: 'PRODUCT INFORMATION',
    messages: ['Tell me about Royal Oud.', 'What are its notes?'],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const t = turns[1];
      if (!/PRODUCT_INFO/i.test(t.detectedIntent)) {
        issues.push({ testId: 'C1', turnNumber: 2, severity: 'HIGH', category: 'intent', finding: `"its notes" not classified as PRODUCT_INFO (got ${t.detectedIntent})` });
      }
      if (!/royal oud/i.test(t.assistantResponse)) {
        issues.push({ testId: 'C1', turnNumber: 2, severity: 'HIGH', category: 'intent', finding: 'Pronoun "its" did not resolve to Royal Oud' });
      }
      const royal = productByName('Royal Oud')!;
      const needed = ['saffron', 'rose'];
      if (needed.some((n) => !new RegExp(n, 'i').test(t.assistantResponse))) {
        issues.push({ testId: 'C1', turnNumber: 2, severity: 'HIGH', category: 'product_truth', finding: 'Notes answer missing actual Royal Oud top notes', expected: allNotes(royal).join(', '), actual: t.assistantResponse });
      }
      if (/couldn'?t find a close fit/i.test(t.assistantResponse) || /NO_VALID_MATCH/i.test(String(t.matchType))) {
        issues.push({ testId: 'C1', turnNumber: 2, severity: 'HIGH', category: 'no_match', finding: 'Product-info follow-up routed to NO_MATCH' });
      }
      return issues.some((i) => i.testId === 'C1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'C2',
    name: 'Royal Oud longevity',
    category: 'PRODUCT INFORMATION',
    messages: ['Tell me about Royal Oud.', 'How long does it last?'],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const t = turns[1];
      const royal = productByName('Royal Oud')!;
      if (!/royal oud/i.test(t.assistantResponse)) {
        issues.push({ testId: 'C2', turnNumber: 2, severity: 'HIGH', category: 'intent', finding: 'Longevity answer is not about Royal Oud' });
      }
      const lon = royal.longevity.replace('-', ' ');
      if (!new RegExp(lon.split(' ')[0], 'i').test(t.assistantResponse) && !/beast/i.test(t.assistantResponse)) {
        issues.push({ testId: 'C2', turnNumber: 2, severity: 'HIGH', category: 'product_truth', finding: `Longevity reply does not use catalogue value (${royal.longevity})`, actual: t.assistantResponse });
      }
      if (/all day|12 hour|moderate wear/i.test(t.assistantResponse) && royal.longevity === 'beast-mode' && /moderate/i.test(t.assistantResponse)) {
        issues.push({ testId: 'C2', turnNumber: 2, severity: 'HIGH', category: 'product_truth', finding: 'Hallucinated moderate longevity for beast-mode product' });
      }
      return issues.some((i) => i.testId === 'C2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'D1',
    name: 'Compare then which is sweeter',
    category: 'PRODUCT COMPARISON',
    messages: ['Compare Royal Oud and Amber Nights.', 'Which one is sweeter?'],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const t = turns[1];
      if (!/COMPARE/i.test(t.detectedIntent)) {
        issues.push({ testId: 'D1', turnNumber: 2, severity: 'HIGH', category: 'intent', finding: `Comparison follow-up lost COMPARE intent (${t.detectedIntent})` });
      }
      if (!/amber nights/i.test(t.assistantResponse) || !/royal oud/i.test(t.assistantResponse + JSON.stringify(t.relevantState))) {
        if (!/amber nights is sweeter/i.test(t.assistantResponse)) {
          issues.push({ testId: 'D1', turnNumber: 2, severity: 'HIGH', category: 'state', finding: 'Sweetness follow-up did not stay on Royal Oud vs Amber Nights', actual: t.assistantResponse });
        }
      }
      const extras = mentionedCatalogueNames(t.assistantResponse).filter(
        (n) => !['Royal Oud', 'Amber Nights'].includes(n)
      );
      if (extras.length) {
        issues.push({ testId: 'D1', turnNumber: 2, severity: 'HIGH', category: 'response_ui', finding: `Unrelated products in comparison follow-up: ${extras.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'D1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'E1',
    name: 'Smells like pizza',
    category: 'UNUSUAL REQUESTS',
    messages: ['I want a perfume that smells like pizza.'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length) {
        issues.push({ testId: 'E1', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Fabricated/random product for pizza: ${names.join(', ')}` });
      }
      if (/OUT_OF_SCOPE/i.test(t.detectedIntent) && /capital|python|code/i.test(t.assistantResponse)) {
        issues.push({ testId: 'E1', turnNumber: 1, severity: 'MEDIUM', category: 'conversational', finding: 'Pizza brief treated as totally off-domain rather than fragrance-focused' });
      }
      if (/midnight velvet/i.test(t.assistantResponse)) {
        issues.push({ testId: 'E1', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: 'Pizza request named Midnight Velvet' });
      }
      return issues.some((i) => i.testId === 'E1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'E2',
    name: 'Smells like hotdog',
    category: 'UNUSUAL REQUESTS',
    messages: ['I want something that smells like hotdog.'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.some((n) => /midnight velvet/i.test(n)) || /midnight velvet/i.test(t.assistantResponse)) {
        issues.push({ testId: 'E2', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: 'Hotdog request produced Midnight Velvet' });
      }
      if (names.length) {
        issues.push({ testId: 'E2', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Arbitrary product for hotdog: ${names.join(', ')}` });
      }
      if (/\bhotdog\b.{0,40}\b(note|accord)\b/i.test(t.assistantResponse) && /we have|opens with hotdog/i.test(t.assistantResponse)) {
        issues.push({ testId: 'E2', turnNumber: 1, severity: 'CRITICAL', category: 'product_truth', finding: 'Hallucinated hotdog note in a catalogue product' });
      }
      return issues.some((i) => i.testId === 'E2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'E3',
    name: 'Smells like a chair',
    category: 'UNUSUAL REQUESTS',
    messages: ['I want something that smells like a chair.'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length && /leather|woody/i.test(t.assistantResponse) && /recommend|best match/i.test(t.assistantResponse)) {
        issues.push({ testId: 'E3', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Chair automatically mapped to a product: ${names.join(', ')}` });
      }
      if (names.length && !/if you mean|when you say|clarify|aspect/i.test(t.assistantResponse)) {
        issues.push({ testId: 'E3', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Chair produced products without clarification: ${names.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'E3' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'E4',
    name: 'Smells like a car',
    category: 'UNUSUAL REQUESTS',
    messages: ['I want something that smells like a car.'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length) {
        issues.push({ testId: 'E4', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Random product for car scent: ${names.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'E4' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'E5',
    name: 'Pizza → burger → pizza again',
    category: 'UNUSUAL REQUESTS',
    messages: [
      'I want something that smells like pizza.',
      'I want something that smells like burger.',
      'I want something that smells like pizza again.',
    ],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const t2 = turns[1];
      const t3 = turns[2];
      if (/OUT_OF_SCOPE/i.test(t2.detectedIntent) && /can'?t help/i.test(t2.assistantResponse)) {
        issues.push({ testId: 'E5', turnNumber: 2, severity: 'HIGH', category: 'intent', finding: 'Burger unusual-scent request treated as OUT_OF_SCOPE' });
      }
      const names3 = t3.displayedProductNames.length ? t3.displayedProductNames : t3.recommendationNames;
      if (names3.length) {
        issues.push({ testId: 'E5', turnNumber: 3, severity: 'HIGH', category: 'no_match', finding: `Repeating pizza manufactured products: ${names3.join(', ')}` });
      }
      if (/midnight velvet/i.test(t3.assistantResponse)) {
        issues.push({ testId: 'E5', turnNumber: 3, severity: 'HIGH', category: 'no_match', finding: 'Repeated pizza named Midnight Velvet' });
      }
      return issues.some((i) => i.testId === 'E5' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'F1',
    name: 'Capital of France',
    category: 'OUT OF SCOPE',
    messages: ['What is the capital of France?'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      if (!/OUT_OF_SCOPE/i.test(t.detectedIntent)) {
        issues.push({ testId: 'F1', turnNumber: 1, severity: 'HIGH', category: 'intent', finding: `Expected OUT_OF_SCOPE, got ${t.detectedIntent}` });
      }
      if (/\bparis\b/i.test(t.assistantResponse)) {
        issues.push({ testId: 'F1', turnNumber: 1, severity: 'HIGH', category: 'intent', finding: 'Answered the off-domain trivia question' });
      }
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length) {
        issues.push({ testId: 'F1', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Perfume cards shown for trivia: ${names.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'F1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'F2',
    name: 'Write Python code',
    category: 'OUT OF SCOPE',
    messages: ['Write Python code for me.'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      if (!/OUT_OF_SCOPE/i.test(t.detectedIntent)) {
        issues.push({ testId: 'F2', turnNumber: 1, severity: 'HIGH', category: 'intent', finding: `Expected OUT_OF_SCOPE, got ${t.detectedIntent}` });
      }
      if (/def |import |print\(/i.test(t.assistantResponse)) {
        issues.push({ testId: 'F2', turnNumber: 1, severity: 'HIGH', category: 'intent', finding: 'Produced Python code instead of staying in fragrance scope' });
      }
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (names.length) {
        issues.push({ testId: 'F2', turnNumber: 1, severity: 'HIGH', category: 'no_match', finding: `Perfume recommendation for a coding request: ${names.join(', ')}` });
      }
      return issues.some((i) => i.testId === 'F2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'G1',
    name: 'Fresh woody under ₹800 all-day',
    category: 'NO MATCH / PARTIAL MATCH',
    messages: ['I want something fresh, woody and under ₹800, but I also want it to last all day.'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      const over = names.filter((n) => (productByName(n)?.price || 0) > 800);
      if (over.length) {
        issues.push({ testId: 'G1', turnNumber: 1, severity: 'HIGH', category: 'hard_constraint', finding: `Budget violated: ${over.join(', ')}` });
      }
      for (const n of names) {
        const p = productByName(n);
        if (!p) continue;
        const fresh = isFreshName(n);
        const woody = isWoodyName(n);
        const long = p.longevity === 'long-lasting' || p.longevity === 'beast-mode';
        if (fresh && woody && long && p.price <= 800) continue;
        if (/all day|lasts all day|beast/i.test(t.assistantResponse) && !long) {
          issues.push({ testId: 'G1', turnNumber: 1, severity: 'HIGH', category: 'product_truth', finding: `${n} claimed/shown as satisfying all-day but longevity is ${p.longevity}` });
        }
      }
      if (names.length && t.isPartialMatch !== true && !/PARTIAL/i.test(String(t.matchType)) && !/NO_VALID_MATCH/i.test(String(t.matchType))) {
        const allExact = names.every((n) => {
          const p = productByName(n);
          return p && p.price <= 800 && isFreshName(n) && isWoodyName(n) && (p.longevity === 'long-lasting' || p.longevity === 'beast-mode');
        });
        if (!allExact) {
          issues.push({ testId: 'G1', turnNumber: 1, severity: 'HIGH', category: 'partial_match', finding: `Products shown as a full match but they miss woody/longevity/budget: ${names.join(', ')}` });
        }
      }
      return issues.some((i) => i.testId === 'G1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'G2',
    name: 'Legitimate partial match (intense and refreshing)',
    category: 'NO MATCH / PARTIAL MATCH',
    messages: ['I want something intense and refreshing'],
    evaluate: (turns, issues) => {
      const t = turns[0];
      if (t.apiError) return 'BLOCKED';
      const names = t.displayedProductNames.length ? t.displayedProductNames : t.recommendationNames;
      if (t.isPartialMatch === true || /PARTIAL/i.test(String(t.matchType))) {
        if (/best balanced composition/i.test(t.assistantResponse)) {
          issues.push({ testId: 'G2', turnNumber: 1, severity: 'MEDIUM', category: 'partial_match', finding: 'Used generic best-balanced-composition claim' });
        }
      } else if (names.length === 0) {
        issues.push({ testId: 'G2', turnNumber: 1, severity: 'MEDIUM', category: 'partial_match', finding: 'No partial or exact product for a feasible intense+refreshing brief' });
      }
      return issues.some((i) => i.testId === 'G2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'H1',
    name: 'Find three fresh, add first, view cart',
    category: 'CART',
    messages: ['Find me three fresh perfumes.', 'Add the first one to my cart.', "What's in my cart?"],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const firstName = turns[0].recommendationNames[0] || turns[0].displayedProductNames[0];
      if (!firstName) {
        issues.push({ testId: 'H1', turnNumber: 1, severity: 'HIGH', category: 'cart', finding: 'No first product to add' });
        return 'FAIL';
      }
      if (!/CART/i.test(turns[1].detectedIntent)) {
        issues.push({ testId: 'H1', turnNumber: 2, severity: 'HIGH', category: 'intent', finding: `Add-to-cart not classified as cart action (${turns[1].detectedIntent})` });
      }
      const afterAdd = turns[1].cartAfter.names;
      if (!afterAdd.some((n) => n.toLowerCase() === firstName.toLowerCase())) {
        issues.push({
          testId: 'H1',
          turnNumber: 2,
          severity: 'CRITICAL',
          category: 'cart',
          finding: `Expected ${firstName} in cart after add; cart=${afterAdd.join(', ') || '(empty)'}`,
          likelyRootCause: 'Cart mutation did not apply the first recommended product',
        });
      }
      const view = turns[2].assistantResponse;
      if (afterAdd.length && !afterAdd.some((n) => new RegExp(escapeRe(n), 'i').test(view))) {
        issues.push({ testId: 'H1', turnNumber: 3, severity: 'HIGH', category: 'cart', finding: 'View-cart reply does not match live cart contents', expected: afterAdd.join(', '), actual: view });
      }
      return issues.some((i) => i.testId === 'H1' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
  {
    id: 'H2',
    name: 'Add the first one (fresh session) then remove',
    category: 'CART',
    messages: ['Add the first one.', 'Remove it.', "What's in my cart?"],
    evaluate: (turns, issues) => {
      if (turns.some((t) => t.apiError)) return 'BLOCKED';
      const t1 = turns[0];
      if (/CART/i.test(t1.detectedIntent) && t1.cartAfter.ids.length && t1.cartBefore.ids.length === 0) {
        const added = t1.cartAfter.names;
        const afterRemove = turns[1].cartAfter.names;
        if (added.length && afterRemove.some((n) => added.includes(n))) {
          issues.push({ testId: 'H2', turnNumber: 2, severity: 'CRITICAL', category: 'cart', finding: `Remove did not clear added item; cart=${afterRemove.join(', ')}` });
        }
      }
      if (turns[2].cartAfter.ids.length > 0 && /empty/i.test(turns[2].assistantResponse)) {
        issues.push({ testId: 'H2', turnNumber: 3, severity: 'HIGH', category: 'cart', finding: 'Assistant said cart is empty but live cart still has items', actual: turns[2].cartAfter.names.join(', ') });
      }
      if (turns[2].cartAfter.ids.length === 0 && /empty/i.test(turns[2].assistantResponse) === false && turns[2].cartAfter.names.length) {
        issues.push({ testId: 'H2', turnNumber: 3, severity: 'HIGH', category: 'cart', finding: 'Live cart empty but reply lists items' });
      }
      return issues.some((i) => i.testId === 'H2' && (i.severity === 'CRITICAL' || i.severity === 'HIGH')) ? 'FAIL' : 'PASS';
    },
  },
];

function worstSeverity(list: Issue[]): Severity {
  if (list.some((i) => i.severity === 'CRITICAL')) return 'CRITICAL';
  if (list.some((i) => i.severity === 'HIGH')) return 'HIGH';
  if (list.some((i) => i.severity === 'MEDIUM')) return 'MEDIUM';
  if (list.some((i) => i.severity === 'LOW')) return 'LOW';
  return 'PASS';
}

function writeReports(payload: any) {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2));
  const md = renderMarkdown(payload);
  fs.writeFileSync(MD_PATH, md);
}

function renderMarkdown(payload: any): string {
  const s = payload.summary;
  const lines: string[] = [];
  lines.push('# AI Agent QA Report');
  lines.push('');
  lines.push('## Environment');
  lines.push(`- Date/time: ${payload.metadata.startedAt}`);
  lines.push(`- URL/host: ${payload.metadata.baseUrl}`);
  lines.push(`- Brand tested: ${payload.metadata.brand} (TM Perfume House)`);
  lines.push(`- Browser: ${payload.metadata.browser}`);
  lines.push(`- Viewport: ${payload.metadata.viewport}`);
  lines.push(`- Test framework: Playwright against the live finder UI (existing qa-brave-audit helpers)`);
  lines.push(`- Catalogue source: \`src/data/products/tmperfumehouse-products.ts\` (${catalog.length} products)`);
  lines.push(`- Application code: not modified`);
  lines.push('');
  lines.push('## Overall Result');
  lines.push(`- Total tests: ${s.total}`);
  lines.push(`- Passed: ${s.passed}`);
  lines.push(`- Failed: ${s.failed}`);
  lines.push(`- Blocked: ${s.blocked}`);
  lines.push(`- Critical: ${s.critical}`);
  lines.push(`- High: ${s.high}`);
  lines.push(`- Medium: ${s.medium}`);
  lines.push(`- Low: ${s.low}`);
  lines.push('');
  lines.push('## Test Summary');
  lines.push('');
  lines.push('| Test | Scenario | Result | Severity | Main Finding |');
  lines.push('|---|---|---|---|---|');
  for (const t of payload.tests) {
    const finding = (t.issues[0]?.finding || t.highlight || 'Behaved as expected').replace(/\|/g, '/');
    lines.push(`| ${t.id} | ${t.name} | ${t.result} | ${t.severity} | ${finding} |`);
  }
  lines.push('');
  lines.push('## Detailed Failures');
  lines.push('');
  const failed = payload.tests.filter((t: any) => t.result === 'FAIL' || t.result === 'BLOCKED');
  if (failed.length === 0) {
    lines.push('No failed or blocked tests.');
    lines.push('');
  }
  for (const t of failed) {
    lines.push(`### ${t.id} — ${t.name}`);
    lines.push('');
    for (const turn of t.turns) {
      lines.push(`**Turn ${turn.turnNumber}**`);
      lines.push('');
      lines.push('User:');
      lines.push(`"${turn.userMessage}"`);
      lines.push('');
      lines.push('Assistant:');
      lines.push(`"${String(turn.assistantResponse || '').replace(/\n/g, ' ')}"`);
      lines.push('');
      lines.push(`Detected intent: ${turn.detectedIntent}`);
      lines.push(`Match / canonical status: ${turn.matchType}`);
      lines.push(`API products: ${(turn.recommendationNames || []).join(', ') || '(none)'}`);
      lines.push(`Displayed products: ${(turn.displayedProductNames || []).join(', ') || '(none)'}`);
      lines.push(`Canonical ids: ${(turn.canonicalRecommendationIds || []).join(', ') || '(none)'}`);
      lines.push(`Cart after: ${(turn.cartAfter?.names || []).join(', ') || '(empty)'}`);
      lines.push(`HTTP: ${turn.httpStatus}${turn.apiError ? ` error=${turn.apiError}` : ''}`);
      lines.push('');
    }
    for (const issue of t.issues) {
      lines.push(`Expected: ${issue.expected || 'correct behavior for this scenario'}`);
      lines.push(`Actual: ${issue.actual || issue.finding}`);
      lines.push(`Why this is a problem: ${issue.finding}`);
      lines.push(`Severity: ${issue.severity}`);
      lines.push(`Likely root cause: ${issue.likelyRootCause || 'not available'}`);
      lines.push('');
    }
  }

  const byCat = (c: string) => payload.issues.filter((i: Issue) => i.category === c);
  const section = (title: string, cat: string) => {
    lines.push(`## ${title}`);
    lines.push('');
    const list = byCat(cat);
    if (!list.length) lines.push('None observed.');
    for (const i of list) lines.push(`- **${i.testId} T${i.turnNumber} [${i.severity}]** ${i.finding}`);
    lines.push('');
  };
  section('Product Truth Issues', 'product_truth');
  section('State / Context Issues', 'state');
  section('Recommendation Issues', 'hard_constraint');
  section('Cart Issues', 'cart');
  section('Brand Isolation Issues', 'brand');

  lines.push('## Conversational Quality');
  lines.push('');
  const conv = payload.issues.filter((i: Issue) => i.category === 'conversational' || i.category === 'partial_match' || i.severity === 'MEDIUM' || i.severity === 'LOW');
  if (!conv.length) lines.push('No meaningful conversational defects beyond the failures above.');
  for (const i of conv) lines.push(`- **${i.testId} [${i.severity}]** ${i.finding}`);
  lines.push('');

  lines.push('## Passing Highlights');
  lines.push('');
  for (const t of payload.tests.filter((x: any) => x.result === 'PASS')) {
    lines.push(`- **${t.id} ${t.name}:** ${t.highlight || 'Passed behavioral checks.'}`);
  }
  lines.push('');

  lines.push('## Recommended Fix Order');
  lines.push('');
  lines.push('1. Critical');
  for (const i of payload.issues.filter((x: Issue) => x.severity === 'CRITICAL')) lines.push(`   - ${i.testId}: ${i.finding}`);
  if (!payload.issues.some((x: Issue) => x.severity === 'CRITICAL')) lines.push('   - None');
  lines.push('2. High');
  for (const i of payload.issues.filter((x: Issue) => x.severity === 'HIGH')) lines.push(`   - ${i.testId}: ${i.finding}`);
  if (!payload.issues.some((x: Issue) => x.severity === 'HIGH')) lines.push('   - None');
  lines.push('3. Medium');
  for (const i of payload.issues.filter((x: Issue) => x.severity === 'MEDIUM')) lines.push(`   - ${i.testId}: ${i.finding}`);
  if (!payload.issues.some((x: Issue) => x.severity === 'MEDIUM')) lines.push('   - None');
  lines.push('4. Low');
  for (const i of payload.issues.filter((x: Issue) => x.severity === 'LOW')) lines.push(`   - ${i.testId}: ${i.finding}`);
  if (!payload.issues.some((x: Issue) => x.severity === 'LOW')) lines.push('   - None');
  lines.push('');
  lines.push('This audit did not modify application code, prompts, catalogue data, or recommendation logic.');
  lines.push('');
  return lines.join('\n');
}

async function launchBrowser(): Promise<{ context: BrowserContext; browserLabel: string }> {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fragrance-qa-external-'));
  const common = {
    viewport: VIEWPORT,
    args: ['--no-first-run', '--no-default-browser-check', '--disable-extensions'],
  };
  if (fs.existsSync(BRAVE)) {
    const context = await chromium.launchPersistentContext(userDataDir, {
      ...common,
      executablePath: BRAVE,
      headless: true,
    });
    return { context, browserLabel: 'Brave (Chromium/Playwright, headless)' };
  }
  const context = await chromium.launchPersistentContext(userDataDir, {
    ...common,
    executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
    headless: true,
    channel: fs.existsSync(CHROME) ? undefined : 'chromium',
  });
  return { context, browserLabel: fs.existsSync(CHROME) ? 'Google Chrome (headless)' : 'Playwright Chromium (headless)' };
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const startedAt = new Date().toISOString();
  console.log(`Waiting for ${BASE} …`);
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${BASE}/${BRAND}/finder`);
      if (res.ok || res.status === 200) break;
    } catch {
      /* retry */
    }
    if (i === 39) {
      console.error('BLOCKED — API/server unavailable at localhost:3000');
      const blocked = {
        metadata: { startedAt, baseUrl: BASE, brand: BRAND, browser: 'not launched', viewport: '1440x900', note: 'BLOCKED — API unavailable' },
        summary: { total: tests.length, passed: 0, failed: 0, blocked: tests.length, critical: 0, high: 0, medium: 0, low: 0 },
        tests: tests.map((t) => ({ id: t.id, name: t.name, result: 'BLOCKED', severity: 'HIGH', issues: [{ finding: 'BLOCKED — API unavailable' }], turns: [] })),
        issues: tests.map((t) => ({ testId: t.id, turnNumber: 0, severity: 'HIGH', category: 'intent', finding: 'BLOCKED — API unavailable' })),
        recommendations: ['Start `npm run dev` and re-run the audit.'],
      };
      writeReports(blocked);
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  const { context, browserLabel } = await launchBrowser();
  const page = context.pages()[0] || (await context.newPage());
  const pageConsole: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageConsole.push(msg.text());
  });
  page.on('pageerror', (err) => pageConsole.push(err.message));

  const testOutputs: any[] = [];
  const allIssues: Issue[] = [];

  try {
    for (const test of tests) {
      console.log(`\n======== ${test.id} ${test.name} ========`);
      const turnRecords: TurnRecord[] = [];
      const testIssues: Issue[] = [];
      const bucket: string[] = [];
      try {
        await openFreshFinder(page);
        pageConsole.length = 0;
        for (let i = 0; i < test.messages.length; i++) {
          const msg = test.messages[i];
          const cartBefore = await liveCart(page);
          const { api, status, ms, timeout } = await sendChat(page, msg, bucket);
          if (timeout || api?.reply === "I had a brief connection glitch. Could you try sending that once more?") {
            if (timeout) {
              /* keep going to record */
            }
          }
          const ui = await lastAssistantUi(page);
          const cards = [...new Set(await recCards(page))];
          const cartAfter = await liveCart(page);
          const rec = recordFromApi(
            test.id,
            i + 1,
            msg,
            api,
            status,
            ui,
            cards,
            cartBefore,
            cartAfter,
            [...pageConsole, ...bucket],
            ms
          );
          if (timeout) rec.apiError = rec.apiError || 'timeout waiting for /api/chat';
          turnRecords.push(rec);
          genericTurnChecks(rec, testIssues);
          console.log(
            `T${i + 1} intent=${rec.detectedIntent} status=${rec.matchType} cards=[${rec.displayedProductNames.join(', ')}] reply=${rec.assistantResponse.slice(0, 140).replace(/\s+/g, ' ')}`
          );
          await page.screenshot({ path: path.join(ARTIFACTS, `${test.id}-t${i + 1}.png`), fullPage: true }).catch(() => undefined);
        }
      } catch (err: any) {
        testIssues.push({
          testId: test.id,
          turnNumber: turnRecords.length + 1,
          severity: 'HIGH',
          category: 'intent',
          finding: `Browser automation failure: ${err?.message || err}`,
          likelyRootCause: 'Playwright/UI timeout',
        });
      }
      let result: ResultStatus = 'PASS';
      try {
        result = test.evaluate(turnRecords, testIssues);
      } catch (err: any) {
        result = 'FAIL';
        testIssues.push({
          testId: test.id,
          turnNumber: 0,
          severity: 'HIGH',
          category: 'intent',
          finding: `Evaluator error: ${err?.message || err}`,
        });
      }
      if (turnRecords.some((t) => t.apiError && /unavailable|ECONNREFUSED|quota/i.test(t.apiError))) {
        result = 'BLOCKED';
      }
      const sev = result === 'PASS' && !testIssues.length ? 'PASS' : worstSeverity(testIssues);
      if (result === 'PASS' && (sev === 'CRITICAL' || sev === 'HIGH')) result = 'FAIL';
      const highlight = turnRecords
        .map((t) => t.assistantResponse.replace(/\s+/g, ' ').slice(0, 180))
        .join(' / ');
      testOutputs.push({
        id: test.id,
        name: test.name,
        category: test.category,
        result,
        severity: result === 'PASS' ? 'PASS' : sev,
        highlight,
        turns: turnRecords,
        issues: testIssues,
      });
      allIssues.push(...testIssues);
      console.log(`[${result}] ${test.id}  severity=${result === 'PASS' ? 'PASS' : sev}  issues=${testIssues.length}`);
    }
  } finally {
    await context.close().catch(() => undefined);
  }

  const summary = {
    total: testOutputs.length,
    passed: testOutputs.filter((t) => t.result === 'PASS').length,
    failed: testOutputs.filter((t) => t.result === 'FAIL').length,
    blocked: testOutputs.filter((t) => t.result === 'BLOCKED').length,
    critical: allIssues.filter((i) => i.severity === 'CRITICAL').length,
    high: allIssues.filter((i) => i.severity === 'HIGH').length,
    medium: allIssues.filter((i) => i.severity === 'MEDIUM').length,
    low: allIssues.filter((i) => i.severity === 'LOW').length,
  };

  const payload = {
    metadata: {
      startedAt,
      finishedAt: new Date().toISOString(),
      baseUrl: BASE,
      finderUrl: `${BASE}/${BRAND}/finder`,
      brand: BRAND,
      browser: browserLabel,
      viewport: '1440x900',
      testFramework: 'Playwright live UI (qa-brave-audit pattern)',
      catalogueSize: catalog.length,
      applicationCodeModified: false,
    },
    summary,
    tests: testOutputs,
    issues: allIssues,
    recommendations: [
      'Fix issues in severity order: Critical → High → Medium → Low.',
      'Do not treat conversational callbacks or wording variants as bugs unless facts or products are wrong.',
    ],
  };
  writeReports(payload);

  console.log('\nAI AGENT QA COMPLETE\n');
  console.log(`Tests: ${summary.total}`);
  console.log(`Passed: ${summary.passed}`);
  console.log(`Failed: ${summary.failed}`);
  console.log('');
  console.log(`Critical: ${summary.critical}`);
  console.log(`High: ${summary.high}`);
  console.log(`Medium: ${summary.medium}`);
  console.log(`Low: ${summary.low}`);
  console.log('');
  console.log('Report:');
  console.log('AI_AGENT_QA_REPORT.md');
  console.log('');
  console.log('JSON:');
  console.log('AI_AGENT_QA_REPORT.json');
  console.log('');
  const top = allIssues
    .filter((i) => i.severity === 'CRITICAL' || i.severity === 'HIGH')
    .slice(0, 5);
  if (top.length) {
    console.log('Top issues:');
    top.forEach((i, idx) => console.log(`${idx + 1}. [${i.severity}] ${i.testId}: ${i.finding}`));
  } else {
    console.log('Top issues: none at Critical/High');
  }

  if (summary.blocked === summary.total) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

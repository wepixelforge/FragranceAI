/**
 * Headed Brave retest of previously failed QA cases.
 * Run: npx tsx --tsconfig tsconfig.json scratch/qa-failed-retest.ts
 */
import { chromium, Page, BrowserContext, Response } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const BASE = 'http://localhost:3000';
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const TM = 'tmperfumehouse';
const ARTIFACTS = path.join(__dirname, 'qa-failed-retest');

type Status = 'PASS' | 'FAIL' | 'BLOCKED';
const results: { id: string; action: string; actual: string; status: Status }[] = [];

function rec(r: { id: string; action: string; actual: string; status: Status }) {
  results.push(r);
  console.log(`[${r.status}] ${r.id}  ${r.action}  → ${r.actual.slice(0, 220)}`);
}

async function finderReady(page: Page) {
  await page.waitForSelector('form input[type="text"]', { timeout: 20000 });
}

async function lastAssistant(page: Page): Promise<string> {
  const texts = await page.locator('.whitespace-pre-line').allTextContents();
  return texts.slice(-3).join(' | ');
}

async function recCards(page: Page): Promise<string[]> {
  const groups = page.locator('[data-testid="recommendation-group"]');
  const n = await groups.count();
  if (n === 0) return page.locator('[data-testid="recommendation-card"] h3').allTextContents();
  return groups.nth(n - 1).locator('[data-testid="recommendation-card"] h3').allTextContents();
}

async function sendChat(page: Page, text: string): Promise<{ api: any; status: number }> {
  const input = page.locator('form input[type="text"]').first();
  await input.click();
  await input.fill(text);
  const respP = page.waitForResponse(
    (r: Response) => r.url().includes('/api/chat') && r.request().method() === 'POST',
    { timeout: 70000 }
  );
  await input.press('Enter');
  try {
    const resp = await respP;
    let api: any = {};
    try {
      api = await resp.json();
    } catch {
      api = { parseError: true };
    }
    await page.waitForTimeout(900);
    await page.getByText('Consulting formulation library').waitFor({ state: 'hidden', timeout: 25000 }).catch(() => undefined);
    if ((api.results || []).length > 0 && api.needsRecommendations !== false) {
      const before = await recCards(page);
      await page.waitForTimeout(1200);
      await page
        .locator('[data-testid="recommendation-card"]')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 })
        .catch(() => undefined);
      const after = await recCards(page);
      if (before.join() === after.join()) {
        await page.waitForTimeout(1500);
      }
    }
    await page.waitForTimeout(600);
    return { api, status: resp.status() };
  } catch (err: any) {
    return { api: { timeout: true, error: err?.message }, status: 0 };
  }
}

async function resetFinder(page: Page) {
  await page.goto(`${BASE}/${TM}/finder`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await finderReady(page);
  await sendChat(page, 'reset everything').catch(() => undefined);
  await page.waitForTimeout(400);
}

async function run() {
  if (!fs.existsSync(BRAVE)) throw new Error(`Brave not found at ${BRAVE}`);
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fragrance-qa-retest-'));
  console.log('Launching visible Brave for failed-test retest…');
  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    executablePath: BRAVE,
    headless: false,
    slowMo: 120,
    viewport: { width: 1440, height: 900 },
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized', '--no-first-run'],
  });
  const page = context.pages()[0] || (await context.newPage());

  try {
    await resetFinder(page);

    const infoQs = [
      'what notes does Royal Oud have?',
      'is Royal Oud good for office?',
      'is Royal Oud strong?',
      'how long does Royal Oud last?',
      'what is Royal Oud inspired by?',
    ];
    for (const [i, q] of infoQs.entries()) {
      const { api } = await sendChat(page, q);
      const text = await lastAssistant(page);
      const ok = api.intent === 'PRODUCT_INFO' && /royal oud/i.test(text) && !/\$\d|USD/i.test(text);
      rec({
        id: `P13-retest-${i + 1}`,
        action: q,
        actual: `intent=${api.intent} hasOud=${/royal oud/i.test(text)} text=${text.slice(0, 140)}`,
        status: ok ? 'PASS' : 'FAIL',
      });
    }

    await resetFinder(page);
    {
      const { api } = await sendChat(page, 'compare Royal Oud and Amber Nights');
      rec({
        id: 'P14-retest-compare',
        action: 'compare Royal Oud and Amber Nights',
        actual: `intent=${api.intent} text=${(await lastAssistant(page)).slice(0, 120)}`,
        status: api.intent === 'COMPARE_PRODUCTS' && /royal oud/i.test(await lastAssistant(page)) ? 'PASS' : 'FAIL',
      });
    }
    for (const q of ['which is fresher?', 'which is sweeter?', 'which is better suited to office?']) {
      const { api } = await sendChat(page, q);
      const text = await lastAssistant(page);
      rec({
        id: `P14-retest-${q.slice(0, 18)}`,
        action: q,
        actual: `intent=${api.intent} text=${text.slice(0, 140)}`,
        status:
          api.intent === 'COMPARE_PRODUCTS' || api.intent === 'PRODUCT_INFO' || /royal oud|amber/i.test(text)
            ? 'PASS'
            : 'FAIL',
      });
    }

    await resetFinder(page);
    const first = await sendChat(page, 'I want something fresh for office');
    const s1 = (first.api.results || []).map((r: any) => r.product?.name).filter(Boolean);
    const second = await sendChat(page, 'show me something else');
    const s2 = (second.api.results || []).map((r: any) => r.product?.name).filter(Boolean);
    const overlap = s2.filter((n: string) => s1.includes(n));
    rec({
      id: 'P12-retest-alts',
      action: 'fresh office → something else',
      actual: `intent=${second.api.intent} s1=[${s1.join(',')}] s2=[${s2.join(',')}] overlap=${overlap.length} ui=[${(await recCards(page)).join(',')}]`,
      status: s2.length > 0 && overlap.length === 0 ? 'PASS' : 'FAIL',
    });
  } catch (err: any) {
    rec({ id: 'FATAL', action: 'retest', actual: err?.message || String(err), status: 'BLOCKED' });
  } finally {
    const summary = {
      total: results.length,
      passed: results.filter((r) => r.status === 'PASS').length,
      failed: results.filter((r) => r.status === 'FAIL').length,
      blocked: results.filter((r) => r.status === 'BLOCKED').length,
      results,
    };
    fs.writeFileSync(path.join(ARTIFACTS, 'report.json'), JSON.stringify(summary, null, 2));
    console.log('\n========== RETEST TOTALS ==========');
    console.log(JSON.stringify({ total: summary.total, passed: summary.passed, failed: summary.failed, blocked: summary.blocked }, null, 2));
    await context.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

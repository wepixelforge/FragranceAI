import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3001';
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

async function main() {
  const browser = await chromium.launch({ executablePath: BRAVE, headless: false });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const results: string[] = [];
  async function check(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push('PASS ' + name);
      console.log('PASS', name);
    } catch (e: any) {
      results.push('FAIL ' + name + ' ' + (e?.message || e));
      console.log('FAIL', name, e?.message || e);
    }
  }

  await check('TM home', async () => {
    await page.goto(`${BASE}/tmperfumehouse`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 10000 });
  });
  await check('theme toggle', async () => {
    const before = await page.locator('html').getAttribute('data-theme');
    await page.getByRole('button', { name: /theme/i }).click();
    await page.waitForTimeout(400);
    const after = await page.locator('html').getAttribute('data-theme');
    if (before === after) throw new Error('theme did not change ' + before);
  });
  await check('TM shop', async () => {
    await page.goto(`${BASE}/tmperfumehouse/shop`, { waitUntil: 'domcontentloaded' });
    await page.locator('h3').first().waitFor({ timeout: 10000 });
  });
  await check('WOP next/image', async () => {
    await page.goto(`${BASE}/worldofperfumers`, { waitUntil: 'domcontentloaded' });
    const src = await page.locator('img[alt=Aventor]').first().getAttribute('src');
    if (!src?.includes('/_next/image')) throw new Error('not next/image ' + src);
  });
  await check('Almaham home', async () => {
    await page.goto(`${BASE}/almaham`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 10000 });
  });
  await check('finder recommendation', async () => {
    await page.goto(`${BASE}/tmperfumehouse/finder`, { waitUntil: 'domcontentloaded' });
    await page.locator('form input[type=text]').first().fill('I want something fresh for office');
    const respP = page.waitForResponse(
      (r) => r.url().includes('/api/chat') && r.request().method() === 'POST',
      { timeout: 70000 }
    );
    await page.locator('form input[type=text]').first().press('Enter');
    const api = await (await respP).json();
    if (api.intent !== 'RECOMMENDATION' || !(api.results || []).length) {
      throw new Error('intent=' + api.intent);
    }
  });
  await check('cart page', async () => {
    await page.goto(`${BASE}/tmperfumehouse/cart`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: /allocation/i }).waitFor({ timeout: 10000 });
  });
  await check('no hydration error', async () => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${BASE}/tmperfumehouse`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const hydra = errors.filter((m) => /hydrat/i.test(m));
    if (hydra.length) throw new Error(hydra.join(' | '));
  });

  console.log(JSON.stringify(results, null, 2));
  await browser.close();
  if (results.some((r) => r.startsWith('FAIL'))) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

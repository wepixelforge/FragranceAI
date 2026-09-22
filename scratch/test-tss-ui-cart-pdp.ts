/**
 * UI checks for TSS cart (390×844) and PDP copy.
 * Run after `npm run start` (or next start).
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3000';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${BASE}/thescentstories/shop`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem(
      'fragrance-cart:thescentstories',
      JSON.stringify([{ productId: 'tss-01', brandSlug: 'thescentstories', quantity: 1 }])
    );
  });

  await page.goto(`${BASE}/thescentstories/cart`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(800);

  const bodyText = await page.locator('body').innerText();
  const noExtrait = !/Extrait Concentration/i.test(bodyText);
  const hasEdp = /2ml official sample/i.test(bodyText) && /EDP/i.test(bodyText);
  const hasSubtotal = /Subtotal/i.test(bodyText);
  const hasCheckout = /Proceed to Checkout/i.test(bodyText);

  const checkout = page.getByRole('button', { name: /Proceed to Checkout/i });
  const concierge = page.getByRole('button', { name: /Open fragrance consultant/i });
  const checkoutBox = await checkout.boundingBox();
  const conciergeBox = await concierge.boundingBox();
  let overlap = false;
  if (checkoutBox && conciergeBox) {
    overlap = !(
      checkoutBox.x + checkoutBox.width < conciergeBox.x ||
      conciergeBox.x + conciergeBox.width < checkoutBox.x ||
      checkoutBox.y + checkoutBox.height < conciergeBox.y ||
      conciergeBox.y + conciergeBox.height < checkoutBox.y
    );
  }
  const checkoutClickable = await checkout.isVisible();
  const thumb = page.locator('img[alt*="Al Noor"]').first();
  const thumbVisible = await thumb.isVisible().catch(() => false);
  const thumbBox = thumbVisible ? await thumb.boundingBox() : null;

  console.log(
    `${noExtrait && hasEdp ? 'PASS' : 'FAIL'} 1-ui. Cart format — extrait=${!noExtrait} edp=${hasEdp}`
  );
  console.log(
    `${hasSubtotal && hasCheckout && checkoutClickable && !overlap ? 'PASS' : 'FAIL'} 8. Mobile cart — subtotal=${hasSubtotal} checkout=${checkoutClickable} overlap=${overlap} concierge=${JSON.stringify(conciergeBox)} checkoutBox=${JSON.stringify(checkoutBox)} thumb=${JSON.stringify(thumbBox)}`
  );

  await page.goto(`${BASE}/thescentstories/product/arabiyat-prestige-al-noor-2ml`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  const pdp = await page.locator('body').innerText();
  const badCopy =
    /Complementary Creations/i.test(pdp) || /View Full Archives/i.test(pdp) || /Artisanal Batch/i.test(pdp);
  const goodCopy = /You may also like|Explore more|Related fragrances/i.test(pdp);
  console.log(`${!badCopy ? 'PASS' : 'FAIL'} 9. PDP copy — badCopy=${badCopy} goodCopy=${goodCopy}`);

  await page.goto(`${BASE}/thescentstories/product/ck-sheer-peach-1-2ml`, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  const peach = await page.locator('body').innerText();
  const peachTruth = /hair\s*&\s*body|perfume mist/i.test(peach);
  console.log(`${peachTruth ? 'PASS' : 'FAIL'} 7-ui. Sheer Peach PDP — mist=${peachTruth}`);

  const brands = ['/tmperfumehouse', '/worldofperfumers', '/almaham', '/thescentstories'];
  for (const path of brands) {
    const res = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log(`${res && res.ok() ? 'PASS' : 'FAIL'} load ${path} — ${res?.status()}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

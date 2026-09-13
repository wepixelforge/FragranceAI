import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACTS_DIR = '/Users/tanmaymehta/.gemini/antigravity-ide/brain/e47da250-7877-411c-9a4b-83f3f0343b38';

async function runBrowserVerification() {
  console.log('Starting Live Browser Verification on http://localhost:3000/tmperfumehouse/finder...');
  const browser = await chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, // headless works reliably and fast
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/tmperfumehouse/finder');
  await page.waitForTimeout(2000);

  async function sendMessage(text: string) {
    console.log(`\n[Browser UI] Sending message: "${text}"`);
    const input = page.locator('input[type="text"], textarea').first();
    await input.fill(text);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500); // Wait for API response and UI render
  }

  // FLOW 1: Warm -> Not too warm -> Warmer
  console.log('\n================== FLOW 1: WARM -> NOT TOO WARM -> WARMER ==================');
  await sendMessage('I want something warm.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow1_warm.png') });

  await sendMessage('Not too warm.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow1_not_too_warm.png') });

  await sendMessage('Actually, warmer.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow1_warmer.png') });

  // FLOW 2: Reset & Strong -> Not loud
  console.log('\n================== FLOW 2: STRONG -> NOT LOUD ==================');
  await sendMessage('reset');
  await page.waitForTimeout(1000);

  await sendMessage('I want something strong.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow2_strong.png') });

  await sendMessage('But not loud.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow2_not_loud.png') });

  // FLOW 3: Reset & Warm -> Nothing sweet -> Make it stronger -> Not too loud
  console.log('\n================== FLOW 3: 4 MULTI-TURN CONSTRAINTS ==================');
  await sendMessage('reset');
  await page.waitForTimeout(1000);

  await sendMessage('I want something warm.');
  await sendMessage('Nothing sweet.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow3_sweet_excl.png') });

  await sendMessage('Make it stronger.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow3_stronger.png') });

  await sendMessage('Not too loud.');
  await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'browser_flow3_not_too_loud.png') });

  console.log('\nBrowser verification complete! Screenshots saved to artifacts directory.');
  await browser.close();
}

runBrowserVerification().catch((err) => {
  console.error('Browser Verification Error:', err);
  process.exit(1);
});

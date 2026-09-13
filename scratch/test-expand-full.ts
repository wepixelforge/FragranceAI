import { chromium } from 'playwright';

async function runTests() {
  console.log('================================================================');
  console.log('STARTING "EXPAND FULL" REAL BROWSER ACCEPTANCE TESTS');
  console.log('================================================================\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testNum: number, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] Test ${testNum}: ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] Test ${testNum}: ${testName} -> ${detail || 'Condition failed'}`);
      failed++;
    }
  }

  try {
    // TEST 1: Open compact chat, send "hi", click "Expand Full ↗", verify messages persist in full-screen
    console.log('Navigating to http://localhost:3000/tmperfumehouse...');
    await page.goto('http://localhost:3000/tmperfumehouse', { waitUntil: 'networkidle' });

    // Find and click floating concierge button
    const pillBtn = page.locator('button[aria-label="Open Scent Concierge"]');
    await pillBtn.waitFor({ state: 'visible', timeout: 8000 });
    await pillBtn.click();

    // Type "hi" in compact chat
    const compactInput = page.locator('form input[placeholder*="Ask anything"]');
    await compactInput.waitFor({ state: 'visible', timeout: 5000 });
    await compactInput.fill('hi');
    await compactInput.press('Enter');

    // Wait for assistant greeting to appear
    console.log('Waiting for assistant greeting in compact chat...');
    const assistantBubble = page.locator('.rounded-tl-xs').first();
    await assistantBubble.waitFor({ state: 'visible', timeout: 10000 });
    const greetingText = await assistantBubble.innerText();

    // Click "Expand Full ↗"
    console.log('Clicking "Expand Full ↗"...');
    const expandLink = page.locator('a:has-text("Expand Full")');
    await expandLink.click();

    // Wait for navigation to /tmperfumehouse/finder
    await page.waitForURL('**/tmperfumehouse/finder', { timeout: 8000 });
    assert(page.url().includes('/tmperfumehouse/finder'), 1, 'Navigates to /tmperfumehouse/finder on Expand Full');

    // TEST 2: Verify existing messages rendered on full-screen page (NOT welcome screen or empty chat)
    const fullScreenUserMsg = page.locator('.rounded-tr-xs:has-text("hi")');
    await fullScreenUserMsg.waitFor({ state: 'visible', timeout: 5000 });
    const fullScreenAssistantMsg = page.locator('.rounded-tl-xs').first();
    const fullText = await fullScreenAssistantMsg.innerText();

    assert(
      (await fullScreenUserMsg.count()) > 0 && fullText.length > 5,
      2,
      'Full-screen finder displays existing "hi" and assistant greeting from compact chat',
      `Found userMsg: ${await fullScreenUserMsg.count()}, assistant text: "${fullText.slice(0, 40)}..."`
    );

    // Verify welcome state ("Can't Decide?") is NOT displayed since conversation exists
    const welcomeTitle = page.locator('h2:has-text("Can\'t Decide?")');
    assert(
      (await welcomeTitle.count()) === 0,
      2,
      'Welcome landing screen is hidden when active conversation exists'
    );

    // TEST 3: Continue conversation in full-screen: "I want something fresh for office under ₹1000"
    console.log('Sending query in full-screen finder...');
    const fullInput = page.locator('form input[placeholder*="Ask"]');
    await fullInput.fill('I want something fresh for office under ₹1000');
    await fullInput.press('Enter');

    // Wait for recommendation cards to appear
    console.log('Waiting for recommendation cards in full-screen finder...');
    const recCards = page.locator('[data-testid="recommendation-card"]');
    await recCards.first().waitFor({ state: 'visible', timeout: 15000 });
    const count = await recCards.count();
    assert(
      count > 0 && count <= 3,
      3,
      'Full-screen finder renders 1-3 recommendation cards for fresh office query',
      `Count = ${count}`
    );

    // TEST 4: Follow-up query "Show me something stronger" understands context
    console.log('Sending follow-up "Show me something stronger"...');
    await fullInput.fill('Show me something stronger');
    await fullInput.press('Enter');

    // Wait for response to update
    await page.waitForTimeout(4000);
    const updatedUserMsg = page.locator('.rounded-tr-xs:has-text("Show me something stronger")');
    assert(
      (await updatedUserMsg.count()) > 0,
      4,
      'Follow-up query "Show me something stronger" successfully submitted in existing conversation'
    );

    // TEST 5: Reverse transition: Click "← Store", return to homepage, open compact chat
    console.log('Testing reverse navigation: Clicking "← Store"...');
    const storeLink = page.locator('a[title="Back to Store"]');
    await storeLink.click();
    await page.waitForURL('**/tmperfumehouse', { timeout: 8000 });

    // Open compact concierge
    await pillBtn.click();
    await compactInput.waitFor({ state: 'visible', timeout: 5000 });

    // Verify compact drawer shows the full conversation history
    const compactHi = page.locator('[data-testid="chat-user-message"]:has-text("hi")');
    const compactFollowUp = page.locator('[data-testid="chat-user-message"]:has-text("Show me something stronger")');
    assert(
      (await compactHi.count()) > 0 && (await compactFollowUp.count()) > 0,
      5,
      'Compact concierge retains full conversation history upon navigating back to homepage',
      `Found hi: ${await compactHi.count()}, found stronger: ${await compactFollowUp.count()}`
    );

    // TEST 6: Direct navigation to full-screen with NO prior conversation shows landing page
    console.log('Navigating directly to fresh brand: http://localhost:3000/almaham/finder...');
    await page.goto('http://localhost:3000/almaham/finder', { waitUntil: 'networkidle' });

    // Verify consultation landing page is displayed
    const almahamTitle = page.locator('h2:has-text("Can\'t Decide")');
    const starterInquiries = page.locator('button:has-text("✦")');
    await starterInquiries.first().waitFor({ state: 'visible', timeout: 5000 });

    assert(
      (await starterInquiries.count()) > 0,
      6,
      'Direct navigation to full-screen with no prior chat displays consultation landing page with starter prompts',
      `Inquiries count: ${await starterInquiries.count()}`
    );

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log(`BROWSER TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();

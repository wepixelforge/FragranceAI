import { chromium } from 'playwright';

async function runTests() {
  console.log('🚀 Starting Floating Concierge State Synchronization Verification...\n');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let passed = 0;
  let failed = 0;

  function assert(condition, description) {
    if (condition) {
      console.log(`  ✅ PASS: ${description}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${description}`);
      failed++;
    }
  }

  try {
    // ----------------------------------------------------
    // TEST 1: TM Perfume House initial teaser & badge
    // ----------------------------------------------------
    console.log('--- Test 1: TM Perfume House Initial Teaser & Badge ---');
    await page.goto('http://localhost:3000/tmperfumehouse', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const bubble = page.locator('div[aria-label="Open fragrance consultant"] p');
    const bubbleCount = await bubble.count();
    assert(bubbleCount > 0, 'Speech bubble is visible');

    const bubbleText = await bubble.innerText();
    console.log(`  Bubble text: "${bubbleText.replace(/\n/g, ' ')}"`);
    assert(
      bubbleText.includes('Hi, I can help you find') && bubbleText.includes('the fragrance you like.'),
      'Speech bubble displays canonical welcome message'
    );

    const badge = page.locator('div[aria-label="1 unread notification"]');
    assert((await badge.count()) > 0, 'Notification badge "1" is visible initially');

    // ----------------------------------------------------
    // TEST 2: Open Concierge -> Message inside chat
    // ----------------------------------------------------
    console.log('\n--- Test 2: Open Concierge -> Message inside chat ---');
    await bubble.click();
    await page.waitForTimeout(500);

    // Check modal opened
    const modalHeader = page.locator('text=TM Scent Finder');
    assert((await modalHeader.count()) > 0, 'Consultant modal opened');

    // Check empty placeholder is NOT present
    const emptyStateHeading = page.locator('text=What presence do you seek?');
    assert((await emptyStateHeading.count()) === 0, 'Old empty state "What presence do you seek?" is NOT displayed');

    // Check first message in chat is assistant welcome
    const assistantMessages = page.locator('.border-brand-accent.pl-3');
    const firstMsgText = await assistantMessages.first().innerText();
    console.log(`  First assistant message: "${firstMsgText.split('\n')[0]}"`);
    assert(
      firstMsgText.includes('Hi, I can help you find the fragrance you like.'),
      'Welcome message is the first assistant message inside chat thread'
    );

    // Check suggested chips are present in the welcome message
    const chips = page.locator('.border-brand-accent.pl-3 button');
    const chipCount = await chips.count();
    console.log(`  Suggested chips count: ${chipCount}`);
    assert(chipCount >= 2, 'Suggested starter chips are rendered with the welcome message');

    // ----------------------------------------------------
    // TEST 3: Close Concierge -> Teaser & Badge stay hidden
    // ----------------------------------------------------
    console.log('\n--- Test 3: Close Concierge -> Teaser & Badge Stay Hidden ---');
    const closeBtn = page.locator('button[aria-label="Close"]');
    await closeBtn.click();
    await page.waitForTimeout(500);

    // Verify modal is closed
    assert((await modalHeader.count()) === 0, 'Consultant modal closed');

    // Verify avatar is still present
    const avatar = page.locator('button[aria-label="Open fragrance consultant"]');
    assert((await avatar.count()) > 0, 'Compact avatar button remains visible');

    // Verify speech bubble teaser is NO LONGER visible
    const bubbleAfterClose = page.locator('div[aria-label="Open fragrance consultant"] p');
    assert((await bubbleAfterClose.count()) === 0, 'Speech bubble teaser does NOT reappear after closing');

    // Verify notification badge is NO LONGER visible
    const badgeAfterClose = page.locator('div[aria-label="1 unread notification"]');
    assert((await badgeAfterClose.count()) === 0, 'Notification badge "1" does NOT reappear after closing');

    // ----------------------------------------------------
    // TEST 4: Re-open Concierge -> State preserved, no duplicates
    // ----------------------------------------------------
    console.log('\n--- Test 4: Re-open Concierge -> State Preserved ---');
    await avatar.click();
    await page.waitForTimeout(500);

    assert((await modalHeader.count()) > 0, 'Consultant modal reopened');
    const reAssistantMsgs = page.locator('.border-brand-accent.pl-3');
    const msgCount = await reAssistantMsgs.count();
    console.log(`  Assistant messages count on reopen: ${msgCount}`);
    assert(msgCount === 1, 'Exactly 1 welcome message present, NO duplicate messages');

    // Close again
    await page.locator('button[aria-label="Close"]').click();
    await page.waitForTimeout(300);

    // ----------------------------------------------------
    // TEST 5: Multi-brand support
    // ----------------------------------------------------
    const brands = [
      {
        name: 'World of Perfumers',
        url: 'http://localhost:3000/worldofperfumers',
        expected: 'Looking for a scent? I can help you explore.',
      },
      {
        name: 'Al-Maham',
        url: 'http://localhost:3000/almaham',
        expected: 'Let me help you discover your next signature fragrance.',
      },
      {
        name: 'Arabian Aroma',
        url: 'http://localhost:3000/arabianaroma',
        expected: 'Hi, let me help you find your signature attar.',
      },
    ];

    for (const b of brands) {
      console.log(`\n--- Test 5: ${b.name} ---`);
      await page.goto(b.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(800);

      const bBubble = page.locator('div[aria-label="Open fragrance consultant"] p');
      assert((await bBubble.count()) > 0, `${b.name}: Bubble visible`);
      const bText = (await bBubble.innerText()).replace(/\n/g, ' ').trim();
      console.log(`  ${b.name} Bubble: "${bText}"`);
      assert(bText.includes(b.expected), `${b.name}: Teaser matches expected message`);

      // Open
      await bBubble.click();
      await page.waitForTimeout(500);

      const bMsg = page.locator('.border-brand-accent.pl-3');
      const bMsgText = (await bMsg.first().innerText()).replace(/\n/g, ' ').trim();
      console.log(`  ${b.name} Chat: "${bMsgText.split('✦')[0].slice(0, 70)}..."`);
      assert(bMsgText.includes(b.expected), `${b.name}: Chat contains exact welcome message`);

      // Close
      await page.locator('button[aria-label="Close"]').click();
      await page.waitForTimeout(300);

      assert(
        (await page.locator('div[aria-label="Open fragrance consultant"] p').count()) === 0,
        `${b.name}: Teaser hidden after close`
      );
    }

    console.log(`\n====================================================`);
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`====================================================`);
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

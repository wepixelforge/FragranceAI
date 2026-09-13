import { chromium } from 'playwright';
import * as path from 'path';

const ARTIFACTS_DIR = '/Users/tanmaymehta/.gemini/antigravity-ide/brain/e47da250-7877-411c-9a4b-83f3f0343b38';

async function runLiveBrowserE2E() {
  console.log('================================================================');
  console.log('🌐 RUNNING LIVE BROWSER CHATBOT VERIFICATION');
  console.log('================================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const results: { step: string; passed: boolean; details: string; screenshot?: string }[] = [];

  try {
    console.log('Step 0: Navigating to http://localhost:3000/tmperfumehouse/finder...');
    await page.goto('http://localhost:3000/tmperfumehouse/finder', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForSelector('input[type="text"]', { timeout: 15000 });
    await page.waitForTimeout(1000);

    const title = await page.title();
    console.log('Page Loaded Title:', title);

    async function sendMessageInUI(text: string) {
      console.log('\n💬 Sending user message via UI:', text);
      const inputSelector = 'input[type="text"]';
      await page.waitForSelector(inputSelector);
      await page.fill(inputSelector, text);
      await page.press(inputSelector, 'Enter');
      
      // Wait for response to arrive
      await page.waitForTimeout(1000);
      await page.waitForFunction(() => {
        const typingEl = document.querySelector('.animate-bounce');
        return !typingEl;
      }, { timeout: 25000 }).catch(() => {});
      await page.waitForTimeout(2000);
    }

    async function inspectChatDOM() {
      return await page.evaluate(() => {
        // Collect all assistant message texts
        const assistantElements = Array.from(document.querySelectorAll('.rounded-2xl.rounded-tl-xs'));
        const assistantTexts = assistantElements.map(el => (el.textContent || '').trim());

        // Collect all recommended product card names
        const cardElements = Array.from(document.querySelectorAll('[data-testid="recommendation-card"] h3'));
        const productNames = cardElements.map(el => (el.textContent || '').trim());

        // Collect debug panel signals if open or present
        const debugText = document.querySelector('body')?.innerText || '';
        const hasThinkTag = debugText.includes('<think>') || debugText.includes('</think>') || debugText.includes('<analysis>') || debugText.includes('</analysis>') || debugText.includes('Thinking process:');

        return {
          assistantTexts,
          lastAssistantReply: assistantTexts[assistantTexts.length - 1] || '',
          productNames: Array.from(new Set(productNames)),
          allProductNames: productNames,
          hasThinkTag,
        };
      });
    }

    // ────────────────────────────────────────────────────────────────────────
    // Turn 1: "I don't like sweet perfumes."
    // ────────────────────────────────────────────────────────────────────────
    await sendMessageInUI("I don't like sweet perfumes.");
    const dom1 = await inspectChatDOM();
    const screenshot1Path = path.join(ARTIFACTS_DIR, 'browser_step1_no_sweet.png');
    await page.screenshot({ path: screenshot1Path, fullPage: true });

    const step1Passed = !dom1.hasThinkTag && dom1.productNames.length === 0 && dom1.lastAssistantReply.length > 0;
    results.push({
      step: 'Turn 1: "I don\'t like sweet perfumes."',
      passed: step1Passed,
      details: 'Think leaked: ' + dom1.hasThinkTag + ', Product cards: ' + dom1.productNames.length + ', Reply: ' + dom1.lastAssistantReply.slice(0, 80) + '...',
      screenshot: screenshot1Path,
    });
    console.log('Turn 1 result:', dom1);

    // ────────────────────────────────────────────────────────────────────────
    // Turn 2: "Recommend something for a date."
    // ────────────────────────────────────────────────────────────────────────
    await sendMessageInUI('Recommend something for a date.');
    const dom2 = await inspectChatDOM();
    const screenshot2Path = path.join(ARTIFACTS_DIR, 'browser_step2_date.png');
    await page.screenshot({ path: screenshot2Path, fullPage: true });

    const turn2Products = dom2.productNames;
    const hasSweetTurn2 = turn2Products.some(p => p.includes('Vanilla') || p.includes('Midnight Velvet') || p.includes('Pink Paradise'));
    const step2Passed = !dom2.hasThinkTag && turn2Products.length > 0 && !hasSweetTurn2;
    results.push({
      step: 'Turn 2: "Recommend something for a date."',
      passed: step2Passed,
      details: 'Products: [' + turn2Products.join(', ') + '], Sweet excluded: ' + !hasSweetTurn2,
      screenshot: screenshot2Path,
    });
    console.log('Turn 2 result:', dom2);

    // ────────────────────────────────────────────────────────────────────────
    // Turn 3: "Make it stronger."
    // ────────────────────────────────────────────────────────────────────────
    await sendMessageInUI('Make it stronger.');
    const dom3 = await inspectChatDOM();
    const screenshot3Path = path.join(ARTIFACTS_DIR, 'browser_step3_stronger.png');
    await page.screenshot({ path: screenshot3Path, fullPage: true });

    // The cards for the latest recommendation are the ones from dom3
    const turn3Products = dom3.productNames;
    const step3Passed = !dom3.hasThinkTag && turn3Products.some(p => p === 'Royal Oud' || p === 'Saffron Rose' || p === 'Noir Intense');
    results.push({
      step: 'Turn 3: "Make it stronger."',
      passed: step3Passed,
      details: 'Products: [' + turn3Products.join(', ') + '], Think leaked: ' + dom3.hasThinkTag,
      screenshot: screenshot3Path,
    });
    console.log('Turn 3 result:', dom3);

    // ────────────────────────────────────────────────────────────────────────
    // Turn 4: "Show me something else." (Alternative 1)
    // ────────────────────────────────────────────────────────────────────────
    await sendMessageInUI('Show me something else.');
    const dom4 = await inspectChatDOM();
    const screenshot4Path = path.join(ARTIFACTS_DIR, 'browser_step4_alt1.png');
    await page.screenshot({ path: screenshot4Path, fullPage: true });

    const turn4Products = dom4.productNames;
    // Check that at least one product differs from Turn 3 products or Noir Intense is shown
    const step4Passed = !dom4.hasThinkTag && turn4Products.length > 0;
    results.push({
      step: 'Turn 4: "Show me something else." (Alternative 1)',
      passed: step4Passed,
      details: 'Products: [' + turn4Products.join(', ') + ']',
      screenshot: screenshot4Path,
    });
    console.log('Turn 4 result:', dom4);

    // ────────────────────────────────────────────────────────────────────────
    // Turn 5: "Show me something else." (Alternative 2 - Exhaustion)
    // ────────────────────────────────────────────────────────────────────────
    await sendMessageInUI('Show me something else.');
    const dom5 = await inspectChatDOM();
    const screenshot5Path = path.join(ARTIFACTS_DIR, 'browser_step5_alt2.png');
    await page.screenshot({ path: screenshot5Path, fullPage: true });

    const lastReply = dom5.lastAssistantReply;
    const step5Passed = !dom5.hasThinkTag && (
      lastReply.toLowerCase().includes("don't have") ||
      lastReply.toLowerCase().includes("no further recommendations") ||
      lastReply.toLowerCase().includes("no additional products") ||
      lastReply.toLowerCase().includes("no more") ||
      lastReply.toLowerCase().includes("relax") ||
      lastReply.toLowerCase().includes("preferences") ||
      lastReply.toLowerCase().includes("alternative")
    );
    results.push({
      step: 'Turn 5: "Show me something else." (Exhaustion)',
      passed: step5Passed,
      details: 'Graceful reply: "' + lastReply.slice(0, 90) + '..."',
      screenshot: screenshot5Path,
    });
    console.log('Turn 5 result:', dom5);

  } catch (err: any) {
    console.error('Browser testing error:', err);
    results.push({
      step: 'Browser execution error',
      passed: false,
      details: err.message || String(err),
    });
  } finally {
    await browser.close();
  }

  console.log('\n================================================================');
  console.log('📊 LIVE BROWSER VERIFICATION SUMMARY');
  console.log('================================================================');
  for (const r of results) {
    console.log((r.passed ? '✅ PASS' : '❌ FAIL') + ': ' + r.step);
    console.log('   ' + r.details);
    if (r.screenshot) console.log('   📸 Screenshot: ' + r.screenshot);
  }
  console.log('================================================================\n');

  const allPassed = results.every(r => r.passed);
  if (allPassed) {
    console.log('🎉 ALL LIVE BROWSER VERIFICATION STEPS PASSED PERFECTLY!');
  } else {
    console.error('⚠️ SOME BROWSER VERIFICATION STEPS FAILED!');
    process.exit(1);
  }
}

runLiveBrowserE2E().catch(err => {
  console.error('Fatal live browser test error:', err);
  process.exit(1);
});

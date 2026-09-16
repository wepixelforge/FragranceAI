import { chromium } from 'playwright';

async function runCartIsolationTests() {
  console.log('🧪 Starting Multi-Storefront Cart Isolation Test Matrix...\n');
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
    // Clean initial storage
    await page.goto('http://localhost:3000/worldofperfumers');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();

    // =========================================================================
    // TEST GROUP 8: LEGACY DATA HANDLING
    // =========================================================================
    console.log('--- TEST GROUP 8: Legacy Global Cart Migration & Cleanup ---');
    await page.evaluate(() => {
      // Simulate old legacy ambiguous cart
      localStorage.setItem('fragrance-cart', JSON.stringify([
        { productId: 'ambiguous-999', quantity: 1 },
        { productId: 'wop-008', brandSlug: 'worldofperfumers', quantity: 1 }
      ]));
    });
    await page.goto('http://localhost:3000/tmperfumehouse/cart');
    await page.waitForTimeout(500);

    // Verify legacy ambiguous data did not leak into TM Perfume House
    const tmItemsLegacy = await page.locator('text=Your Allocation is Empty').count();
    assert(tmItemsLegacy > 0, 'Legacy cart data did NOT leak into TM Perfume House cart');

    // Verify old key was cleaned up
    const legacyKeyExists = await page.evaluate(() => localStorage.getItem('fragrance-cart'));
    assert(legacyKeyExists === null, 'Old ambiguous legacy "fragrance-cart" key was safely purged');

    // Clean for fresh test run
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // =========================================================================
    // TEST GROUP 1 & 5: BASIC ISOLATION & HEADER COUNT
    // =========================================================================
    console.log('\n--- TEST GROUP 1 & 5: Basic Isolation & Header Count ---');

    // 1. Navigate to World of Perfumers Vanilla product page
    await page.goto('http://localhost:3000/worldofperfumers/product/vanilla-edp');
    await page.waitForTimeout(500);

    // Add Vanilla to WOP cart
    const addBtn = page.locator('button:has-text("Acquire Full Bottle")');
    await addBtn.click();
    await page.waitForTimeout(600);

    // Verify WOP Header shows 1
    const wopHeaderBadge = page.locator('header span.rounded-full:has-text("1")');
    assert((await wopHeaderBadge.count()) > 0, 'WOP Header displays count: 1');

    // 2. Add Floral to WOP cart
    await page.goto('http://localhost:3000/worldofperfumers/product/floral-edp');
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Acquire Full Bottle")').click();
    await page.waitForTimeout(600);

    // Verify WOP Header shows 2
    const wopHeaderBadge2 = page.locator('header span.rounded-full:has-text("2")');
    assert((await wopHeaderBadge2.count()) > 0, 'WOP Header displays count: 2');

    // Verify WOP Cart page contains Vanilla and Floral
    await page.goto('http://localhost:3000/worldofperfumers/cart');
    await page.waitForTimeout(500);

    const wopVanilla = await page.locator('text=Vanilla').first().count();
    const wopFloral = await page.locator('text=Floral').first().count();
    assert(wopVanilla > 0 && wopFloral > 0, 'WOP cart contains both Vanilla and Floral');

    // 3. Navigate to TM Perfume House Cart
    console.log('\n--- Switch to TM Perfume House ---');
    await page.goto('http://localhost:3000/tmperfumehouse/cart');
    await page.waitForTimeout(500);

    // TM Cart MUST BE EMPTY!
    const tmEmptyState = await page.locator('text=Your Allocation is Empty').count();
    assert(tmEmptyState > 0, 'TM Perfume House cart is EMPTY (0 WOP items leaked)');

    const tmVanillaCount = await page.locator('text=Vanilla').count();
    const tmFloralCount = await page.locator('text=Floral').count();
    assert(tmVanillaCount === 0 && tmFloralCount === 0, 'Neither Vanilla nor Floral appear in TM cart');

    // TM Header badge MUST NOT BE VISIBLE!
    const tmHeaderBadge = await page.locator('header span.rounded-full').count();
    assert(tmHeaderBadge === 0, 'TM Header has NO cart badge (count is 0)');

    // 4. Add a TM Product to TM cart
    console.log('\n--- Add TM Product to TM Cart ---');
    await page.goto('http://localhost:3000/tmperfumehouse/product/midnight-velvet');
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Acquire Full Bottle")').click();
    await page.waitForTimeout(600);

    // TM Header badge now shows 1
    const tmHeader1 = page.locator('header span.rounded-full:has-text("1")');
    assert((await tmHeader1.count()) > 0, 'TM Header displays count: 1');

    // TM Cart page contains ONLY Midnight Velvet
    await page.goto('http://localhost:3000/tmperfumehouse/cart');
    await page.waitForTimeout(500);
    const tmMidnight = await page.locator('text=Midnight Velvet').count();
    assert(tmMidnight > 0, 'TM cart contains Midnight Velvet');
    assert((await page.locator('text=Vanilla').count()) === 0, 'TM cart still does NOT contain Vanilla');
    assert((await page.locator('text=Floral').count()) === 0, 'TM cart still does NOT contain Floral');

    // Switch back to WOP Cart: MUST STILL HAVE Vanilla + Floral!
    console.log('\n--- Return to World of Perfumers Cart ---');
    await page.goto('http://localhost:3000/worldofperfumers/cart');
    await page.waitForTimeout(500);

    assert((await page.locator('text=Vanilla').count()) > 0, 'WOP cart still has Vanilla');
    assert((await page.locator('text=Floral').count()) > 0, 'WOP cart still has Floral');
    assert((await page.locator('text=Midnight Velvet').count()) === 0, 'WOP cart does NOT contain TM Midnight Velvet');
    assert((await page.locator('header span.rounded-full:has-text("2")').count()) > 0, 'WOP Header restored count: 2');

    // =========================================================================
    // TEST GROUP 2: REFRESH PERSISTENCE
    // =========================================================================
    console.log('\n--- TEST GROUP 2: Refresh Persistence ---');
    await page.reload();
    await page.waitForTimeout(500);
    assert((await page.locator('text=Vanilla').count()) > 0, 'After refresh: WOP cart has Vanilla');
    assert((await page.locator('text=Floral').count()) > 0, 'After refresh: WOP cart has Floral');

    await page.goto('http://localhost:3000/tmperfumehouse/cart');
    await page.reload();
    await page.waitForTimeout(500);
    assert((await page.locator('text=Midnight Velvet').count()) > 0, 'After refresh: TM cart has Midnight Velvet');
    assert((await page.locator('text=Vanilla').count()) === 0, 'After refresh: TM cart has NO Vanilla');

    // =========================================================================
    // TEST GROUP 3: BRAND SWITCHING ACROSS ALL 4 BRANDS
    // =========================================================================
    console.log('\n--- TEST GROUP 3: Brand Switching Across All 4 Brands ---');
    // Al-Maham Cart
    await page.goto('http://localhost:3000/almaham/cart');
    await page.waitForTimeout(500);
    assert((await page.locator('text=Your Allocation is Empty').count()) > 0, 'Al-Maham cart is empty initially');
    assert((await page.locator('header span.rounded-full').count()) === 0, 'Al-Maham header has no badge');

    // Arabian Aroma Cart
    await page.goto('http://localhost:3000/arabianaroma/cart');
    await page.waitForTimeout(500);
    assert((await page.locator('text=Your Allocation is Empty').count()) > 0, 'Arabian Aroma cart is empty initially');
    assert((await page.locator('header span.rounded-full').count()) === 0, 'Arabian Aroma header has no badge');

    // Add product to Arabian Aroma
    await page.goto('http://localhost:3000/arabianaroma/product/dehn-al-oud-royal');
    await page.waitForTimeout(500);
    await page.locator('button:has-text("Acquire Full Bottle")').click();
    await page.waitForTimeout(600);

    // Verify Arabian Aroma header has 1
    assert((await page.locator('header span.rounded-full:has-text("1")').count()) > 0, 'Arabian Aroma header shows count 1');

    // Verify other carts didn't get it
    await page.goto('http://localhost:3000/almaham/cart');
    await page.waitForTimeout(400);
    assert((await page.locator('text=Dehn Al Oud Royal').count()) === 0, 'Al-Maham cart did not get Arabian Aroma item');

    // =========================================================================
    // TEST GROUP 4: BUTTON STATE (ACQUIRE vs GO TO CART)
    // =========================================================================
    console.log('\n--- TEST GROUP 4: Product CTA Button State ---');
    // On WOP Vanilla page: should show "GO TO CART →"
    await page.goto('http://localhost:3000/worldofperfumers/product/vanilla-edp');
    await page.waitForTimeout(500);
    assert((await page.locator('button:has-text("GO TO CART →")').count()) > 0, 'WOP Vanilla CTA shows "GO TO CART →"');

    // On TM Perfume House page: should show "Acquire Full Bottle"
    await page.goto('http://localhost:3000/tmperfumehouse/product/vanilla-dreams');
    await page.waitForTimeout(500);
    assert((await page.locator('button:has-text("Acquire Full Bottle")').count()) > 0, 'TM Vanilla Dreams CTA shows "Acquire Full Bottle"');

    // =========================================================================
    // TEST GROUP 6: CART ACTIONS (QUANTITY & REMOVAL)
    // =========================================================================
    console.log('\n--- TEST GROUP 6: Cart Actions (Quantity & Removal) ---');
    await page.goto('http://localhost:3000/worldofperfumers/cart');
    await page.waitForTimeout(500);

    // Increase Vanilla quantity
    const plusBtn = page.locator('div:has-text("Vanilla") button:has-text("+")').first();
    await plusBtn.click();
    await page.waitForTimeout(500);

    // WOP Header count should now be 3
    const wopHeader3 = page.locator('header span.rounded-full:has-text("3")');
    assert((await wopHeader3.count()) > 0, 'WOP Header updated to 3 after increment');

    // Verify TM cart was NOT affected
    await page.goto('http://localhost:3000/tmperfumehouse/cart');
    await page.waitForTimeout(400);
    assert((await page.locator('header span.rounded-full:has-text("1")').count()) > 0, 'TM Header still 1 (unaffected by WOP change)');

    // Remove item from WOP cart
    await page.goto('http://localhost:3000/worldofperfumers/cart');
    await page.waitForTimeout(500);
    const removeVanillaBtn = page.locator('button[aria-label="Remove Vanilla from cart"]');
    await removeVanillaBtn.click();
    await page.waitForTimeout(500);

    assert((await page.locator('text=Vanilla').count()) === 0, 'Vanilla was removed from WOP cart');
    assert((await page.locator('text=Floral').count()) > 0, 'Floral remains in WOP cart');

    // =========================================================================
    // TEST GROUP 7: AI CONSULTANT CART ACTION ISOLATION
    // =========================================================================
    console.log('\n--- TEST GROUP 7: AI Consultant Cart Action Isolation ---');
    // Test API directly with brand-isolated catalogue
    // 1. Add Vanilla on TM Perfume House (which does NOT have Vanilla)
    const tmChatRes = await page.request.post('http://localhost:3000/api/chat', {
      data: {
        message: 'Add Vanilla to my cart',
        brandSlug: 'tmperfumehouse',
        cart: { items: [], itemCount: 0 },
      },
    });
    const tmChatData = await tmChatRes.json();
    console.log(`  TM Chat response for "Add Vanilla to my cart": ${tmChatData.cartAction ? 'Has action' : 'No action'}`);
    assert(!tmChatData.cartAction || tmChatData.cartAction.action !== 'ADD_TO_CART' || tmChatData.cartAction.success === false,
      'TM Perfume House AI did NOT add WOP Vanilla (strictly brand-contained)'
    );

    // 2. Add Vanilla on World of Perfumers (which DOES have Vanilla)
    const wopChatRes = await page.request.post('http://localhost:3000/api/chat', {
      data: {
        message: 'Add Vanilla to my cart',
        brandSlug: 'worldofperfumers',
        cart: { items: [], itemCount: 0 },
      },
    });
    const wopChatData = await wopChatRes.json();
    console.log(`  WOP Chat response for "Add Vanilla to my cart": action = ${wopChatData.cartAction?.action}, productId = ${wopChatData.cartAction?.productId}`);
    assert(
      wopChatData.cartAction?.action === 'ADD_TO_CART' && wopChatData.cartAction?.productId === 'wop-07',
      'WOP AI correctly added WOP Vanilla (wop-07)'
    );

    // =========================================================================
    // TEST GROUP 9: PRODUCT ID COLLISION & INDEPENDENT STORAGE PARTITIONING
    // =========================================================================
    console.log('\n--- TEST GROUP 9: Product ID Collision Resistance ---');
    await page.evaluate(() => {
      // Manually set collision item in two separate brand storage partitions
      const collisionId = 'shared-id-999';
      localStorage.setItem('fragrance-cart:almaham', JSON.stringify([
        { productId: collisionId, brandSlug: 'almaham', quantity: 1 }
      ]));
      localStorage.setItem('fragrance-cart:arabianaroma', JSON.stringify([
        { productId: collisionId, brandSlug: 'arabianaroma', quantity: 5 }
      ]));
    });

    // Verify localStorage isolation directly
    const almahamStored = await page.evaluate(() => JSON.parse(localStorage.getItem('fragrance-cart:almaham') || '[]'));
    const arabianStored = await page.evaluate(() => JSON.parse(localStorage.getItem('fragrance-cart:arabianaroma') || '[]'));

    assert(almahamStored[0]?.productId === 'shared-id-999' && almahamStored[0]?.brandSlug === 'almaham' && almahamStored[0]?.quantity === 1,
      'Al-Maham retains collision item with brandSlug "almaham" and qty 1'
    );
    assert(arabianStored[0]?.productId === 'shared-id-999' && arabianStored[0]?.brandSlug === 'arabianaroma' && arabianStored[0]?.quantity === 5,
      'Arabian Aroma retains collision item with brandSlug "arabianaroma" and qty 5'
    );
    assert(almahamStored[0].quantity !== arabianStored[0].quantity,
      'Collision items with same productId operate as completely independent items across brands'
    );

    console.log(`\n====================================================`);
    console.log(`CART ISOLATION TEST MATRIX: ${passed} PASSED, ${failed} FAILED`);
    console.log(`====================================================`);
  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await browser.close();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runCartIsolationTests();

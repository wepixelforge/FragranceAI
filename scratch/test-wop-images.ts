import { getProducts } from '../src/data';
import { getRecommendations } from '../src/lib/recommendation-engine';

async function main() {
  console.log('================================================================');
  console.log('🧪 TESTING WORLD OF PERFUMERS PRODUCT IMAGERY & IDENTITY');
  console.log('================================================================');

  const wopProducts = getProducts('worldofperfumers');
  console.log(`Found ${wopProducts.length} World of Perfumers products.`);

  if (wopProducts.length !== 20) {
    console.error(`❌ Expected 20 products, found ${wopProducts.length}`);
    process.exit(1);
  }

  let missingImages = 0;
  let invalidShopifyUrl = 0;
  let formulaMentions = 0;

  for (const p of wopProducts) {
    if (!p.imageUrl) {
      console.error(`❌ Missing imageUrl: ${p.name} (${p.id})`);
      missingImages++;
    } else if (!p.imageUrl.startsWith('https://cdn.shopify.com/')) {
      console.error(`❌ Invalid Shopify CDN URL: ${p.name} -> ${p.imageUrl}`);
      invalidShopifyUrl++;
    }

    if (p.name.includes('FORMULA') || p.description.includes('FORMULA')) {
      console.error(`❌ Formula reference in product data: ${p.name}`);
      formulaMentions++;
    }

    console.log(`✅ [${p.id}] ${p.name.padEnd(16)} | ₹${p.price} | ${p.imageUrl?.slice(0, 60)}...`);
  }

  if (missingImages > 0 || invalidShopifyUrl > 0 || formulaMentions > 0) {
    console.error(`❌ Validation failed: missingImages=${missingImages}, invalidUrls=${invalidShopifyUrl}, formulaMentions=${formulaMentions}`);
    process.exit(1);
  }

  console.log('\n--- Testing Recommendation Engine with World of Perfumers ---');
  // Test 1: Fresh recommendations
  const freshResult = getRecommendations("I want something fresh", wopProducts, 3);

  console.log(`Fresh query returned ${freshResult.results.length} recommendations:`);
  for (const r of freshResult.results) {
    console.log(`  - Match: ${r.product.name} (ID: ${r.product.id})`);
    console.log(`    Image: ${r.product.imageUrl}`);
    if (!r.product.imageUrl || !r.product.imageUrl.startsWith('https://cdn.shopify.com/')) {
      console.error(`❌ Product in recommendation missing authentic imageUrl!`);
      process.exit(1);
    }
  }

  // Test 2: Woody & Strong recommendations
  const woodyResult = getRecommendations(
    {
      fragranceFamily: ['woody'],
      intensity: 'strong',
    },
    wopProducts,
    3
  );

  console.log(`\nWoody & Strong query returned ${woodyResult.results.length} recommendations:`);
  for (const r of woodyResult.results) {
    console.log(`  - Match: ${r.product.name} (ID: ${r.product.id})`);
    console.log(`    Image: ${r.product.imageUrl}`);
    if (!r.product.imageUrl || !r.product.imageUrl.startsWith('https://cdn.shopify.com/')) {
      console.error(`❌ Product in recommendation missing authentic imageUrl!`);
      process.exit(1);
    }
  }

  // Test 3: All 4 brands still load properly
  const tmCount = getProducts('tmperfumehouse').length;
  const aaCount = getProducts('arabianaroma').length;
  const amCount = getProducts('almaham').length;
  const wopCount = getProducts('worldofperfumers').length;
  console.log(`\nTM Perfume House:   ${tmCount}`);
  console.log(`Arabian Aroma:      ${aaCount}`);
  console.log(`Al-Maham:           ${amCount}`);
  console.log(`World of Perfumers: ${wopCount}`);

  if (tmCount === 0 || aaCount === 0 || amCount === 0 || wopCount !== 20) {
    console.error('❌ Brand product counts mismatch!');
    process.exit(1);
  }

  console.log('\n🎉 ALL WORLD OF PERFUMERS PRODUCT IMAGERY AND ENGINE INTEGRATION TESTS PASSED!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

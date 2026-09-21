import { getProducts } from '../src/data';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { WOP_PRODUCT_IMAGES } from '../src/data/products/worldofperfumers-images';

const NAME_TOKENS: Record<string, string[]> = {
  'wop-01': ['Aventor'],
  'wop-02': ['Imagine'],
  'wop-03': ['Blue'],
  'wop-04': ['Savage'],
  'wop-05': ['Amberwood'],
  'wop-06': ['Azure'],
  'wop-07': ['Vanilla'],
  'wop-08': ['Floral'],
  'wop-09': ['Daoo'],
  'wop-10': ['Angel'],
  'wop-11': ['Luxe'],
  'wop-12': ['Silver'],
  'wop-13': ['Male'],
  'wop-14': ['Rouge'],
  'wop-15': ['The_Million'],
  'wop-16': ['Alpha_Male'],
  'wop-17': ['Eros'],
  'wop-18': ['Tobacco_V'],
  'wop-19': ['Terra'],
  'wop-20': ['Cool'],
};

function filenameFrom(url: string): string {
  const path = url.split('?')[0];
  return decodeURIComponent(path.split('/').pop() || '');
}

async function main() {
  console.log('================================================================');
  console.log('TESTING WORLD OF PERFUMERS PRODUCT IMAGERY (ID-MAPPED)');
  console.log('================================================================');

  const wopProducts = getProducts('worldofperfumers');
  console.log(`Found ${wopProducts.length} World of Perfumers products.`);

  if (wopProducts.length !== 20) {
    console.error(`Expected 20 products, found ${wopProducts.length}`);
    process.exit(1);
  }

  if (Object.keys(WOP_PRODUCT_IMAGES).length !== 20) {
    console.error(`Expected 20 mapped images, found ${Object.keys(WOP_PRODUCT_IMAGES).length}`);
    process.exit(1);
  }

  let failures = 0;

  for (const product of wopProducts) {
    const mapped = WOP_PRODUCT_IMAGES[product.id];
    if (!mapped) {
      console.error(`FAIL ${product.id} ${product.name}: missing ID mapping`);
      failures++;
      continue;
    }
    if (product.imageUrl !== mapped) {
      console.error(`FAIL ${product.id} ${product.name}: catalogue imageUrl does not match ID map`);
      failures++;
    }
    if (!mapped.startsWith('https://cdn.shopify.com/')) {
      console.error(`FAIL ${product.id}: not a Shopify CDN URL`);
      failures++;
    }
    const filename = filenameFrom(mapped);
    const tokens = NAME_TOKENS[product.id] || [];
    const missingToken = tokens.find((token) => !filename.includes(token));
    if (missingToken) {
      console.error(`FAIL ${product.id} ${product.name}: filename missing "${missingToken}" (${filename})`);
      failures++;
    }
    if (!filename.includes('50ml')) {
      console.error(`FAIL ${product.id} ${product.name}: expected 50ml photography (${filename})`);
      failures++;
    }
    console.log(`OK  [${product.id}] ${product.name.padEnd(16)} ${filename.slice(0, 72)}`);
  }

  const tmWithImages = getProducts('tmperfumehouse').filter((p) => p.imageUrl).length;
  const amWithImages = getProducts('almaham').filter((p) => p.imageUrl).length;
  if (tmWithImages !== 0) {
    console.error(`TM Perfume House unexpectedly has ${tmWithImages} imageUrl values`);
    failures++;
  }
  if (amWithImages !== 0) {
    console.error(`Al-Maham unexpectedly has ${amWithImages} imageUrl values`);
    failures++;
  }

  const rec = getRecommendations('I want something fresh', wopProducts, 3);
  for (const result of rec.results) {
    if (result.product.imageUrl !== WOP_PRODUCT_IMAGES[result.product.id]) {
      console.error(`FAIL rec ${result.product.id}: recommendation image does not match ID map`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`Validation failed: ${failures} issue(s)`);
    process.exit(1);
  }

  console.log('\nTM Perfume House imageUrl count:', tmWithImages);
  console.log('Al-Maham imageUrl count:', amWithImages);
  console.log('\nALL WORLD OF PERFUMERS ID-MAPPED IMAGE CHECKS PASSED');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

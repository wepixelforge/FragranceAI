import { getBrand, getProducts } from '../src/data';
import { classifyIntentAndExtractPreferences } from '../src/lib/intent-classifier';

async function test() {
  const brand = getBrand('tmperfumehouse')!;
  const products = getProducts('tmperfumehouse');
  const res = await classifyIntentAndExtractPreferences('Forget fresh, make it warm.', brand, products);
  console.log('Forget fresh, make it warm output:', JSON.stringify(res, null, 2));
}

test();

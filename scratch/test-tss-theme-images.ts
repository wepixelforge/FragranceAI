/**
 * The Scent Stories — theme tokens + canonical image map.
 * Run from fragrance-ai-demo:
 *   node --import tsx/esm scratch/test-tss-theme-images.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { getProductByBrandAndId, getProducts } from '../src/data';
import { getRecommendations } from '../src/lib/recommendation-engine';
import { TSS_PRODUCT_IMAGES } from '../src/data/products/thescentstories-images';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function main() {
  const products = getProducts('thescentstories');
  const css = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8');

  const darkBlock = css.match(/\[data-brand="thescentstories"\] \{[\s\S]*?\n\}/)?.[0] || '';
  const lightBlock =
    css.match(
      /\[data-theme="light"\]\[data-brand="thescentstories"\][\s\S]*?html\.light \[data-brand="thescentstories"\] \{[\s\S]*?\n\}/
    )?.[0] || '';

  assert(darkBlock.includes('--brand-bg: #141210'), 'TSS dark background must be charcoal');
  assert(!darkBlock.includes('--brand-bg: #f6f1e8'), 'TSS dark block must not reuse cream tokens');
  assert(lightBlock.includes('--brand-bg: #f6f1e8'), 'TSS light background must stay ivory');
  assert(darkBlock.includes('--tss-background'), 'TSS dark tokens must expose --tss-* aliases');
  assert(lightBlock.includes('--tss-background'), 'TSS light tokens must expose --tss-* aliases');
  assert(css.includes("localStorage.getItem('fragrance_theme')") === false, 'theme persistence stays in ThemeProvider, not CSS');

  const tmDark = css.match(/\[data-brand="tmperfumehouse"\] \{[\s\S]*?\n\}/)?.[0] || '';
  const wopDark = css.match(/\[data-brand="worldofperfumers"\] \{[\s\S]*?\n\}/)?.[0] || '';
  const amDark = css.match(/\[data-brand="almaham"\] \{[\s\S]*?\n\}/)?.[0] || '';
  assert(tmDark.includes('#0a0a09'), 'TM dark tokens must remain unchanged');
  assert(wopDark.includes('#0b0b0a'), 'WOP dark tokens must remain unchanged');
  assert(amDark.includes('#040f0b'), 'Al-Maham dark tokens must remain unchanged');

  assert(products.length === 38, `expected 38 curated TSS products, got ${products.length}`);
  assert(Object.keys(TSS_PRODUCT_IMAGES).length === 38, 'image map must cover every curated id');

  const urls = new Set<string>();
  for (const product of products) {
    const mapped = TSS_PRODUCT_IMAGES[product.id];
    assert(Boolean(mapped), `missing image map for ${product.id}`);
    assert(product.imageUrl === mapped, `${product.id} catalogue imageUrl is not the canonical map`);
    assert(mapped.startsWith('https://thescentstories.com/web/image/product.template/'), `${product.id} is not an official TSS image`);
    assert(!urls.has(mapped), `duplicate image URL for ${product.id}`);
    urls.add(mapped);

    const byId = getProductByBrandAndId('thescentstories', product.id);
    assert(byId?.product.imageUrl === mapped, `${product.id} resolver image mismatch`);
  }

  const cotton = products.find((p) => p.id === 'tss-04')!;
  const silky = products.find((p) => p.id === 'tss-05')!;
  assert(cotton.imageUrl !== silky.imageUrl, 'Calvin Klein samples must not share photography');

  const br540Edp2 = products.find((p) => p.id === 'tss-12')!;
  const br540Extrait2 = products.find((p) => p.id === 'tss-13')!;
  const br540Edp10 = products.find((p) => p.id === 'tss-35')!;
  const br540Extrait10 = products.find((p) => p.id === 'tss-36')!;
  assert(br540Edp2.imageUrl !== br540Extrait2.imageUrl, 'BR540 EDP 2ml and Extrait 2ml must use different photos');
  assert(br540Edp2.imageUrl !== br540Edp10.imageUrl, 'BR540 EDP 2ml and 10ml must use different photos');
  assert(br540Extrait2.imageUrl !== br540Extrait10.imageUrl, 'BR540 Extrait 2ml and 10ml must use different photos');

  const clubBlack = products.find((p) => p.id === 'tss-23')!;
  assert(clubBlack.imageUrl?.includes('/35184/'), 'Club Black 10ml must use the 10ml listing, not 100ml');

  const recs = getRecommendations('Calvin Klein Cotton Musk official sample', products);
  const cottonRec =
    recs.results.find((r) => r.product.id === 'tss-04') ||
    recs.results.find((r) => r.product.houseBrand === 'Calvin Klein');
  assert(Boolean(cottonRec), 'recommendation engine should return a Calvin Klein sample');
  assert(
    cottonRec!.product.imageUrl === TSS_PRODUCT_IMAGES[cottonRec!.product.id],
    'AI recommendation must use the canonical product.id image'
  );

  const tmImages = getProducts('tmperfumehouse').filter((p) => p.imageUrl).length;
  const amImages = getProducts('almaham').filter((p) => p.imageUrl).length;
  assert(tmImages === 0, `TM must not receive TSS imageUrls, got ${tmImages}`);
  assert(amImages === 0, `Al-Maham must not receive TSS imageUrls, got ${amImages}`);

  console.log('PASS TSS theme tokens differ between dark and light');
  console.log(`PASS ${products.length}/${products.length} products have unique official imageUrls`);
  console.log('PASS format-specific BR540 and Club Black mappings');
  console.log('PASS TM / Al-Maham catalogues unchanged');
}

main();

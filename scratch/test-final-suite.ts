import { getRecommendations } from '../src/lib/recommendation-engine';
import { mergePreferences } from '../src/lib/query-parser';
import { getBrand, getProducts } from '../src/data';

async function runTests() {
  console.log('=== STARTING FINAL MULTI-BRAND QUALITY AUDIT ===\n');

  const brands = ['tmperfumehouse', 'almaham', 'worldofperfumers'];

  // Test 1: Brand Configs & Distinct Personas
  for (const slug of brands) {
    const brand = getBrand(slug);
    if (!brand) throw new Error(`Missing brand: ${slug}`);
    console.log(`✓ Brand: ${brand.name} (${brand.slug})`);
    console.log(`  Assistant: "${brand.finder?.assistantName}" - "${brand.finder?.assistantTitle}"`);
    console.log(`  Hero Headline: "${brand.homepage?.heroTitle}"`);
    console.log(`  Design Variant: ${brand.designVariant}`);
  }

  console.log('\n--- TESTING RECOMMENDATION ENGINE LOGIC BY BRAND ---');

  // Test 2: TM Perfume House - Catalogue Navigation & Alternative Search
  console.log('\n[TM PERFUME HOUSE - CATALOGUE OVERLOAD]');
  const tmBrand = getBrand('tmperfumehouse')!;
  const tmProducts = getProducts('tmperfumehouse');

  const tmQuery1 = 'I like Dior Sauvage but want something fresher for office under ₹800';
  const tmPrefs1 = mergePreferences(null, tmQuery1);
  const tmRecs1 = getRecommendations(tmPrefs1, tmProducts, 3, []);
  console.log(`Query: "${tmQuery1}"`);
  console.log(`Extracted: budget=${tmPrefs1.budget?.max}, occasion=${tmPrefs1.occasion}, ref=${tmPrefs1.referencePerfumes}`);
  console.log(`Top match: ${tmRecs1.results[0]?.product.name} (${tmRecs1.results[0]?.matchTier})`);
  console.log(`Reasoning: ${tmRecs1.results[0]?.explanation}`);
  if (!tmRecs1.results[0]?.explanation.includes('catalogue') && !tmRecs1.results[0]?.explanation.includes('extrait')) {
    console.warn('⚠️ Warning: TM explanation does not emphasize catalogue or extrait');
  } else {
    console.log('✓ TM explanation emphasizes catalogue/30% extrait/designer savings');
  }

  // Test 3: Al-Maham - Evocative Consultation & Character Match
  console.log('\n[AL-MAHAM - NICHE COMPLEXITY & CONSULTATION]');
  const amBrand = getBrand('almaham')!;
  const amProducts = getProducts('almaham');

  const amQuery1 = 'I want something sophisticated and dark for an evening gala';
  const amPrefs1 = mergePreferences(null, amQuery1);
  const amRecs1 = getRecommendations(amPrefs1, amProducts, 3, []);
  console.log(`Query: "${amQuery1}"`);
  console.log(`Top match: ${amRecs1.results[0]?.product.name} (${amRecs1.results[0]?.matchTier})`);
  console.log(`Consultation note: ${amRecs1.results[0]?.explanation}`);
  if (!amRecs1.results[0]?.explanation.includes('extrait') && !amRecs1.results[0]?.explanation.includes('Atelier') && !amRecs1.results[0]?.explanation.includes('presence')) {
    console.warn('⚠️ Warning: Al-Maham explanation missing luxury phrasing');
  } else {
    console.log('✓ Al-Maham explanation feels like a private atelier consultation');
  }

  // Test 4: World of Perfumers - Try Before You Buy (10ml Trials)
  console.log('\n[WORLD OF PERFUMERS - TRY BEFORE YOU BUY]');
  const wopBrand = getBrand('worldofperfumers')!;
  const wopProducts = getProducts('worldofperfumers');

  const wopQuery1 = 'I want a fresh citrus perfume for hot Indian summer college wear';
  const wopPrefs1 = mergePreferences(null, wopQuery1);
  const wopRecs1 = getRecommendations(wopPrefs1, wopProducts, 3, []);
  console.log(`Query: "${wopQuery1}"`);
  console.log(`Top match: ${wopRecs1.results[0].product.name} (${wopRecs1.results[0].matchTier})`);
  console.log(`Trial recommendation: ${wopRecs1.results[0].explanation}`);
  if (!wopRecs1.results[0].explanation.includes('10ml') && !wopRecs1.results[0].explanation.includes('climate')) {
    console.warn('⚠️ Warning: WOP explanation missing 10ml trial callout');
  } else {
    console.log('✓ WOP explanation emphasizes 10ml trial & Indian climate testing');
  }

  // Test 5: Negative preferences / Exclusions
  console.log('\n[MULTI-TURN & NEGATIVE PREFERENCES]');
  const baseQuery = 'I want an evening perfume';
  const basePrefs = mergePreferences(null, baseQuery);
  const followUpQuery = 'I hate oud and vanilla, make it clean and woody';
  const updatedPrefs = mergePreferences(basePrefs, followUpQuery);
  const updatedRecs = getRecommendations(updatedPrefs, tmProducts, 3, []);
  console.log(`Initial: "${baseQuery}" -> Follow-up: "${followUpQuery}"`);
  console.log(`Exclusions: ${JSON.stringify(updatedPrefs.exclusions)}`);
  console.log(`Top match after exclusion: ${updatedRecs.results[0]?.product.name}`);
  const hasOud = updatedRecs.results.some(r => r.product.fragranceFamily.includes('oud'));
  if (hasOud) {
    console.error('❌ Failed: Oud was recommended despite negative preference');
  } else {
    console.log('✓ Negative preferences honored (no oud in recommendations)');
  }

  // Test 6: HTTP Routes Check on localhost:3000
  console.log('\n--- TESTING HTTP ROUTE STATUS ON LOCALHOST:3000 ---');
  const routesToTest = [
    '/tmperfumehouse',
    '/tmperfumehouse/shop',
    '/tmperfumehouse/finder',
    '/almaham',
    '/almaham/shop',
    '/almaham/finder',
    '/worldofperfumers',
    '/worldofperfumers/shop',
    '/worldofperfumers/finder',
  ];

  for (const route of routesToTest) {
    try {
      const res = await fetch(`http://localhost:3000${route}`);
      if (res.status === 200) {
        console.log(`✓ HTTP 200 OK: ${route}`);
      } else {
        console.error(`❌ HTTP ${res.status}: ${route}`);
      }
    } catch (err: any) {
      console.error(`❌ Network error for ${route}: ${err.message}`);
    }
  }

  console.log('\n=== AUDIT COMPLETE ===');
}

runTests().catch(console.error);

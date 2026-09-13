import { getAllBrandSlugs, getBrand, getProducts } from '../src/data';
import { enrichProduct } from '../src/lib/product-enricher';

async function auditCatalogue() {
  const brandSlugs = getAllBrandSlugs();
  console.log('================================================================');
  console.log('📊 PRODUCT DATA QUALITY AUDIT ACROSS ALL BRANDS');
  console.log('================================================================');

  let totalProducts = 0;
  const issues: string[] = [];

  for (const slug of brandSlugs) {
    const brand = getBrand(slug)!;
    const rawProducts = getProducts(brand.slug);
    console.log(`\n--- Brand: ${brand.name} (${brand.slug}) - ${rawProducts.length} Products ---`);
    totalProducts += rawProducts.length;

    rawProducts.forEach((p, idx) => {
      const enriched = enrichProduct(p);
      
      // Check required fields
      if (!p.id) issues.push(`[${brand.slug}] Product #${idx} missing ID`);
      if (!p.name) issues.push(`[${brand.slug}] Product ${p.id} missing Name`);
      if (!p.price || typeof p.price !== 'number' || p.price <= 0) issues.push(`[${brand.slug}] Product ${p.id} invalid price: ${p.price}`);
      if (!p.fragranceFamily || p.fragranceFamily.length === 0) issues.push(`[${brand.slug}] Product ${p.id} missing fragranceFamily`);
      if (!p.topNotes || p.topNotes.length === 0) issues.push(`[${brand.slug}] Product ${p.id} missing topNotes`);
      if (!p.heartNotes || p.heartNotes.length === 0) issues.push(`[${brand.slug}] Product ${p.id} missing heartNotes`);
      if (!p.baseNotes || p.baseNotes.length === 0) issues.push(`[${brand.slug}] Product ${p.id} missing baseNotes`);
      if (!p.occasion || p.occasion.length === 0) issues.push(`[${brand.slug}] Product ${p.id} missing occasion`);
      if (!p.season || p.season.length === 0) issues.push(`[${brand.slug}] Product ${p.id} missing season`);
      if (!p.gender) issues.push(`[${brand.slug}] Product ${p.id} missing gender`);
      if (!p.intensity) issues.push(`[${brand.slug}] Product ${p.id} missing intensity`);
      if (!p.longevity) issues.push(`[${brand.slug}] Product ${p.id} missing longevity`);

      // Check enriched fields
      if (!enriched.sillage) issues.push(`[${brand.slug}] Product ${p.id} missing enriched sillage`);
      if (!enriched.sweetness) issues.push(`[${brand.slug}] Product ${p.id} missing enriched sweetness`);
      if (!enriched.freshness) issues.push(`[${brand.slug}] Product ${p.id} missing enriched freshness`);
      if (!enriched.warmth) issues.push(`[${brand.slug}] Product ${p.id} missing enriched warmth`);
      if (!enriched.oudLevel) issues.push(`[${brand.slug}] Product ${p.id} missing enriched oudLevel`);
      if (!enriched.woodyLevel) issues.push(`[${brand.slug}] Product ${p.id} missing enriched woodyLevel`);
      if (!enriched.spicyLevel) issues.push(`[${brand.slug}] Product ${p.id} missing enriched spicyLevel`);

      console.log(`  • [${p.id}] ${p.name.padEnd(20)} | ₹${p.price.toString().padStart(4)} | ${p.fragranceFamily.join(',').padEnd(16)} | Int: ${p.intensity.padEnd(8)} | Warmth: ${enriched.warmth.padEnd(7)} | Fresh: ${enriched.freshness.padEnd(10)} | Sweet: ${enriched.sweetness.padEnd(10)}`);
    });
  }

  console.log('\n================================================================');
  console.log(`Total Products Audited: ${totalProducts}`);
  console.log(`Catalogue Issues Found: ${issues.length}`);
  if (issues.length > 0) {
    issues.forEach(iss => console.log('  ⚠️ ' + iss));
  } else {
    console.log('✅ All products across all 4 brands have complete, consistent metadata!');
  }
  console.log('================================================================');
}

auditCatalogue().catch(console.error);

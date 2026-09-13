import { getAllBrandSlugs, getProducts } from '../src/data';

for (const slug of getAllBrandSlugs()) {
  const prods = getProducts(slug);
  const freshStrong = prods.filter(p => 
    (p.fragranceFamily.includes('fresh') || p.fragranceFamily.includes('aquatic') || p.fragranceFamily.includes('citrus')) &&
    (p.intensity === 'strong' || p.intensity === 'projection-beast')
  );
  console.log(`${slug}: ${prods.length} total, ${freshStrong.length} fresh+strong: [${freshStrong.map(p => p.name).join(', ')}]`);
}

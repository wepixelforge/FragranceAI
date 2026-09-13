import { getProducts } from '../src/data';

const products = getProducts('tmperfumehouse');
console.log('TM Perfume House Products:');
for (const p of products) {
  console.log(`- ${p.name}: intensity=${p.intensity}, sillage=${p.sillage}, longevity=${p.longevity}, families=[${p.fragranceFamily.join(', ')}]`);
}

const freshStrong = products.filter(p => 
  (p.fragranceFamily.includes('fresh') || p.fragranceFamily.includes('aquatic') || p.fragranceFamily.includes('citrus')) &&
  (p.intensity === 'strong' || p.intensity === 'projection-beast')
);
console.log('\nFresh + Strong in TM Perfume House:', freshStrong.map(p => p.name));

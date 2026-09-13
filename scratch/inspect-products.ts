import { getProducts } from '../src/data';

for (const slug of ['tmperfumehouse', 'arabianaroma', 'almaham', 'worldofperfumers']) {
  console.log(`\n=== Brand: ${slug} ===`);
  const prods = getProducts(slug);
  for (const p of prods) {
    const isDate = p.occasion.some(o => o.toLowerCase().includes('date') || o.toLowerCase().includes('evening'));
    const isSweet = p.fragranceFamily.some(f => f.toLowerCase().includes('sweet') || f.toLowerCase().includes('gourmand')) || p.sweetness === 'sweet' || p.sweetness === 'very-sweet';
    const isStrong = p.intensity === 'strong' || p.intensity === 'projection-beast' || p.longevity === 'beast-mode';
    if (isDate && !isSweet && isStrong) {
      console.log(`MATCH: ${p.id} (${p.name}) | ${p.fragranceFamily.join('/')} | intensity: ${p.intensity}`);
    }
  }
}

import { Product } from '@/types/product';

/**
 * Deterministically enriches any Product with structured nuance attributes
 * if they are not already explicitly specified in the catalogue data.
 * This guarantees that ranking, filtering, and explanation never encounter undefined values.
 */
export function enrichProduct(product: Product): Product {
  const p = { ...product };

  // Helper tokens
  const allNotes = [
    ...p.topNotes,
    ...p.heartNotes,
    ...p.baseNotes,
    ...p.tags,
    p.description,
    p.name,
  ].map((s) => s.toLowerCase());

  const hasToken = (tokens: string[]) =>
    tokens.some((token) => allNotes.some((n) => n.includes(token)));

  // 1. Sillage & Projection
  // Decoupled from intensity: a product may be strong intensity with moderate sillage, or vice-versa.
  if (!p.sillage) {
    if (p.projection) {
      p.sillage = p.projection;
    } else if (
      hasToken(['room filler', 'enormous projection', 'fill the room', 'beast mode projection'])
    ) {
      p.sillage = 'enormous';
    } else if (
      hasToken(['projection', 'bold', 'statement', 'own the room', 'clubbing']) ||
      p.tags.some((t) => t.toLowerCase() === 'projection') ||
      (p.intensity === 'strong' && p.longevity === 'beast-mode')
    ) {
      p.sillage = 'strong';
    } else if (
      hasToken(['skin scent', 'skin-scent', 'intimate', 'close to skin', 'inoffensive']) ||
      p.tags.some((t) => t.toLowerCase() === 'skin-scent')
    ) {
      p.sillage = 'intimate';
    } else if (p.intensity === 'subtle') {
      p.sillage = 'intimate';
    } else {
      p.sillage = 'moderate';
    }
  }

  if (!p.projection) {
    p.projection = p.sillage;
  }

  // 2. Sweetness
  if (!p.sweetness) {
    if (p.fragranceFamily.includes('gourmand')) {
      p.sweetness = 'very-sweet';
    } else if (
      p.fragranceFamily.includes('sweet') ||
      hasToken(['vanilla', 'caramel', 'honey', 'sugar', 'praline', 'tonka', 'chocolate'])
    ) {
      const sweetCount = ['vanilla', 'caramel', 'sugar', 'praline', 'chocolate'].filter((t) =>
        hasToken([t])
      ).length;
      p.sweetness = sweetCount >= 2 ? 'very-sweet' : 'sweet';
    } else if (hasToken(['amber', 'jasmine', 'raspberry', 'peach', 'plum'])) {
      p.sweetness = 'subtle';
    } else {
      p.sweetness = 'none';
    }
  }

  // 3. Freshness
  if (!p.freshness) {
    if (
      p.fragranceFamily.includes('fresh') ||
      p.fragranceFamily.includes('aquatic') ||
      p.fragranceFamily.includes('citrus')
    ) {
      const freshTokens = ['lemon', 'bergamot', 'sea salt', 'marine', 'mint', 'lime', 'grapefruit', 'aldehydes'];
      const freshCount = freshTokens.filter((t) => hasToken([t])).length;
      p.freshness = freshCount >= 2 ? 'very-fresh' : 'fresh';
    } else if (hasToken(['tea', 'lavender', 'apple', 'green', 'neroli', 'clean'])) {
      p.freshness = 'moderate';
    } else {
      p.freshness = 'subtle';
    }
  }

  // 4. Warmth
  // Scent temperature: dominant fresh/aquatic/citrus signals take precedence over single woody base notes.
  if (!p.warmth) {
    const isAquaticFresh =
      p.fragranceFamily.includes('aquatic') ||
      p.fragranceFamily.includes('fresh') ||
      p.fragranceFamily.includes('citrus') ||
      p.freshness === 'very-fresh';

    const hasStrongWarmNotes = hasToken(['amber', 'cinnamon', 'clove', 'benzoin', 'incense', 'resinous', 'warm']);
    const hasHeavyOriental = p.fragranceFamily.includes('oriental');

    // Fresh/aquatic dominance: a single cedar or musk base note in an aquatic scent does NOT make it warm.
    if (isAquaticFresh && !hasHeavyOriental && !hasToken(['amber', 'benzoin', 'cinnamon'])) {
      p.warmth = (p.freshness === 'very-fresh' || p.fragranceFamily.includes('aquatic')) ? 'cool' : 'neutral';
    } else if (
      hasHeavyOriental ||
      hasStrongWarmNotes
    ) {
      const warmCount = ['amber', 'cinnamon', 'benzoin', 'incense', 'leather'].filter((t) =>
        hasToken([t])
      ).length;
      p.warmth = warmCount >= 2 ? 'very-warm' : 'warm';
    } else if (
      p.fragranceFamily.includes('woody') ||
      hasToken(['sandalwood', 'tonka', 'cardamom', 'leather'])
    ) {
      p.warmth = 'warm';
    } else if (p.freshness === 'fresh') {
      p.warmth = 'neutral';
    } else {
      p.warmth = 'neutral';
    }
  }

  // 5. Oud Level
  if (!p.oudLevel) {
    if (p.name.toLowerCase().includes('oud') || p.fragranceFamily.includes('oud')) {
      p.oudLevel = 'dominant';
    } else if (hasToken(['agarwood', 'oudh', 'oud'])) {
      p.oudLevel = 'moderate';
    } else {
      p.oudLevel = 'none';
    }
  }

  // 6. Woody Level
  if (!p.woodyLevel) {
    if (p.fragranceFamily.includes('woody')) {
      const woodCount = ['cedar', 'sandalwood', 'vetiver', 'guaiac', 'oakmoss', 'cypress', 'pine'].filter(
        (w) => hasToken([w])
      ).length;
      p.woodyLevel = woodCount >= 2 ? 'dominant' : 'moderate';
    } else if (hasToken(['cedar', 'sandalwood', 'vetiver', 'wood', 'cashmeran'])) {
      p.woodyLevel = 'subtle';
    } else {
      p.woodyLevel = 'none';
    }
  }

  // 7. Spicy Level
  if (!p.spicyLevel) {
    if (p.fragranceFamily.includes('spicy')) {
      const spiceCount = ['black pepper', 'cardamom', 'cinnamon', 'saffron', 'pink pepper', 'clove'].filter(
        (s) => hasToken([s])
      ).length;
      p.spicyLevel = spiceCount >= 2 ? 'dominant' : 'moderate';
    } else if (hasToken(['pepper', 'cardamom', 'saffron', 'cinnamon', 'spicy'])) {
      p.spicyLevel = 'subtle';
    } else {
      p.spicyLevel = 'none';
    }
  }

  // 8. Availability
  if (!p.availability) {
    p.availability = 'in-stock';
  }

  return p;
}

export function enrichProducts(products: Product[]): Product[] {
  return products.map(enrichProduct);
}

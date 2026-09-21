/**
 * Canonical The Scent Stories product photography.
 *
 * Source of truth: product.id → official Odoo product.template image
 * from thescentstories.com (not catalogue order, not recommendation order).
 *
 * Each URL is the featured image of the matching official product page.
 * Format-specific SKUs keep their own photography (sample ≠ pocket ≠ 10ml ≠ 100ml).
 *
 * Visual content was checked against the official PDP, not only HTTP 200.
 */

const officialTssImage = (templateId: number): string =>
  `https://thescentstories.com/web/image/product.template/${templateId}/image_1024`;

export const TSS_PRODUCT_IMAGES: Readonly<Record<string, string>> = {
  // Samples
  'tss-01': officialTssImage(34861), // Arabiyat Prestige Al Noor EDP 2 ML
  'tss-02': officialTssImage(34860), // Arabiyat Prestige Safa EDP 2 ML Official Sample
  'tss-03': officialTssImage(34855), // Zimaya Fatima Extrait 2 ML Official Sample
  'tss-04': officialTssImage(34684), // Calvin Klein Cotton Musk 1.2 ML
  'tss-05': officialTssImage(34683), // Calvin Klein Silky Coconut 1.2 ML
  'tss-06': officialTssImage(34682), // Calvin Klein Nude Vanilla 1.2 ML
  'tss-07': officialTssImage(34681), // Calvin Klein Sheer Peach 1.2 ML
  'tss-08': officialTssImage(32138), // Roberto Cavalli Paradiso EDP 1.2ml Official Sample
  'tss-09': officialTssImage(30039), // Arabiyat Prestige Marwa EDP 2ml Official Sample
  'tss-10': officialTssImage(30036), // Aquolina Pink Sugar Sensual EDT 1.2ml
  'tss-11': officialTssImage(29778), // Ahmed Summer Oud EDP 3ml Official Sample
  'tss-12': officialTssImage(8971), // MFK Baccarat Rouge 540 EDP 2 ml Official Sample
  'tss-13': officialTssImage(35030), // MFK Baccarat Rouge 540 Extrait 2 ml Official Sample
  'tss-14': officialTssImage(9066), // MFK Oud Satin Mood EDP 2 ml Official Sample
  'tss-15': officialTssImage(35177), // MFK Gentle Fluidity EDP 2 ml
  'tss-16': officialTssImage(35180), // MFK Aqua Celestia Cologne Forte EDP 2 ml
  'tss-17': officialTssImage(9000), // MFK Amyris Homme Extrait 2 ml Official Sample

  // Pocket / travel
  'tss-18': officialTssImage(11223), // YSL Mon Paris EDP 3 ml
  'tss-19': officialTssImage(11341), // Trussardi Riflesso EDT 10 ml
  'tss-20': officialTssImage(11315), // Diesel Spirit of The Brave EDT 10 ml
  'tss-21': officialTssImage(34940), // Hugo Boss Just Different EDT 8 ml
  'tss-22': officialTssImage(11252), // Narciso Rodriguez Forever EDP 4 ml
  'tss-23': officialTssImage(35184), // Mercedes-Benz Club Black EDT 10 ml (not the 100 ml listing)
  'tss-24': officialTssImage(11318), // Hermès H24 EDP 12.5 ml
  'tss-38': officialTssImage(35172), // Coach Floral EDP 7.5 ml

  // Miniatures
  'tss-25': officialTssImage(26256), // Versace Dylan Blue EDT 5 ml Miniature
  'tss-26': officialTssImage(26248), // Ferragamo Intense Leather EDP 5 ml Miniature
  'tss-27': officialTssImage(26247), // Ferragamo Bright Leather EDT 5 ml Miniature

  // Discovery sets
  'tss-28': officialTssImage(23634), // Gucci Flora 3×1.5 ml Discovery Set
  'tss-29': officialTssImage(23622), // Memo Paris EDP 7×1.5 ml Discovery Set
  'tss-30': officialTssImage(34695), // Nishane Time Capsule Collection 5×2 ml
  'tss-31': officialTssImage(35195), // Burberry Garden Roses EDP 10×4 ml
  'tss-32': officialTssImage(35169), // Atkinsons Discovery Set 12×1.2 ml
  'tss-33': officialTssImage(32123), // Nishane X Collection Extrait Discovery Set

  // Tester / larger MFK sizes
  'tss-34': officialTssImage(31115), // BR540 Extrait 5 ml without box
  'tss-35': officialTssImage(34156), // BR540 EDP 10 ml
  'tss-36': officialTssImage(34158), // BR540 Extrait 10 ml
  'tss-37': officialTssImage(11232), // MFK Gentle Fluidity Silver EDP 5 ml
};

export function getTssProductImageUrl(productId: string): string | undefined {
  return TSS_PRODUCT_IMAGES[productId];
}

export function applyTssCanonicalImages<T extends { id: string; imageUrl?: string }>(products: T[]): T[] {
  return products.map((product) => {
    const imageUrl = TSS_PRODUCT_IMAGES[product.id];
    return imageUrl ? { ...product, imageUrl } : product;
  });
}

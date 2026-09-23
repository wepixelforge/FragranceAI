/**
 * Canonical Scentira product photography.
 * Source of truth: product.id → official Shopify CDN image from the matching
 * scentira.in product page. Not catalogue order. Demo approximations are not used.
 */

export const SCENTIRA_PRODUCT_IMAGES: Readonly<Record<string, string>> = {
  "scentira-001": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/lattafa-khamrah-waha-eau-de-parfum-perfume-6139857.png?v=1782869534",
  "scentira-002": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/lattafa-khamrah-waha-eau-de-parfum-perfume-6139857.png?v=1782869534",
  "scentira-003": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/lattafa-khamrah-waha-eau-de-parfum-perfume-6139857.png?v=1782869534",
  "scentira-004": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/lattafa-khamrah-waha-eau-de-parfum-perfume-2324518.png?v=1782869536",
  "scentira-005": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Lattafa_Khamrah_Dukhan_EDP_1_f3a9eb64-bf8e-4f7e-abfb-461d4ffc5020.png?v=1756888761",
  "scentira-006": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ChatGPT_Image_Jul_2_2026_12_26_18_PM.png?v=1782975499",
  "scentira-007": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitled_design__1__variant.png?v=1787385090",
  "scentira-008": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitled_design__1__variant.png?v=1787385090",
  "scentira-009": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Rasasi_Hawas_Tropical_Eau_de_Parfum_19172859-2e58-4106-a139-0780dd8ba7b4.png?v=1774613194",
  "scentira-010": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/My_Perfumes_Leather_of_Men_Eau_de_Parfum.png?v=1763120781",
  "scentira-011": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ajmal-wave-eau-de-parfum-perfume-3141115.png?v=1782869355",
  "scentira-012": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ajmal-cyan-oud-eau-de-parfum-perfume-3247116.png?v=1782869424",
  "scentira-013": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/arabiyat-prestige-raees-aurum-eau-de-parfum-perfume-9867812.png?v=1782869419",
  "scentira-014": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/rayhaan-tropical-vibe-eau-de-parfum-perfume-8085831.png?v=1782869354",
  "scentira-015": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/fragrance-world-tabac-n-coke-eau-de-parfum-perfume-1243242.png?v=1782869416",
  "scentira-016": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/french-avenue-liquid-brun-limited-edition-eau-de-parfum-perfume-3289999.png?v=1782869413",
  "scentira-017": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Arabiyat_Prestige_Marwa_Eau_de_Parfum_a9e6a9ed-e9c1-43ff-b717-e30bf6077228.png?v=1767532434",
  "scentira-018": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Lattafa_Asad_Zanzibar_Eau_de_Parfum.png?v=1762931233",
  "scentira-019": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitleddesign_1_7fca0d08-429e-424a-bb31-b547233bfaba.jpg?v=1789472629",
  "scentira-020": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Armaf_Club_De_Nuit_Sillage_Eau_De_Parfum.png?v=1761319832",
  "scentira-021": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/lattafa-fakhar-platin-eau-de-parfum-perfume-4068733.png?v=1782869474",
  "scentira-022": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Lattafa_Eclaire_Eau_de_Parfum.png?v=1762931530",
  "scentira-023": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Afnan_9Pm_Elixir_Eau_de_Parfum_3a3c3fac-f187-4b28-ab6c-9897b9e9b3d5.png?v=1767088681",
  "scentira-024": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Afnan_Turathi_Blue_Eau_De_Parfum.png?v=1761306550",
  "scentira-025": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Al_Majed_Oud_Boisee_Perfume_grande_variant.png?v=1789470903",
  "scentira-026": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Lattafa_Bade_e_Al_Oud_Amethyst_Eau_de_Parfum.png?v=1762931292",
  "scentira-027": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/riiffs-freeze-extrait-de-parfum-perfume-2239698.png?v=1782869476",
  "scentira-028": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/riiffs-costa-de-amalfi-extrait-de-parfum-perfume-9928567.png?v=1782869596",
  "scentira-029": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitled_design_0d888a8b-581e-4d2c-9b4d-a24ca5f01dcf.jpg?v=1789126822",
  "scentira-030": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ChatGPTImageSep10_2026_02_15_06PM.png?v=1789031601",
  "scentira-031": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitleddesign_4_034872fc-c10a-482f-9b15-8f03be44a3ee.jpg?v=1789722103",
  "scentira-032": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitleddesign_d76ff5c8-3f41-46a3-bc19-f8ffbd27602e.jpg?v=1789472777",
  "scentira-033": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitleddesign_1_35f4c520-b5eb-4c18-afca-69b1f6767928.jpg?v=1789709563",
  "scentira-034": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitled_design__2__variant_1.png?v=1790074373",
  "scentira-035": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/guerlain-lhomme-ideal-parfum-perfume-8247496.png?v=1782869413",
  "scentira-036": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/N63XJ_SQ1_0000000088_NO_COLOR_SLf_thumbnail.png?v=1789971898",
  "scentira-037": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Untitleddesign_3_e119c9b8-a0cd-492f-b425-7497e52540d9.jpg?v=1789978448",
  "scentira-038": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/dolce-gabbana-light-blue-eau-de-toilette-for-women-2025-launch-perfume-2383288.png?v=1782869775",
  "scentira-039": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/giorgio-armani-005396gi_02_variant_1.png?v=1788424458",
  "scentira-040": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/giorgio-armani-stronger-with-you-powerfully-eau-de-parfum-perfume-4374286.png?v=1782869361",
  "scentira-041": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/16990d6aabf860de10786273e9e55904_variant.png?v=1781866049",
  "scentira-042": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/gucci-guilty-absolu-de-parfum-pour-femme-perfume-6253197.png?v=1782869356",
  "scentira-043": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/versace-eros-najim-pour-homme-parfum-perfume-9007184.png?v=1782869549",
  "scentira-044": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/EXPLORER_MONT_BLANC_692fd3c1-f053-46e2-85b4-473e81ac6e16.png?v=1756889842",
  "scentira-045": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ChatGPT_Image_Jul_2_2026_05_02_04_PM.png?v=1782991949",
  "scentira-046": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Maison_Francis_Kurkdjian_Baccarat_Rouge_540_Eau_De_Parfum.png?v=1763119326",
  "scentira-047": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Blue_Talisman_Extrait_100ml_1800x1800_variant.png?v=1787897470",
  "scentira-048": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/375x500_95195_variant.png?v=1787901792",
  "scentira-049": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ChatGPTImageAug20_2026_05_41_37PM-compressed.jpg?v=1787228034",
  "scentira-050": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ChatGPT_Image_Jul_3_2026_03_56_44_PM.png?v=1783074426",
  "scentira-051": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Maison_Margiela_Replica_By_The_Fireplace_Eau_De_Toilette.png?v=1763119768",
  "scentira-052": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Diptyque_Tam_Dao_Eau_De_Parfum.png?v=1761306362",
  "scentira-053": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/byredo-gypsy-water-eau-de-parfum-perfume-1583861.png?v=1782869475",
  "scentira-054": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/ChatGPTImageSep3_2026_05_02_29PM.png?v=1788435210",
  "scentira-055": "https://cdn.shopify.com/s/files/1/0591/0180/6670/files/Maison_Margiela_Replica_Beach_Walk_Eau_De_Toilette.png?v=1767865725",
};

export function getScentiraProductImageUrl(productId: string): string | undefined {
  return SCENTIRA_PRODUCT_IMAGES[productId];
}

export function applyScentiraCanonicalImages<T extends { id: string; imageUrl?: string }>(products: T[]): T[] {
  return products.map((product) => {
    const imageUrl = SCENTIRA_PRODUCT_IMAGES[product.id];
    return imageUrl ? { ...product, imageUrl } : product;
  });
}

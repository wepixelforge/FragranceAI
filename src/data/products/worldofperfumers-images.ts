/**
 * Canonical World of Perfumers product photography.
 *
 * Source of truth: product.id → official Shopify 50ml Perfume variant image
 * from worldofperfumers.com (not catalogue order, not recommendation order).
 *
 * Each URL is the featured image of the matching product's "Perfume / 50ml"
 * variant on the live store. Filenames include the product name.
 */
export const WOP_PRODUCT_IMAGES: Readonly<Record<string, string>> = {
  'wop-01':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Aventor_Perfume_50ml_inspired_by_Creed_s_Aventus.webp?v=1789543496',
  'wop-02':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Imagine_Perfume_50ml_inspired_by_Louis_Vuitton_s_Imagination_76563049-d43d-4ffc-8da7-11f6dca5b3d6.webp?v=1789685585',
  'wop-03':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Blue_Perfume_50ml_inspired_by_Chanel_s_Bleu_De_Chanel.webp?v=1789573758',
  'wop-04':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Savage_Perfume_50ml_inspired_by_Christian_Dior_s_Sauvage_778754af-40e2-4fb9-a22c-d6310232613d.webp?v=1789763524',
  'wop-05':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Amberwood_Perfume_50ml_inspired_by_Tom_Ford_s_Oud_Wood.webp?v=1789540043',
  'wop-06':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Azure_Perfume_50ml_inspired_by_Giorgio_Armani_s_Acqua_Di_Gio.webp?v=1789544308',
  'wop-07':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Vanilla_Perfume_50ml_inspired_by_Kayali_s_Vanilla_28_Kayali_88a9f3f4-dbd1-4c43-8216-9a2ace2fa9cb.webp?v=1789827894',
  'wop-08':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Floral_Perfume_50ml_inspired_by_Gucci_s_Flora.webp?v=1789588208',
  'wop-09':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Daoo_Perfume_50ml_inspired_by_Diptyque_s_Tam_Dao_3e8e30f5-65b9-4782-9a71-974014c0e997.webp?v=1789584011',
  'wop-10':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Angel_Perfume_50ml_inspired_by_Kilian_s_Angel_Share_b89bc337-b8e4-43e6-b6e2-90e3baa3adad.webp?v=1789542260',
  'wop-11':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Luxe_Perfume_50ml_inspired_by_Tom_Ford_s_Ombre_Leather.webp?v=1789687146',
  'wop-12':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Silver_Perfume_50ml_inspired_by_Creed_s_Silver_Mountain_Water.webp?v=1789764935',
  'wop-13':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Male_Perfume_50ml_inspired_by_Jean_Paul_Gaultier_s_Le_Male_Elixir_cc2eb831-79d3-4bd5-b26a-c4d77b5d6779.webp?v=1789687577',
  'wop-14':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Rouge_Perfume_50ml_inspired_by_MFK_Paris_Baccarat_Rouge_540.webp?v=1789762806',
  'wop-15':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_The_Million_Perfume_50ml_inspired_by_One_Million.webp?v=1789765663',
  'wop-16':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Alpha_Male_Perfume_50ml_inspired_by_Jean_Paul_Gaultier_s_Ultra_Male_135c54b2-cce5-4bf6-8b81-ebd9005e1c85.webp?v=1789539181',
  'wop-17':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Eros_Perfume_50ml_inspired_by_Versace_s_Eros_333bf84d-3040-416d-8e1d-ca0a4548e211.webp?v=1789586021',
  'wop-18':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Tobacco_V_Perfume_50ml_inspired_by_Tom_Ford_s_Tobacco_Vanille.webp?v=1789766031',
  'wop-19':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Terra_Perfume_50ml_inspired_by_Hermes_Terre_D_Hermes.webp?v=1789765201',
  'wop-20':
    'https://cdn.shopify.com/s/files/1/0844/7642/8535/files/WOPS_Cool_Perfume_50ml_inspired_by_David_Off_s_Cool_Water.webp?v=1789675183',
};

export function getWopProductImageUrl(productId: string): string | undefined {
  return WOP_PRODUCT_IMAGES[productId];
}

export function applyWopCanonicalImages<T extends { id: string; imageUrl?: string }>(products: T[]): T[] {
  return products.map((product) => {
    const imageUrl = WOP_PRODUCT_IMAGES[product.id];
    return imageUrl ? { ...product, imageUrl } : product;
  });
}

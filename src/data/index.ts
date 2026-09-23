import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import { tmperfumehouse } from './brands/tmperfumehouse';
import { arabianaroma } from './brands/arabianaroma';
import { almaham } from './brands/almaham';
import { worldofperfumers } from './brands/worldofperfumers';
import { thescentstories } from './brands/thescentstories';
import { scentira } from './brands/scentira';
import { tmperfumehouseProducts } from './products/tmperfumehouse-products';
import { arabianaromaProducts } from './products/arabianaroma-products';
import { almahamProducts } from './products/almaham-products';
import { worldofperfumersProducts } from './products/worldofperfumers-products';
import { thescentstoriesProducts } from './products/thescentstories-products';
import { applyWopCanonicalImages } from './products/worldofperfumers-images';
import { applyTssCanonicalImages } from './products/thescentstories-images';
import { applyScentiraCanonicalImages } from './products/scentira-images';
import { scentiraProducts } from './products/scentira-products';
import { enrichProducts } from '@/lib/product-enricher';

function resolveBrandSlug(slug: string): string {
  return slug.toLowerCase();
}

// ── Brand Registry ──────────────────────────────────────────────────────────
export const brands: Record<string, BrandConfig> = {
  tmperfumehouse,
  arabianaroma,
  almaham,
  worldofperfumers,
  thescentstories,
  scentira,
};

// ── Product Registry ────────────────────────────────────────────────────────
const productsByBrand: Record<string, Product[]> = {
  tmperfumehouse: enrichProducts(tmperfumehouseProducts),
  arabianaroma: enrichProducts(arabianaromaProducts),
  almaham: enrichProducts(almahamProducts),
  worldofperfumers: applyWopCanonicalImages(enrichProducts(worldofperfumersProducts)),
  thescentstories: applyTssCanonicalImages(enrichProducts(thescentstoriesProducts)),
  scentira: applyScentiraCanonicalImages(enrichProducts(scentiraProducts)),
};

// ── Public API ──────────────────────────────────────────────────────────────
export function getBrand(slug: string): BrandConfig | undefined {
  return brands[resolveBrandSlug(slug)];
}

export function getProducts(brandSlug: string): Product[] {
  return productsByBrand[resolveBrandSlug(brandSlug)] ?? [];
}

export function getProduct(brandSlug: string, productSlug: string): Product | undefined {
  return getProducts(brandSlug).find((p) => p.slug === productSlug);
}

export function getFeaturedProducts(brandSlug: string): Product[] {
  const products = getProducts(brandSlug);
  const featured = products.filter((p) => p.featured);
  return featured.length > 0 ? featured : products.slice(0, 4);
}

export function getAllBrandSlugs(): string[] {
  return Object.keys(brands);
}

export function getAllProducts(): Product[] {
  return Object.values(productsByBrand).flat();
}

export function getProductById(productId: string): { product: Product; brand: BrandConfig } | undefined {
  for (const [slug, prods] of Object.entries(productsByBrand)) {
    const found = prods.find((p) => p.id === productId);
    if (found) {
      return { product: found, brand: brands[slug] };
    }
  }
  return undefined;
}

/**
 * Authoritative, brand-scoped product resolver.
 * Ensures products are only resolved within their intended storefront catalogue.
 */
export function getProductByBrandAndId(
  brandSlug: string,
  productId: string
): { product: Product; brand: BrandConfig } | undefined {
  const resolved = resolveBrandSlug(brandSlug);
  const brand = brands[resolved];
  if (!brand) return undefined;
  const prods = productsByBrand[resolved] ?? [];
  const found = prods.find((p) => p.id === productId || p.slug === productId);
  if (found) {
    return { product: found, brand };
  }
  return undefined;
}

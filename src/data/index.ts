import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import { tmperfumehouse } from './brands/tmperfumehouse';
import { arabianaroma } from './brands/arabianaroma';
import { almaham } from './brands/almaham';
import { worldofperfumers } from './brands/worldofperfumers';
import { tmperfumehouseProducts } from './products/tmperfumehouse-products';
import { arabianaromaProducts } from './products/arabianaroma-products';
import { almahamProducts } from './products/almaham-products';
import { worldofperfumersProducts } from './products/worldofperfumers-products';

// ── Brand Registry ──────────────────────────────────────────────────────────
export const brands: Record<string, BrandConfig> = {
  tmperfumehouse,
  arabianaroma,
  almaham,
  worldofperfumers,
};

import { enrichProducts } from '@/lib/product-enricher';

// ── Product Registry ────────────────────────────────────────────────────────
const productsByBrand: Record<string, Product[]> = {
  tmperfumehouse: enrichProducts(tmperfumehouseProducts),
  arabianaroma: enrichProducts(arabianaromaProducts),
  almaham: enrichProducts(almahamProducts),
  worldofperfumers: enrichProducts(worldofperfumersProducts),
};

// ── Public API ──────────────────────────────────────────────────────────────
export function getBrand(slug: string): BrandConfig | undefined {
  return brands[slug];
}

export function getProducts(brandSlug: string): Product[] {
  return productsByBrand[brandSlug] ?? [];
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

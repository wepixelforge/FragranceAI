import { BrandConfig } from '@/types/brand';

/**
 * Generate CSS custom properties from brand colors.
 * Applied as inline style on the brand layout wrapper.
 */
export function getBrandCssVars(brand: BrandConfig): Record<string, string> {
  return {
    '--brand-primary': brand.colors.primary,
    '--brand-primary-fg': brand.colors.primaryForeground,
    '--brand-accent': brand.colors.accent,
    '--brand-accent-fg': brand.colors.accentForeground,
    '--brand-bg': brand.colors.background,
    '--brand-surface': brand.colors.surface,
    '--brand-surface-hover': brand.colors.surfaceHover,
    '--brand-text': brand.colors.text,
    '--brand-text-muted': brand.colors.textMuted,
    '--brand-border': brand.colors.border,
    '--brand-border-light': brand.colors.borderLight,
  };
}

/**
 * Format price in Indian Rupees.
 */
export function formatPrice(price: number): string {
  return `₹${price.toLocaleString('en-IN')}`;
}

/**
 * Generate a product image placeholder color based on product name.
 */
export function getProductPlaceholderGradient(productName: string): string {
  const hash = productName
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);

  const gradients = [
    'from-amber-100 to-orange-50',
    'from-rose-100 to-pink-50',
    'from-violet-100 to-purple-50',
    'from-emerald-100 to-teal-50',
    'from-sky-100 to-blue-50',
    'from-stone-200 to-stone-100',
    'from-amber-200 to-yellow-100',
    'from-slate-200 to-slate-100',
  ];

  return gradients[hash % gradients.length];
}

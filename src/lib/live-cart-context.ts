import { getProductByBrandAndId } from '@/data';
import { formatPrice, STOREFRONT_CURRENCY } from './brand-utils';

export interface CartRequestItem {
  productId: string;
  brandSlug?: string;
  quantity: number;
}

export interface CartRequestPayload {
  items: CartRequestItem[];
  itemCount: number;
  subtotal: number;
}

export interface LiveCartLine {
  productId: string;
  brandSlug: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitPriceFormatted: string;
  lineTotal: number;
  lineTotalFormatted: string;
}

export interface LiveCartContext {
  brandSlug: string;
  isEmpty: boolean;
  itemCount: number;
  items: LiveCartLine[];
  subtotal: number;
  subtotalFormatted: string;
  currency: typeof STOREFRONT_CURRENCY;
}

export function serializeCartRequestPayload(
  brandSlug: string,
  items: { productId: string; brandSlug?: string; quantity: number }[]
): CartRequestPayload {
  const scoped = (items || [])
    .filter((item) => item && typeof item.productId === 'string')
    .filter((item) => !item.brandSlug || item.brandSlug === brandSlug)
    .map((item) => ({
      productId: item.productId,
      brandSlug,
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? Math.floor(item.quantity) : 1,
    }));

  let subtotal = 0;
  let itemCount = 0;
  for (const item of scoped) {
    const resolved = getProductByBrandAndId(brandSlug, item.productId);
    if (!resolved) continue;
    itemCount += item.quantity;
    subtotal += resolved.product.price * item.quantity;
  }

  return {
    items: scoped,
    itemCount,
    subtotal,
  };
}

export function buildLiveCartContext(
  brandSlug: string,
  cart?: { items?: CartRequestItem[]; itemCount?: number; subtotal?: number } | null
): LiveCartContext {
  const lines: LiveCartLine[] = [];

  for (const item of cart?.items || []) {
    if (!item?.productId) continue;
    if (item.brandSlug && item.brandSlug !== brandSlug) continue;
    const resolved = getProductByBrandAndId(brandSlug, item.productId);
    if (!resolved) continue;
    const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? Math.floor(item.quantity) : 1;
    const unitPrice = resolved.product.price;
    const lineTotal = unitPrice * quantity;
    lines.push({
      productId: item.productId,
      brandSlug,
      name: resolved.product.name,
      quantity,
      unitPrice,
      unitPriceFormatted: formatPrice(unitPrice),
      lineTotal,
      lineTotalFormatted: formatPrice(lineTotal),
    });
  }

  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  return {
    brandSlug,
    isEmpty: lines.length === 0,
    itemCount,
    items: lines,
    subtotal,
    subtotalFormatted: formatPrice(subtotal),
    currency: STOREFRONT_CURRENCY,
  };
}

export function toResponseCartContext(liveCart: LiveCartContext) {
  return {
    itemCount: liveCart.itemCount,
    isEmpty: liveCart.isEmpty,
    items: liveCart.items.map((line) => ({
      productId: line.productId,
      brandSlug: line.brandSlug,
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      unitPriceFormatted: line.unitPriceFormatted,
      price: line.unitPrice,
    })),
    subtotal: liveCart.subtotal,
    subtotalFormatted: liveCart.subtotalFormatted,
    currency: liveCart.currency,
  };
}

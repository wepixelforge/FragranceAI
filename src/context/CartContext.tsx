'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Product } from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { getProductByBrandAndId, getAllBrandSlugs } from '@/data';

export interface CartItem {
  productId: string;
  brandSlug: string;
  quantity: number;
}

export interface DetailedCartItem {
  product: Product;
  brand: BrandConfig;
  quantity: number;
}

export interface CartToastState {
  visible: boolean;
  product: Product | null;
  brandSlug?: string;
  message?: string;
}

export interface CartContextValue {
  // Global partitioned state
  cartsByBrand: Record<string, CartItem[]>;
  isHydrated: boolean;

  // Brand-scoped retrieval & mutations
  getBrandItems: (brandSlug: string) => CartItem[];
  getBrandItemCount: (brandSlug: string) => number;
  getBrandSubtotal: (brandSlug: string) => number;
  getBrandCartDetails: (brandSlug: string) => DetailedCartItem[];
  isProductInBrandCart: (productId: string, brandSlug: string) => boolean;
  addItemToBrand: (productId: string, brandSlug: string, quantity?: number) => boolean;
  removeItemFromBrand: (productId: string, brandSlug: string) => void;
  updateBrandQuantity: (productId: string, brandSlug: string, quantity: number) => void;
  clearBrandCart: (brandSlug: string) => void;

  // Toast
  toast: CartToastState;
  showToast: (product: Product, brandSlug: string, message?: string) => void;
  hideToast: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const LEGACY_STORAGE_KEY = 'fragrance-cart';
const getBrandStorageKey = (brandSlug: string) => `fragrance-cart:${brandSlug}`;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartsByBrand, setCartsByBrand] = useState<Record<string, CartItem[]>>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const [toast, setToast] = useState<CartToastState>({ visible: false, product: null });

  // 1. Initial Load, Migration of Legacy Data, & Brand-Scoped Validation
  useEffect(() => {
    try {
      const allSlugs = getAllBrandSlugs();
      const initialCarts: Record<string, CartItem[]> = {};
      allSlugs.forEach((slug) => {
        initialCarts[slug] = [];
      });

      // A. Safe handling of legacy un-scoped data
      try {
        const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (legacyRaw) {
          const parsedLegacy = JSON.parse(legacyRaw);
          if (Array.isArray(parsedLegacy)) {
            for (const item of parsedLegacy) {
              // Only migrate if item explicitly has a known brandSlug and resolves against that brand
              if (
                item &&
                typeof item.brandSlug === 'string' &&
                typeof item.productId === 'string' &&
                allSlugs.includes(item.brandSlug)
              ) {
                const resolved = getProductByBrandAndId(item.brandSlug, item.productId);
                if (resolved) {
                  const qty = typeof item.quantity === 'number' && item.quantity > 0 ? Math.floor(item.quantity) : 1;
                  initialCarts[item.brandSlug].push({
                    productId: item.productId,
                    brandSlug: item.brandSlug,
                    quantity: qty,
                  });
                }
              }
            }
          }
          // Remove legacy un-scoped key permanently to prevent future data cross-contamination
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      } catch (legacyErr) {
        console.warn('[CartStore] Error handling legacy cart:', legacyErr);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }

      // B. Load brand-isolated keys
      for (const slug of allSlugs) {
        const raw = localStorage.getItem(getBrandStorageKey(slug));
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const validItems: CartItem[] = [];
              for (const item of parsed) {
                if (item && typeof item.productId === 'string') {
                  const resolved = getProductByBrandAndId(slug, item.productId);
                  if (resolved) {
                    const qty = typeof item.quantity === 'number' && item.quantity > 0 ? Math.floor(item.quantity) : 1;
                    validItems.push({
                      productId: item.productId,
                      brandSlug: slug,
                      quantity: qty,
                    });
                  }
                }
              }
              // If brand key had items, take them (overriding legacy migration)
              initialCarts[slug] = validItems;
              localStorage.setItem(getBrandStorageKey(slug), JSON.stringify(validItems));
            }
          } catch (e) {
            console.warn(`[CartStore] Failed parsing cart for brand "${slug}":`, e);
          }
        } else if (initialCarts[slug].length > 0) {
          // Persist migrated items for this brand
          localStorage.setItem(getBrandStorageKey(slug), JSON.stringify(initialCarts[slug]));
        }
      }

      setCartsByBrand(initialCarts);
    } catch (err) {
      console.warn('[CartStore] Error during cart hydration:', err);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Toast controls
  const showToast = useCallback((product: Product, brandSlug: string, message?: string) => {
    setToast({ visible: true, product, brandSlug, message });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    if (!toast.visible) return;
    const timer = setTimeout(() => {
      hideToast();
    }, 4500);
    return () => clearTimeout(timer);
  }, [toast.visible, hideToast]);

  // Brand-scoped queries
  const getBrandItems = useCallback(
    (brandSlug: string): CartItem[] => {
      return cartsByBrand[brandSlug] || [];
    },
    [cartsByBrand]
  );

  const isProductInBrandCart = useCallback(
    (productId: string, brandSlug: string): boolean => {
      const items = cartsByBrand[brandSlug] || [];
      return items.some((i) => i.productId === productId);
    },
    [cartsByBrand]
  );

  const getBrandItemCount = useCallback(
    (brandSlug: string): number => {
      const items = cartsByBrand[brandSlug] || [];
      return items.reduce((total, i) => total + i.quantity, 0);
    },
    [cartsByBrand]
  );

  const getBrandCartDetails = useCallback(
    (brandSlug: string): DetailedCartItem[] => {
      const items = cartsByBrand[brandSlug] || [];
      const list: DetailedCartItem[] = [];
      for (const item of items) {
        const lookup = getProductByBrandAndId(brandSlug, item.productId);
        if (lookup) {
          list.push({
            product: lookup.product,
            brand: lookup.brand,
            quantity: item.quantity,
          });
        }
      }
      return list;
    },
    [cartsByBrand]
  );

  const getBrandSubtotal = useCallback(
    (brandSlug: string): number => {
      const details = getBrandCartDetails(brandSlug);
      return details.reduce((total, item) => total + item.product.price * item.quantity, 0);
    },
    [getBrandCartDetails]
  );

  // Brand-scoped mutations
  const addItemToBrand = useCallback(
    (productId: string, brandSlug: string, quantity = 1): boolean => {
      const lookup = getProductByBrandAndId(brandSlug, productId);
      if (!lookup) {
        console.warn(`[CartStore] Cannot add product "${productId}" to brand "${brandSlug}": not found in catalogue.`);
        return false;
      }

      setCartsByBrand((prev) => {
        const brandItems = prev[brandSlug] || [];
        const existingIdx = brandItems.findIndex((i) => i.productId === productId);
        let updated: CartItem[];

        if (existingIdx > -1) {
          updated = [...brandItems];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + (quantity > 0 ? quantity : 1),
          };
        } else {
          updated = [
            ...brandItems,
            {
              productId,
              brandSlug,
              quantity: quantity > 0 ? quantity : 1,
            },
          ];
        }

        try {
          localStorage.setItem(getBrandStorageKey(brandSlug), JSON.stringify(updated));
        } catch (e) {
          console.warn(`[CartStore] Failed saving cart for brand "${brandSlug}":`, e);
        }

        return {
          ...prev,
          [brandSlug]: updated,
        };
      });

      showToast(lookup.product, brandSlug);
      return true;
    },
    [showToast]
  );

  const removeItemFromBrand = useCallback((productId: string, brandSlug: string) => {
    setCartsByBrand((prev) => {
      const brandItems = prev[brandSlug] || [];
      const updated = brandItems.filter((i) => i.productId !== productId);

      try {
        localStorage.setItem(getBrandStorageKey(brandSlug), JSON.stringify(updated));
      } catch (e) {
        console.warn(`[CartStore] Failed removing item from brand "${brandSlug}":`, e);
      }

      return {
        ...prev,
        [brandSlug]: updated,
      };
    });
  }, []);

  const updateBrandQuantity = useCallback((productId: string, brandSlug: string, quantity: number) => {
    setCartsByBrand((prev) => {
      const brandItems = prev[brandSlug] || [];
      let updated: CartItem[];

      if (quantity <= 0) {
        updated = brandItems.filter((i) => i.productId !== productId);
      } else {
        updated = brandItems.map((item) =>
          item.productId === productId ? { ...item, quantity: Math.floor(quantity) } : item
        );
      }

      try {
        localStorage.setItem(getBrandStorageKey(brandSlug), JSON.stringify(updated));
      } catch (e) {
        console.warn(`[CartStore] Failed updating quantity for brand "${brandSlug}":`, e);
      }

      return {
        ...prev,
        [brandSlug]: updated,
      };
    });
  }, []);

  const clearBrandCart = useCallback((brandSlug: string) => {
    setCartsByBrand((prev) => {
      try {
        localStorage.setItem(getBrandStorageKey(brandSlug), JSON.stringify([]));
      } catch (e) {
        console.warn(`[CartStore] Failed clearing cart for brand "${brandSlug}":`, e);
      }

      return {
        ...prev,
        [brandSlug]: [],
      };
    });
  }, []);

  return (
    <CartContext.Provider
      value={{
        cartsByBrand,
        isHydrated,
        getBrandItems,
        getBrandItemCount,
        getBrandSubtotal,
        getBrandCartDetails,
        isProductInBrandCart,
        addItemToBrand,
        removeItemFromBrand,
        updateBrandQuantity,
        clearBrandCart,
        toast,
        showToast,
        hideToast,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

/**
 * Hook to access cart state and actions.
 * If scopedBrandSlug is passed, or if called inside a /[brandSlug]/ route,
 * all cart properties (items, itemCount, subtotal, etc.) are automatically
 * scoped strictly to that brand storefront.
 */
export function useCart(scopedBrandSlug?: string) {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }

  const params = useParams();
  const routeBrandSlug = typeof params?.brandSlug === 'string' ? params.brandSlug : undefined;
  const activeBrandSlug = scopedBrandSlug || routeBrandSlug || 'tmperfumehouse';

  const items = useMemo(() => {
    return context.getBrandItems(activeBrandSlug);
  }, [context, activeBrandSlug]);

  const itemCount = useMemo(() => {
    return context.getBrandItemCount(activeBrandSlug);
  }, [context, activeBrandSlug]);

  const subtotal = useMemo(() => {
    return context.getBrandSubtotal(activeBrandSlug);
  }, [context, activeBrandSlug]);

  const detailedItems = useMemo(() => {
    return context.getBrandCartDetails(activeBrandSlug);
  }, [context, activeBrandSlug]);

  const isInCart = useCallback(
    (productId: string, brandSlugOverride?: string): boolean => {
      return context.isProductInBrandCart(productId, brandSlugOverride || activeBrandSlug);
    },
    [context, activeBrandSlug]
  );

  const addItem = useCallback(
    (productId: string, brandSlugOverride?: string, quantity = 1): boolean => {
      return context.addItemToBrand(productId, brandSlugOverride || activeBrandSlug, quantity);
    },
    [context, activeBrandSlug]
  );

  const removeItem = useCallback(
    (productId: string, brandSlugOverride?: string): void => {
      context.removeItemFromBrand(productId, brandSlugOverride || activeBrandSlug);
    },
    [context, activeBrandSlug]
  );

  const updateQuantity = useCallback(
    (productId: string, quantityOrBrand: number | string, possibleQuantity?: number): void => {
      if (typeof quantityOrBrand === 'number') {
        context.updateBrandQuantity(productId, activeBrandSlug, quantityOrBrand);
      } else {
        context.updateBrandQuantity(productId, quantityOrBrand, possibleQuantity || 1);
      }
    },
    [context, activeBrandSlug]
  );

  const clearCart = useCallback(
    (brandSlugOverride?: string): void => {
      context.clearBrandCart(brandSlugOverride || activeBrandSlug);
    },
    [context, activeBrandSlug]
  );

  const getCartDetails = useCallback(
    (brandSlugOverride?: string): DetailedCartItem[] => {
      return context.getBrandCartDetails(brandSlugOverride || activeBrandSlug);
    },
    [context, activeBrandSlug]
  );

  return {
    ...context,
    activeBrandSlug,
    items,
    itemCount,
    subtotal,
    detailedItems,
    isInCart,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    getCartDetails,
  };
}

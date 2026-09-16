'use client';

import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { formatPrice } from '@/lib/brand-utils';

export default function CartToast() {
  const { toast, hideToast } = useCart();

  if (!toast.visible || !toast.product) return null;

  const { product } = toast;

  return (
    <aside
      aria-label="Cart notification"
      className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-brand-surface/95 backdrop-blur-md border border-brand-border shadow-2xl p-4 transition-all duration-300 animate-slide-up"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 shrink-0 border border-brand-accent/40 bg-brand-accent/10 flex items-center justify-center text-brand-accent text-xs">
            ✓
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-brand-accent font-medium block">
              Added to your allocation
            </span>
            <h4 className="font-serif text-sm font-normal text-brand-text mt-0.5 leading-snug">
              {product.name}
            </h4>
            <div className="flex items-center gap-2 text-xs text-brand-text-muted mt-1 font-light">
              <span>{product.size}</span>
              <span>·</span>
              <span className="font-serif text-brand-text font-normal">{formatPrice(product.price)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={hideToast}
          className="text-brand-text-muted hover:text-brand-text p-1 transition-colors text-xs"
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>

      <div className="mt-4 pt-3 border-t border-brand-border flex items-center justify-between gap-2">
        <button
          onClick={hideToast}
          className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted hover:text-brand-text transition-colors py-1"
        >
          Continue Browsing
        </button>
        <Link
          href={`/${toast.brandSlug || product.brandSlug || 'tmperfumehouse'}/cart`}
          onClick={hideToast}
          className="inline-flex items-center gap-1.5 border border-brand-accent bg-brand-accent px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-brand-primary-fg hover:bg-transparent hover:text-brand-text transition-all duration-200"
        >
          View Cart →
        </Link>
      </div>
    </aside>
  );
}

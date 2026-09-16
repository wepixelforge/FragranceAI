'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { getBrand } from '@/data';
import { formatPrice } from '@/lib/brand-utils';
import BottleVisual from '@/components/shop/BottleVisual';

export default function CartPage() {
  const params = useParams();
  const brandSlug = (params?.brandSlug as string) || 'tmperfumehouse';
  const brand = getBrand(brandSlug) || getBrand('tmperfumehouse')!;

  const { items, getCartDetails, updateQuantity, removeItem, clearCart, subtotal, itemCount } = useCart(brandSlug);
  const detailedItems = getCartDetails(brandSlug);

  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);

  return (
    <div className="min-h-[75vh] bg-brand-bg text-brand-text py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        
        {/* Editorial Header */}
        <div className="border-b border-brand-border pb-6 flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-4">
          <div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-brand-accent font-medium block">
              Shopping Cart &mdash; Client Allocation
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl font-normal text-brand-text mt-1">
              Your Allocation
            </h1>
          </div>
          <p className="text-xs text-brand-text-muted font-light">
            {itemCount} {itemCount === 1 ? 'item' : 'items'} selected
          </p>
        </div>

        {items.length === 0 ? (
          /* Empty Cart State */
          <div className="py-20 sm:py-28 text-center max-w-md mx-auto">
            <div className="h-12 w-12 mx-auto border border-brand-border flex items-center justify-center text-brand-text-muted text-base font-serif mb-4">
              ✦
            </div>
            <h2 className="font-serif text-xl sm:text-2xl text-brand-text font-normal">
              Your Allocation is Empty
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-brand-text-muted font-light leading-relaxed">
              You have not added any fragrances to your allocation yet. Discover artisanal blends formulated with lasting sillage.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href={`/${brand.slug}/shop`}
                className="w-full sm:w-auto border border-brand-accent bg-brand-accent px-6 py-3 text-[10px] font-medium tracking-[0.22em] uppercase text-brand-primary-fg hover:bg-transparent hover:text-brand-text transition-all duration-300"
              >
                Explore Collection
              </Link>
              <Link
                href={`/${brand.slug}/finder`}
                className="w-full sm:w-auto border border-brand-border px-6 py-3 text-[10px] font-medium tracking-[0.22em] uppercase text-brand-text hover:border-brand-accent/50 hover:bg-brand-surface transition-all duration-300"
              >
                Consult Scent Advisor →
              </Link>
            </div>
          </div>
        ) : (
          /* Active Cart Grid */
          <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Items List (Left Column) */}
            <div className="lg:col-span-8 space-y-6">
              {detailedItems.map(({ product, brand: itemBrand, quantity }) => (
                <div
                  key={`${itemBrand.slug}:${product.id}`}
                  className="border border-brand-border bg-brand-surface p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 transition-colors hover:border-brand-accent/40"
                >
                  {/* Left: Thumbnail & Name */}
                  <div className="flex items-center gap-4 sm:gap-6">
                    <Link
                      href={`/${itemBrand.slug}/product/${product.slug}`}
                      className="h-20 w-20 shrink-0 border border-brand-border bg-brand-stage flex items-center justify-center overflow-hidden hover:opacity-90 transition-opacity"
                    >
                      <BottleVisual product={product} brand={itemBrand} size="sm" />
                    </Link>
                    <div>
                      <span className="text-[9px] uppercase tracking-[0.2em] text-brand-accent font-medium block">
                        {itemBrand.name}
                      </span>
                      <Link
                        href={`/${itemBrand.slug}/product/${product.slug}`}
                        className="font-serif text-lg sm:text-xl text-brand-text hover:text-brand-accent transition-colors block mt-0.5"
                      >
                        {product.name}
                      </Link>
                      <span className="text-xs text-brand-text-muted font-light block mt-1">
                        {product.size} &middot; Extrait Concentration
                      </span>
                      <span className="text-xs font-serif text-brand-text mt-1 block sm:hidden">
                        {formatPrice(product.price)} each
                      </span>
                    </div>
                  </div>

                  {/* Right: Quantity Controls, Price & Remove */}
                  <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-4 sm:pt-0 border-t sm:border-t-0 border-brand-border-light">
                    {/* Quantity Selector */}
                    <div className="flex items-center border border-brand-border bg-brand-bg">
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        className="px-3 py-1.5 text-xs text-brand-text hover:text-brand-accent transition-colors"
                        aria-label={`Decrease quantity of ${product.name}`}
                      >
                        –
                      </button>
                      <span className="px-3 py-1.5 text-xs font-medium text-brand-text min-w-[28px] text-center">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        className="px-3 py-1.5 text-xs text-brand-text hover:text-brand-accent transition-colors"
                        aria-label={`Increase quantity of ${product.name}`}
                      >
                        +
                      </button>
                    </div>

                    {/* Subtotal for this item */}
                    <div className="text-right min-w-[80px]">
                      <span className="font-serif text-base text-brand-text font-normal block">
                        {formatPrice(product.price * quantity)}
                      </span>
                      {quantity > 1 && (
                        <span className="text-[10px] text-brand-text-muted block">
                          {formatPrice(product.price)} ea
                        </span>
                      )}
                    </div>

                    {/* Remove Action */}
                    <button
                      type="button"
                      onClick={() => removeItem(product.id)}
                      className="text-brand-text-muted hover:text-red-400 p-1 text-xs transition-colors"
                      aria-label={`Remove ${product.name} from cart`}
                      title="Remove item"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}

              <div className="flex items-center justify-between pt-4">
                <Link
                  href={`/${brand.slug}/shop`}
                  className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted hover:text-brand-text transition-colors flex items-center gap-1"
                >
                  ← Continue Exploring
                </Link>
                <button
                  type="button"
                  onClick={() => clearCart()}
                  className="text-[10px] uppercase tracking-[0.2em] text-brand-text-muted hover:text-red-400 transition-colors"
                >
                  Clear Cart
                </button>
              </div>
            </div>

            {/* Order Summary (Right Column) */}
            <div className="lg:col-span-4 border border-brand-border bg-brand-surface p-6 sm:p-8 sticky top-28">
              <span className="text-[10px] uppercase tracking-[0.22em] text-brand-accent font-medium block">
                Order Breakdown
              </span>
              <h3 className="font-serif text-xl font-normal text-brand-text mt-1">
                Summary
              </h3>

              <div className="mt-6 space-y-3 text-xs border-b border-brand-border pb-6 font-light">
                <div className="flex justify-between text-brand-text-muted">
                  <span>Subtotal</span>
                  <span className="font-serif text-brand-text font-normal">{formatPrice(subtotal)}</span>
                </div>
                <div className="flex justify-between text-brand-text-muted">
                  <span>Shipping & Handling</span>
                  <span className="text-brand-accent">Complimentary</span>
                </div>
                <div className="flex justify-between text-brand-text-muted">
                  <span>Artisanal Sample Vial</span>
                  <span className="text-brand-accent">Included</span>
                </div>
              </div>

              <div className="mt-6 flex items-baseline justify-between">
                <span className="text-xs uppercase tracking-[0.2em] text-brand-text font-medium">
                  Total
                </span>
                <span className="font-serif text-2xl text-brand-text font-normal">
                  {formatPrice(subtotal)}
                </span>
              </div>

              {/* Proceed to Checkout CTA */}
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(true)}
                className="mt-8 w-full border border-brand-accent bg-brand-accent py-4 text-center text-xs font-medium uppercase tracking-[0.22em] text-brand-primary-fg hover:bg-transparent hover:text-brand-text transition-all duration-300 cursor-pointer shadow-lg"
              >
                Proceed to Checkout →
              </button>

              <div className="mt-6 text-[10px] text-brand-text-muted font-light leading-relaxed border-t border-brand-border-light pt-4 text-center">
                ✦ Demonstration Portfolio Mode &mdash; No payment is captured.
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Demo Checkout Modal */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="border border-brand-border bg-brand-surface max-w-md w-full p-6 sm:p-8 text-center shadow-2xl relative">
            <div className="h-10 w-10 mx-auto border border-brand-accent/50 bg-brand-accent/10 flex items-center justify-center text-brand-accent text-sm mb-4">
              ✦
            </div>

            <h3 className="font-serif text-xl sm:text-2xl text-brand-text font-normal">
              Portfolio Demonstration
            </h3>

            <p className="mt-3 text-xs sm:text-sm text-brand-text-muted font-light leading-relaxed">
              This ecommerce and AI consultation platform is a demonstration project. Real payment gateways (such as Stripe/Razorpay) are not connected.
            </p>

            <div className="mt-4 p-4 border border-brand-border bg-brand-bg/50 text-left text-xs text-brand-text-muted space-y-1.5 font-light">
              <div className="flex justify-between">
                <span>Total Items:</span>
                <span className="font-medium text-brand-text">{itemCount}</span>
              </div>
              <div className="flex justify-between">
                <span>Order Total:</span>
                <span className="font-serif font-normal text-brand-text">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Persistence:</span>
                <span className="text-brand-accent">Saved in localStorage</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsCheckoutModalOpen(false)}
              className="mt-6 w-full border border-brand-accent bg-brand-accent py-3 text-xs font-medium uppercase tracking-[0.2em] text-brand-primary-fg hover:bg-transparent hover:text-brand-text transition-colors"
            >
              Return to Cart
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

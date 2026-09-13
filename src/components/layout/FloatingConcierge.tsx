'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import { formatPrice } from '@/lib/brand-utils';
import BottleVisual from '@/components/shop/BottleVisual';
import { useScentFinder } from '@/context/ScentFinderContext';

interface FloatingConciergeProps {
  brand: BrandConfig;
  products: Product[];
}

export default function FloatingConcierge({ brand }: FloatingConciergeProps) {
  const pathname = usePathname();
  const {
    messages,
    isTyping,
    isCompactOpen: isOpen,
    setIsCompactOpen: setIsOpen,
    sendMessage,
    resetConversation,
  } = useScentFinder();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // If already on the dedicated finder page, hide the floating widget to avoid duplication
  const isDedicatedFinderPage = pathname.endsWith('/finder');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      const timer = setTimeout(scrollToBottom, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, messages, isTyping]);

  if (isDedicatedFinderPage) {
    return null;
  }

  const getPillLabel = () => {
    switch (brand.slug) {
      case 'tmperfumehouse':
        return '✦ Find My Fragrance (380+ Scents)';
      case 'almaham':
        return '✦ Fragrance Consultant';
      case 'worldofperfumers':
        return '✦ Scent Guide · 10ml Trials';
      case 'arabianaroma':
        return '✦ Artisanal Attar Advisor';
      default:
        return '✦ Scent Concierge';
    }
  };

  const handleSend = (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isTyping) return;
    setInput('');
    sendMessage(trimmed);
  };

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end pointer-events-none">
      {/* Expanded Consultation Drawer / Window */}
      {isOpen && (
        <div className="pointer-events-auto mb-3 w-[92vw] sm:w-[380px] max-h-[520px] h-[75vh] rounded-2xl border border-brand-border bg-brand-surface shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-4 py-3 border-b border-brand-border-light bg-brand-surface flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: brand.colors.accent }}
              />
              <div>
                <h4 className="text-xs font-bold text-brand-text uppercase tracking-wider">
                  {brand.finder?.assistantName || 'Scent Concierge'}
                </h4>
                <p className="text-[10px] text-brand-text-muted">Personal Fragrance Consultation</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={resetConversation}
                  title="Start New Consultation"
                  className="h-6 w-6 rounded-full flex items-center justify-center text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-hover text-xs cursor-pointer transition-colors"
                >
                  ↻
                </button>
              )}
              <Link
                href={`/${brand.slug}/finder`}
                className="text-[10px] font-semibold text-brand-accent hover:underline px-2 py-1"
                onClick={() => setIsOpen(false)}
              >
                Expand Full ↗
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 rounded-full flex items-center justify-center text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-hover text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-brand-bg/50">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div
                  className="h-10 w-10 mx-auto rounded-xl flex items-center justify-center font-serif text-lg font-bold mb-3"
                  style={{ backgroundColor: `${brand.colors.accent}20`, color: brand.colors.accent }}
                >
                  {brand.monogram}
                </div>
                <h5 className="font-serif text-sm font-bold text-brand-text">
                  How can I guide you today?
                </h5>
                <p className="text-xs text-brand-text-muted mt-1 max-w-xs mx-auto">
                  Describe a mood, occasion, budget, or favorite scent note in plain language.
                </p>

                {/* Quick prompts */}
                <div className="mt-4 space-y-1.5 text-left">
                  {brand.finder.examplePrompts.slice(0, 3).map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(prompt)}
                      className="w-full text-left rounded-lg border border-brand-border-light bg-brand-surface p-2.5 text-[11px] font-medium text-brand-text hover:border-brand-accent transition-colors"
                    >
                      &ldquo;{prompt}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id}>
                {m.type === 'user' && (
                  <div className="flex justify-end" data-testid="chat-user-message">
                    <div
                      className="max-w-[85%] rounded-xl px-3.5 py-2 text-xs font-medium shadow-sm"
                      style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
                    >
                      {m.text}
                    </div>
                  </div>
                )}

                {m.type === 'assistant' && (
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-tl-xs border border-brand-border-light bg-brand-surface p-3 text-xs text-brand-text leading-relaxed shadow-sm">
                      {m.text}
                      {m.suggestedChips && m.suggestedChips.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-brand-border-light flex flex-wrap gap-1.5">
                          {m.suggestedChips.map((chip) => (
                            <button
                              key={chip}
                              type="button"
                              onClick={() => handleSend(chip)}
                              className="rounded-full border border-brand-accent/40 bg-brand-surface-hover hover:bg-brand-accent hover:text-white text-[10px] font-semibold px-2.5 py-1 text-brand-text transition cursor-pointer"
                            >
                              {chip}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {m.type === 'recommendations' && m.results && (
                  <div className="space-y-2 pt-1">
                    {m.results.map((r) => (
                      <div
                        key={r.product.id}
                        className="rounded-xl border border-brand-border bg-brand-surface p-3 shadow-sm flex items-center gap-3"
                      >
                        <div className="h-14 w-11 shrink-0 flex items-center justify-center">
                          <BottleVisual product={r.product} brand={brand} size="sm" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-brand-accent">
                              {r.matchTier}
                            </span>
                            <span className="text-xs font-serif font-bold text-brand-text">
                              {formatPrice(r.product.price)}
                            </span>
                          </div>
                          <h6 className="font-serif text-xs font-bold text-brand-text truncate mt-0.5">
                            {r.product.name}
                          </h6>
                          <p className="text-[10px] text-brand-text-muted line-clamp-1 mt-0.5">
                            {r.product.fragranceFamily.join(' · ')}
                          </p>
                          <Link
                            href={`/${brand.slug}/product/${r.product.slug}`}
                            onClick={() => setIsOpen(false)}
                            className="inline-block mt-1.5 text-[10px] font-bold text-brand-accent hover:underline"
                          >
                            Examine Fragrance →
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-bounce" />
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-bounce [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 rounded-full bg-brand-accent animate-bounce [animation-delay:300ms]" />
                <span className="text-[10px]">Consulting notes...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="p-3 border-t border-brand-border-light bg-brand-surface flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything (e.g. 'Fresh for office')..."
              className="flex-1 rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs text-brand-text placeholder-brand-text-muted outline-none focus:border-brand-accent"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-lg px-3.5 py-2 text-xs font-semibold shadow-sm hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
            >
              Ask
            </button>
          </form>
        </div>
      )}

      {/* Collapsed Floating Pill Button */}
      <button
        onClick={() => setIsOpen((prev: boolean) => !prev)}
        className="pointer-events-auto group rounded-full px-4 py-2.5 text-xs font-semibold shadow-2xl transition-all duration-300 hover:scale-105 flex items-center gap-2 border"
        style={{
          backgroundColor: brand.colors.primary,
          color: brand.colors.primaryForeground,
          borderColor: `${brand.colors.accent}60`,
        }}
        aria-label="Open Scent Concierge"
      >
        <span
          className="h-2 w-2 rounded-full animate-pulse"
          style={{ backgroundColor: brand.colors.accent }}
        />
        <span>{getPillLabel()}</span>
      </button>
    </div>
  );
}

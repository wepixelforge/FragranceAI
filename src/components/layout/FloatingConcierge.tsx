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
        return '✦ Scent Concierge (380+ Scents)';
      case 'almaham':
        return '✦ Atelier Sommelier';
      case 'worldofperfumers':
        return '✦ Scent Lab · 10ml Trials';
      case 'arabianaroma':
        return '✦ Attar Advisor';
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
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
      {/* Expanded Consultation Panel */}
      {isOpen && (
        <div className="pointer-events-auto mb-3 w-[92vw] sm:w-[390px] max-h-[540px] h-[75vh] rounded-none border border-brand-border bg-brand-bg/98 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-5 py-4 border-b border-brand-border bg-brand-surface flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
              <div>
                <h4 className="text-xs font-serif text-brand-text tracking-wide">
                  {brand.finder?.assistantName || 'Scent Concierge'}
                </h4>
                <p className="text-[9px] uppercase tracking-[0.2em] text-brand-text-muted font-light">
                  Private Consultation
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={resetConversation}
                  title="New Consultation"
                  className="text-[10px] tracking-[0.18em] uppercase text-brand-text-muted hover:text-brand-text px-2 py-1 transition-colors cursor-pointer"
                >
                  ↻ Reset
                </button>
              )}
              <Link
                href={`/${brand.slug}/finder`}
                className="text-[10px] tracking-[0.18em] uppercase text-brand-accent hover:underline px-2 py-1"
                onClick={() => setIsOpen(false)}
              >
                Full Studio ↗
              </Link>
              <button
                onClick={() => setIsOpen(false)}
                className="h-6 w-6 flex items-center justify-center text-brand-text-muted hover:text-brand-text text-xs cursor-pointer ml-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-brand-bg">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <div className="h-8 w-8 mx-auto border border-brand-border flex items-center justify-center font-serif text-xs text-brand-accent mb-3">
                  {brand.monogram}
                </div>
                <h5 className="font-serif text-sm font-normal text-brand-text">
                  What presence do you seek?
                </h5>
                <p className="text-xs text-brand-text-muted mt-1 max-w-xs mx-auto font-light leading-relaxed">
                  Describe an occasion, mood, favorite notes, or budget in natural language.
                </p>

                {/* Starters */}
                <div className="mt-5 space-y-2 text-left">
                  {brand.finder.examplePrompts.slice(0, 3).map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(prompt)}
                      className="w-full text-left p-2.5 border border-brand-border bg-brand-surface hover:border-brand-accent/40 hover:bg-brand-surface-hover text-[11px] text-brand-text font-light transition-colors cursor-pointer block"
                    >
                      &ldquo;{prompt}&rdquo;
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, idx) => {
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const isFollowUpAssistant = m.type === 'assistant' && prevMsg?.type === 'assistant';

              return (
                <div key={m.id} className={isFollowUpAssistant ? '-mt-2' : ''}>
                  {m.type === 'user' && (
                    <div className="flex justify-end" data-testid="chat-user-message">
                      <div className="max-w-[85%] border border-brand-border bg-brand-user-bubble px-4 py-2.5 text-xs text-brand-text font-light leading-relaxed">
                        {m.text}
                      </div>
                    </div>
                  )}

                  {m.type === 'assistant' && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] border-l border-brand-accent pl-3 py-1 text-xs text-brand-text font-light leading-relaxed whitespace-pre-line">
                        {m.text}
                        {m.suggestedChips && m.suggestedChips.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-brand-border-light flex flex-wrap gap-1.5">
                            {m.suggestedChips.map((chip) => (
                              <button
                                key={chip}
                                type="button"
                                onClick={() => handleSend(chip)}
                                className="border border-brand-border bg-brand-surface hover:border-brand-accent text-[10px] text-brand-text-muted hover:text-brand-text px-2.5 py-1 transition-colors cursor-pointer"
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
                    <div className="space-y-2.5 pt-1">
                      {m.results.map((r) => (
                        <div
                          key={r.product.id}
                          className="border border-brand-border bg-brand-surface p-3 flex items-center gap-3"
                        >
                          <div className="h-16 w-14 shrink-0 bg-brand-stage flex items-center justify-center p-1">
                            <BottleVisual product={r.product} brand={brand} size="sm" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <span className="text-[9px] uppercase tracking-[0.2em] text-brand-accent block">
                              {r.product.fragranceFamily.slice(0, 2).join(' · ')}
                            </span>
                            <h6 className="font-serif text-xs text-brand-text font-normal truncate mt-0.5">
                              {r.product.name}
                            </h6>
                            <div className="mt-1.5 flex items-center justify-between">
                              <span className="text-xs text-brand-text font-light">
                                {formatPrice(r.product.price)}
                              </span>
                              <Link
                                href={`/${brand.slug}/product/${r.product.slug}`}
                                className="text-[10px] uppercase tracking-[0.15em] text-brand-accent hover:underline"
                                onClick={() => setIsOpen(false)}
                              >
                                View →
                              </Link>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {isTyping && (
              <div className="flex items-center gap-2 text-xs text-brand-text-muted pl-2">
                <span className="text-[10px] uppercase tracking-[0.2em]">
                  {messages[messages.length - 1]?.type === 'assistant' ? 'Continuing' : 'Consulting'}
                </span>
                <span className="h-1 w-1 rounded-full bg-brand-accent animate-pulse" />
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
            className="p-3 border-t border-brand-border bg-brand-surface flex gap-2"
          >
            <input
              type="text"
              value={input}
              disabled={isTyping}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isTyping ? "Consultant is replying..." : "Ask the scent consultant..."}
              className="flex-1 bg-brand-input-bg border border-brand-input-border disabled:opacity-60 px-3 py-2 text-xs text-brand-text placeholder-brand-text-muted/60 outline-none focus:border-brand-accent transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="border border-brand-accent bg-brand-accent text-brand-primary-fg hover:bg-transparent hover:text-brand-text px-3.5 py-2 text-[10px] uppercase tracking-[0.18em] font-medium disabled:opacity-40 transition-all cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Collapsed Minimalist Luxury Pill */}
      <button
        onClick={() => setIsOpen((prev: boolean) => !prev)}
        className="pointer-events-auto group border border-brand-accent/40 bg-brand-bg/95 backdrop-blur-md px-5 py-3 text-[11px] font-medium tracking-[0.22em] uppercase text-brand-text shadow-2xl hover:border-brand-accent hover:bg-brand-surface transition-all duration-300 flex items-center gap-2.5 cursor-pointer"
        aria-label="Open Scent Concierge"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
        <span>{getPillLabel()}</span>
      </button>
    </div>
  );
}

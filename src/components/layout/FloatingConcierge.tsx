'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BrandConfig } from '@/types/brand';
import { Product } from '@/types/product';
import { formatPrice, getBrandWelcomeMessage } from '@/lib/brand-utils';
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
    hasOpenedConsultant,
    openConsultant,
    closeConsultant,
    sendMessage,
    resetConversation,
  } = useScentFinder();
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isDedicatedFinderPage = pathname.endsWith('/finder');
  const isScentStories = brand.slug === 'thescentstories';
  const isTssCart = isScentStories && pathname.includes('/cart');
  const contextualPrompt = (() => {
    if (!isScentStories) return getBrandWelcomeMessage(brand);
    if (pathname.includes('/cart')) return 'Need help choosing between these?';
    if (pathname.includes('/product/')) return 'Looking for something similar?';
    if (pathname.includes('/shop')) return "Can't decide? Tell me what you're looking for.";
    return 'Need help finding a fragrance?';
  })();

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        closeConsultant();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeConsultant]);

  if (isDedicatedFinderPage) {
    return null;
  }

  const handleSend = (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) return;
    setInput('');
    sendMessage(trimmed);
  };

  return (
    <div className={`fixed z-50 flex flex-col items-end pointer-events-none ${isTssCart ? 'bottom-3 right-3 sm:bottom-6 sm:right-6' : 'bottom-6 right-6'}`}>
      {/* Expanded Consultation Panel */}
      {isOpen && (
        <div className="pointer-events-auto mb-3 w-[92vw] sm:w-[390px] max-h-[540px] h-[75vh] rounded-none border border-brand-border bg-brand-bg/98 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-5 py-4 border-b border-brand-border bg-brand-surface flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
              <div>
                <h4 className="text-xs font-serif text-brand-text tracking-wide">
                  {isScentStories
                    ? brand.finder?.assistantName || 'Fragrance advisor'
                    : brand.finder?.assistantName || 'Scent Concierge'}
                </h4>
                <p className="text-[9px] uppercase tracking-[0.2em] text-brand-text-muted font-light">
                  {isScentStories ? 'Shopping help' : 'Private Consultation'}
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
                onClick={closeConsultant}
              >
                {isScentStories ? 'Open page ↗' : 'Full Studio ↗'}
              </Link>
              <button
                onClick={closeConsultant}
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
                  {isScentStories ? brand.finder.title : 'What presence do you seek?'}
                </h5>
                <p className="text-xs text-brand-text-muted mt-1 max-w-xs mx-auto font-light leading-relaxed">
                  {isScentStories
                    ? brand.finder.subtitle
                    : 'Describe an occasion, mood, favorite notes, or budget in natural language.'}
                </p>

                {/* Starters */}
                <div className="mt-5 space-y-2 text-left">
                  {(isScentStories ? brand.finder.examplePrompts : brand.finder.examplePrompts.slice(0, 3)).map((prompt, i) => (
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
                        {m.queued && (
                          <span className="mt-1.5 block text-[9px] uppercase tracking-[0.18em] text-brand-text-muted">
                            Queued
                          </span>
                        )}
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
                                onClick={closeConsultant}
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
              onChange={(e) => setInput(e.target.value)}
              placeholder={isScentStories ? "Tell me what you're looking for..." : 'Ask the scent consultant...'}
              className="flex-1 bg-brand-input-bg border border-brand-input-border px-3 py-2 text-xs text-brand-text placeholder-brand-text-muted/60 outline-none focus:border-brand-accent transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="border border-brand-accent bg-brand-accent text-brand-primary-fg hover:bg-transparent hover:text-brand-text px-3.5 py-2 text-[10px] uppercase tracking-[0.18em] font-medium disabled:opacity-40 transition-all cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>
      )}

      {/* Floating Circular Assistant & Attached Speech Bubble */}
      {!isOpen && (
        <div className="pointer-events-auto flex items-center gap-3 sm:gap-3.5 select-none animate-fade-in">
          {/* Speech Bubble */}
          {!hasOpenedConsultant && !messages.some((m) => m.type === 'user') && !isTssCart && (
            <div
              role="button"
              tabIndex={0}
              onClick={openConsultant}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openConsultant();
                }
              }}
              aria-label="Open fragrance consultant"
              className="group relative cursor-pointer border border-brand-border bg-brand-surface/95 backdrop-blur-md px-4 py-2.5 sm:px-5 sm:py-3.5 rounded-2xl sm:rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.18)] hover:border-brand-accent/60 hover:shadow-[0_6px_28px_rgba(0,0,0,0.25)] transition-all duration-300 max-w-[210px] sm:max-w-[270px] text-left"
            >
              {/* Small Triangle Pointer towards circle */}
              <div
                aria-hidden="true"
                className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rotate-45 border-t border-r border-brand-border bg-brand-surface group-hover:border-brand-accent/60 transition-colors"
              />

              <p className="relative z-10 text-[12px] sm:text-[13px] font-sans text-brand-text leading-snug tracking-wide font-normal">
                {contextualPrompt}
              </p>
            </div>
          )}

          {/* Circular Assistant Avatar Button */}
          <button
            type="button"
            onClick={openConsultant}
            aria-label="Open fragrance consultant"
            className={`relative group cursor-pointer rounded-full p-[3px] bg-gradient-to-br from-brand-accent/60 via-brand-border to-brand-accent/30 hover:from-brand-accent hover:via-brand-accent/70 hover:to-brand-accent/50 shadow-[0_4px_24px_rgba(0,0,0,0.4)] hover:shadow-[0_8px_32px_rgba(183,154,100,0.35)] transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent ${isTssCart ? 'w-11 h-11 sm:w-16 sm:h-16 md:w-[70px] md:h-[70px]' : 'w-14 h-14 sm:w-16 sm:h-16 md:w-[70px] md:h-[70px]'}`}
          >
            {/* Inner Circular Image Container */}
            <div className="w-full h-full rounded-full overflow-hidden bg-brand-stage relative flex items-center justify-center border border-black/40">
              <Image
                src="/images/concierge-avatar.jpg"
                alt={brand.finder?.assistantName || 'Fragrance Assistant'}
                width={70}
                height={70}
                sizes="70px"
                className="w-full h-full object-cover select-none transition-transform duration-500 group-hover:scale-110"
              />
              <div className="absolute inset-0 flex items-center justify-center text-brand-accent font-serif text-lg pointer-events-none -z-10">
                ✦
              </div>
            </div>

            {/* Subtle Notification Badge: Gold circle with "1" */}
            {!isScentStories && !hasOpenedConsultant && !messages.some((m) => m.type === 'user') && (
              <div
                aria-label="1 unread notification"
                className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-5 h-5 sm:w-5.5 sm:h-5.5 rounded-full bg-brand-accent text-brand-primary-fg font-sans font-semibold text-[10px] sm:text-[11px] flex items-center justify-center shadow-md border-2 border-brand-bg transition-transform duration-300 group-hover:scale-110"
              >
                1
              </div>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

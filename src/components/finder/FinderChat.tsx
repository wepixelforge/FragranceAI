'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Product,
  RecommendationResult,
  StructuredPreferences,
} from '@/types/product';
import { BrandConfig } from '@/types/brand';
import { formatPrice } from '@/lib/brand-utils';
import { sanitizeUserFacingResponse } from '@/lib/response-generator';
import BottleVisual from '@/components/shop/BottleVisual';
import { useScentFinder, ConversationMessage } from '@/context/ScentFinderContext';
import ConsultationDebugPanel from '@/components/finder/ConsultationDebugPanel';

interface FinderChatProps {
  brand: BrandConfig;
  products: Product[];
}

export default function FinderChat(props: FinderChatProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center bg-[#0B0B0A]">
          <div className="flex items-center gap-3 text-xs tracking-[0.2em] uppercase text-[#A0998F]">
            <div className="h-3 w-3 rounded-full border border-[#B79A64] border-t-transparent animate-spin" />
            <span>Connecting with your scent consultant...</span>
          </div>
        </div>
      }
    >
      <FinderChatInner {...props} />
    </Suspense>
  );
}

function FinderChatInner({ brand, products }: FinderChatProps) {
  const searchParams = useSearchParams();
  const {
    messages,
    conversationState,
    activePreferences,
    latestDebugInfo,
    isTyping,
    sendMessage,
    resetConversation,
  } = useScentFinder();
  const [input, setInput] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpRef = useRef<boolean>(false);
  const initialQueryHandled = useRef(false);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 140;
    userScrolledUpRef.current = !isNearBottom;
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current && !userScrolledUpRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
    const timer = setTimeout(() => scrollToBottom('smooth'), 120);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto');
      const timer = setTimeout(() => scrollToBottom('smooth'), 150);
      return () => clearTimeout(timer);
    }
  }, []);

  // Handle URL query parameters on mount
  useEffect(() => {
    const q = searchParams.get('q');
    const refSlug = searchParams.get('ref');
    if (q && !initialQueryHandled.current) {
      initialQueryHandled.current = true;
      userScrolledUpRef.current = false;
      sendMessage(q, false, refSlug || undefined);
    }
  }, [searchParams, sendMessage]);

  const handleSendMessage = (
    rawText: string,
    isAlternativeRequest = false,
    contextProductSlug?: string
  ) => {
    const trimmed = rawText.trim();
    if (!trimmed || isTyping) return;
    userScrolledUpRef.current = false;
    setInput('');
    sendMessage(trimmed, isAlternativeRequest, contextProductSlug);
  };

  const starterPrompts = brand.finder?.examplePrompts || [
    'I want something fresh and clean for everyday wear.',
    'A warm date-night fragrance that lasts through the evening.',
    'Something woody and commanding without sweetness.',
    'Looking for a summer fragrance suitable for high heat.',
  ];

  return (
    <div className="flex flex-col h-full bg-[#0B0B0A] text-[#EDE8DF]">
      {/* Top Consultation Status Bar */}
      <div className="border-b border-[rgba(237,232,223,0.08)] bg-[#0B0B0A]/95 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${brand.slug}`}
            className="text-[10px] tracking-[0.2em] uppercase text-[#A0998F] hover:text-[#EDE8DF] transition-colors font-medium mr-2"
            title="Return to Store"
          >
            ← Store
          </Link>
          <div className="h-1.5 w-1.5 rounded-full bg-[#B79A64]" />
          <div className="flex flex-col">
            <span className="text-xs font-serif tracking-wide text-[#EDE8DF]">
              {brand.finder.assistantName}
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-[#A0998F] hidden sm:inline font-light">
              Personal Fragrance Consultation · {brand.name}
            </span>
          </div>
        </div>

        {/* Reset / New Consultation Action */}
        {(activePreferences || messages.length > 0) && (
          <button
            onClick={resetConversation}
            className="border border-[rgba(237,232,223,0.15)] hover:border-[#B79A64] text-[#A0998F] hover:text-[#EDE8DF] px-3 py-1 text-[10px] tracking-[0.2em] uppercase transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>↻</span>
            <span className="hidden sm:inline">New Consultation</span>
          </button>
        )}
      </div>

      {/* Debug Panel for forensic verification */}
      <ConsultationDebugPanel debugInfo={latestDebugInfo} />

      {/* Scrollable Consultation Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-8 sm:px-8 space-y-6 max-w-5xl mx-auto w-full"
      >
        
        {/* Welcome state when consultation is empty */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 max-w-xl mx-auto animate-fade-in text-center">
            <div className="h-12 w-12 border border-[rgba(237,232,223,0.2)] flex items-center justify-center mb-6 font-serif text-sm text-[#B79A64]">
              {brand.monogram}
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl font-normal text-[#EDE8DF] mb-3 leading-tight">
              {brand.finder.title}
            </h2>
            <p className="text-xs sm:text-sm text-[#A0998F] max-w-md mb-10 font-light leading-relaxed">
              {brand.finder.subtitle}
            </p>

            {/* Suggested Consultation Starter Prompts */}
            <div className="w-full space-y-3 text-left">
              <span className="text-[10px] uppercase tracking-[0.22em] text-[#B79A64] block font-medium">
                Example Inquiries:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {starterPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(prompt)}
                    className="p-3.5 border border-[rgba(237,232,223,0.08)] bg-[#121211] hover:border-[#B79A64]/40 hover:bg-[#181816] transition-all duration-300 text-left text-xs text-[#EDE8DF] font-light leading-relaxed flex items-start gap-2.5 group cursor-pointer"
                  >
                    <span className="text-[#B79A64] text-[10px] mt-0.5 opacity-60 group-hover:opacity-100">✦</span>
                    <span className="flex-1">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Thread */}
        {messages.map((message, idx) => {
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const isFollowUpAssistantThought = message.type === 'assistant' && prevMsg?.type === 'assistant';

          return (
            <div key={message.id} className="animate-fade-in-up">
              {/* User Dialogue */}
              {message.type === 'user' && (
                <div className="flex justify-end" data-testid="chat-user-message">
                  <div className="max-w-lg border border-[rgba(237,232,223,0.12)] bg-[#181816] px-5 py-3.5 text-xs sm:text-sm text-[#EDE8DF] font-light leading-relaxed shadow-sm">
                    {message.text}
                  </div>
                </div>
              )}

              {/* Sommelier Dialogue */}
              {message.type === 'assistant' && (
                <div className="flex justify-start">
                  <div className={`max-w-2xl border-l border-[#B79A64] pl-5 py-1 ${isFollowUpAssistantThought ? '-mt-2' : ''}`}>
                    {!isFollowUpAssistantThought && (
                      <span className="text-[9px] uppercase tracking-[0.25em] text-[#B79A64] font-medium block mb-1.5">
                        {brand.finder.assistantName}
                      </span>
                    )}
                    <div className="text-xs sm:text-sm text-[#EDE8DF] font-light leading-relaxed whitespace-pre-line">
                      {sanitizeUserFacingResponse(message.text || '')}
                    </div>

                    {/* Refinement Chips */}
                    {message.suggestedChips && message.suggestedChips.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-[rgba(237,232,223,0.06)] flex flex-wrap gap-2">
                        {message.suggestedChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleSendMessage(chip)}
                            className="border border-[rgba(237,232,223,0.15)] bg-[#121211] hover:border-[#B79A64] text-[11px] text-[#A0998F] hover:text-[#EDE8DF] px-3.5 py-1.5 transition-colors cursor-pointer"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Curated Recommendations (Primary Match + Also Consider) */}
              {message.type === 'recommendations' && message.results && message.results.length > 0 && (
                <CuratedRecommendationGroup
                  results={message.results}
                  brand={brand}
                />
              )}
            </div>
          );
        })}

        {/* Subtle consultant indicator */}
        {isTyping && (
          <div className="flex justify-start">
            <div className="border-l border-[#B79A64]/40 pl-5 py-1 flex items-center gap-2.5">
              <span className="text-[9px] uppercase tracking-[0.22em] text-[#A0998F]">
                {messages[messages.length - 1]?.type === 'assistant'
                  ? 'Continuing consultation'
                  : 'Consulting formulation library'}
              </span>
              <span className="flex gap-1">
                <span className="h-1 w-1 rounded-full bg-[#B79A64] animate-pulse" />
                <span className="h-1 w-1 rounded-full bg-[#B79A64] animate-pulse delay-75" />
                <span className="h-1 w-1 rounded-full bg-[#B79A64] animate-pulse delay-150" />
              </span>
            </div>
          </div>
        )}

        <div className="h-6" />
      </div>

      {/* Consultation Input Bar */}
      <div className="border-t border-[rgba(237,232,223,0.08)] bg-[#0B0B0A] p-4 sm:p-6">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(input);
            }}
            className="flex items-center gap-2 sm:gap-3"
          >
            <input
              type="text"
              value={input}
              disabled={isTyping}
              onChange={(e) => setInput(e.target.value)}
              placeholder={isTyping ? "Consultant is replying..." : "Describe your desired mood, occasion, or notes..."}
              className="flex-1 bg-[#121211] border border-[rgba(237,232,223,0.15)] focus:border-[#B79A64] disabled:opacity-60 text-[#EDE8DF] placeholder-[#6B655B] text-xs sm:text-sm px-4 sm:px-5 py-3.5 outline-none transition-colors"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="border border-[#B79A64] bg-[#B79A64] text-[#0B0B0A] hover:bg-transparent hover:text-[#EDE8DF] disabled:opacity-40 disabled:pointer-events-none px-6 sm:px-8 py-3.5 text-[11px] font-medium tracking-[0.2em] uppercase transition-all duration-300 shrink-0 cursor-pointer"
            >
              Consult
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * Curated Recommendation Group
 * Features a dominant PRIMARY MATCH with generous breathing room,
 * followed by an ALSO CONSIDER tier for complementary exploration.
 */
function CuratedRecommendationGroup({
  results,
  brand,
}: {
  results: RecommendationResult[];
  brand: BrandConfig;
}) {
  const primary = results[0];
  const alternatives = results.slice(1);
  const isDiscovery = brand.designVariant === 'discovery-niche';

  if (!primary) return null;

  return (
    <div className="space-y-8 my-6">
      {/* ── 1. PRIMARY HERO MATCH ────────────────────────────────────────── */}
      <div
        data-testid="recommendation-card"
        className="border border-[rgba(237,232,223,0.12)] bg-[#121211] hover:border-[#B79A64]/50 transition-all duration-500 overflow-hidden"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
          {/* Left: Product Flacon Showcase */}
          <div className="lg:col-span-5 aspect-square sm:aspect-[4/3] lg:aspect-square bg-[#0F0F0E] flex items-center justify-center p-8 relative overflow-hidden">
            <div className="absolute top-4 left-4 z-20 text-[9px] uppercase tracking-[0.25em] text-[#B79A64] font-medium">
              Primary Selection
            </div>
            <div className="relative z-10 transition-transform duration-700 ease-out hover:scale-104">
              <BottleVisual product={primary.product} brand={brand} size="md" />
            </div>
          </div>

          {/* Right: Sommelier Profile & Justification */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-[10px] uppercase tracking-[0.22em] text-[#B79A64] font-medium">
                  {primary.product.fragranceFamily.slice(0, 2).join(' · ')}
                </span>
                <span className="font-serif text-lg text-[#EDE8DF] font-normal">
                  {formatPrice(primary.product.price)}
                </span>
              </div>

              <h3 className="font-serif text-2xl sm:text-3xl text-[#EDE8DF] font-normal mt-1 leading-snug">
                {primary.product.name}
              </h3>

              {/* Conversational Match Rationale */}
              <p className="mt-3 text-xs sm:text-sm text-[#A0998F] font-light leading-relaxed italic border-l border-[#B79A64]/30 pl-3">
                &ldquo;{primary.explanation}&rdquo;
              </p>

              {/* Refined Olfactory Highlights */}
              <div className="mt-4 pt-3 border-t border-[rgba(237,232,223,0.06)] space-y-1.5">
                <span className="text-[9px] uppercase tracking-[0.2em] text-[#EDE8DF] font-medium block">
                  Olfactory Profile:
                </span>
                <p className="text-xs text-[#A0998F] font-light">
                  {primary.product.topNotes.slice(0, 2).join(', ')} opening into {primary.product.heartNotes[0] || 'subtle floras'} and {primary.product.baseNotes[0] || 'amber woods'}.
                </p>
              </div>
            </div>

            {/* Action Row */}
            <div className="mt-6 pt-4 border-t border-[rgba(237,232,223,0.06)] flex flex-wrap items-center justify-between gap-4">
              <div className="text-[10px] text-[#A0998F] font-light">
                {isDiscovery ? '10ml trial from ₹149' : `${primary.product.size} Extrait`}
              </div>

              <div className="flex items-center gap-3">
                {isDiscovery && (
                  <Link
                    href={`/${brand.slug}/product/${primary.product.slug}?trial=10ml`}
                    className="text-[10px] font-medium tracking-[0.18em] uppercase text-[#B79A64] hover:underline"
                  >
                    Try 10ml First →
                  </Link>
                )}
                <Link
                  href={`/${brand.slug}/product/${primary.product.slug}`}
                  className="border border-[#B79A64] bg-[#B79A64] text-[#0B0B0A] hover:bg-transparent hover:text-[#EDE8DF] px-5 py-2 text-[10px] font-medium tracking-[0.2em] uppercase transition-all duration-300"
                >
                  View Details
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. ALSO CONSIDER TIER ────────────────────────────────────────── */}
      {alternatives.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-[10px] uppercase tracking-[0.25em] text-[#A0998F] font-medium">
              Also Consider &mdash; Complementary Selections
            </span>
            <div className="flex-1 h-px bg-[rgba(237,232,223,0.08)]" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {alternatives.map((alt) => (
              <div
                key={alt.product.id}
                data-testid="recommendation-card"
                className="border border-[rgba(237,232,223,0.08)] bg-[#121211] hover:border-[#B79A64]/30 p-5 flex items-center gap-4 transition-all duration-300"
              >
                <div className="w-20 h-24 shrink-0 bg-[#0F0F0E] flex items-center justify-center p-2">
                  <BottleVisual product={alt.product} brand={brand} size="sm" />
                </div>

                <div className="flex-1 min-w-0">
                  <span className="text-[9px] uppercase tracking-[0.2em] text-[#B79A64] block">
                    {alt.product.fragranceFamily.slice(0, 2).join(' · ')}
                  </span>
                  <h3 className="font-serif text-base text-[#EDE8DF] font-normal truncate mt-0.5">
                    {alt.product.name}
                  </h3>
                  <p className="text-[11px] text-[#A0998F] line-clamp-1 mt-1 font-light">
                    {alt.product.description}
                  </p>
                  <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-xs text-[#EDE8DF] font-light">
                      {formatPrice(alt.product.price)}
                    </span>
                    <Link
                      href={`/${brand.slug}/product/${alt.product.slug}`}
                      className="text-[10px] tracking-[0.18em] uppercase text-[#B79A64] hover:underline font-medium"
                    >
                      View →
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

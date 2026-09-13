'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Product,
  RecommendationResult,
  StructuredPreferences,
  MatchTier,
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
        <div className="flex h-full items-center justify-center">
          <div className="flex items-center gap-2 text-sm text-brand-text-muted">
            <div className="h-4 w-4 rounded-full border-2 border-brand-accent border-t-transparent animate-spin" />
            <span>Connecting with {props.brand.finder?.assistantName || 'Fragrance Sommelier'}...</span>
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const initialQueryHandled = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior,
      });
    }
  };

  useEffect(() => {
    scrollToBottom('smooth');
    const timer = setTimeout(() => scrollToBottom('smooth'), 100);
    return () => clearTimeout(timer);
  }, [messages, isTyping]);

  // Initial scroll on mount if conversation already exists (e.g. from compact chat)
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto');
      const timer = setTimeout(() => scrollToBottom('smooth'), 150);
      return () => clearTimeout(timer);
    }
  }, []);

  // Handle URL query parameter and product reference on mount
  useEffect(() => {
    const q = searchParams.get('q');
    const refSlug = searchParams.get('ref');
    if (q && !initialQueryHandled.current) {
      initialQueryHandled.current = true;
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
    setInput('');
    sendMessage(trimmed, isAlternativeRequest, contextProductSlug);
  };

  // Starter prompts tailored to the brand
  const starterPrompts = brand.finder?.examplePrompts || [
    'I want something fresh and clean for office use.',
    'I need a date-night perfume that smells expensive under ₹1,000.',
    'I like Dior Sauvage but want something warmer.',
    'I hate very sweet perfumes. Give me something woody.',
    'I want something for college that isn\'t too strong.',
    'I need a gift for my girlfriend under ₹1,200.',
  ];

  return (
    <div className="flex flex-col h-full bg-brand-bg">
      {/* Top Scent Concierge Status Bar */}
      <div className="border-b border-brand-border-light bg-brand-surface/95 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/${brand.slug}`}
            className="text-xs text-brand-text-muted hover:text-brand-text transition-colors flex items-center gap-1 font-medium mr-1.5"
            title="Back to Store"
          >
            ← Store
          </Link>
          <div
            className="h-2.5 w-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: brand.colors.accent }}
          />
          <div className="flex flex-col">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-text">
              {brand.finder.assistantName}
            </span>
            <span className="text-[10px] text-brand-text-muted hidden sm:inline">
              {brand.finder.assistantTitle} · {brand.name}
            </span>
          </div>
        </div>

        {/* Active Context Reset Action */}
        {(activePreferences || messages.length > 0) && (
          <button
            onClick={resetConversation}
            className="rounded-full border border-brand-border px-3 py-1 text-xs text-brand-text-muted hover:text-brand-text hover:border-brand-accent transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span>↻</span>
            <span className="hidden sm:inline">New Consultation</span>
          </button>
        )}
      </div>

      {/* Development Debug State Inspector */}
      <ConsultationDebugPanel debugInfo={latestDebugInfo} />

      {/* Messages Scroll Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 space-y-6">
        {/* Welcome state when no messages */}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 max-w-2xl mx-auto animate-fade-in text-center">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5 shadow-md font-serif text-2xl font-bold"
              style={{ backgroundColor: `${brand.colors.accent}20`, color: brand.colors.accent }}
            >
              {brand.monogram}
            </div>

            <h2 className="font-serif text-2xl sm:text-3xl font-bold text-brand-text mb-2">
              {brand.finder.title}
            </h2>
            <p className="text-sm sm:text-base text-brand-text-muted max-w-lg mb-8 leading-relaxed">
              {brand.finder.subtitle}
            </p>

            {/* Curated Brand Starter Prompts */}
            <div className="w-full space-y-2.5">
              <p className="text-xs font-bold text-brand-text-muted uppercase tracking-wider">
                Select a consultation inquiry:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
                {starterPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(prompt)}
                    className="group rounded-xl border border-brand-border bg-brand-surface p-3 text-xs text-brand-text hover:border-brand-accent hover:shadow-md transition-all duration-200 flex items-start gap-2.5"
                  >
                    <span className="text-brand-accent mt-0.5 font-bold">✦</span>
                    <span className="flex-1 font-medium leading-snug">{prompt}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Message Thread */}
        {messages.map((message) => (
          <div key={message.id} className="animate-fade-in-up">
            {/* User Bubble */}
            {message.type === 'user' && (
              <div className="flex justify-end" data-testid="chat-user-message">
                <div
                  className="max-w-md rounded-2xl rounded-tr-xs px-5 py-3.5 text-sm shadow-md font-medium"
                  style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
                >
                  {message.text}
                </div>
              </div>
            )}

            {/* Assistant Text Bubble */}
            {message.type === 'assistant' && (
              <div className="flex justify-start">
                <div className="flex gap-3 max-w-2xl">
                  <div
                    className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm"
                    style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
                  >
                    {brand.monogram}
                  </div>
                  <div className="rounded-2xl rounded-tl-xs border border-brand-border-light bg-brand-surface px-5 py-4 text-sm text-brand-text leading-relaxed shadow-sm">
                    {sanitizeUserFacingResponse(message.text || '')}
                    {message.suggestedChips && message.suggestedChips.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-brand-border-light flex flex-wrap gap-2">
                        {message.suggestedChips.map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleSendMessage(chip)}
                            className="rounded-full border border-brand-accent/40 bg-brand-surface-hover hover:bg-brand-accent hover:text-white text-xs font-semibold px-3 py-1.5 transition text-brand-text shadow-xs cursor-pointer"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Recommendations Group */}
            {message.type === 'recommendations' && message.results && (
              <div className="space-y-6 sm:pl-11 max-w-4xl">
                {/* Active Scent DNA Extracted Signals Banner */}
                {message.preferencesSnapshot && (
                  <div className="rounded-2xl border border-brand-accent/30 bg-brand-surface p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-brand-accent font-bold text-xs">✦</span>
                        <span className="text-xs font-bold text-brand-text uppercase tracking-wider">
                          Active Scent Preferences (Consultation Context):
                        </span>
                      </div>
                      <span className="text-[10px] text-brand-text-muted">Multi-turn active</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {message.preferencesSnapshot.occasion?.map((occ) => (
                        <span key={occ} className="rounded-full bg-brand-surface-hover border border-brand-border text-brand-text px-3 py-1 text-xs font-medium capitalize">
                          Occasion: {occ.replace('-', ' ')}
                        </span>
                      ))}
                      {message.preferencesSnapshot.budget?.max && (
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 px-3 py-1 text-xs font-medium">
                          Budget: Under ₹{message.preferencesSnapshot.budget.max.toLocaleString('en-IN')}
                        </span>
                      )}
                      {message.preferencesSnapshot.fragranceFamilies?.map((fam) => (
                        <span key={fam} className="rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 px-3 py-1 text-xs font-medium capitalize">
                          Family: {fam}
                        </span>
                      ))}
                      {message.preferencesSnapshot.referencePerfumes?.map((ref) => (
                        <span key={ref} className="rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-800 px-3 py-1 text-xs font-medium capitalize">
                          Style: {ref}
                        </span>
                      ))}
                      {message.preferencesSnapshot.intensityPreference && (
                        <span className="rounded-full bg-brand-surface-hover border border-brand-border text-brand-text px-3 py-1 text-xs font-medium capitalize">
                          Sillage: {message.preferencesSnapshot.intensityPreference}
                        </span>
                      )}
                      {message.preferencesSnapshot.category && (
                        <span className="rounded-full bg-brand-surface-hover border border-brand-border text-brand-text px-3 py-1 text-xs font-medium capitalize">
                          Target: {message.preferencesSnapshot.category}
                        </span>
                      )}
                      {/* Negative exclusions visually confirmed */}
                      {message.preferencesSnapshot.exclusions?.fragranceFamilies?.map((ef) => (
                        <span key={ef} className="rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-700 px-3 py-1 text-xs font-medium line-through">
                          Avoid: {ef}
                        </span>
                      ))}
                      {message.preferencesSnapshot.exclusions?.intensity?.includes('strong') && (
                        <span className="rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-700 px-3 py-1 text-xs font-medium">
                          Avoid: Loud Sillage
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* The Top 3 Recommendation Cards */}
                <div className="space-y-4">
                  {message.results.map((result) => (
                    <EnhancedRecommendationCard
                      key={result.product.id}
                      result={result}
                      brand={brand}
                    />
                  ))}
                </div>

                {/* Conversational Context Refinement Actions */}
                <div className="rounded-2xl border border-brand-border-light bg-brand-surface-hover p-4">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-xs font-bold text-brand-text-muted uppercase tracking-wider">
                      Refine in current context:
                    </span>
                    <span className="text-[10px] text-brand-text-muted">(Remembers your previous details)</span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => handleSendMessage('Something fresher and cleaner')}
                      className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-text hover:border-brand-accent transition-all duration-200"
                    >
                      🌿 Something fresher
                    </button>
                    <button
                      onClick={() => handleSendMessage('Make it sweeter and warmer')}
                      className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-text hover:border-brand-accent transition-all duration-200"
                    >
                      🍯 Warmer / Sweeter
                    </button>
                    <button
                      onClick={() => handleSendMessage('Strictly under ₹800')}
                      className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-text hover:border-brand-accent transition-all duration-200"
                    >
                      💰 Under ₹800
                    </button>
                    <button
                      onClick={() => handleSendMessage('Better for daily professional office wear')}
                      className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-text hover:border-brand-accent transition-all duration-200"
                    >
                      💼 Office suitable
                    </button>
                    <button
                      onClick={() => handleSendMessage('Show alternative options', true)}
                      className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-text hover:border-brand-accent transition-all duration-200"
                    >
                      🔄 Show alternatives
                    </button>
                    <button
                      onClick={() => handleSendMessage('More noble woody and resinous')}
                      className="rounded-full border border-brand-border bg-brand-surface px-3 py-1.5 text-xs font-medium text-brand-text hover:border-brand-accent transition-all duration-200"
                    >
                      🪵 Woody / Resinous
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Cognitive Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start animate-fade-in sm:pl-11">
            <div className="flex items-center gap-3 rounded-2xl border border-brand-border-light bg-brand-surface px-5 py-3.5 shadow-sm">
              <span className="text-xs font-bold text-brand-accent uppercase tracking-wider">
                {brand.designVariant === 'oriental-artisanal'
                  ? 'Analyzing traditional attar accords'
                  : brand.designVariant === 'luxury-editorial'
                  ? 'Consulting haute parfumerie archives'
                  : brand.designVariant === 'discovery-niche'
                  ? 'Matching climate resilience protocol'
                  : 'Consulting olfactory pyramid'}
              </span>
              <div className="flex gap-1.5">
                <div className="h-2 w-2 rounded-full animate-bounce" style={{ backgroundColor: brand.colors.accent, animationDelay: '0ms' }} />
                <div className="h-2 w-2 rounded-full animate-bounce" style={{ backgroundColor: brand.colors.accent, animationDelay: '150ms' }} />
                <div className="h-2 w-2 rounded-full animate-bounce" style={{ backgroundColor: brand.colors.accent, animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="border-t border-brand-border bg-brand-surface p-4 sm:p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage(input);
          }}
          className="mx-auto flex max-w-3xl gap-3"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(input);
              }
            }}
            placeholder={`Ask ${brand.finder.assistantName} (e.g. "I want something woody for winter", "Under ₹1,000")...`}
            className="flex-1 rounded-xl border border-brand-border bg-brand-bg px-4 py-3.5 text-sm text-brand-text placeholder-brand-text-muted/60 outline-none focus:border-brand-accent transition-colors shadow-inner"
            disabled={isTyping}
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="rounded-xl px-6 py-3.5 text-sm font-semibold transition-all duration-200 hover:opacity-90 disabled:opacity-40 shadow-md flex items-center gap-2 shrink-0"
            style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
          >
            <span>Consult</span>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Enhanced Recommendation Card Component ───────────────────────────────────

interface EnhancedRecommendationCardProps {
  result: RecommendationResult;
  brand: BrandConfig;
}

function EnhancedRecommendationCard({ result, brand }: EnhancedRecommendationCardProps) {
  const { product, matchTier, detailedReasons, explanation } = result;

  // Tier styling
  const getTierBadge = (tier: MatchTier) => {
    switch (tier) {
      case 'Best Match':
        return {
          bg: 'bg-amber-500/15 border-amber-500/40 text-amber-700 font-bold',
          icon: '★',
          label: 'Best Match',
        };
      case 'Great Match':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 font-bold',
          icon: '✦',
          label: 'Great Match',
        };
      case 'Spotlight':
        return {
          bg: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 font-bold',
          icon: '✦',
          label: 'Catalogue Spotlight',
        };
      case 'Comparison Candidate':
        return {
          bg: 'bg-purple-500/15 border-purple-500/40 text-purple-700 font-bold',
          icon: '⚖',
          label: 'Comparison Candidate',
        };
      case 'Alternative':
      default:
        return {
          bg: 'bg-slate-500/15 border-slate-500/40 text-slate-700 font-semibold',
          icon: '◇',
          label: 'Alternative',
        };
    }
  };

  const tierBadge = getTierBadge(matchTier);

  // Brand-specific specs
  const getConcentrationText = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return `${product.size} · Alcohol-Free Pure Attar`;
      case 'luxury-editorial':
        return `${product.size} · 35% Pure Extrait`;
      case 'discovery-niche':
        return `${product.size} EDP (10ml Trial Available)`;
      default:
        return `${product.size} · 30% Extrait`;
    }
  };

  const getCtaText = () => {
    switch (brand.designVariant) {
      case 'oriental-artisanal':
        return 'View Attar Details →';
      case 'luxury-editorial':
        return 'Private Formulation →';
      case 'discovery-niche':
        return 'Formula Specs →';
      default:
        return 'View Fragrance Details →';
    }
  };

  return (
    <div
      data-testid="recommendation-card"
      className="rounded-2xl border border-brand-border bg-brand-surface overflow-hidden shadow-lg transition-all duration-300 hover:border-brand-accent/60"
    >
      <div className="flex flex-col sm:flex-row">
        
        {/* Left Column: Visual Flacon */}
        <div className="relative w-full sm:w-48 bg-gradient-to-b from-neutral-900 via-neutral-950 to-black p-6 flex flex-col items-center justify-between shrink-0">
          {/* Match Tier Badge */}
          <div className={`rounded-full border px-3 py-0.5 text-xs flex items-center gap-1.5 shadow-sm ${tierBadge.bg}`}>
            <span>{tierBadge.icon}</span>
            <span>{tierBadge.label}</span>
          </div>

          {/* Architectural Flacon */}
          <div className="relative my-4 flex items-center justify-center">
            <BottleVisual product={product} brand={brand} size="sm" />
          </div>

          <div className="text-center">
            <span className="text-[10px] font-semibold text-white/80 uppercase tracking-wider block">
              {getConcentrationText()}
            </span>
            <span className="text-[9px] text-[#D4AF37] block mt-0.5 capitalize">
              {product.gender === 'unisex' ? 'Unisex' : `For ${product.gender}`}
            </span>
          </div>
        </div>

        {/* Right Column: Sommelier Explanation & "WHY THIS MATCHES" */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between">
          <div>
            {/* Header: Name, Price, Category */}
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h3 className="font-serif text-xl font-bold text-brand-text">
                  {product.name}
                </h3>
                <p className="text-xs text-brand-text-muted mt-0.5 capitalize">
                  {product.fragranceFamily.join(' · ')}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="font-serif text-lg font-bold text-brand-text">
                  {formatPrice(product.price)}
                </span>
                <span className="block text-[10px] text-brand-text-muted">
                  {brand.designVariant === 'discovery-niche' ? '10ml from ₹149' : 'Free Shipping'}
                </span>
              </div>
            </div>

            {/* Conversational Explanation */}
            <p className="text-xs sm:text-sm text-brand-text leading-relaxed my-2.5">
              {explanation}
            </p>

            {/* WHY THIS MATCHES Section */}
            <div className="rounded-xl border border-brand-border-light bg-brand-surface-hover p-3.5 my-3 space-y-2">
              <span className="text-[11px] font-bold text-brand-text uppercase tracking-wider block">
                WHY THIS MATCHES YOUR REQUEST:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {detailedReasons.map((reason, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-brand-accent font-bold mt-0.5">•</span>
                    <div>
                      <span className="font-semibold text-brand-text">{reason.category}: </span>
                      <span className="text-brand-text-muted">{reason.text}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Olfactory Pyramid Chips */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-brand-text-muted mt-2">
              <span className="font-semibold text-brand-text text-[11px]">Top:</span>
              {product.topNotes.slice(0, 2).map((n) => (
                <span key={n} className="rounded-md bg-brand-surface-hover border border-brand-border-light px-2 py-0.5 text-[10px] text-brand-text font-medium">
                  {n}
                </span>
              ))}
              <span className="font-semibold text-brand-text text-[11px] ml-1">Heart:</span>
              {product.heartNotes.slice(0, 2).map((n) => (
                <span key={n} className="rounded-md bg-brand-surface-hover border border-brand-border-light px-2 py-0.5 text-[10px] text-brand-text font-medium">
                  {n}
                </span>
              ))}
              <span className="font-semibold text-brand-text text-[11px] ml-1">Base:</span>
              {product.baseNotes.slice(0, 2).map((n) => (
                <span key={n} className="rounded-md bg-brand-surface-hover border border-brand-border-light px-2 py-0.5 text-[10px] text-brand-text font-medium">
                  {n}
                </span>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="mt-4 pt-3 border-t border-brand-border-light flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {product.similarTo && product.similarTo.length > 0 ? (
                <span className="text-[11px] text-brand-text-muted">
                  ✦ {brand.designVariant === 'luxury-editorial' ? 'Atelier expression of' : 'Inspired by'}{' '}
                  <span className="font-semibold text-brand-text">{product.similarTo[0]}</span>
                </span>
              ) : (
                <span className="text-[11px] text-brand-text-muted">
                  Longevity: <span className="font-semibold text-brand-text capitalize">{product.longevity.replace('-', ' ')}</span>
                </span>
              )}
              {brand.designVariant === 'discovery-niche' && (
                <span className="hidden sm:inline-block rounded bg-sky-100 text-sky-800 text-[10px] font-mono px-1.5 py-0.5 font-semibold">
                  Pocket Trial: ₹149
                </span>
              )}
              {brand.slug === 'tmperfumehouse' && (
                <span className="hidden sm:inline-block rounded bg-amber-100 text-amber-900 text-[10px] font-medium px-2 py-0.5">
                  380+ Catalogue Match
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end">
              {brand.designVariant === 'discovery-niche' ? (
                <>
                  <Link
                    href={`/${brand.slug}/product/${product.slug}`}
                    className="rounded-lg px-3 py-2 text-xs font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors text-center"
                  >
                    50ml Full ({formatPrice(product.price)})
                  </Link>
                  <Link
                    href={`/${brand.slug}/product/${product.slug}?trial=10ml`}
                    className="rounded-lg px-4 py-2 text-xs font-bold text-white shadow-sm transition-all duration-200 hover:opacity-95 flex items-center gap-1.5 text-center bg-[#0284C7]"
                  >
                    <span>✦ Try 10ml First (₹149)</span>
                  </Link>
                </>
              ) : (
                <Link
                  href={`/${brand.slug}/product/${product.slug}`}
                  className="rounded-lg px-4 py-2 text-xs font-bold shadow-sm transition-all duration-200 hover:opacity-90 flex items-center justify-center gap-1.5 text-center"
                  style={{ backgroundColor: brand.colors.primary, color: brand.colors.primaryForeground }}
                >
                  {getCtaText()}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


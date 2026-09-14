'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { BrandConfig } from '@/types/brand';
import { Product, RecommendationResult, StructuredPreferences } from '@/types/product';
import { ConversationState, ChatApiResponse, ConsultationDebugInfo } from '@/types/chat';
import { toStructuredPreferences } from '@/lib/state-manager';

export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant' | 'recommendations';
  text?: string;
  results?: RecommendationResult[];
  preferencesSnapshot?: StructuredPreferences;
  suggestedChips?: string[];
  timestamp?: Date;
  debugInfo?: ConsultationDebugInfo;
}

export interface ScentFinderContextValue {
  brand: BrandConfig;
  products: Product[];
  messages: ConversationMessage[];
  conversationState: ConversationState | undefined;
  activePreferences: StructuredPreferences | null;
  latestDebugInfo: ConsultationDebugInfo | null;
  isTyping: boolean;
  isCompactOpen: boolean;
  setIsCompactOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sendMessage: (
    rawText: string,
    isAlternativeRequest?: boolean,
    contextProductSlug?: string
  ) => Promise<void>;
  resetConversation: () => void;
}

const ScentFinderContext = createContext<ScentFinderContextValue | null>(null);

interface ScentFinderProviderProps {
  brand: BrandConfig;
  products: Product[];
  children: React.ReactNode;
}

export function ScentFinderProvider({ brand, products, children }: ScentFinderProviderProps) {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [conversationState, setConversationState] = useState<ConversationState | undefined>(undefined);
  const [activePreferences, setActivePreferences] = useState<StructuredPreferences | null>(null);
  const [latestDebugInfo, setLatestDebugInfo] = useState<ConsultationDebugInfo | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isCompactOpen, setIsCompactOpen] = useState(false);
  const activeTimers = useRef<NodeJS.Timeout[]>([]);

  const clearPendingTimers = useCallback(() => {
    activeTimers.current.forEach((t) => clearTimeout(t));
    activeTimers.current = [];
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  // Keep track of brand to reset when brand changes
  const activeBrandSlug = useRef(brand.slug);
  useEffect(() => {
    if (activeBrandSlug.current !== brand.slug) {
      activeBrandSlug.current = brand.slug;
      clearPendingTimers();
      setMessages([]);
      setConversationState(undefined);
      setActivePreferences(null);
      setLatestDebugInfo(null);
      setIsTyping(false);
    }
  }, [brand.slug, clearPendingTimers]);

  const resetConversation = useCallback(() => {
    clearPendingTimers();
    setMessages([]);
    setConversationState(undefined);
    setActivePreferences(null);
    setLatestDebugInfo(null);
    setIsTyping(false);
  }, [clearPendingTimers]);

  const sendMessage = useCallback(
    async (rawText: string, isAlternativeRequest = false, contextProductSlug?: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isTyping) return;

      // Clear any remaining timers from a prior sequence
      clearPendingTimers();

      // Add user message to thread
      const userMsg: ConversationMessage = {
        id: `user-${Date.now()}`,
        type: 'user',
        text: trimmed,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsTyping(true);

      try {
        // Build history from current messages
        const historyPayload = messages
          .filter((m) => m.type === 'user' || m.type === 'assistant')
          .slice(-6)
          .map((m) => ({
            role: m.type === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.text || '',
          }));

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            brandSlug: brand.slug,
            conversationState,
            history: historyPayload,
            contextProductSlug,
            isAlternativeRequest,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error HTTP ${res.status}`);
        }

        const data: ChatApiResponse = await res.json();

        // Update accumulated conversation state & structured preferences
        setConversationState(data.updatedState);
        const structured = toStructuredPreferences(data.updatedState.preferences, trimmed);
        setActivePreferences(structured);
        if (data.debugInfo) {
          setLatestDebugInfo(data.debugInfo);
        }

        const thoughtList: string[] =
          data.messages && data.messages.length > 0
            ? data.messages
            : [data.reply];

        // 1. Immediately reveal the first assistant thought
        const firstMsg: ConversationMessage = {
          id: `assistant-${Date.now()}-0`,
          type: 'assistant',
          text: thoughtList[0],
          suggestedChips: thoughtList.length === 1 ? data.suggestedChips : undefined,
          timestamp: new Date(),
          debugInfo: data.debugInfo,
        };

        setMessages((prev) => [...prev, firstMsg]);

        // 2. If additional thoughts or recommendations exist, sequence them one-by-one
        if (thoughtList.length > 1 || (data.needsRecommendations && data.results && data.results.length > 0)) {
          let currentDelay = 600;

          // Schedule subsequent thoughts
          for (let i = 1; i < thoughtList.length; i++) {
            const index = i;
            const delay = currentDelay;
            const isLastThought = index === thoughtList.length - 1;
            const timer = setTimeout(() => {
              const nextMsg: ConversationMessage = {
                id: `assistant-${Date.now()}-${index}`,
                type: 'assistant',
                text: thoughtList[index],
                suggestedChips: isLastThought ? data.suggestedChips : undefined,
                timestamp: new Date(),
                debugInfo: data.debugInfo,
              };
              setMessages((prev) => [...prev, nextMsg]);
            }, delay);
            activeTimers.current.push(timer);
            currentDelay += 600;
          }

          // Schedule recommendations if present
          if (data.needsRecommendations && data.results && data.results.length > 0) {
            const recsDelay = currentDelay;
            const recsTimer = setTimeout(() => {
              const recsMsg: ConversationMessage = {
                id: `recs-${Date.now()}`,
                type: 'recommendations',
                results: data.results,
                preferencesSnapshot: structured,
                timestamp: new Date(),
                debugInfo: data.debugInfo,
              };
              setMessages((prev) => [...prev, recsMsg]);
              setIsTyping(false);
            }, recsDelay);
            activeTimers.current.push(recsTimer);
          } else {
            // Unlock typing after the final thought finishes
            const unlockTimer = setTimeout(() => {
              setIsTyping(false);
            }, currentDelay);
            activeTimers.current.push(unlockTimer);
          }
        } else {
          setIsTyping(false);
        }
      } catch (err) {
        console.warn('[ScentFinderContext Error]:', err);
        const fallbackMsg: ConversationMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          text: `I'm having a little trouble connecting right now. Try telling me the occasion, style, or budget you're shopping for!`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
        setIsTyping(false);
      }
    },
    [brand.slug, conversationState, isTyping, messages, clearPendingTimers]
  );

  return (
    <ScentFinderContext.Provider
      value={{
        brand,
        products,
        messages,
        conversationState,
        activePreferences,
        latestDebugInfo,
        isTyping,
        isCompactOpen,
        setIsCompactOpen,
        sendMessage,
        resetConversation,
      }}
    >
      {children}
    </ScentFinderContext.Provider>
  );
}

export function useScentFinder(): ScentFinderContextValue {
  const context = useContext(ScentFinderContext);
  if (!context) {
    throw new Error('useScentFinder must be used within a ScentFinderProvider');
  }
  return context;
}

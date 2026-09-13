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

  // Keep track of brand to reset when brand changes
  const activeBrandSlug = useRef(brand.slug);
  useEffect(() => {
    if (activeBrandSlug.current !== brand.slug) {
      activeBrandSlug.current = brand.slug;
      setMessages([]);
      setConversationState(undefined);
      setActivePreferences(null);
      setLatestDebugInfo(null);
      setIsTyping(false);
    }
  }, [brand.slug]);

  const resetConversation = useCallback(() => {
    setMessages([]);
    setConversationState(undefined);
    setActivePreferences(null);
    setLatestDebugInfo(null);
    setIsTyping(false);
  }, []);

  const sendMessage = useCallback(
    async (rawText: string, isAlternativeRequest = false, contextProductSlug?: string) => {
      const trimmed = rawText.trim();
      if (!trimmed || isTyping) return;

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

        const assistantMsg: ConversationMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          text: data.reply,
          suggestedChips: data.suggestedChips,
          timestamp: new Date(),
          debugInfo: data.debugInfo,
        };

        if (data.needsRecommendations && data.results && data.results.length > 0) {
          const recsMsg: ConversationMessage = {
            id: `recs-${Date.now()}`,
            type: 'recommendations',
            results: data.results,
            preferencesSnapshot: structured,
            timestamp: new Date(),
            debugInfo: data.debugInfo,
          };
          setMessages((prev) => [...prev, assistantMsg, recsMsg]);
        } else {
          setMessages((prev) => [...prev, assistantMsg]);
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
      } finally {
        setIsTyping(false);
      }
    },
    [brand.slug, conversationState, isTyping, messages]
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

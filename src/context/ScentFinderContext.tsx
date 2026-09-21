'use client';

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { BrandConfig } from '@/types/brand';
import { Product, RecommendationResult, StructuredPreferences } from '@/types/product';
import { ConversationState, ChatApiResponse, ConsultationDebugInfo } from '@/types/chat';
import { toStructuredPreferences } from '@/lib/state-manager';
import { getBrandWelcomeMessage } from '@/lib/brand-utils';
import { useCart } from './CartContext';
import { serializeCartRequestPayload } from '@/lib/live-cart-context';
import { isAuthorizedCartMutation } from '@/lib/cart-authorization';

function sessionStorageKey(brandSlug: string) {
  return `fragrance-ai-session:${brandSlug}`;
}

function createBrowserSessionId() {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant' | 'recommendations';
  text?: string;
  results?: RecommendationResult[];
  preferencesSnapshot?: StructuredPreferences;
  suggestedChips?: string[];
  timestamp?: Date;
  debugInfo?: ConsultationDebugInfo;
  queued?: boolean;
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
  hasOpenedConsultant: boolean;
  setHasOpenedConsultant: React.Dispatch<React.SetStateAction<boolean>>;
  openConsultant: () => void;
  closeConsultant: () => void;
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
  const [hasOpenedConsultant, setHasOpenedConsultant] = useState(false);
  const activeTimers = useRef<NodeJS.Timeout[]>([]);
  const sessionIdRef = useRef(createBrowserSessionId());
  const resetSessionRef = useRef(false);
  const hydratedRef = useRef(false);
  const lastAppliedCartActionIdRef = useRef<string | null>(null);
  const conversationStateRef = useRef(conversationState);
  const messagesRef = useRef(messages);
  const requestGenerationRef = useRef(0);
  const turnQueueRef = useRef<
    {
      id: string;
      text: string;
      isAlternativeRequest: boolean;
      contextProductSlug?: string;
    }[]
  >([]);
  const processingTurnRef = useRef(false);

  type PendingTurn = {
    id: string;
    text: string;
    isAlternativeRequest: boolean;
    contextProductSlug?: string;
  };

  // Cart integration — always read the live store at request time (never a stale sendMessage closure)
  const cart = useCart(brand.slug);
  const liveCartRef = useRef(cart);

  useEffect(() => {
    conversationStateRef.current = conversationState;
  }, [conversationState]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    liveCartRef.current = cart;
  }, [cart]);

  const clearPendingTimers = useCallback(() => {
    activeTimers.current.forEach((t) => clearTimeout(t));
    activeTimers.current = [];
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => clearPendingTimers();
  }, [clearPendingTimers]);

  const createCanonicalWelcomeMessage = useCallback(
    (brandConfig: BrandConfig): ConversationMessage => {
      return {
        id: `welcome-${brandConfig.slug}`,
        type: 'assistant',
        text: getBrandWelcomeMessage(brandConfig),
        suggestedChips: brandConfig.finder?.examplePrompts?.slice(0, 3) || [],
        timestamp: new Date(),
      };
    },
    []
  );

  const openConsultant = useCallback(() => {
    setHasOpenedConsultant(true);
    setIsCompactOpen(true);
    setMessages((prev) => {
      if (prev.length > 0) return prev;
      return [createCanonicalWelcomeMessage(brand)];
    });
  }, [brand, createCanonicalWelcomeMessage]);

  const closeConsultant = useCallback(() => {
    setIsCompactOpen(false);
  }, []);

  const activeBrandSlug = useRef(brand.slug);
  useEffect(() => {
    const brandChanged = activeBrandSlug.current !== brand.slug;
    if (brandChanged) {
      activeBrandSlug.current = brand.slug;
      requestGenerationRef.current += 1;
      turnQueueRef.current = [];
      processingTurnRef.current = false;
      clearPendingTimers();
      setIsTyping(false);
      setIsCompactOpen(false);
    }

    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(sessionStorageKey(brand.slug));
      if (!raw) {
        sessionIdRef.current = createBrowserSessionId();
        if (brandChanged) {
          setMessages([]);
          setConversationState(undefined);
          setActivePreferences(null);
          setLatestDebugInfo(null);
          setHasOpenedConsultant(false);
        }
        return;
      }
      const saved = JSON.parse(raw) as {
        sessionId?: string;
        messages?: ConversationMessage[];
        conversationState?: ConversationState;
      };
      if (saved.sessionId) sessionIdRef.current = saved.sessionId;
      if (saved.conversationState) setConversationState(saved.conversationState);
      if (saved.messages && saved.messages.length > 0) {
        setMessages(saved.messages);
        setHasOpenedConsultant(true);
      }
    } catch {
      sessionIdRef.current = createBrowserSessionId();
    }
    hydratedRef.current = true;
  }, [brand.slug, clearPendingTimers]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hydratedRef.current) return;
    try {
      window.sessionStorage.setItem(
        sessionStorageKey(brand.slug),
        JSON.stringify({
          sessionId: sessionIdRef.current,
          messages,
          conversationState,
        })
      );
    } catch {
      // Ignore quota / private mode failures
    }
  }, [brand.slug, messages, conversationState]);

  const resetConversation = useCallback(() => {
    requestGenerationRef.current += 1;
    turnQueueRef.current = [];
    processingTurnRef.current = false;
    clearPendingTimers();
    setConversationState(undefined);
    setActivePreferences(null);
    setLatestDebugInfo(null);
    setIsTyping(false);
    setMessages([createCanonicalWelcomeMessage(brand)]);
    setHasOpenedConsultant(false);
    sessionIdRef.current = createBrowserSessionId();
    resetSessionRef.current = true;
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(sessionStorageKey(brand.slug));
    }
  }, [brand, clearPendingTimers, createCanonicalWelcomeMessage]);

  const executeTurn = useCallback(
    async (turn: PendingTurn) => {
      const generation = requestGenerationRef.current;
      messagesRef.current = messagesRef.current.map((m) =>
        m.id === turn.id ? { ...m, queued: false } : m
      );
      setMessages(messagesRef.current);
      setIsTyping(true);

      const wait = (ms: number) =>
        new Promise<void>((resolve) => {
          setTimeout(resolve, ms);
        });

      const cancelled = () => generation !== requestGenerationRef.current;

      try {
        const historyPayload = messagesRef.current
          .filter((m) => m.id !== turn.id)
          .filter((m) => m.type === 'user' || m.type === 'assistant')
          .slice(-24)
          .map((m) => ({
            role: m.type === 'user' ? ('user' as const) : ('assistant' as const),
            content: m.text || '',
          }));

        const liveCart = liveCartRef.current;
        const cartPayload = serializeCartRequestPayload(
          brand.slug,
          liveCart.getBrandItems(brand.slug).map((item) => ({
            productId: item.productId,
            brandSlug: item.brandSlug || brand.slug,
            quantity: item.quantity,
          }))
        );

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: turn.text,
            brandSlug: brand.slug,
            conversationState: conversationStateRef.current,
            history: historyPayload,
            sessionId: sessionIdRef.current,
            resetSession: resetSessionRef.current,
            contextProductSlug: turn.contextProductSlug,
            isAlternativeRequest: turn.isAlternativeRequest,
            cart: cartPayload,
          }),
        });

        if (!res.ok) {
          throw new Error(`API error HTTP ${res.status}`);
        }

        const data: ChatApiResponse = await res.json();
        if (cancelled()) return;
        resetSessionRef.current = false;
        if (data.sessionId) {
          sessionIdRef.current = data.sessionId;
        }

        if (isAuthorizedCartMutation(data.cartAction)) {
          const actionId = data.cartAction.actionId;
          if (actionId && lastAppliedCartActionIdRef.current === actionId) {
            // Same transaction already applied (retry / rerender)
          } else {
            lastAppliedCartActionIdRef.current = actionId || lastAppliedCartActionIdRef.current;
            const actionItems =
              data.cartAction.items && data.cartAction.items.length > 0
                ? data.cartAction.items
                : data.cartAction.productId
                  ? [
                      {
                        productId: data.cartAction.productId,
                        brandSlug: data.cartAction.brandSlug || brand.slug,
                        quantity: data.cartAction.quantity || 1,
                      },
                    ]
                  : [];
            if (data.cartAction.action === 'ADD_TO_CART') {
              for (const item of actionItems) {
                liveCartRef.current.addItem(item.productId, item.brandSlug || brand.slug, item.quantity || 1);
              }
            } else if (data.cartAction.action === 'REMOVE_FROM_CART') {
              for (const item of actionItems) {
                liveCartRef.current.removeItem(item.productId, item.brandSlug || brand.slug);
              }
            } else if (data.cartAction.action === 'CLEAR_CART') {
              liveCartRef.current.clearBrandCart(data.cartAction.brandSlug || brand.slug);
            }
          }
        }

        conversationStateRef.current = data.updatedState;
        setConversationState(data.updatedState);
        const structured = toStructuredPreferences(data.updatedState.preferences, turn.text);
        setActivePreferences(structured);
        if (data.debugInfo) {
          setLatestDebugInfo(data.debugInfo);
        }

        const thoughtList: string[] =
          data.messages && data.messages.length > 0 ? data.messages : [data.reply];

        if (data.intent === 'RESET_CONSULTATION') {
          const userTurn = messagesRef.current.find((m) => m.id === turn.id);
          messagesRef.current = [
            createCanonicalWelcomeMessage(brand),
            ...(userTurn ? [{ ...userTurn, queued: false }] : []),
          ];
          setMessages(messagesRef.current);
          setActivePreferences({});
        }

        const firstMsg: ConversationMessage = {
          id: `assistant-${Date.now()}-0`,
          type: 'assistant',
          text: thoughtList[0],
          suggestedChips: thoughtList.length === 1 ? data.suggestedChips : undefined,
          timestamp: new Date(),
          debugInfo: data.debugInfo,
        };
        messagesRef.current = [...messagesRef.current, firstMsg];
        setMessages(messagesRef.current);

        for (let i = 1; i < thoughtList.length; i++) {
          await wait(600);
          if (cancelled()) return;
          const isLastThought = i === thoughtList.length - 1;
          const nextMsg: ConversationMessage = {
            id: `assistant-${Date.now()}-${i}`,
            type: 'assistant',
            text: thoughtList[i],
            suggestedChips: isLastThought ? data.suggestedChips : undefined,
            timestamp: new Date(),
            debugInfo: data.debugInfo,
          };
          messagesRef.current = [...messagesRef.current, nextMsg];
          setMessages(messagesRef.current);
        }

        if (data.needsRecommendations && data.results && data.results.length > 0) {
          await wait(250);
          if (cancelled()) return;
          const recsMsg: ConversationMessage = {
            id: `recs-${Date.now()}`,
            type: 'recommendations',
            results: data.results,
            preferencesSnapshot: structured,
            timestamp: new Date(),
            debugInfo: data.debugInfo,
          };
          messagesRef.current = [...messagesRef.current, recsMsg];
          setMessages(messagesRef.current);
        }
      } catch (err) {
        console.warn('[ScentFinderContext Error]:', err);
        const fallbackMsg: ConversationMessage = {
          id: `assistant-${Date.now()}`,
          type: 'assistant',
          text: `I'm having a little trouble connecting right now. Try telling me the occasion, style, or budget you're shopping for!`,
          timestamp: new Date(),
        };
        messagesRef.current = [...messagesRef.current, fallbackMsg];
        setMessages(messagesRef.current);
      } finally {
        if (!cancelled()) setIsTyping(false);
      }
    },
    [brand, brand.slug, createCanonicalWelcomeMessage]
  );

  const sendMessage = useCallback(
    async (
      rawText: string,
      isAlternativeRequest = false,
      contextProductSlug?: string
    ) => {
      const trimmed = rawText.trim();
      if (!trimmed) return;

      const busy = processingTurnRef.current || turnQueueRef.current.length > 0;
      const turn: PendingTurn = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: trimmed,
        isAlternativeRequest,
        contextProductSlug,
      };

      const userMsg: ConversationMessage = {
        id: turn.id,
        type: 'user',
        text: trimmed,
        timestamp: new Date(),
        queued: busy,
      };
      messagesRef.current = [...messagesRef.current, userMsg];
      setMessages(messagesRef.current);
      turnQueueRef.current.push(turn);

      const drain = async () => {
        if (processingTurnRef.current) return;
        processingTurnRef.current = true;
        try {
          while (turnQueueRef.current.length > 0) {
            const next = turnQueueRef.current.shift();
            if (next) await executeTurn(next);
          }
        } finally {
          processingTurnRef.current = false;
          if (turnQueueRef.current.length > 0) {
            void drain();
          }
        }
      };

      await drain();
    },
    [executeTurn]
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
        hasOpenedConsultant,
        setHasOpenedConsultant,
        openConsultant,
        closeConsultant,
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

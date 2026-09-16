import { InMemoryChatMessageHistory } from '@langchain/core/chat_history';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ChatMessage, ConversationState } from '@/types/chat';

const SESSION_HISTORY_TURNS = 24;

export interface LangChainSession {
  id: string;
  memory: InMemoryChatMessageHistory;
  conversationState?: ConversationState;
  brandSlug: string;
  updatedAt: number;
}

const sessions = new Map<string, LangChainSession>();

function createSessionId(): string {
  return `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newSessionId(): string {
  return createSessionId();
}

function getOrInitSession(sessionId: string, brandSlug: string): LangChainSession {
  const existing = sessions.get(sessionId);
  if (existing && existing.brandSlug === brandSlug) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const session: LangChainSession = {
    id: sessionId,
    memory: new InMemoryChatMessageHistory(),
    brandSlug,
    updatedAt: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

export async function loadLangChainSession(options: {
  sessionId?: string;
  brandSlug: string;
  incomingHistory?: ChatMessage[];
  incomingState?: ConversationState;
  reset?: boolean;
}): Promise<LangChainSession> {
  const sessionId = options.sessionId?.trim() || createSessionId();

  if (options.reset) {
    await clearLangChainSession(sessionId);
  }

  const session = getOrInitSession(sessionId, options.brandSlug);

  if (options.incomingState) {
    session.conversationState = options.incomingState;
  }

  const stored = await session.memory.getMessages();
  if (stored.length === 0 && options.incomingHistory && options.incomingHistory.length > 0) {
    await session.memory.addMessages(
      options.incomingHistory.map((turn) =>
        turn.role === 'user' ? new HumanMessage(turn.content) : new AIMessage(turn.content)
      )
    );
  }

  session.updatedAt = Date.now();
  return session;
}

export async function sessionHistoryAsChat(session: LangChainSession): Promise<ChatMessage[]> {
  const messages = await session.memory.getMessages();
  return messages.slice(-SESSION_HISTORY_TURNS).map((msg) => ({
    role: msg instanceof HumanMessage ? ('user' as const) : ('assistant' as const),
    content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
  }));
}

export async function appendSessionTurn(
  session: LangChainSession,
  userMessage: string,
  assistantReply: string,
  conversationState: ConversationState
): Promise<void> {
  await session.memory.addUserMessage(userMessage);
  await session.memory.addAIMessage(assistantReply);
  session.conversationState = conversationState;
  session.updatedAt = Date.now();
}

export async function clearLangChainSession(sessionId: string): Promise<void> {
  const existing = sessions.get(sessionId);
  if (existing) {
    await existing.memory.clear();
    sessions.delete(sessionId);
  }
}

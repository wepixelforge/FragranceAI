import { CartActionPayload } from '@/types/chat';

/** Client-safe cart authorization check. Do not import from cart-action-resolver in client code. */
export function isAuthorizedCartMutation(payload?: CartActionPayload | null): payload is CartActionPayload {
  if (!payload) return false;
  if (payload.needsClarification || payload.awaitingConfirmation) return false;
  if (payload.success !== true) return false;
  if (payload.action === 'VIEW_CART') return false;
  if (payload.action === 'CLEAR_CART') return true;
  return Boolean((payload.items && payload.items.length > 0) || payload.productId);
}

// Janki Rasoi — Shared Active Order Storage Helpers

export function getActiveTrackingIdentifier(): string | null {
  if (typeof window === 'undefined') return null;

  // 1. Direct tracking token
  const directToken = window.localStorage.getItem('jr_last_tracking_token');
  if (directToken && directToken.trim()) return directToken.trim();

  // 2. Order number
  const lastOrderNumber = window.localStorage.getItem('jr_last_order_number');
  if (lastOrderNumber && lastOrderNumber.trim()) return lastOrderNumber.trim();

  // 3. Most recent order in recent orders list
  try {
    const raw = window.localStorage.getItem('jr_recent_orders');
    if (raw) {
      const recents = JSON.parse(raw);
      if (Array.isArray(recents) && recents.length > 0) {
        const top = recents[0];
        const tok = top.trackingToken || top.orderNumber;
        if (tok && typeof tok === 'string' && tok.trim()) return tok.trim();
      }
    }
  } catch {}

  return null;
}

export function saveActiveOrder(trackingToken: string, orderNumber: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem('jr_last_tracking_token', trackingToken);
    window.localStorage.setItem('jr_last_order_number', orderNumber);

    const recents = JSON.parse(window.localStorage.getItem('jr_recent_orders') || '[]');
    const nextRecents = [
      { trackingToken, orderNumber, placedAt: new Date().toISOString() },
      ...recents.filter((r: any) => r.orderNumber !== orderNumber && r.trackingToken !== trackingToken),
    ].slice(0, 10);
    window.localStorage.setItem('jr_recent_orders', JSON.stringify(nextRecents));

    // Dispatch global event for instant UI update without waiting for poll
    window.dispatchEvent(
      new CustomEvent('jr_order_placed', {
        detail: { trackingToken, orderNumber },
      })
    );
  } catch {}
}

/**
 * Removes stale, expired, or non-existent (404) tracking tokens from localStorage
 * so the frontend does not get trapped in an endless 404 polling loop.
 */
export function clearActiveTrackingIdentifier(invalidToken?: string) {
  if (typeof window === 'undefined') return;
  try {
    const currentToken = window.localStorage.getItem('jr_last_tracking_token');
    const currentOrderNumber = window.localStorage.getItem('jr_last_order_number');

    if (!invalidToken || currentToken === invalidToken || currentOrderNumber === invalidToken) {
      window.localStorage.removeItem('jr_last_tracking_token');
      window.localStorage.removeItem('jr_last_order_number');
    }

    if (invalidToken) {
      const raw = window.localStorage.getItem('jr_recent_orders');
      if (raw) {
        const recents = JSON.parse(raw);
        if (Array.isArray(recents)) {
          const filtered = recents.filter(
            (r: any) => r.trackingToken !== invalidToken && r.orderNumber !== invalidToken
          );
          window.localStorage.setItem('jr_recent_orders', JSON.stringify(filtered));
        }
      }
    }
  } catch {}
}


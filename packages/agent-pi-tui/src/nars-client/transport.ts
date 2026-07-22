import type { WebSocketLike } from '../types.js';

export const WEB_SOCKET_OPEN = 1;

export function socketIsOpen(socket: WebSocketLike | null): boolean {
  return Boolean(socket && (socket.readyState === undefined || socket.readyState === WEB_SOCKET_OPEN));
}

export function addSocketListener(
  socket: WebSocketLike,
  event: 'open' | 'message' | 'error' | 'close',
  listener: (value: unknown) => void,
): () => void {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(event, listener);
    return () => socket.removeEventListener?.(event, listener);
  }
  if (typeof socket.on === 'function') {
    socket.on(event, listener);
    return () => socket.off?.(event, listener);
  }
  const property = `on${event}` as 'onopen' | 'onmessage' | 'onerror' | 'onclose';
  socket[property] = listener;
  return () => {
    if (socket[property] === listener) socket[property] = null;
  };
}

export function messageData(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (ArrayBuffer.isView(value)) return new TextDecoder().decode(value as Uint8Array);
  if (value && typeof value === 'object' && 'data' in value) return messageData((value as { data: unknown }).data);
  return String(value ?? '');
}

export function closeSocket(socket: WebSocketLike | null): void {
  try {
    socket?.close();
  } catch {
    // Detaching is best-effort. The client must not turn a local close into a NARS close.
  }
}


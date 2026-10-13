// LAN HTTP and older Safari do not expose crypto.randomUUID.
export function farmRequestId(randomSource = globalThis.crypto) {
  if (typeof randomSource?.randomUUID === 'function') return randomSource.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof randomSource?.getRandomValues === 'function') randomSource.getRandomValues(bytes);
  else {
    // Last-resort compatibility; this is an idempotency key, not an auth token.
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

const STOP_RE = /\b(stop|unsubscribe|remove me|opt out|cancel|quit)\b/i;

/** True when an inbound message is an opt-out request (TCPA: honor instantly). */
export function isOptOut(text: string): boolean {
  return STOP_RE.test(text);
}

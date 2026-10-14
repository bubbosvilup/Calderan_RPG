import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * One polite live region for the whole app. Regions that re-render on every refresh (cards, lists) are NOT live; instead a new offer, a new
 * confirmation or a finished turn is announced once, by key, through this channel.
 */
interface Announcer { readonly announce: (text: string, key?: string) => void }
const AnnouncerContext = createContext<Announcer>({ announce: () => undefined });

export function AnnouncerProvider({ children }: { readonly children: ReactNode }) {
  const [message, setMessage] = useState("");
  const seen = useRef(new Set<string>());
  const announce = useCallback((text: string, key?: string) => {
    if (key) { if (seen.current.has(key)) return; seen.current.add(key); }
    // Clearing first makes a repeated sentence announce again.
    setMessage("");
    queueMicrotask(() => setMessage(text));
  }, []);
  const value = useMemo(() => ({ announce }), [announce]);
  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{message}</div>
    </AnnouncerContext.Provider>
  );
}

export const useAnnouncer = () => useContext(AnnouncerContext);

/** Announces `text` once per `key` (e.g. an offer ref) when it first renders. */
export function useAnnounceOnce(key: string, text: string) {
  const { announce } = useAnnouncer();
  useEffect(() => { announce(text, key); }, [announce, key, text]);
}

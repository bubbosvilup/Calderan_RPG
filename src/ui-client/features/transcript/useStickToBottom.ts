import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

const NEAR_BOTTOM_PX = 96;

/**
 * Follow-the-latest scrolling that never fights the reader: new content keeps the view pinned to the bottom only when the reader was
 * already near it before the update. Scrolling up stops following and offers "Jump to latest". `pin()` forces it (own submission).
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, contentVersion: unknown) {
  const following = useRef(true);
  const [showJump, setShowJump] = useState(false);
  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    following.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    setShowJump(!following.current);
  }, [ref]);
  const pin = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    following.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJump(false);
  }, [ref]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && following.current) el.scrollTop = el.scrollHeight;
  }, [ref, contentVersion]);
  return { onScroll, pin, showJump };
}

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const focusables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.hidden && el.getAttribute("aria-hidden") !== "true");

/**
 * Modal focus management for drawers and dialogs: on open, the app root becomes `inert` and focus moves into the dialog (to
 * `[data-autofocus]`, else its first control); Tab wraps inside it; Escape closes it; on close focus returns to the control that opened it,
 * or to `fallback()` when that control is gone (re-rendered away).
 */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, onClose: () => void, fallback?: () => HTMLElement | null) {
  const close = useRef(onClose), fallbackRef = useRef(fallback);
  close.current = onClose;
  fallbackRef.current = fallback;
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    const wasInert = root?.inert ?? false;
    if (root && !node.closest("#root")) root.inert = true;
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(node)[0] ?? node).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === "Tab") {
        const items = focusables(node);
        if (!items.length) { event.preventDefault(); return; }
        const first = items[0]!, last = items[items.length - 1]!;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      if (root) root.inert = wasInert;
      const target = invoker?.isConnected ? invoker : fallbackRef.current?.();
      target?.focus();
    };
  }, [ref]);
}

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

const focusables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => !el.hidden && el.getAttribute("aria-hidden") !== "true");

/** Dialogs currently open, oldest first. Only the newest is interactive: opening one makes the previous ones `inert`. */
const openDialogs: HTMLElement[] = [];
let scrollLocks = 0;

/**
 * Modal focus management shared by every dialog (Drawer, Modal and so the Lightbox). While a dialog is open:
 *  - the app root, and any dialog opened before this one, are `inert` (nothing behind it can be reached by pointer, keyboard or assistive tech);
 *  - the page behind does not scroll (`data-scroll-locked` on <html>, reference-counted);
 *  - focus moves into the dialog (to `[data-autofocus]`, else its first control); Tab wraps inside it; Escape closes it (and only it);
 * and when it closes, focus returns to the control that opened it, or to `fallback()` when that control is gone (re-rendered away).
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
    // The dialog's overlay (the portal child of <body>) is what earlier dialogs hide behind.
    const layer = (el: HTMLElement) => (el.closest("[data-dialog-layer]") as HTMLElement | null) ?? el;
    const behind = openDialogs.map(layer).filter(el => !el.inert);
    for (const el of behind) el.inert = true;
    openDialogs.push(node);
    if (scrollLocks++ === 0) document.documentElement.dataset.scrollLocked = "true";
    (node.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(node)[0] ?? node).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Listens on the document so Escape still works when focus fell to <body> (a focused button became disabled after a click).
        if (openDialogs[openDialogs.length - 1] !== node) return;
        event.preventDefault();
        event.stopPropagation();
        close.current();
      } else if (event.key === "Tab") {
        if (!node.contains(document.activeElement)) { event.preventDefault(); (focusables(node)[0] ?? node).focus(); return; }
        const items = focusables(node);
        if (!items.length) { event.preventDefault(); return; }
        const first = items[0]!, last = items[items.length - 1]!;
        if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const at = openDialogs.indexOf(node);
      if (at >= 0) openDialogs.splice(at, 1);
      for (const el of behind) el.inert = false;
      if (root) root.inert = wasInert;
      if (--scrollLocks === 0) delete document.documentElement.dataset.scrollLocked;
      const target = invoker?.isConnected ? invoker : fallbackRef.current?.();
      target?.focus();
    };
  }, [ref]);
}

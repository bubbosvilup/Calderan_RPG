import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { cx } from "../../lib/cx";
import styles from "./Modal.module.css";

export interface ModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Visible heading; also the dialog's accessible name. */
  readonly title: string;
  readonly children: ReactNode;
  /** Buttons for the dialog's decisions, right-aligned in the footer. */
  readonly actions?: ReactNode;
  /**
   * "md": a compact decision or form. "wide": content that wants room (an image viewer); on a phone either one fills the viewport.
   */
  readonly size?: "md" | "wide";
  /**
   * Whether a click on the dimmed area closes the dialog. Off by default: a dialog that holds a decision or typed input must not vanish
   * from a stray click. Turn it on only for read-only viewers (the image lightbox).
   */
  readonly dismissOnBackdrop?: boolean;
  /** Where focus goes on close when the opening control no longer exists. */
  readonly returnFocus?: () => HTMLElement | null;
  /**
   * Extra keys for the dialog (the lightbox's arrow keys). Receives keydown from whichever control inside the dialog has focus; Escape and Tab
   * are already handled and never reach it.
   */
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

/**
 * A modal dialog for a short, focused interaction: it blocks everything behind it until it is closed. Not for pages (Inventory, the player
 * page are routes) and not for contextual side panels (Drawer). Focus, Escape, inert background, scroll lock and focus return are the same
 * `useDialogFocus` the Drawer uses.
 *
 * Nesting policy: one modal at a time. A dialog opened above another (a modal above a drawer, say) makes the earlier one inert until it
 * closes, but UI code should not nest on purpose: a confirmation inside a modal is rendered inline in that modal, not as a second one.
 */
export function Modal(props: ModalProps) {
  return props.open ? createPortal(<ModalPanel {...props} />, document.body) : null;
}

function ModalPanel({ onClose, title, children, actions, size = "md", dismissOnBackdrop = false, returnFocus, onKeyDown }: ModalProps) {
  const ref = useRef<HTMLElement>(null), titleId = useId();
  useDialogFocus(ref, onClose, returnFocus);
  return (
    <div className={styles.overlay} data-dialog-layer>
      {dismissOnBackdrop
        ? <button type="button" tabIndex={-1} className={styles.backdrop} aria-hidden="true" onClick={onClose} />
        : <span className={styles.backdrop} aria-hidden="true" />}
      <section ref={ref} className={cx(styles.dialog, size === "wide" && styles.wide)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={onKeyDown}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button type="button" className={styles.close} aria-label={`Close ${title}`} onClick={onClose}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {actions ? <footer className={styles.actions}>{actions}</footer> : null}
      </section>
    </div>
  );
}

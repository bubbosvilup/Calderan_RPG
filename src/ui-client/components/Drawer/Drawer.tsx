import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { cx } from "../../lib/cx";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Visible heading; also the dialog's accessible name. */
  readonly title: string;
  readonly eyebrow?: string;
  readonly side?: "left" | "right";
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  /** Where focus goes on close when the opening control no longer exists. */
  readonly returnFocus?: () => HTMLElement | null;
}

/** A modal side panel (character details now; inventory, gallery and other modules later). Rendered in a portal above the app root. */
export function Drawer(props: DrawerProps) {
  return props.open ? createPortal(<DrawerPanel {...props} />, document.body) : null;
}

function DrawerPanel({ onClose, title, eyebrow, side = "right", children, footer, returnFocus }: DrawerProps) {
  const ref = useRef<HTMLElement>(null), titleId = useId();
  useDialogFocus(ref, onClose, returnFocus);
  return (
    <div className={styles.overlay} data-dialog-layer>
      <button type="button" tabIndex={-1} className={styles.backdrop} aria-label={`Close ${title}`} onClick={onClose} />
      <section ref={ref} className={cx(styles.panel, side === "left" ? styles.left : styles.right)} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <header className={styles.header}>
          <div className={styles.heading}>
            {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
            <h2 id={titleId} className={styles.title}>{title}</h2>
          </div>
          <button type="button" className={styles.close} aria-label={`Close ${title}`} onClick={onClose} data-autofocus>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className={styles.body}>{children}</div>
        {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      </section>
    </div>
  );
}

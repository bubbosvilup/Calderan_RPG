import { useId, type ReactNode } from "react";
import { Button } from "../../components/Button/Button";
import { cx } from "../../lib/cx";
import styles from "./ConfirmationCard.module.css";

/**
 * The one confirmation pattern for explicit, player-authorized acts (a pending confirmation from the engine, NPC+ promotion). Presentational
 * only: what the act means and whether it is allowed are decided elsewhere. Both buttons are real buttons with verbs that make sense
 * out of context; while unavailable, the reason is visible and attached to the buttons (aria-describedby).
 */
export function ConfirmationCard({ eyebrow = "Needs your confirmation", title, body, confirmLabel, cancelLabel, onConfirm, onCancel, pending, unavailableReason, error, autoFocus, refAttribute, className }: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly body: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  /** A request for this card is in flight. */
  readonly pending: boolean;
  /** Set while the act cannot be taken right now (e.g. a turn is running). */
  readonly unavailableReason?: string | null;
  readonly error?: string | null;
  /** Move focus to Confirm on mount (used when the card replaces the control that opened it). */
  readonly autoFocus?: boolean;
  /** Data attribute carrying the opaque ref, for tests and browser checks. Never displayed. */
  readonly refAttribute?: string;
  readonly className?: string | undefined;
}) {
  const titleId = useId(), reasonId = useId();
  const disabled = pending || !!unavailableReason;
  const describedBy = unavailableReason ? reasonId : undefined;
  return (
    <section className={cx(styles.card, className)} role="group" aria-labelledby={titleId} data-confirmation-ref={refAttribute}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <strong id={titleId} className={styles.title}>{title}</strong>
      <div className={styles.body}>{body}</div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={onConfirm} disabled={disabled} aria-describedby={describedBy} aria-label={`Confirm: ${confirmLabel}`} autoFocus={autoFocus}>
          {pending ? "Working…" : confirmLabel}
        </Button>
        <Button onClick={onCancel} disabled={disabled} aria-describedby={describedBy} aria-label={`Cancel: ${title} ${cancelLabel}`}>{cancelLabel}</Button>
        {unavailableReason ? <span id={reasonId} className={styles.reason}>{unavailableReason}</span> : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </section>
  );
}

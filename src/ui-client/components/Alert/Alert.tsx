import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Alert.module.css";

/**
 * Inline message. `error` is announced assertively (role=alert); `warning` / `info` / `success` politely (role=status). Copy should say
 * what happened and what the player can do.
 */
export function Alert({ tone, title, children, action, onDismiss, className }: {
  readonly tone: "error" | "warning" | "info" | "success";
  readonly title?: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
  readonly onDismiss?: () => void;
  readonly className?: string | undefined;
}) {
  return (
    <div className={cx(styles.alert, styles[tone], className)} role={tone === "error" ? "alert" : "status"}>
      <div className={styles.body}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div>{children}</div>
      </div>
      {action || onDismiss ? (
        <div className={styles.actions}>
          {action}
          {onDismiss ? <button type="button" className={styles.dismiss} onClick={onDismiss}>Dismiss</button> : null}
        </div>
      ) : null}
    </div>
  );
}

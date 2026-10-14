import { useId, type ReactNode } from "react";
import styles from "./ErrorState.module.css";

/** A whole-panel failure (the page could not load). Inline failures use Alert instead. */
export function ErrorState({ title, message, action }: { readonly title: string; readonly message: string; readonly action?: ReactNode }) {
  const titleId = useId();
  return (
    <section className={styles.state} role="alert" aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      {action ? <div className={styles.action}>{action}</div> : null}
    </section>
  );
}

/** Nothing to show yet; says why, and optionally what to do. */
export function EmptyState({ children }: { readonly children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

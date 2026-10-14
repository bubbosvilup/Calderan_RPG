import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./PageLayout.module.css";

/**
 * Frame for the page-like screens of a session (Inventory, the player character page): the same header as the play screen (brand, campaign
 * name, then navigation and the save state as slots) and one scrolling column under it. Slots keep the layout free of feature knowledge.
 */
export function PageLayout({ campaign, nav, trailing, label, children }: {
  readonly campaign: string;
  readonly nav: ReactNode;
  readonly trailing?: ReactNode;
  /** Accessible name of the page's <main>. */
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}><span aria-hidden="true">◊ </span>Caldrevan</Link>
        <span className={styles.campaign} title={campaign}>{campaign}</span>
        {nav}
        <span className={styles.spacer} />
        {trailing}
      </header>
      <main id="main-content" className={styles.main} aria-label={label}>
        <div className={styles.column}>{children}</div>
      </main>
    </div>
  );
}

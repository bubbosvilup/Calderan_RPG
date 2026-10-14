import type { ReactNode } from "react";
import { Link } from "react-router";
import styles from "./CampaignLayout.module.css";

/** Frame for the screens outside play (campaign selection, route errors): a header and one centered column. */
export function CampaignLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.brand}><span aria-hidden="true">◊ </span>Caldrevan</Link>
      </header>
      <main id="main-content" className={styles.main}>{children}</main>
    </div>
  );
}

import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Badge.module.css";

export function Badge({ children, tone = "neutral" }: { readonly children: ReactNode; readonly tone?: "neutral" | "accent" }) {
  return <span className={cx(styles.badge, tone === "accent" && styles.accent)}>{children}</span>;
}

import styles from "./Spinner.module.css";

/** Decorative by default; pass `label` when the spinner is the only signal (it is then announced as a status). */
export function Spinner({ label, size = "md" }: { readonly label?: string; readonly size?: "sm" | "md" }) {
  return (
    <span className={styles.wrap} {...(label ? { role: "status" } : { "aria-hidden": true })}>
      <span className={size === "sm" ? styles.small : styles.spinner} />
      {label ? <span className={styles.label}>{label}</span> : null}
    </span>
  );
}

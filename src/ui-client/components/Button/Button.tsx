import type { ButtonHTMLAttributes, Ref } from "react";
import { cx } from "../../lib/cx";
import styles from "./Button.module.css";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: "primary" | "secondary" | "ghost" | "danger";
  readonly size?: "sm" | "md";
  readonly ref?: Ref<HTMLButtonElement>;
}

/** A real <button>, `type="button"` unless told otherwise (no accidental form submits). */
export function Button({ variant = "secondary", size = "md", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={cx(styles.button, styles[variant], styles[size], className)} {...rest} />;
}

import { cx } from "../../lib/cx";
import { Image } from "../Image/Image";
import styles from "./Avatar.module.css";

/**
 * A character's avatar: the server-selected image when one exists, else an initial (or "?" when the name is not known to the player).
 * Decorative: the name is always rendered next to it.
 */
export function Avatar({ url, name, nameKnown = true, size = "md" }: { readonly url: string | null | undefined; readonly name: string; readonly nameKnown?: boolean; readonly size?: "sm" | "md" | "lg" }) {
  const initial = nameKnown ? name.trim().charAt(0).toUpperCase() || "?" : "?";
  return (
    <span className={cx(styles.avatar, styles[size])} aria-hidden="true">
      <Image src={url} alt="" ratio="avatar" fallback={<span className={styles.initial}>{initial}</span>} />
    </span>
  );
}

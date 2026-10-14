import { useState, type ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./Image.module.css";

export type ImageRatio = "avatar" | "portrait" | "fullBody" | "scene";

/**
 * The one image primitive for every artwork surface (avatars, portraits, full body, items, scene art). It reserves its box from a ratio
 * token before the file arrives (no layout shift), loads lazily and decodes asynchronously unless `priority` is set, shows a placeholder
 * while loading and the given `fallback` when there is no URL or the file is missing. URLs always come from the server's read model;
 * this component never builds a path.
 */
export function Image({ src, alt, ratio = "avatar", fit = "cover", fallback, priority = false, className }: {
  readonly src: string | null | undefined;
  /** "" for decorative images (the name is next to it). */
  readonly alt: string;
  readonly ratio?: ImageRatio;
  readonly fit?: "cover" | "contain";
  readonly fallback: ReactNode;
  readonly priority?: boolean;
  readonly className?: string | undefined;
}) {
  // Keyed by URL: a new URL restarts the loading state without an effect.
  return <ImageFrame key={src ?? ""} src={src} alt={alt} ratio={ratio} fit={fit} fallback={fallback} priority={priority} className={className} />;
}

function ImageFrame({ src, alt, ratio, fit, fallback, priority, className }: {
  readonly src: string | null | undefined; readonly alt: string; readonly ratio: ImageRatio; readonly fit: "cover" | "contain";
  readonly fallback: ReactNode; readonly priority: boolean; readonly className: string | undefined;
}) {
  const [state, setState] = useState<"loading" | "loaded" | "missing">(src ? "loading" : "missing");
  return (
    <span className={cx(styles.frame, styles[ratio], className)} data-state={state}>
      {src && state !== "missing" ? (
        <img
          className={cx(styles.image, fit === "contain" && styles.contain)}
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onLoad={() => setState("loaded")}
          onError={() => setState("missing")}
        />
      ) : null}
      {state === "loading" ? <span className={styles.placeholder} aria-hidden="true" /> : null}
      {state === "missing" ? <span className={styles.fallback}>{fallback}</span> : null}
    </span>
  );
}

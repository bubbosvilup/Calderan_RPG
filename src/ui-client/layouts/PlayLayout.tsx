import { useState, type ReactNode } from "react";
import { Button } from "../components/Button/Button";
import { Drawer } from "../components/Drawer/Drawer";
import { useMediaQuery } from "../hooks/useMediaQuery";
import styles from "./PlayLayout.module.css";

export const WIDE_QUERY = "(min-width: 1200px)";
export const MEDIUM_QUERY = "(min-width: 800px)";

/**
 * The play screen frame. Wide: overview | story | people. Medium: story | people, with the overview in a drawer. Small: story only, both
 * side panels in drawers opened from the header. Panels are slots: each feature decides what it renders; the layout decides only where.
 * `--play-backdrop-image` (tokens.css) is the seam for illustrated scene backgrounds.
 */
export function PlayLayout({ header, left, right, main, leftLabel = "Overview", rightLabel = "People" }: {
  readonly header: ReactNode;
  readonly left: ReactNode;
  /** Receives `closePanel` so a control inside a collapsed panel can close it before opening something else. */
  readonly right: (helpers: { readonly closePanel: () => void }) => ReactNode;
  readonly main: ReactNode;
  readonly leftLabel?: string;
  readonly rightLabel?: string;
}) {
  const wide = useMediaQuery(WIDE_QUERY), medium = useMediaQuery(MEDIUM_QUERY);
  const [panel, setPanel] = useState<"left" | "right" | null>(null);
  const closePanel = () => setPanel(null);
  const leftInline = wide, rightInline = medium;
  return (
    <div className={styles.shell}>
      <div className={styles.backdrop} aria-hidden="true" />
      <header className={styles.header}>
        {header}
        {!leftInline || !rightInline ? (
          <div className={styles.toggles}>
            {!leftInline ? <Button size="sm" aria-haspopup="dialog" onClick={() => setPanel("left")}>{leftLabel}</Button> : null}
            {!rightInline ? <Button size="sm" aria-haspopup="dialog" onClick={() => setPanel("right")}>{rightLabel}</Button> : null}
          </div>
        ) : null}
      </header>
      <div className={styles.body} data-left={leftInline} data-right={rightInline}>
        {leftInline ? <aside className={styles.left} aria-label={leftLabel}>{left}</aside> : null}
        <main id="main-content" className={styles.main}>{main}</main>
        {rightInline ? <aside className={styles.right} aria-label={rightLabel}>{right({ closePanel })}</aside> : null}
      </div>
      <Drawer open={panel === "left" && !leftInline} side="left" title={leftLabel} onClose={closePanel}>{left}</Drawer>
      <Drawer open={panel === "right" && !rightInline} title={rightLabel} onClose={closePanel}>{right({ closePanel })}</Drawer>
    </div>
  );
}

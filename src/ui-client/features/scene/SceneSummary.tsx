import { useId } from "react";
import type { SceneSummaryDto } from "../../api/types";
import styles from "./SceneSummary.module.css";

/**
 * Where and when the player is, exactly as the engine's scene projection words it (calendar date and time of day are derived server-side;
 * the client never computes time). There is no weather display: weather exists in the narrator's scene line only.
 */
export function SceneSummary({ scene }: { readonly scene: SceneSummaryDto }) {
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <h2 id={headingId} className={styles.eyebrow}>You are in</h2>
      <p className={styles.location}>{scene.location}</p>
      <p className={styles.time}><span>{scene.date_text}</span><span className={styles.daypart}>{scene.time_of_day}</span></p>
    </section>
  );
}

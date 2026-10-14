import { memo, useMemo } from "react";
import type { TranscriptMessage } from "../../api/types";
import { cx } from "../../lib/cx";
import { parseStoryText } from "./rpgText";
import styles from "./Transcript.module.css";

/** One committed message. Memoized: the cache keeps unchanged message objects identical, so a new turn renders only the new items. */
export const MessageItem = memo(function MessageItem({ message, playerName }: { readonly message: TranscriptMessage; readonly playerName: string }) {
  const segments = useMemo(() => parseStoryText(message.text), [message.text]);
  const speaker = message.role === "player" ? playerName : message.role === "narrator" ? "Narrator" : "Notice";
  return (
    <article className={cx(styles.message, styles[message.role])}>
      <span className={styles.speaker}>{speaker}</span>
      <p className={styles.text}>
        {segments.map((segment, index) => (
          <span key={index} className={segment.kind === "narration" ? styles.narration : styles.dialogue}>{segment.text}</span>
        ))}
      </p>
    </article>
  );
});

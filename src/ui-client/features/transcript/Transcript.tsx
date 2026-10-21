import { useEffect, useRef, type ReactNode } from "react";
import type { AlternateModelDto, TranscriptMessage, TurnPhase } from "../../api/types";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { cx } from "../../lib/cx";
import { MessageItem } from "./MessageItem";
import { useStickToBottom } from "./useStickToBottom";
import styles from "./Transcript.module.css";

const NO_MODELS: readonly AlternateModelDto[] = [];

/** The player's own submission while the turn runs: presentation only, replaced by the committed messages when the result arrives. */
export interface PendingTurn { readonly text: string; readonly phase: TurnPhase }

/** Status words come from this closed table, never from server text; no narrator prose exists in the page before the commit. */
export const PHASE_LABELS: Readonly<Record<TurnPhase, string>> = { thinking: "Thinking…", narrating: "Narrating…", resolving: "Resolving…" };

/**
 * The story so far. Committed messages render in a `log` (new ones are announced politely); the pending exchange and the inline state
 * cards (Actual Offer, confirmations) follow the newest message inside the same scroll area. Long histories stay cheap: items are
 * memoized and off-screen items skip layout and paint (content-visibility) — the seam for virtualization if histories outgrow the
 * server's 500-message window.
 */
export function Transcript({ messages, playerName, pending, contentVersion, alternateModels = NO_MODELS, children }: {
  readonly messages: readonly TranscriptMessage[];
  readonly playerName: string;
  readonly pending: PendingTurn | null;
  /** Changes whenever content below the log changes (cards appear, revision moves), so the view keeps following. */
  readonly contentVersion: string;
  /** Models offered for narrator comparison (a stable array: messages are memoized on it). */
  readonly alternateModels?: readonly AlternateModelDto[];
  readonly children?: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { onScroll, pin, showJump } = useStickToBottom(scrollRef, `${messages.length}:${messages.at(-1)?.seq ?? ""}:${pending?.phase ?? ""}:${contentVersion}`);
  // The player's own submission always brings the newest exchange into view.
  const pendingText = pending?.text;
  useEffect(() => { if (pendingText !== undefined) pin(); }, [pendingText, pin]);
  return (
    <div className={styles.wrap}>
      <div ref={scrollRef} className={styles.scroll} onScroll={onScroll} role="region" aria-label="Story" tabIndex={0}>
        <div className={styles.column}>
          <section className={styles.log} role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
            {messages.length ? messages.map((message, index) => <MessageItem key={message.seq ?? `i${index}`} message={message} playerName={playerName} models={alternateModels} />)
              : <EmptyState>The story has not started yet.</EmptyState>}
          </section>
          {pending ? (
            <div className={styles.pending} aria-hidden="true">
              <article className={cx(styles.message, styles.player, styles.sending)}>
                <span className={styles.speaker}>{playerName}</span>
                <p className={styles.text}>{pending.text}</p>
              </article>
              <article className={cx(styles.message, styles.narrator, styles.working)} aria-busy="true">
                <span className={styles.speaker}>Narrator</span>
                <p className={styles.text}><span className={styles.phase}>{PHASE_LABELS[pending.phase]}</span></p>
              </article>
            </div>
          ) : null}
          {children}
        </div>
      </div>
      {showJump ? <button type="button" className={styles.jump} onClick={pin}>Jump to latest <span aria-hidden="true">↓</span></button> : null}
    </div>
  );
}

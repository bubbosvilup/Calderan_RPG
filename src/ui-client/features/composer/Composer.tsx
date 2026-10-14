import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Button } from "../../components/Button/Button";
import styles from "./Composer.module.css";

export const MAX_INPUT = 4000;

/**
 * The player's input. The draft is local presentation state (typing never re-renders the transcript). Enter sends, Shift+Enter starts a
 * new line, composition (IME) input is never sent half-finished. A submission is accepted at most once while `busy`; the draft is cleared
 * only when the submit handler reports it was taken, so a refused turn keeps the text for a resend. When the page unlocks after a turn,
 * focus returns to the input if it was there.
 */
export function Composer({ playerName, locked, busy, statusText, onSubmit }: {
  readonly playerName: string;
  /** No input is accepted (a turn or another action is running, or the session is closed). */
  readonly locked: boolean;
  /** A turn from this page is running. */
  readonly busy: boolean;
  readonly statusText: string;
  /** Resolves true when the text was taken (clear the draft), false to keep it. */
  readonly onSubmit: (text: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null), submitting = useRef(false), hadFocus = useRef(false);
  const inputId = useId(), hintId = useId(), statusId = useId();
  useEffect(() => {
    if (!locked && hadFocus.current) { hadFocus.current = false; inputRef.current?.focus(); }
  }, [locked]);
  const send = async () => {
    const text = draft.trim();
    if (!text || locked || submitting.current) return;
    submitting.current = true;
    hadFocus.current = document.activeElement === inputRef.current || hadFocus.current;
    try { if (await onSubmit(text)) setDraft(""); }
    finally { submitting.current = false; }
  };
  const onFormSubmit = (event: FormEvent) => { event.preventDefault(); void send(); };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  };
  return (
    <form className={styles.composer} onSubmit={onFormSubmit} aria-label="Your action">
      <p id={statusId} className={styles.status} role="status">{statusText}</p>
      <div className={styles.row}>
        <label htmlFor={inputId} className="sr-only">What {playerName} says or does</label>
        <textarea
          ref={inputRef}
          id={inputId}
          data-composer-input
          className={styles.input}
          rows={2}
          maxLength={MAX_INPUT}
          value={draft}
          placeholder={`What does ${playerName} say or do?`}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={`${hintId} ${statusId}`}
          // Read-only rather than disabled while waiting: the text stays selectable and focus is not thrown away mid-turn.
          readOnly={locked}
          aria-disabled={locked}
        />
        <Button type="submit" variant="primary" disabled={locked || !draft.trim()} aria-busy={busy}>
          {busy ? "Sending…" : "Send"}
        </Button>
      </div>
      <small id={hintId} className={styles.hint}>Enter to send · Shift+Enter for a new line · /location &lt;place&gt; corrects your location</small>
    </form>
  );
}

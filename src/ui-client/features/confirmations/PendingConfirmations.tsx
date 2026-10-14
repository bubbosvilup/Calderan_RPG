import { useRef, useState } from "react";
import { resolveConfirmation } from "../../api/confirmations";
import type { ConfirmationCardDto, ConfirmationViewDto } from "../../api/types";
import { useAnnounceOnce } from "../../hooks/announcer";
import { errorMessage, useSessionAction } from "../../state/serverState";
import { ConfirmationCard } from "./ConfirmationCard";
import styles from "./ConfirmationCard.module.css";

/**
 * The engine's pending confirmations ("Free Maren?"), inline after the newest message. Card text, labels and outcomes come from the
 * read model; this component sends only the opaque ref and the rendered revision. Outcome notices are echoed only for cards this page
 * showed (a reload does not resurface old history).
 */
export function PendingConfirmations({ view, blockedReason, onSettled }: {
  readonly view: ConfirmationViewDto;
  /** Why no action can be taken right now (a turn or another request is running), else null. */
  readonly blockedReason: string | null;
  /** Called when a request finishes (the page restores focus if the clicked button went away). */
  readonly onSettled?: () => void;
}) {
  const shown = useRef(new Set<string>());
  for (const card of view.cards) shown.current.add(card.ref);
  const action = useSessionAction("confirmation", (request: { readonly action: "confirm" | "cancel"; readonly ref: string }, revision) => resolveConfirmation({ ...request, expectedRevision: revision }));
  const [failure, setFailure] = useState<{ readonly ref: string; readonly message: string } | null>(null);
  const act = (kind: "confirm" | "cancel", ref: string) => {
    if (action.isPending) return;
    setFailure(null);
    action.mutate({ action: kind, ref }, {
      onError: error => setFailure({ ref, message: errorMessage(error, "That could not be completed. Nothing changed.") }),
      onSettled: () => onSettled?.(),
    });
  };
  const notices = view.recent.filter(notice => shown.current.has(notice.ref)).slice(-2);
  if (!view.cards.length && !notices.length) return null;
  return (
    <div className={styles.region}>
      {notices.map(notice => (
        <p key={`${notice.ref}:${notice.status}`} className={styles.notice} data-confirmation-notice={notice.ref}>
          <span aria-hidden="true">{notice.status === "confirmed" ? "✓ " : "• "}</span>{notice.subject_label}: {notice.text}
        </p>
      ))}
      {view.cards.map(card => (
        <PendingCard key={card.ref} card={card} pending={action.isPending && action.variables?.ref === card.ref} blockedReason={blockedReason} error={failure?.ref === card.ref ? failure.message : null} onAct={act} />
      ))}
    </div>
  );
}

function PendingCard({ card, pending, blockedReason, error, onAct }: {
  readonly card: ConfirmationCardDto; readonly pending: boolean; readonly blockedReason: string | null; readonly error: string | null;
  readonly onAct: (kind: "confirm" | "cancel", ref: string) => void;
}) {
  useAnnounceOnce(`confirm:${card.ref}`, `Needs your confirmation: ${card.title}`);
  return (
    <ConfirmationCard
      title={card.title}
      body={card.body}
      confirmLabel={card.confirm_label}
      cancelLabel={card.cancel_label}
      onConfirm={() => onAct("confirm", card.ref)}
      onCancel={() => onAct("cancel", card.ref)}
      pending={pending}
      unavailableReason={pending ? null : blockedReason}
      error={error}
      refAttribute={card.ref}
    />
  );
}

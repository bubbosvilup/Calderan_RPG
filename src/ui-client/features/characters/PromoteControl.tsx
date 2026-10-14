import { useRef, useState } from "react";
import { promoteToNpcPlus } from "../../api/characters";
import type { CharacterCardDto } from "../../api/types";
import { Button } from "../../components/Button/Button";
import { errorMessage, useSessionAction } from "../../state/serverState";
import { ConfirmationCard } from "../confirmations/ConfirmationCard";

/**
 * Explicit NPC+ promotion (the Heartstone rite confirmation). The control exists only when the engine's capability says the character is
 * eligible right now; React never evaluates household, location or status rules. The first click only opens the confirmation; only
 * Promote sends the one request. On success the card re-renders from the returned state (now NPC+, so this control disappears).
 */
export function PromoteControl({ card, blockedReason }: { readonly card: CharacterCardDto; readonly blockedReason: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opener = useRef<HTMLButtonElement>(null), dialog = useRef<HTMLElement | null>(null);
  const promote = useSessionAction("promote", (ref: string, revision) => promoteToNpcPlus({ ref, expectedRevision: revision }));
  if (!card.character_capabilities.can_promote_to_npc_plus) return null;
  if (!confirming) {
    return (
      <Button ref={opener} onClick={event => { dialog.current = event.currentTarget.closest("[role='dialog']"); setError(null); setConfirming(true); }} aria-label={`Promote ${card.name} to NPC+`}>
        <span aria-hidden="true">↑</span> Promote to NPC+
      </Button>
    );
  }
  return (
    <ConfirmationCard
      eyebrow="NPC+ promotion"
      title={`Promote ${card.name} to NPC+?`}
      body={`Confirm that ${card.name} has completed the Heartstone household rite. This will add them to the household and permanently unlock NPC+ capabilities.`}
      confirmLabel="Promote"
      cancelLabel="Cancel"
      autoFocus
      pending={promote.isPending}
      unavailableReason={promote.isPending ? null : blockedReason}
      error={error}
      onConfirm={() => {
        if (promote.isPending) return;
        setError(null);
        promote.mutate(card.ref, {
          onSuccess: () => { setConfirming(false); requestAnimationFrame(() => dialog.current?.focus()); },
          onError: failure => setError(errorMessage(failure, "The promotion was not saved.")),
        });
      }}
      onCancel={() => { setConfirming(false); requestAnimationFrame(() => opener.current?.focus()); }}
    />
  );
}

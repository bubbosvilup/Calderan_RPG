import { useCallback, useState, type MutableRefObject } from "react";
import { Link, useLocation } from "react-router";
import type { ActiveSessionPayload } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { PlayLayout } from "../../layouts/PlayLayout";
import { inventoryPath, npcCharacterPath, playerCharacterPath } from "../../lib/paths";
import { useRequestInFlight } from "../../state/serverState";
import { CharacterDrawer } from "../characters/CharacterDrawer";
import { CharacterSidebar, findCharacterCard } from "../characters/CharacterSidebar";
import { Composer } from "../composer/Composer";
import { PendingConfirmations } from "../confirmations/PendingConfirmations";
import { PlayerSummary } from "../player/PlayerSummary";
import { SaveBanner } from "../save/SaveBanner";
import { SaveIndicator } from "../save/SaveIndicator";
import { SessionNav } from "../session/SessionNav";
import { SceneSummary } from "../scene/SceneSummary";
import { TradeRegion } from "../trade/TradeRegion";
import { PHASE_LABELS, Transcript } from "../transcript/Transcript";
import { useTurn } from "./useTurn";
import styles from "./PlayScreen.module.css";

const WAIT_FOR_NARRATOR = "Available when the narrator finishes.";
const WAIT_FOR_REQUEST = "Available when the current request finishes.";

/**
 * The play screen for one live session. Everything it shows comes from the session read model; its own state is presentation only (the
 * open character drawer, the pending exchange, dismissed notices). Whether an action may be taken right now is the server's `status`
 * plus "this page already has a request in flight" (one at a time, like the server); eligibility of each action is a read-model flag.
 */
export function PlayScreen({ session, connectionLost, draftRef }: {
  readonly session: ActiveSessionPayload;
  readonly connectionLost: boolean;
  /** Holds the composer draft for the play route, so the text survives a visit to Inventory or the character page. Optional. */
  readonly draftRef?: MutableRefObject<string>;
}) {
  const turn = useTurn();
  const requestInFlight = useRequestInFlight();
  const location = useLocation();
  const [selectedRef, setSelectedRef] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadWarnings, setLoadWarnings] = useState<readonly string[]>(() => {
    const state: unknown = location.state;
    return typeof state === "object" && state !== null && Array.isArray((state as { loadWarnings?: unknown }).loadWarnings) ? (state as { loadWarnings: string[] }).loadWarnings : [];
  });
  const playerName = session.player_character?.name ?? session.play.participants.find(p => p.ref === "player")?.name ?? "You";
  const serverBusy = session.status !== "idle";
  const closed = session.status === "closed";
  const blockedReason = closed ? "The session has ended." : serverBusy || turn.running ? WAIT_FOR_NARRATOR : requestInFlight ? WAIT_FOR_REQUEST : null;
  const statusText = closed ? "Session ended."
    : turn.pending ? PHASE_LABELS[turn.pending.phase]
    : turn.running ? "Working…"
    : serverBusy ? "The narrator is working…"
    : "Your turn.";
  const selectedCard = selectedRef ? findCharacterCard(session, selectedRef) : null;
  const focusComposer = useCallback(() => document.querySelector<HTMLTextAreaElement>("[data-composer-input]"), []);
  // After an inline action the clicked button may be gone; focus lands on the composer instead of the page body.
  const restoreFocus = useCallback(() => requestAnimationFrame(() => {
    if (!document.activeElement || document.activeElement === document.body) focusComposer()?.focus();
  }), [focusComposer]);

  const header = (
    <>
      <Link to="/" className={styles.brand}><span aria-hidden="true">◊ </span>Caldrevan</Link>
      {session.campaign ? <span className={styles.campaign} title={session.campaign.display_name}>{session.campaign.display_name}</span> : <span className={styles.campaign}>Playtest session</span>}
      <SessionNav session={session} />
      <span className={styles.spacer} />
      {session.campaign ? <SaveIndicator campaignId={session.campaign.id} initial={session.campaign.save} onError={setSaveError} /> : null}
    </>
  );

  return (
    <>
      <PlayLayout
        header={header}
        left={(
          <div className={styles.stack}>
            <PlayerSummary player={session.player_character} gold={session.play.gold} characterHref={playerCharacterPath(session)} inventoryHref={inventoryPath(session)} />
            <SceneSummary scene={session.scene} />
          </div>
        )}
        right={({ closePanel }) => (
          <CharacterSidebar session={session} blockedReason={blockedReason} onSettled={restoreFocus} onOpenCharacter={ref => { closePanel(); setSelectedRef(ref); }} />
        )}
        main={(
          <>
            <div className={styles.notices}>
              {connectionLost ? <Alert tone="error">The connection to the game server was lost. Retrying; what you see may be out of date.</Alert> : null}
              {!session.configured ? <Alert tone="warning">The narrator provider is not configured. Set OPENROUTER_API_KEY and restart the game server to play.</Alert> : null}
              {loadWarnings.length ? <Alert tone="warning" title="Loaded with notes" onDismiss={() => setLoadWarnings([])}>{loadWarnings.join(" ")}</Alert> : null}
              {session.campaign ? <SaveBanner campaignId={session.campaign.id} initial={session.campaign.save} /> : null}
              {saveError ? <Alert tone="error" onDismiss={() => setSaveError(null)}>{saveError}</Alert> : null}
            </div>
            <Transcript messages={session.messages} playerName={playerName} pending={turn.pending} {...(session.alternate_models ? { alternateModels: session.alternate_models } : {})} contentVersion={`${session.revision}:${session.trade.offer?.ref ?? ""}:${session.confirmations.cards.length}`}>
              <TradeRegion trade={session.trade} blockedReason={blockedReason} onSettled={restoreFocus} />
              <PendingConfirmations view={session.confirmations} blockedReason={blockedReason} onSettled={restoreFocus} />
            </Transcript>
            <div className={styles.composerArea}>
              {turn.notice ? <Alert tone={turn.notice.tone} onDismiss={turn.dismissNotice} className={styles.turnNotice}>{turn.notice.text}</Alert> : null}
              <Composer playerName={playerName} {...(draftRef ? { initialDraft: draftRef.current, onDraftChange: (text: string) => { draftRef.current = text; } } : {})} locked={closed || serverBusy || requestInFlight} busy={turn.running} statusText={statusText} onSubmit={turn.submit} />
            </div>
          </>
        )}
      />
      <CharacterDrawer card={selectedCard} playerName={playerName} blockedReason={blockedReason} onClose={() => setSelectedRef(null)} returnFocus={focusComposer} editHref={selectedCard?.character_capabilities.can_edit_npc_plus ? npcCharacterPath(session, selectedCard.ref) : null} />
    </>
  );
}

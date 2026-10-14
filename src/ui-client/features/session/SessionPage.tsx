import { useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import type { ActiveSessionPayload } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { PageLayout } from "../../layouts/PageLayout";
import { inventoryPath, playerCharacterPath, playPath } from "../../lib/paths";
import { SaveIndicator } from "../save/SaveIndicator";
import styles from "./SessionPage.module.css";

/**
 * A page of the open session (Inventory, the player character page): the shared page frame with navigation back to Play and between pages,
 * and the save state. The session is owned by the play route above, so moving between pages keeps the query cache and the composer draft.
 */
export function SessionPage({ session, title, children }: { readonly session: ActiveSessionPayload; readonly title: string; readonly children: ReactNode }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const characterName = session.player_character?.name ?? "Character";
  const link = ({ isActive }: { readonly isActive: boolean }) => (isActive ? styles.active : styles.link);
  return (
    <PageLayout
      label={title}
      campaign={session.campaign?.display_name ?? "Playtest session"}
      nav={(
        <nav className={styles.nav} aria-label="Campaign pages">
          <NavLink to={playPath(session)} end className={link}>Play</NavLink>
          <NavLink to={inventoryPath(session)} className={link}>Inventory</NavLink>
          <NavLink to={playerCharacterPath(session)} className={link}>{characterName}</NavLink>
        </nav>
      )}
      trailing={session.campaign ? <SaveIndicator campaignId={session.campaign.id} initial={session.campaign.save} onError={setSaveError} /> : null}
    >
      {saveError ? <Alert tone="error" onDismiss={() => setSaveError(null)}>{saveError}</Alert> : null}
      {children}
    </PageLayout>
  );
}

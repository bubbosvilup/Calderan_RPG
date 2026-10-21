import { useState, type ReactNode } from "react";
import type { ActiveSessionPayload } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { PageLayout } from "../../layouts/PageLayout";
import { SaveBanner } from "../save/SaveBanner";
import { SaveIndicator } from "../save/SaveIndicator";
import { SessionNav } from "./SessionNav";

/**
 * A page of the open session (Household, Inventory, the player and NPC+ character pages, Settings): the shared page frame with navigation back to Play and between pages,
 * and the save state. The session is owned by the play route above, so moving between pages keeps the query cache and the composer draft.
 */
export function SessionPage({ session, title, children }: { readonly session: ActiveSessionPayload; readonly title: string; readonly children: ReactNode }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  return (
    <PageLayout
      label={title}
      campaign={session.campaign?.display_name ?? "Playtest session"}
      nav={<SessionNav session={session} />}
      trailing={session.campaign ? <SaveIndicator campaignId={session.campaign.id} initial={session.campaign.save} onError={setSaveError} /> : null}
    >
      {session.campaign ? <SaveBanner campaignId={session.campaign.id} initial={session.campaign.save} /> : null}
      {saveError ? <Alert tone="error" onDismiss={() => setSaveError(null)}>{saveError}</Alert> : null}
      {children}
    </PageLayout>
  );
}

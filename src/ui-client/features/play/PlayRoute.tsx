import { useIsMutating } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { loadCampaign } from "../../api/campaigns";
import { mutationKeys } from "../../api/queryKeys";
import { isActiveSession, isHostMode, isNoCampaign } from "../../api/session";
import { Alert } from "../../components/Alert/Alert";
import { Button } from "../../components/Button/Button";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Spinner } from "../../components/Spinner/Spinner";
import { CampaignLayout } from "../../layouts/CampaignLayout";
import { errorMessage, useServerAction, useSessionQuery } from "../../state/serverState";
import { PlayScreen } from "./PlayScreen";

/**
 * `/play` (the disposable playtest session) and `/play/:campaignId` (a persistent campaign). The server holds one active session; this
 * route only checks that the URL names it, and otherwise offers to open the named campaign (an explicit click, never an implicit load).
 */
export function PlayRoute() {
  const { campaignId } = useParams();
  const turnInFlight = useIsMutating({ mutationKey: mutationKeys.turn }) > 0;
  const query = useSessionQuery({ pollWhileBusy: !turnInFlight });
  if (query.isPending) return <CampaignLayout><Spinner label="Opening the story…" /></CampaignLayout>;
  if (!query.data) {
    return (
      <CampaignLayout>
        <ErrorState title="The game server is not answering" message={errorMessage(query.error, "The session could not be loaded.")} action={<Button variant="primary" onClick={() => void query.refetch()}>Try again</Button>} />
      </CampaignLayout>
    );
  }
  const data = query.data;
  if (!isHostMode(data)) {
    if (campaignId) return <Navigate to="/play" replace />;
    return isActiveSession(data) ? <PlayScreen session={data} connectionLost={query.isRefetchError} /> : <CampaignLayout><ErrorState title="No session" message="The game server has no session to show." /></CampaignLayout>;
  }
  if (isNoCampaign(data)) return campaignId ? <CampaignNotOpen campaignId={campaignId} /> : <Navigate to="/" replace />;
  if (!isActiveSession(data) || !data.campaign) return <Navigate to="/" replace />;
  if (!campaignId) return <Navigate to={`/play/${encodeURIComponent(data.campaign.id)}`} replace />;
  if (data.campaign.id !== campaignId) return <CampaignNotOpen campaignId={campaignId} openName={data.campaign.display_name} openId={data.campaign.id} />;
  return <PlayScreen session={data} connectionLost={query.isRefetchError} />;
}

/** The URL names a campaign that is not the one open on the server (a bookmark, a restart, another tab switched campaigns). */
function CampaignNotOpen({ campaignId, openName, openId }: { readonly campaignId: string; readonly openName?: string; readonly openId?: string }) {
  const navigate = useNavigate();
  const load = useServerAction("campaign-load", (id: string) => loadCampaign({ campaignId: id, slot: "current" }));
  return (
    <CampaignLayout>
      <section aria-labelledby="not-open-title">
        <h1 id="not-open-title">This campaign is not open</h1>
        <p>{openName ? `The game server currently has “${openName}” open.` : "The game server has no campaign open right now."} Opening this one saves and closes the current campaign first.</p>
        {load.error ? <Alert tone="error">{errorMessage(load.error, "The campaign could not be opened.")}</Alert> : null}
        <p>
          <Button variant="primary" disabled={load.isPending} onClick={() => load.mutate(campaignId, { onSuccess: result => { if (result.warnings.length) void navigate(".", { replace: true, state: { loadWarnings: result.warnings } }); } })}>
            {load.isPending ? "Opening…" : "Open this campaign"}
          </Button>{" "}
          {openId ? <Link to={`/play/${encodeURIComponent(openId)}`}>Continue “{openName}”</Link> : null}{" "}
          <Link to="/">All campaigns</Link>
        </p>
      </section>
    </CampaignLayout>
  );
}

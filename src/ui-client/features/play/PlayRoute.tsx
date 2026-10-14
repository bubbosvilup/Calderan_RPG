import { useIsMutating } from "@tanstack/react-query";
import { useRef } from "react";
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from "react-router";
import { loadCampaign } from "../../api/campaigns";
import { mutationKeys } from "../../api/queryKeys";
import { isActiveSession, isHostMode, isNoCampaign } from "../../api/session";
import { Alert } from "../../components/Alert/Alert";
import { Button } from "../../components/Button/Button";
import { ErrorState } from "../../components/ErrorState/ErrorState";
import { Spinner } from "../../components/Spinner/Spinner";
import { CampaignLayout } from "../../layouts/CampaignLayout";
import type { PlaySessionContext } from "../../state/playSession";
import { errorMessage, useServerAction, useSessionQuery } from "../../state/serverState";

/**
 * The route layout of an open session: `/play` (the disposable playtest session) and `/play/:campaignId` (a persistent campaign), with
 * the play screen, Inventory and the player character page as its children. The server holds one active session; this layout only checks
 * that the URL names it (otherwise it offers to open the named campaign: an explicit click, never an implicit load) and then hands the
 * authoritative session to whichever page the URL selects. The session query lives here, so moving between pages never refetches or resets it.
 */
export function PlayRoute() {
  const { campaignId } = useParams();
  const turnInFlight = useIsMutating({ mutationKey: mutationKeys.turn }) > 0;
  const draftRef = useRef("");
  const { pathname } = useLocation();
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
    // The playtest session has no campaign id: keep the page, drop the campaign segment.
    if (campaignId) return <Navigate to={pathname.replace(/^\/play\/[^/]+/, "/play")} replace />;
    return isActiveSession(data) ? <Outlet context={{ session: data, connectionLost: query.isRefetchError, draftRef } satisfies PlaySessionContext} /> : <CampaignLayout><ErrorState title="No session" message="The game server has no session to show." /></CampaignLayout>;
  }
  if (isNoCampaign(data)) return campaignId ? <CampaignNotOpen campaignId={campaignId} /> : <Navigate to="/" replace />;
  if (!isActiveSession(data) || !data.campaign) return <Navigate to="/" replace />;
  // `/play/inventory` and the like name a page of the open campaign: keep the page, add the campaign.
  if (!campaignId) return <Navigate to={`/play/${encodeURIComponent(data.campaign.id)}${pathname.replace(/^\/play/, "").replace(/\/$/, "")}`} replace />;
  if (data.campaign.id !== campaignId) return <CampaignNotOpen campaignId={campaignId} openName={data.campaign.display_name} openId={data.campaign.id} />;
  return <Outlet context={{ session: data, connectionLost: query.isRefetchError, draftRef } satisfies PlaySessionContext} />;
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

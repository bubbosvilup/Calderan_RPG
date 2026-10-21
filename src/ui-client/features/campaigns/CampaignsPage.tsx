import { useId, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useNavigate } from "react-router";
import { closeCampaign, createCampaign, deleteCampaign, fetchCampaigns, loadCampaign, type CampaignSlot } from "../../api/campaigns";
import { queryKeys } from "../../api/queryKeys";
import { isActiveSession, isHostMode } from "../../api/session";
import type { CampaignListEntryDto, ScenarioDto } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { Button } from "../../components/Button/Button";
import { Modal } from "../../components/Modal/Modal";
import { EmptyState, ErrorState } from "../../components/ErrorState/ErrorState";
import { Spinner } from "../../components/Spinner/Spinner";
import { CampaignLayout } from "../../layouts/CampaignLayout";
import { errorMessage, useServerAction, useSessionQuery } from "../../state/serverState";
import styles from "./CampaignsPage.module.css";

const savedAt = (iso: string | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : `saved ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)}`;
};

/**
 * `/`: choose, load, create, close or delete a persistent campaign. The disposable playtest server has no campaigns, so this route forwards to
 * its session. Deleting asks for an explicit confirmation naming the campaign; the server refuses the open campaign and one open elsewhere.
 */
export function CampaignsPage() {
  const session = useSessionQuery();
  const host = session.data ? isHostMode(session.data) : undefined;
  const campaigns = useQuery({ queryKey: queryKeys.campaigns, queryFn: ({ signal }) => fetchCampaigns(signal), enabled: host === true });
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const open = (id: string, warnings: readonly string[]) => void navigate(`/play/${encodeURIComponent(id)}`, warnings.length ? { state: { loadWarnings: warnings } } : {});
  const load = useServerAction("campaign-load", (request: { readonly campaignId: string; readonly slot: CampaignSlot }) => loadCampaign(request));
  const create = useServerAction("campaign-create", (request: { readonly displayName: string; readonly scenarioId: string | undefined }) => createCampaign(request));
  const close = useServerAction("campaign-close", () => closeCampaign());
  const remove = useServerAction("campaign-delete", (request: { readonly campaignId: string }) => deleteCampaign(request));
  const [deleting, setDeleting] = useState<CampaignListEntryDto | null>(null);
  const busy = load.isPending || create.isPending || close.isPending || remove.isPending;
  if (session.isPending) return <CampaignLayout><Spinner label="Connecting to the game server…" /></CampaignLayout>;
  if (!session.data) {
    return <CampaignLayout><ErrorState title="The game server is not answering" message={errorMessage(session.error)} action={<Button variant="primary" onClick={() => void session.refetch()}>Try again</Button>} /></CampaignLayout>;
  }
  if (host === false) return <Navigate to="/play" replace />;
  const active = isActiveSession(session.data) ? session.data.campaign : undefined;
  const onLoad = (campaignId: string, slot: CampaignSlot) => {
    setError(null);
    load.mutate({ campaignId, slot }, { onSuccess: result => open(campaignId, result.warnings), onError: failure => { setError(errorMessage(failure, "That campaign could not be opened.")); void campaigns.refetch(); } });
  };
  return (
    <CampaignLayout>
      <h1>Campaigns</h1>
      {error ? <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert> : null}
      {active ? (
        <Alert tone="info" action={(
          <>
            <Link to={`/play/${encodeURIComponent(active.id)}`}>Continue</Link>
            <Button size="sm" disabled={busy} onClick={() => { setError(null); close.mutate(undefined, { onSuccess: () => void campaigns.refetch(), onError: failure => setError(errorMessage(failure, "The campaign could not be closed. It is still open.")) }); }}>
              {close.isPending ? "Closing…" : "Close campaign"}
            </Button>
          </>
        )}>“{active.display_name}” is open.</Alert>
      ) : null}
      <section className={styles.section} aria-labelledby="campaign-list-title">
        <h2 id="campaign-list-title" className={styles.heading}>Saved campaigns</h2>
        {campaigns.isPending ? <Spinner label="Loading campaigns…" />
          : campaigns.isError ? <Alert tone="error" action={<Button size="sm" onClick={() => void campaigns.refetch()}>Retry</Button>}>{errorMessage(campaigns.error, "Could not list campaigns.")}</Alert>
          : campaigns.data.campaigns.length ? (
            <ul className={styles.list}>
              {campaigns.data.campaigns.map(entry => <CampaignRow key={entry.campaign_id} entry={entry} active={entry.campaign_id === active?.id} busy={busy} onLoad={onLoad} onDelete={setDeleting} />)}
            </ul>
          ) : <EmptyState>No campaigns yet. Create one below.</EmptyState>}
      </section>
      {campaigns.data ? (
        <NewCampaignForm scenarios={campaigns.data.scenarios} busy={busy} onCreate={(displayName, scenarioId) => {
          setError(null);
          create.mutate({ displayName, scenarioId }, {
            onSuccess: result => { const id = isActiveSession(result.state) ? result.state.campaign?.id : undefined; if (id) open(id, result.warnings); else void campaigns.refetch(); },
            onError: failure => setError(errorMessage(failure, "The campaign could not be created.")),
          });
        }} />
      ) : null}
      <Modal
        open={deleting !== null}
        onClose={() => { if (!remove.isPending) setDeleting(null); }}
        title="Delete this campaign?"
        actions={(
          <>
            <Button disabled={remove.isPending} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" disabled={remove.isPending} onClick={() => {
              if (!deleting) return;
              setError(null);
              remove.mutateAsync({ campaignId: deleting.campaign_id }).then(
                () => { setDeleting(null); void campaigns.refetch(); },
                failure => { setDeleting(null); setError(errorMessage(failure, "The campaign could not be deleted.")); void campaigns.refetch(); },
              );
            }}>{remove.isPending ? "Deleting…" : "Delete permanently"}</Button>
          </>
        )}
      >
        <p>“{deleting?.display_name}” and all of its saves and backups will be removed from this computer. This cannot be undone.</p>
      </Modal>
    </CampaignLayout>
  );
}

function CampaignRow({ entry, active, busy, onLoad, onDelete }: { readonly entry: CampaignListEntryDto; readonly active: boolean; readonly busy: boolean; readonly onLoad: (id: string, slot: CampaignSlot) => void; readonly onDelete: (entry: CampaignListEntryDto) => void }) {
  const meta = entry.status === "valid"
    ? [entry.location_name, entry.household_members ? `${entry.household_members} in household` : "", savedAt(entry.saved_at)].filter(Boolean).join(" · ")
    : entry.status === "unsupported_version" ? "Made by a newer version of Caldrevan." : "The latest save cannot be read.";
  const latestBackup = entry.backups[0];
  return (
    <li className={styles.row}>
      <div className={styles.info}>
        <strong className={styles.name}>{entry.display_name}</strong>
        <small className={styles.meta}>{meta}</small>
      </div>
      <div className={styles.actions}>
        {active ? <Link to={`/play/${encodeURIComponent(entry.campaign_id)}`}>Continue</Link>
          : entry.status === "valid" ? <Button variant="primary" size="sm" disabled={busy || entry.locked} onClick={() => onLoad(entry.campaign_id, "current")} aria-label={`Load ${entry.display_name}`}>{entry.locked ? "Open elsewhere" : "Load"}</Button>
          : (
            <>
              {entry.previous_valid ? <Button size="sm" disabled={busy || entry.locked} onClick={() => onLoad(entry.campaign_id, "previous")}>Load previous save</Button> : null}
              {latestBackup ? <Button size="sm" disabled={busy || entry.locked} onClick={() => onLoad(entry.campaign_id, `backup:${latestBackup}`)}>Load latest backup</Button> : null}
            </>
          )}
        <Button size="sm" variant="ghost" disabled={busy || entry.locked || active} onClick={() => onDelete(entry)} aria-label={`Delete campaign ${entry.display_name}`}
          title={active ? "Close the campaign before deleting it." : entry.locked ? "This campaign is open elsewhere." : undefined}>Delete</Button>
      </div>
    </li>
  );
}

function NewCampaignForm({ scenarios, busy, onCreate }: { readonly scenarios: readonly ScenarioDto[]; readonly busy: boolean; readonly onCreate: (name: string, scenarioId: string | undefined) => void }) {
  const [name, setName] = useState(""), [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const nameId = useId(), scenarioFieldId = useId(), descriptionId = useId(), problemId = useId();
  const scenario = scenarios.find(s => s.id === scenarioId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setProblem("Enter a campaign name."); return; }
    setProblem(null);
    onCreate(name.trim(), scenarioId || undefined);
  };
  return (
    <form className={styles.form} onSubmit={submit} aria-labelledby="new-campaign-title" noValidate>
      <h2 id="new-campaign-title" className={styles.heading}>New campaign</h2>
      <label htmlFor={nameId}>Campaign name</label>
      <input id={nameId} className={styles.input} value={name} maxLength={80} autoComplete="off" placeholder="My Caldrevan story" onChange={event => setName(event.target.value)} aria-invalid={!!problem} aria-describedby={problem ? problemId : undefined} />
      {problem ? <p id={problemId} className={styles.problem} role="alert">{problem}</p> : null}
      {scenarios.length > 1 ? (
        <>
          <label htmlFor={scenarioFieldId}>Starting scenario</label>
          <select id={scenarioFieldId} className={styles.input} value={scenarioId} onChange={event => setScenarioId(event.target.value)} aria-describedby={descriptionId}>
            {scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </>
      ) : null}
      {scenario ? <p id={descriptionId} className={styles.meta}>{scenario.description}</p> : null}
      <div><Button type="submit" variant="primary" disabled={busy}>{busy ? "Working…" : "Create campaign"}</Button></div>
    </form>
  );
}

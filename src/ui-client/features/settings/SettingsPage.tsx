import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { closeCampaign } from "../../api/campaigns";
import { fetchOptionalServices } from "../../api/diagnostics";
import { queryKeys } from "../../api/queryKeys";
import type { ActiveSessionPayload, OptionalServiceDto } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";
import { Badge } from "../../components/Badge/Badge";
import { Button } from "../../components/Button/Button";
import { EmptyState } from "../../components/ErrorState/ErrorState";
import { Spinner } from "../../components/Spinner/Spinner";
import { errorMessage, useActionBlockedReason, useServerAction } from "../../state/serverState";
import styles from "./Settings.module.css";

/** What each optional service does, in player words. Fixed copy keyed by the closed service name; nothing here comes from the server. */
const SERVICES: Readonly<Record<OptionalServiceDto["service"], { readonly label: string; readonly about: string }>> = {
  reflection: { label: "Reflection", about: "Writes background notes about characters after a turn." },
  mannerism_learning: { label: "Mannerism learning", about: "Learns characters' speech habits from play." },
  portrait_generation: { label: "Portrait generation", about: "Makes character images when you ask for them." },
  item_sprite_generation: { label: "Item illustrations", about: "Draws small pictures of items in the background." },
  sprite_qa: { label: "Item illustration review", about: "Checks generated item pictures before they are used." },
  semantic_retrieval: { label: "Semantic retrieval", about: "Searches the story by meaning. Keyword search is always used." },
};

const when = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

/**
 * Settings and diagnostics of the open session: the campaign (close it and return to the list), whether the narrator provider is configured,
 * and the health of the optional services. Everything shown is read from the server; this page changes nothing about the story.
 */
export function SettingsPage({ session }: { readonly session: ActiveSessionPayload }) {
  const headingId = useId();
  const navigate = useNavigate();
  const blockedReason = useActionBlockedReason(session.status);
  const [error, setError] = useState<string | null>(null);
  const services = useQuery({ queryKey: queryKeys.optionalServices, queryFn: ({ signal }) => fetchOptionalServices(signal), refetchInterval: 5000 });
  const close = useServerAction("campaign-close", () => closeCampaign());
  return (
    <div className={styles.page}>
      <h1 id={headingId} className={styles.title}>Settings</h1>
      <section className={styles.section} aria-labelledby={`${headingId}-campaign`}>
        <h2 id={`${headingId}-campaign`} className={styles.heading}>Campaign</h2>
        {session.campaign ? (
          <>
            <p className={styles.prose}>“{session.campaign.display_name}” is open. Closing it saves any unsaved progress and returns to the campaign list.</p>
            {error ? <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert> : null}
            <div className={styles.actions}>
              <Button
                disabled={close.isPending || !!blockedReason}
                aria-describedby={blockedReason ? `${headingId}-reason` : undefined}
                onClick={() => {
                  setError(null);
                  // mutateAsync settles even though this page unmounts when the closed campaign leaves the cache.
                  close.mutateAsync().then(() => void navigate("/"), failure => setError(errorMessage(failure, "The campaign could not be closed. It is still open.")));
                }}
              >{close.isPending ? "Closing…" : "Close campaign"}</Button>
              {blockedReason ? <small id={`${headingId}-reason`} className={styles.hint}>{blockedReason}</small> : null}
            </div>
          </>
        ) : <p className={styles.prose}>This is the disposable playtest session. It is never saved.</p>}
      </section>
      <section className={styles.section} aria-labelledby={`${headingId}-narrator`}>
        <h2 id={`${headingId}-narrator`} className={styles.heading}>Narrator</h2>
        <p className={styles.prose}>{session.configured ? "The narrator provider is configured." : "The narrator provider is not configured. Set the provider key in the environment and restart the game to play."}</p>
      </section>
      <section className={styles.section} aria-labelledby={`${headingId}-services`}>
        <h2 id={`${headingId}-services`} className={styles.heading}>Optional services</h2>
        <p className={styles.hint}>These run in the background and never change a turn’s outcome. Turning one off leaves the story and existing saves as they are. They are chosen when the game starts; this page only reports their state.</p>
        {services.isPending ? <Spinner label="Reading service status…" />
          : services.isError ? <Alert tone="error" action={<Button size="sm" onClick={() => void services.refetch()}>Retry</Button>}>{errorMessage(services.error, "Service status is not available.")}</Alert>
          : services.data.services.length ? (
            <ul className={styles.services}>
              {services.data.services.map(service => <ServiceRow key={service.service} service={service} />)}
            </ul>
          ) : <EmptyState>No service status is available.</EmptyState>}
      </section>
    </div>
  );
}

function ServiceRow({ service }: { readonly service: OptionalServiceDto }) {
  const copy = SERVICES[service.service];
  const label = copy?.label ?? service.service.replace(/_/g, " ");
  return (
    <li className={styles.service} data-service={service.service}>
      <div className={styles.serviceHead}>
        <strong>{label}</strong>
        <Badge tone={service.enabled ? "accent" : "neutral"}>{service.enabled ? "On" : "Off"}</Badge>
        {service.running ? <Badge>{service.running} running</Badge> : null}
      </div>
      {copy ? <small className={styles.hint}>{copy.about}</small> : null}
      {service.last_success_at && when(service.last_success_at) ? <small className={styles.hint}>Last succeeded {when(service.last_success_at)}</small> : null}
      {service.last_error ? <small className={styles.error}>Last problem: {service.last_error.code.replace(/_/g, " ")}{when(service.last_error.at) ? ` (${when(service.last_error.at)})` : ""}</small> : null}
    </li>
  );
}

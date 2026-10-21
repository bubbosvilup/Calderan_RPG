import { isRecord, requestJson } from "./client";
import { sessionStateFrom } from "./session";
import type { CampaignListDto } from "./types";

/** Save/Load v1 campaign lifecycle. The server owns campaign truth; the browser sends a chosen id, slot or name and renders the result. */
export const fetchCampaigns = (signal?: AbortSignal) => requestJson<CampaignListDto>("/campaigns", { signal });

export type CampaignSlot = "current" | "previous" | `backup:${string}`;

/** Player-safe load-report sentences (empty for a normal load). */
function loadWarnings(body: unknown): readonly string[] {
  const report = isRecord(body) ? body.load_report : undefined;
  return isRecord(report) && Array.isArray(report.warnings) ? report.warnings.filter((w): w is string => typeof w === "string") : [];
}

export async function createCampaign(request: { readonly displayName: string; readonly scenarioId: string | undefined }) {
  const body = await requestJson<unknown>("/campaigns/create", { method: "POST", body: { display_name: request.displayName, ...(request.scenarioId ? { scenario_id: request.scenarioId } : {}) } });
  return { state: sessionStateFrom(body), warnings: loadWarnings(body) };
}

export async function loadCampaign(request: { readonly campaignId: string; readonly slot: CampaignSlot }) {
  const body = await requestJson<unknown>("/campaigns/load", { method: "POST", body: { campaign_id: request.campaignId, slot: request.slot } });
  return { state: sessionStateFrom(body), warnings: loadWarnings(body) };
}

/** Saves a dirty campaign and returns to the campaign list (the server closes its active session). */
export async function closeCampaign() {
  return { state: sessionStateFrom(await requestJson<unknown>("/campaigns/close", { method: "POST", body: {} })) };
}

/** Deletes a campaign and all its saves. The server refuses the open campaign (close it first) and one open elsewhere. */
export async function deleteCampaign(request: { readonly campaignId: string }) {
  return { state: sessionStateFrom(await requestJson<unknown>("/campaigns/delete", { method: "POST", body: { campaign_id: request.campaignId } })) };
}

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../api/queryKeys";
import { fetchSaveStatus } from "../../api/session";
import type { SaveStateDto } from "../../api/types";
import { Alert } from "../../components/Alert/Alert";

/**
 * Standing save notices that must not depend on the player noticing a small badge: a campaign too large to save (an oversized campaign is
 * not a damaged one: the last save is intact), one close to that limit, and paused autosave. The text follows the server's save state; the
 * same cached status the header indicator polls, so this adds no request.
 */
export function SaveBanner({ campaignId, initial }: { readonly campaignId: string; readonly initial: SaveStateDto }) {
  const status = useQuery({ queryKey: queryKeys.saveStatus, queryFn: ({ signal }) => fetchSaveStatus(signal), refetchInterval: 4000 });
  const save = status.data?.campaign?.id === campaignId ? status.data.campaign.save : initial;
  if (save.error === "save_too_large") {
    return <Alert tone="error" title="Save too large">This campaign is now too large to save (over the 16 MB limit). Nothing was overwritten: your last save is intact, but progress since then is only in this session.</Alert>;
  }
  if (save.error) return null; // a failed save is reported where Save was pressed, with the retry
  if (save.size_warning) return <Alert tone="warning" title="Close to the save limit">This campaign is close to the 16 MB save limit. It still saves normally.</Alert>;
  if (save.autosave === "stopped") return <Alert tone="warning" title="Autosave paused">Autosave is paused until the campaign is saved. Press Save to resume it.</Alert>;
  return null;
}

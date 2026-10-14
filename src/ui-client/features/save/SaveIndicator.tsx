import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "../../api/queryKeys";
import { fetchSaveStatus, saveCampaign } from "../../api/session";
import type { SaveStateDto } from "../../api/types";
import { Button } from "../../components/Button/Button";
import { errorMessage, useServerAction } from "../../state/serverState";
import styles from "./SaveIndicator.module.css";

const LABELS = { saving: "Saving…", failed: "Save failed", too_large: "Save too large", unsaved: "Unsaved changes", saved: "Saved" } as const;
type SaveKey = keyof typeof LABELS;

const keyOf = (save: SaveStateDto | undefined, saving: boolean): SaveKey =>
  saving || save?.saving ? "saving" : save?.error === "save_too_large" ? "too_large" : save?.error ? "failed" : save?.state === "saved" ? "saved" : "unsaved";

// CSS Module keys are camelCase (localsConvention: camelCaseOnly).
const CLASSES: Readonly<Record<SaveKey, string | undefined>> = { saving: styles.saving, failed: styles.failed, too_large: styles.tooLarge, unsaved: styles.unsaved, saved: styles.saved };

const TITLES: Partial<Record<SaveKey, string>> = {
  failed: "The last save failed. Your progress is still in this session; press Save to retry.",
  too_large: "This campaign is too large to save (over the 16 MB limit). Your last save is intact; progress since then is only in this session.",
};

/**
 * Persistent campaigns only. Autosave runs on the server in the background; a light 4-second status poll keeps the indicator honest
 * without refetching the story. Save is the explicit manual save.
 */
export function SaveIndicator({ campaignId, initial, onError }: { readonly campaignId: string; readonly initial: SaveStateDto; readonly onError: (message: string | null) => void }) {
  const status = useQuery({ queryKey: queryKeys.saveStatus, queryFn: ({ signal }) => fetchSaveStatus(signal), refetchInterval: 4000 });
  const save = useServerAction("save", () => saveCampaign());
  const current = status.data?.campaign?.id === campaignId ? status.data.campaign.save : initial;
  const key = keyOf(current, save.isPending);
  const title = TITLES[key] ?? (current.autosave === "stopped" ? "Autosave is paused until the campaign is saved." : undefined);
  return (
    <div className={styles.save}>
      <span className={CLASSES[key]} role="status" title={title}>{LABELS[key]}</span>
      <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => { onError(null); save.mutate(undefined, { onError: error => onError(errorMessage(error, "The campaign could not be saved. Your progress is still in this session.")) }); }}>
        Save
      </Button>
    </div>
  );
}

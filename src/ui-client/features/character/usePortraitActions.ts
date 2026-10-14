import { useEffect, useState } from "react";
import { deletePortrait, generatePortraits, setAvatar, setFullBody } from "../../api/portraits";
import type { PortraitKindDto } from "../../api/types";
import { errorMessage, useSessionAction } from "../../state/serverState";

/** The browser gives up on a generation request after six minutes (the server request is synchronous and normally takes 30 to 90 seconds). */
export const GENERATION_TIMEOUT_MS = 6 * 60 * 1000;

export type PortraitCommand =
  | { readonly type: "generate"; readonly kind: PortraitKindDto; readonly pose: string }
  | { readonly type: "avatar"; readonly item: string }
  | { readonly type: "full-body"; readonly item: string | null }
  | { readonly type: "delete"; readonly item: string };

const timedOut = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * The player's portrait actions (generate, choose Avatar, choose or clear Full Body, delete). Every action is one server request carrying the
 * editor ref, the rendered revision and a closed identifier; nothing is applied locally, and each one ends on the server's fresh state, which
 * is where the gallery, the selected roles and the images come from. `error` is the last refusal in player-safe words.
 */
export function usePortraitActions(ref: string) {
  const [error, setError] = useState<string | null>(null);
  const mutation = useSessionAction("portrait", async (command: PortraitCommand, revision) => {
    const base = { ref, expectedRevision: revision };
    if (command.type === "avatar") return setAvatar({ ...base, item: command.item });
    if (command.type === "full-body") return setFullBody({ ...base, item: command.item });
    if (command.type === "delete") return deletePortrait({ ...base, item: command.item });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), GENERATION_TIMEOUT_MS);
    try { return await generatePortraits({ ...base, kind: command.kind, pose: command.pose, signal: controller.signal }); }
    finally { clearTimeout(timer); }
  });
  const run = (command: PortraitCommand, options: { readonly onSuccess?: () => void } = {}) => {
    if (mutation.isPending) return;
    setError(null);
    mutation.mutate(command, {
      onSuccess: () => options.onSuccess?.(),
      onError: failure => setError(timedOut(failure)
        ? "No response after 6 minutes. The images may still have been saved: check the Gallery, then try again if it is empty."
        : errorMessage(failure, command.type === "generate" ? "Portrait generation failed." : "The portrait change was not saved.")),
    });
  };
  const generating = mutation.isPending && mutation.variables?.type === "generate" ? mutation.variables.kind : null;
  return { run, pending: mutation.isPending, generating, error, clearError: () => setError(null) };
}

/** Whole seconds since `active` became true (0 while inactive). Drives the generation progress block. */
export function useElapsedSeconds(active: boolean): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!active) { setSeconds(0); return; }
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return seconds;
}

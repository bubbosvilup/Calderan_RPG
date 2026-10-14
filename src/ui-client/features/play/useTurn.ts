import { useCallback, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, isRecord } from "../../api/client";
import { mutationKeys } from "../../api/queryKeys";
import { correctLocation, locationCandidates, stateFromError, submitTurn } from "../../api/session";
import { applyServerState, renderedRevision } from "../../state/serverState";
import type { PendingTurn } from "../transcript/Transcript";

export type TurnNotice = { readonly tone: "error" | "warning" | "info"; readonly text: string };

const LOCATION_COMMAND = /^\/location(?:\s|$)/i;

/** Player-facing copy for a refused or interrupted turn. The server's AppError message is player-safe; it is used where it adds detail. */
export function turnFailureNotice(error: unknown): TurnNotice {
  if (!(error instanceof ApiError)) return { tone: "error", text: "The turn could not be sent. Nothing changed." };
  const appError = isRecord(error.body) && isRecord(error.body.error) ? error.body.error : undefined;
  if (error.kind === "stale") return { tone: "warning", text: "The story changed since you last looked. Your message was not sent; review the story and send it again." };
  if (error.kind === "busy") return { tone: "warning", text: "Another turn is still running. Your message was not sent; send it again when the narrator finishes." };
  if (error.kind === "network") return { tone: "error", text: "Connection interrupted. The turn may still have completed: the story has been refreshed, so review it before sending again." };
  if (appError?.turn_state_changed === true) return { tone: "error", text: "The turn failed after the campaign changed. Reload to check the session." };
  if (appError?.provider_code === "configuration_error") return { tone: "error", text: "The narrator provider is not configured. Set OPENROUTER_API_KEY and restart the game server to play." };
  return { tone: "error", text: `Turn failed. Your message was not applied. ${error.message}` };
}

/**
 * The composer's submission path. A turn streams progress phases into a local, presentation-only pending exchange; the committed messages
 * replace it in the same render that applies the server's state. One submission at a time (a synchronous guard, not only a re-render),
 * one turn key per submission (retries reuse it). `/location <place>` is the administrative location correction, not game input.
 */
export function useTurn() {
  const client = useQueryClient();
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [notice, setNotice] = useState<TurnNotice | null>(null);
  const inFlight = useRef(false);
  const mutation = useMutation({
    mutationKey: mutationKeys.turn,
    mutationFn: async (text: string) => {
      if (LOCATION_COMMAND.test(text)) {
        const result = await correctLocation({ target: text.replace(LOCATION_COMMAND, "").trim(), expectedRevision: renderedRevision(client) });
        return { state: result.state, notice: result.confirmation ? { tone: "info", text: result.confirmation } as TurnNotice : null };
      }
      setPending({ text, phase: "thinking" });
      const result = await submitTurn({ text, expectedRevision: renderedRevision(client) }, { onPhase: phase => setPending(current => (current ? { ...current, phase } : current)) });
      return { state: result.state, notice: result.warnings.length ? { tone: "warning", text: "Your turn was saved. Some details could not be refreshed; reload if the story looks out of date." } as TurnNotice : null };
    },
    onSuccess: async result => { await applyServerState(client, result.state); setNotice(result.notice); },
    onError: async (error, text) => {
      await applyServerState(client, stateFromError(error));
      if (LOCATION_COMMAND.test(text)) {
        const candidates = locationCandidates(error);
        setNotice({ tone: "error", text: `${error instanceof ApiError ? error.message : "Location correction failed."}${candidates.length ? ` Candidates: ${candidates.join(", ")}.` : ""}` });
      } else setNotice(turnFailureNotice(error));
    },
    onSettled: () => setPending(null),
  });
  const { mutateAsync } = mutation;
  /** Resolves true when the text was taken (the composer clears its draft). */
  const submit = useCallback(async (text: string): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setNotice(null);
    try { await mutateAsync(text); return true; }
    catch { return false; }
    finally { inFlight.current = false; }
  }, [mutateAsync]);
  return { submit, pending, notice, dismissNotice: () => setNotice(null), running: mutation.isPending };
}

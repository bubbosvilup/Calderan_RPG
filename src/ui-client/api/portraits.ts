import type { PortraitKindDto } from "./types";
import { requestJson } from "./client";
import { sessionStateFrom } from "./session";

/**
 * Portrait actions for a character with a visual editor (the player today). The browser sends only the opaque editor ref, the revision it
 * rendered, the closed kind and pose id, or an opaque Gallery item token: never a prompt, model, seed, size, file name or path. The server builds
 * prompts from committed appearance, owns the files, and answers every request with the fresh state.
 */
interface Base { readonly ref: string; readonly expectedRevision: number }

const post = async (path: string, request: Base, extra: Record<string, unknown>, signal?: AbortSignal) => {
  const body = await requestJson<Record<string, unknown>>(path, { method: "POST", body: { ref: request.ref, expected_revision: request.expectedRevision, ...extra }, signal });
  return { state: sessionStateFrom(body), message: typeof body.message === "string" ? body.message : "", changed: body.changed === true };
};

/** One batch of images of one kind. Synchronous on the server (30 to 90 seconds); `signal` lets the caller give up. */
export const generatePortraits = (request: Base & { readonly kind: PortraitKindDto; readonly pose: string; readonly signal?: AbortSignal }) =>
  post("/portrait/generate", request, { kind: request.kind, pose: request.pose }, request.signal);
export const setAvatar = (request: Base & { readonly item: string }) => post("/portrait/avatar", request, { item: request.item });
/** `item: null` clears the Full Body (it is never substituted by the Avatar). */
export const setFullBody = (request: Base & { readonly item: string | null }) => post("/portrait/full-body", request, { item: request.item });
export const deletePortrait = (request: Base & { readonly item: string }) => post("/portrait/delete", request, { item: request.item });

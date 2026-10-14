import { requestJson } from "./client";
import { sessionStateFrom } from "./session";

/**
 * Character actions. Each sends an opaque handle and the rendered revision; eligibility (the Heartstone rite, keepability) is decided by the
 * engine and arrives in the read model as capability flags.
 */
export async function promoteToNpcPlus(request: { readonly ref: string; readonly expectedRevision: number }) {
  return { state: sessionStateFrom(await requestJson<unknown>("/npc-plus/promote", { method: "POST", body: { ref: request.ref, expected_revision: request.expectedRevision } })) };
}

/** Keep track of a temporary (provisional) person of the scene: they become an ordinary Campaign NPC. */
export async function keepTrack(request: { readonly token: string; readonly expectedRevision: number }) {
  return { state: sessionStateFrom(await requestJson<unknown>("/people/keep", { method: "POST", body: { token: request.token, expected_revision: request.expectedRevision } })) };
}

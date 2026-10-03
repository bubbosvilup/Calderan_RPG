import type { NarratorRequest } from "../turn/stages/narration.js";
export type CompactionReason = "auto" | "manual";
export type CompactionResult = { readonly status: "unavailable" | "failed"; readonly reason: CompactionReason; readonly detail: string };
/** Pass 2: build candidate from this detached derived request, validate, then atomically activate.
 * No mutation capability or authoritative source state is supplied. Failure retains active request.
 * Successful activation is deliberately unsupported in Pass 1. */
export interface ContextCompactionService { compact(input: { readonly reason: CompactionReason; readonly request: NarratorRequest }): Promise<CompactionResult> }
export const unavailableCompactor: ContextCompactionService = { async compact({ reason }) { return { status: "unavailable", reason, detail: "Context compressor is not implemented (D-04 Pass 1)." }; } };

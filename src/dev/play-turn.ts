import type { TurnCoordinator } from "../turn/turn-coordinator.js";
import type { TurnEvent, TurnRequest } from "../turn/turn-types.js";
import type { WorldStore } from "../world/world-store.js";
import { reflectAfterTurn, type ReflectionProvider, type ReflectionRun } from "../turn/reflection.js";
import type { ReflectionDiagnosticsSink } from "../turn/reflection-diagnostics.js";

/** Publish/drain gameplay first. Await the separate post-turn operation before accepting another CLI command. */
export async function runPlayTurn(input: { readonly coordinator: Pick<TurnCoordinator, "runTurn">; readonly world: WorldStore;
  readonly request: TurnRequest; readonly publish: (event: TurnEvent) => void; readonly reflection_provider: ReflectionProvider;
  readonly reflection_diagnostics_sink?: ReflectionDiagnosticsSink; readonly max_reflection_characters?: number }): Promise<readonly ReflectionRun[]> {
  let completed = false;
  for await (const event of input.coordinator.runTurn(input.request)) {
    input.publish(event);
    if (event.type === "turn_completed") completed = true;
    if (event.type === "turn_failed") completed = false;
  }
  if (!completed || input.request.signal?.aborted) return [];
  try {
    return await reflectAfterTurn(input.request.campaign, input.world, input.reflection_provider, {
      max_characters: input.max_reflection_characters ?? 1, ...(input.reflection_diagnostics_sink ? { diagnostics_sink: input.reflection_diagnostics_sink } : {}),
    });
  } catch { return []; /* A post-turn infrastructure error cannot undo or reclassify the published turn. */ }
}

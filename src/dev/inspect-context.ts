import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildNarrativeContext } from "../scene/narrative-context-builder.js";
import type { NarrativeContext } from "../types/narrative.js";
import { loadWorld } from "../world/loader.js";
import { RuntimeState } from "../world/runtime-state.js";

/** Development-only inspection; the production builder owns projection and visibility. */
export async function inspectContext(locationId: string, dataDirectory = resolve("data")): Promise<NarrativeContext> {
  const world = await loadWorld(dataDirectory);
  const runtime = new RuntimeState(world, {
    player_location: locationId,
    world_time: { world_minute: 0 },
  });
  return buildNarrativeContext(world, runtime);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !args[0]) throw new Error("Usage: npm run inspect:context -- <location_id>");
    const context = await inspectContext(args[0]);
    process.stdout.write(`${JSON.stringify(context, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Context inspection failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

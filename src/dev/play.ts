import { createInterface } from "node:readline";
import { CampaignState } from "../campaign/campaign-state.js";
import { createOpeningCampaign } from "../campaign/opening-state.js";
import { CampaignSession } from "../persistence/campaign-session.js";
import { FileCampaignRepository } from "../persistence/campaign-repository.js";
import { loadWorld } from "../world/loader.js";
import { turnFixture } from "./turn-fixture.js";
import { onlineCoordinator, selectedModels } from "./turn-services.js";
import { formatCampaignStatus } from "./campaign-status.js";
import { runPlayTurn } from "./play-turn.js";
import { readReflectionMode } from "../app/production.js";
import { OpenRouterReflectionProvider } from "../llm/openrouter/reflection-provider.js";

const help = `Developer play loop (paid OpenRouter requests).
Default: synthetic fixture. --canon starts the canonical opening (heartstone_square). --semantic builds a paid production embedding index. --debug shows turn diagnostics.
/new <campaign_id>, /load <campaign_id>, /save, /status, /status debug, /quit
/go <reachable location ID or name>, /wait <minutes 1..1440>, /mana <signed delta>
/give <item ID> to <character ID>, /equip <item ID> <slot> <worn|held>
/tell <fact ID> to <character ID>, /schedule <event_id> "Title" at <absolute-minute> with nicco,brenna
Ordinary text is roleplay. Conservative authorization may reject unsupported phrasing.
Ctrl-C cancels an active request. No autosave.`;
if (process.argv.includes("--help")) console.log(help);
else {
  console.log(help); console.log(JSON.stringify({ online_paid: true, models: selectedModels() }));
  const fixture = turnFixture(), world = process.argv.includes("--canon") ? await loadWorld("data") : fixture.world;
  const repository = new FileCampaignRepository(world);
  let campaign = process.argv.includes("--canon") ? createOpeningCampaign(world, "dev_play") : fixture.campaign;
  let session = new CampaignSession(campaign, repository);
  const coordinator = await onlineCoordinator(world, process.argv.includes("--semantic"));
  const reflectionProvider = readReflectionMode() === "shadow" ? new OpenRouterReflectionProvider() : undefined;
  const lines = createInterface({ input: process.stdin, output: process.stdout, terminal: !!process.stdin.isTTY });
  let active: AbortController | undefined;
  lines.on("SIGINT", () => { if (active) active.abort(); else lines.close(); });
  lines.setPrompt("Nicco> "); lines.prompt();
  for await (const line of lines) {
    const input = line.trim();
    try {
      if (input === "/quit") break;
      if (input === "/help") console.log(help);
      else if (input === "/save") console.log(await session.save());
      else if (input.startsWith("/load ")) { session = CampaignSession.fromLoaded(await repository.loadCampaign(input.slice(6)), repository); campaign = session.campaign; console.log(`Loaded revision ${campaign.revision}.`); }
      else if (input.startsWith("/new ")) { campaign = process.argv.includes("--canon") ? createOpeningCampaign(world, input.slice(5)) : new CampaignState(world, input.slice(5), { player_location: "test_room", world_time: { world_minute: 0 } }); session = new CampaignSession(campaign, repository); console.log("New campaign; unsaved."); }
      else if (input === "/status" || input === "/status debug") {
        console.log({ revision: campaign.revision, unsaved: session.hasUnsavedChanges, scene: campaign.exportSnapshot().runtime.scene });
        // Household Pass 1: money, legal status, household and relationships, derived from committed state only.
        console.log(formatCampaignStatus(campaign.exportSnapshot(), world, input === "/status debug" ? "debug" : "player"));
      }
      else if (input) {
        active = new AbortController();
        await runPlayTurn({ coordinator, world, request: { campaign, player_input: input, signal: active.signal }, ...(reflectionProvider ? { reflection_provider: reflectionProvider } : {}),
          ...(process.argv.includes("--debug") ? { reflection_diagnostics_sink: (record: unknown) => console.log(JSON.stringify({ reflection: record })) } : {}), publish: event => {
          if (event.type === "narration_delta") process.stdout.write(event.text);
          else if (event.type === "narration_completed") process.stdout.write("\n");
          else if (event.type === "turn_failed") console.log(`\nTurn incomplete: ${event.code}. Revision ${event.final_revision}.`);
          else if (event.type === "turn_completed") { console.log(`Finalized. Revision ${event.result.final_revision}; unsaved: ${session.hasUnsavedChanges}.`); if (process.argv.includes("--debug")) console.log(JSON.stringify(event.result, null, 2)); }
        } });
        active = undefined;
      }
    } catch { console.error("Command failed; campaign was not automatically saved."); }
    lines.prompt();
  }
  lines.close(); console.log(`Session ended. Unsaved changes: ${session.hasUnsavedChanges}.`);
}

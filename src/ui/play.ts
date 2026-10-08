import { createProductionDeps, SessionHost } from "../app/index.js";
import { createUIPlaytestSession } from "../app/ui-playtest.js";
import { createPlaytestServer } from "./server.js";

import { NarratorAlternatives } from "../app/narrator-alternatives.js";
import { imageStackStatus } from "../app/image-stack.js";

/**
 * Play UI. Default: persistent campaigns (Save/Load v1) under saves/campaigns/<campaign_id>/, a start screen to create or load a
 * campaign, manual Save plus autosave, and a save of the dirty campaign on Ctrl+C. `--playtest`: the original disposable `ui_playtest`
 * session (never saved, discarded on shutdown; its files stay under saves/ui_playtest/).
 */
const playtest = process.argv.includes("--playtest");
const portArg = process.argv.find(a => a.startsWith("--port="));
const port = portArg ? Number(portArg.slice(7)) : 3000;
const comparisons = new NarratorAlternatives();
const deps = playtest
  ? await createProductionDeps({ save_dir: "saves/ui_playtest", reflection_mode: "off", prepared_narrator_observer: comparisons.capture })
  : await createProductionDeps({ save_dir: "saves", persistent_campaigns: true, reflection_mode: "off", prepared_narrator_observer: comparisons.capture });
const host = playtest ? undefined : new SessionHost(deps);
const session = playtest ? createUIPlaytestSession(deps) : undefined;
const server = createPlaytestServer(host ?? session!, undefined, comparisons);
server.on("error", () => { console.error(`Cannot start UI on port ${port}. Stop the process using that port and retry.`); process.exitCode = 1; });
server.listen(port, "127.0.0.1", () => {
  console.log(playtest ? `Caldrevan playtest: http://127.0.0.1:${port} — Ctrl+C to stop. Disposable campaign; no saves.`
    : `Caldrevan: http://127.0.0.1:${port} — Ctrl+C saves and stops. Campaigns are stored in saves/campaigns/.`);
  if (!deps.provider_status?.configured) console.log("Set OPENROUTER_API_KEY before launching to play. The opening needs no API key.");
  console.log(imageStackStatus().message);
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  if (host) {
    const result = await host.shutdown();
    if (result.saved_error) console.error(`The campaign could not be saved before closing: ${result.saved_error.code}. The last successful save is kept.`);
  } else await session!.shutdown({ discard_unsaved: true });
  server.closeAllConnections();
  await closed;
}
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });

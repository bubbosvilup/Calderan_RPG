import { createProductionDeps } from "../app/index.js";
import { createUIPlaytestSession } from "../app/ui-playtest.js";
import { createPlaytestServer } from "./server.js";

import { NarratorAlternatives } from "../app/narrator-alternatives.js";

const comparisons = new NarratorAlternatives();
const deps = await createProductionDeps({ save_dir: "saves/ui_playtest", reflection_mode: "off", prepared_narrator_observer: comparisons.capture });
const session = createUIPlaytestSession(deps);
const server = createPlaytestServer(session, undefined, comparisons);
server.on("error", () => { console.error("Cannot start UI on port 3000. Stop the process using that port and retry."); process.exitCode = 1; });
server.listen(3000, "127.0.0.1", () => {
  console.log("Caldrevan playtest: http://127.0.0.1:3000 — Ctrl+C to stop. Disposable campaign; no saves.");
  if (!deps.provider_status?.configured) console.log("Set OPENROUTER_API_KEY before launching to play. The opening needs no API key.");
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise<void>(resolve => server.close(() => resolve()));
  await session.shutdown({ discard_unsaved: true });
  server.closeAllConnections();
  await closed;
}
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });

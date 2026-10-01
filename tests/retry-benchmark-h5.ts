import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { setup, mockNarrator, mockController, collect } from "./turn-fixtures.js";
import { scriptedController, scriptedNarrator, failOnce } from "./provider-failure-scripts.js";
import { DEFAULT_RETRY_POLICY } from "../src/llm/retry.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";

/** Offline H5 benchmark: happy-path bookkeeping overhead of the retry layer, and the real (un-faked) added delay of one transient failure. Not a provider benchmark. */
async function happy(retry: boolean, count: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < count; i++) {
    const f = setup(); const co = new TurnCoordinator(f.world, mockNarrator("Brenna smiles."), mockController([]), f.retrieval, retry ? {} : { provider_retry: false });
    const t = performance.now(); await collect(co.runTurn({ campaign: f.campaign, player_input: "I smile." })); total += performance.now() - t;
  }
  return total / count;
}
await happy(false, 30); await happy(true, 30);
const off: number[] = [], on: number[] = [];
for (let block = 0; block < 7; block++) { if (block % 2) { on.push(await happy(true, 100)); off.push(await happy(false, 100)); } else { off.push(await happy(false, 100)); on.push(await happy(true, 100)); } }
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
const transient: number[] = [];
for (let i = 0; i < 20; i++) {
  const f = turnFixture(); const service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, scriptedNarrator(["Brenna smiles."], failOnce("rate_limited")), scriptedController([]), { service, search: new HybridSearch(service) });
  const t = performance.now(); await collect(co.runTurn({ campaign: f.campaign, player_input: "I smile." })); transient.push(performance.now() - t);
}
process.stdout.write(JSON.stringify({ happy_path_no_retry_ms: median(off), happy_path_with_retry_layer_ms: median(on), overhead_ms: median(on) - median(off),
  transient_one_failure_real_backoff_ms: { median: median(transient), min: Math.min(...transient), max: Math.max(...transient) }, backoff_range_ms: [DEFAULT_RETRY_POLICY.backoff_ms, DEFAULT_RETRY_POLICY.max_backoff_ms] }, null, 2) + "\n");

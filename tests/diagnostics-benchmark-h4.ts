import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { setup, mockNarrator, mockController, collect } from "./turn-fixtures.js";
async function sample(enabled: boolean, count: number): Promise<number> {
  let total = 0;
  for (let i = 0; i < count; i++) {
    const f = setup();
    const co = new TurnCoordinator(f.world, mockNarrator("Brenna smiles."), mockController([]), f.retrieval,
      enabled ? { diagnostics_sink: () => {} } : {});
    const start = performance.now(); await collect(co.runTurn({ campaign: f.campaign, player_input: "I smile." })); total += performance.now() - start;
  }
  return total / count;
}
await sample(false, 30); await sample(true, 30);
const disabled: number[] = [], enabled: number[] = [];
for (let block = 0; block < 7; block++) {
  if (block % 2) { enabled.push(await sample(true, 100)); disabled.push(await sample(false, 100)); }
  else { disabled.push(await sample(false, 100)); enabled.push(await sample(true, 100)); }
}
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
const a = median(disabled), b = median(enabled);
process.stdout.write(JSON.stringify({ fixture: "offline clean turn; setup excluded; sink includes frozen emission", blocks: 7, turns_per_block: 100,
  disabled_ms: a, enabled_ms: b, overhead_ms: b - a, overhead_percent: (b - a) / a * 100, disabled_samples_ms: disabled, enabled_samples_ms: enabled }, null, 2) + "\n");

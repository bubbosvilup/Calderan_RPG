import { promptFor, sceneBlock, scenarios, idealScene } from "./scene-state-fixtures.js";

/** Prints the [CURRENT SCENE] block of the offline Scene State Projection scenarios (synthetic data, no network, nothing persisted). */
const only = process.argv[2]?.toLowerCase();
const all = [{ name: "Ideal scene", input: "Brenna, are you alright?", recent: [], ...idealScene() }, ...scenarios()];
for (const s of all) {
  if (only && !s.name.toLowerCase().startsWith(only)) continue;
  const { text } = promptFor(s.world, s.campaign, s.input, s.recent), block = sceneBlock(text);
  console.log(`===== ${s.name} (${block.length} chars, input: ${JSON.stringify(s.input)})\n${block}\n`);
}

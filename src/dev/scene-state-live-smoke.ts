import { writeFile } from "node:fs/promises";
import { OpenRouterClient } from "../llm/openrouter/client.js";
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL } from "../llm/openrouter/minimax-narrator.js";
import { promptFor, sceneBlock, scenarios, idealScene } from "./scene-state-fixtures.js";

/**
 * Optional live Narrator smoke for Scene State Projection V1: at most four Narrator calls on synthetic fixtures, no Controller call,
 * no semantic retry, no image API. No key is read or printed: the placeholder below is replaced by the sandbox proxy, which authenticates openrouter.ai.
 * Usage: NODE_USE_ENV_PROXY=1 node .build/src/dev/scene-state-live-smoke.js <out.json>
 */
const [, , out = "scene-state-live-smoke.json"] = process.argv;
const all = scenarios();
const CASES = [
  { ...idealScene(), label: "1 condition + owner/carrier", input: "*looks Brenna over* You look worn out. Whose sword is that you're holding?", recent: [] },
  { ...all[3]!, label: "2 stored item", input: "*glances at the letter I left earlier* Maren, did anyone touch it?", recent: [] },
  { ...all[2]!, label: "3 knowledge scopes", input: "Brenna, Maren, what do you two know about the West Gate incident?", recent: [] },
  { ...all[5]!, label: "4 large household scene", input: all[5]!.input, recent: [] },
];
const narrator = new MiniMaxNarratorProvider(new OpenRouterClient({ api_key: () => "sandbox-proxy-injects-auth" }), { model: DEFAULT_NARRATOR_MODEL });
const results: unknown[] = [];
for (const c of CASES) {
  const { request, text } = promptFor(c.world, c.campaign, c.input, c.recent);
  let narration = "", usage: unknown, error: string | undefined;
  try {
    for await (const ev of narrator.stream(request)) {
      if (ev.type === "text_delta") narration += ev.text;
      else if (ev.type === "completed") usage = (ev.result as { usage?: unknown }).usage;
      else if (ev.type === "error") error = String((ev.error as Error)?.message ?? ev.error);
    }
  } catch (cause) { error = String((cause as Error).message); }
  results.push({ case: c.label, input: c.input, scene_block: sceneBlock(text), narration, usage, error });
  console.log(`== ${c.label}${error ? ` ERROR ${error}` : ""}\n${narration}\n`);
}
await writeFile(out, JSON.stringify({ model: DEFAULT_NARRATOR_MODEL, calls: CASES.length, results }, null, 1));

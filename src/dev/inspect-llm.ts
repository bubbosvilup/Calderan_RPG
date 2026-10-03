import { isDeepStrictEqual } from "node:util";
import { MiniMaxNarratorProvider, DEFAULT_NARRATOR_MODEL } from "../llm/openrouter/minimax-narrator.js";
import { OpenRouterStateControllerProvider, DEFAULT_CONTROLLER_MODEL } from "../llm/openrouter/state-controller.js";
import { providerError } from "../llm/errors.js";
import type { NarratorResult } from "../llm/narrator-provider.js";
import { BENCH_NARRATOR_PROMPT, LLM_SCENARIOS } from "./llm-scenarios.js";

const mode = process.argv[2];
const narratorModel = process.env.OPENROUTER_NARRATOR_MODEL ?? DEFAULT_NARRATOR_MODEL;
const controllerModel = process.env.OPENROUTER_CONTROLLER_MODEL ?? DEFAULT_CONTROLLER_MODEL;
const narrator = new MiniMaxNarratorProvider(undefined, { model: narratorModel });
const controller = new OpenRouterStateControllerProvider(undefined, { model: controllerModel });
console.log(JSON.stringify({ online: true, narrator_model: narratorModel, controller_model: controllerModel, date: new Date().toISOString() }));
async function narrate(action: string, state: string): Promise<NarratorResult> {
  for await (const event of narrator.stream({ system_prompt: BENCH_NARRATOR_PROMPT, messages: [{ role: "user", content: JSON.stringify({ prior_state: state, action }) }] })) {
    if (event.type === "text_delta") process.stdout.write(event.text);
    if (event.type === "error") { process.stdout.write("\nINCOMPLETE\n"); throw event.error; }
    if (event.type === "completed") { process.stdout.write("\n"); return event.result; }
  }
  throw new Error();
}
async function run(): Promise<void> {
  if (mode === "narrator") {
    const result = await narrate(process.argv.slice(3).join(" ") || LLM_SCENARIOS[0]!.action, LLM_SCENARIOS[0]!.state);
    console.log(JSON.stringify({ ...result, text: undefined })); return;
  }
  if (mode === "controller") {
    for (const scenario of LLM_SCENARIOS) {
      const result = await controller.propose({ player_action: scenario.action, prior_state: scenario.state, final_narration: scenario.narration });
      const correct = isDeepStrictEqual(result.commands, scenario.expected);
      console.log(JSON.stringify({ scenario: scenario.name, correct, ...result }));
      if (!correct) process.exitCode = 1;
    }
    return;
  }
  if (mode !== "bench") throw new Error();
  // Four representative sequential cases; no controller receives partial narration.
  for (const scenario of LLM_SCENARIOS.slice(0, 4)) {
    const start = performance.now();
    try {
      const narration = await narrate(scenario.action, scenario.state);
      const narratorEnd = performance.now();
      const proposal = await controller.propose({ player_action: scenario.action, prior_state: scenario.state, final_narration: narration.text });
      const end = performance.now();
      const correct = isDeepStrictEqual(proposal.commands, scenario.expected);
      console.log(JSON.stringify({ scenario: scenario.name, correct, narrator: { model: narration.model, usage: narration.usage, latency: narration.latency },
        controller: proposal, estimated_visible_wait_ms: narration.latency.time_to_first_token_ms,
        controller_tail_latency_ms: end - narratorEnd, sequential_total_ms: end - start }));
      if (!correct) process.exitCode = 1;
    } catch (error) { const safe = providerError(error); console.log(JSON.stringify({ scenario: scenario.name, error: safe.code, latency: safe.latency, elapsed_total_ms: performance.now() - start })); process.exitCode = 1; }
  }
}
await run().catch(error => { const safe = providerError(error); console.error(JSON.stringify({ error: safe.code, latency: safe.latency })); process.exitCode = 1; });

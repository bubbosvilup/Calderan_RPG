import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { turnFixture } from "./turn-fixture.js";
import { RetrievalService } from "../retrieval/retrieval-service.js";
import { HybridSearch } from "../retrieval/hybrid-search.js";
import { TurnCoordinator } from "../turn/turn-coordinator.js";
import { MiniMaxNarratorProvider } from "../llm/openrouter/minimax-narrator.js";
import { DeepSeekStateControllerProvider } from "../llm/openrouter/deepseek-controller.js";
import { narratorConfig, selectedModels } from "./turn-services.js";
import type { GenerationRequest } from "../llm/types.js";
import type { NarratorProvider } from "../llm/narrator-provider.js";
import type { StateControllerProvider } from "../llm/state-controller-provider.js";
import type { CampaignCommand } from "../campaign/types.js";
import type { TurnEvent } from "../turn/turn-types.js";

/**
 * Final movement closure LIVE probe (evaluation only; never imported by production). The REAL narrator AND the REAL controller run through
 * the production pipeline on the household fixture; each scenario is one or more turns on one campaign. One JSONL row per turn: delivered
 * text, audit issues, authorization decisions, and the authoritative location of every household member (LOCATED place or OFF_SCENE).
 *
 *   OPENROUTER_API_KEY=... node .build/src/dev/probe-final-movement-live.js --samples 2 --out docs/evaluations/final-movement-closure/live.jsonl [--live]
 *
 * Prices come from OpenRouter's public models API. The key is read only from the environment and never written anywhere.
 */
const args = process.argv.slice(2), flag = (n: string) => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
const live = args.includes("--live"), samples = Number(flag("--samples") ?? 2), only = flag("--scenario");
const out = flag("--out") ?? "docs/evaluations/final-movement-closure/live.jsonl", budgetEur = Number(flag("--budget-eur") ?? 3), eurPerUsd = Number(flag("--eur-per-usd") ?? 0.95);

const TO_HALL: CampaignCommand = { kind: "runtime_delta", delta: { player_location: "test_hall", time_advance_minutes: 1 } };
const at = (character_id: string, location_id: string): CampaignCommand => ({ kind: "move_character", character_id, location_id });
interface Scenario { readonly id: string; readonly label: string; readonly members: readonly string[]; readonly setup: readonly CampaignCommand[]; readonly turns: readonly string[]; readonly geography?: { courtyard?: boolean }; readonly expect: string }
const SCENARIOS: readonly Scenario[] = [
  { id: "known_upstairs", label: "known upstairs destination", members: ["maren"], setup: [TO_HALL, at("maren", "test_hall")], turns: ["I warm my hands at the hearth. Maren, go back upstairs to the Observation room, please."], expect: "maren -> test_room if narrated complete" },
  { id: "known_courtyard", label: "known courtyard destination", members: ["maren"], setup: [TO_HALL, at("maren", "test_hall")], geography: { courtyard: true }, turns: ["I stay by the hearth. Maren, go out into the courtyard for some air."], expect: "maren -> test_yard if narrated complete" },
  { id: "destination_less", label: "destination-less departure", members: ["maren"], setup: [], turns: ["I want some quiet. Maren, go out for a while."], expect: "maren OFF_SCENE if narrated complete, else in room" },
  { id: "voluntary", label: "voluntary independent departure", members: ["maren"], setup: [], turns: ["I sit by the window and start reading. Maren, do whatever you like."], expect: "any state the prose and the ledger agree on" },
  { id: "order_refused", label: "player request then refusal/stay", members: ["maren"], setup: [], turns: ["Maren, leave the room right now. I mean it."], expect: "no state/prose divergence" },
  { id: "incomplete", label: "incomplete departure", members: ["maren"], setup: [], turns: ["I stay still and watch Maren. She seems restless, as if she wants to leave."], expect: "maren stays in the room" },
  { id: "offscene_return", label: "return from off-scene", members: ["maren"], setup: [], turns: ["Maren, go out for a while. I want to be alone.", "I wait quietly by the window.", "I look up as the door opens. Who is it?"], expect: "if she left: stays OFF_SCENE until an exact arrival" },
  { id: "known_return", label: "known to known return (upstairs to hall)", members: ["maren"], setup: [TO_HALL, at("maren", "test_room")], turns: ["I stoke the fire and call up the stairs: Maren, come down and join me."], expect: "maren -> test_hall only if narrated arrival" },
  { id: "multi_npc", label: "multiple NPCs independently located", members: ["maren", "brenna", "gerome"], setup: [TO_HALL, at("brenna", "test_hall"), at("gerome", "test_hall")], geography: { courtyard: true }, turns: ["I warm my hands at the hearth. Gerome, step out into the courtyard and check the gate.", "I ask Brenna how she feels today."], expect: "gerome -> test_yard if narrated; maren stays upstairs; brenna stays" },
];
const scenarios = SCENARIOS.filter(s => !only || s.id === only);
const plan = Array.from({ length: samples }, (_, sample) => scenarios.map(scenario => ({ scenario, sample }))).flat();
console.log(JSON.stringify({ mode: live ? "LIVE" : "DRY_PLAN", scenarios: scenarios.length, samples, calls_min: plan.reduce((n, p) => n + 2 * p.scenario.turns.length, 0), models: selectedModels() }));
if (!live) process.exit(0);
if (!process.env.OPENROUTER_API_KEY?.trim()) { console.error("BLOCKED: OPENROUTER_API_KEY missing; no paid call made"); process.exit(3); }
const catalog = await (await fetch("https://openrouter.ai/api/v1/models")).json() as { data: { id: string; pricing: { prompt: string; completion: string } }[] };
const rate = (model: string) => { const row = catalog.data.find(r => r.id === model || r.id === model.replace(/:nitro$/, "")); if (!row) { console.error(`BLOCKED: no public price for ${model}`); process.exit(3); } return { prompt: Number(row.pricing.prompt), completion: Number(row.pricing.completion) }; };
const models = selectedModels(), narratorRate = rate(models.narrator), controllerRate = rate(models.controller);
mkdirSync(dirname(out), { recursive: true });
let spent = existsSync(out) ? readFileSync(out, "utf8").split("\n").filter(Boolean).reduce((n, l) => n + (JSON.parse(l) as { cost_eur: number }).cost_eur, 0) : 0;
const innerNarrator = new MiniMaxNarratorProvider(undefined, narratorConfig()), innerController = new DeepSeekStateControllerProvider(undefined, { model: models.controller });
const place = (snapshot: ReturnType<ReturnType<typeof turnFixture>["campaign"]["exportSnapshot"]>, id: string) => {
  const n = snapshot.runtime.npc_locations.find(x => x.character_id === id);
  return n?.off_scene ? `OFF_SCENE(last ${n.off_scene.last_known_location})` : n?.current_location;
};
for (const { scenario: s, sample } of plan) {
  if (spent >= budgetEur) { console.error(`STOPPED at EUR ${spent.toFixed(4)}`); break; }
  const f = turnFixture(false, s.geography ?? {});
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "create_household", id: "campaign_household_home", name: "Home" },
    { kind: "set_membership", household_id: "campaign_household_home", membership: { character_id: "nicco", status: "member", role: "owner" } },
    ...s.members.map(character_id => ({ kind: "join_household" as const, household_id: "campaign_household_home", character_id })), ...s.setup] });
  const service = new RetrievalService(f.world);
  for (const [turn, input] of s.turns.entries()) {
    let nIn = 0, nOut = 0, cIn = 0, cOut = 0, narratorCalls = 0, controllerCalls = 0;
    const narrator: NarratorProvider = {
      generate: async (r: GenerationRequest) => { const x = await innerNarrator.generate(r); narratorCalls++; nIn += x.usage.prompt_tokens ?? 0; nOut += x.usage.completion_tokens ?? 0; return x; },
      async *stream(r: GenerationRequest) { narratorCalls++; for await (const e of innerNarrator.stream(r)) { if (e.type === "completed") { nIn += e.result.usage.prompt_tokens ?? 0; nOut += e.result.usage.completion_tokens ?? 0; } yield e; } },
    };
    const controller: StateControllerProvider = { async propose(r) { const x = await innerController.propose(r); controllerCalls++; cIn += x.usage.prompt_tokens ?? 0; cOut += x.usage.completion_tokens ?? 0; return x; } };
    const co = new TurnCoordinator(f.world, narrator, controller, { service, search: new HybridSearch(service) });
    let result; let error: string | undefined;
    try { for await (const e of co.runTurn({ campaign: f.campaign, player_input: input }) as AsyncIterable<TurnEvent>) if (e.type === "turn_completed") result = e.result; }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    const snap = f.campaign.exportSnapshot(), where = Object.fromEntries(s.members.map(id => [id, place(snap, id)]));
    const cost_eur = ((nIn * narratorRate.prompt + nOut * narratorRate.completion) + (cIn * controllerRate.prompt + cOut * controllerRate.completion)) * eurPerUsd;
    spent += cost_eur;
    const rec = result?.narration_reconciliation;
    appendFileSync(out, JSON.stringify({ scenario: s.id, label: s.label, sample, turn, input, expect: s.expect, nicco: snap.runtime.scene.player_location, where, delivered: result?.narration, draft: rec?.draft,
      issues: rec?.issues.map(x => `${x.kind}:${x.character ?? ""}:${x.sentence}`), proposal: result?.controller_proposal.map(c => c.kind === "move_character" ? `${c.kind}:${c.character_id}->${c.location_id}` : `${c.kind}:${"character_id" in c ? c.character_id : ""}`),
      decisions: result?.authorization.map(d => `${d.command.kind}:${d.authorized ? "ok" : d.reason}`), error, narrator_calls: narratorCalls, controller_calls: controllerCalls, narrator_tokens: { prompt: nIn, completion: nOut }, controller_tokens: { prompt: cIn, completion: cOut }, cost_eur }) + "\n");
    console.log(JSON.stringify({ scenario: s.id, sample, turn, nicco: snap.runtime.scene.player_location, where, issues: rec?.issues.length ?? 0, error, spent_eur: +spent.toFixed(4) }));
  }
}
console.log(JSON.stringify({ spent_eur: +spent.toFixed(4) }));

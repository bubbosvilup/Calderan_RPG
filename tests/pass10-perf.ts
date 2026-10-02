import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { reflectionDue } from "../src/turn/reflection.js";
import { packNpcPlus } from "../src/turn/npc-plus.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import { metadata } from "./turn-fixtures.js";

/** NPC+ Pass 10 local performance profile (no provider): `node .build/tests/pass10-perf.js`. Medians of 5 turns per row, milliseconds. */
const world = await loadWorld("data"), service = new RetrievalService(world), pad = (k: number) => String(k).padStart(4, "0");
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
async function row(total: number, npc: number, presentCount = 5) {
  const c = createOpeningCampaign(world, `perf_${total}_${npc}`), id = (k: number) => `campaign_character_p${pad(k)}`;
  const cmds: CampaignCommand[] = Array.from({ length: total }, (_, k) => ({ kind: "register_character", character: { id: id(k), origin: { kind: "created" }, profile: { name: `Person${pad(k)}`, sex: "female" }, current: { current_location: k < presentCount ? OPENING_LOCATION : "heartstone_lr", status: "active" } } }));
  cmds.push(...Array.from({ length: npc }, (_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id(k * Math.max(1, Math.floor(total / Math.max(1, npc)))) })));
  for (let i = 0; i < cmds.length; i += 100) c.apply({ expected_revision: c.revision, commands: cmds.slice(i, i + 100) });
  const diag: TurnDiagnostics[] = [], text = "Person0000 smiles. Nicco's voice carries through the square.";
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: r => diag.push(structuredClone(r) as TurnDiagnostics) });
  for (let t = 0; t < 5; t++) for await (const _ of co.runTurn({ campaign: c, player_input: "Person0000, how are you today?" })) void _;
  const stage = (k: string) => +med(diag.map(d => (d.stage_timings as Record<string, { deterministic_ms: number }>)[k]?.deterministic_ms ?? 0)).toFixed(2);
  const snap = c.exportSnapshot(), t0 = performance.now();
  for (let i = 0; i < 20; i++) for (const p of snap.premium_characters) reflectionDue(snap, p.character_id);
  const due = (performance.now() - t0) / 20;
  const t1 = performance.now(); for (let i = 0; i < 20; i++) buildTurnContext(world, snap, { input: "Person0000, hello." }); const ctx = (performance.now() - t1) / 20;
  const present = new Set([...snap.characters.filter(ch => ch.current.current_location === OPENING_LOCATION).map(ch => ch.id)]);
  const t2 = performance.now(); for (let i = 0; i < 20; i++) packNpcPlus(world, snap, present, "Person0000, hello."); const pack = (performance.now() - t2) / 20;
  console.log(`characters=${String(total).padStart(3)} npc+=${String(npc).padStart(2)} present=${presentCount} | stage ms: intent ${stage("input_intent")} projection ${stage("projection")} prompt ${stage("prompt_composition")} auth ${stage("authorization")} audit ${stage("audit")} commit_prep ${stage("commit_preparation")} commit ${stage("commit")} | buildTurnContext ${ctx.toFixed(2)} packNpcPlus ${pack.toFixed(2)} reflectionDue(all) ${due.toFixed(3)}`);
}
for (const [total, npc] of [[30, 30], [200, 60], [200, 100], [500, 100], [500, 200]] as const) await row(total, npc);

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import type { CampaignCommand, RelationshipDimension } from "../src/campaign/types.js";
import type { ReflectionProvider } from "../src/turn/reflection.js";
import { GameSession, type SessionDeps } from "../src/app/index.js";
import { metadata } from "./turn-fixtures.js";

/**
 * Closure pass: deterministic long-session soak through the application façade, offline (no provider, no cost).
 *   node --expose-gc .build/tests/closure-soak.js [turns=1000]
 * Not a narrative-quality test: it measures growth, monotonic revisions, unique ids, save size, load time and local latency.
 */
const TURNS = Number(process.argv[2] ?? 1000), world = await loadWorld("data"), service = new RetrievalService(world);
const dir = await mkdtemp(join(tmpdir(), "caldrevan-soak-")), repository = new FileCampaignRepository(world, dir);
const names = ["Aldra", "Bessin", "Corvel", "Dunwa", "Elmir", "Farrow", "Gisela", "Harken", "Isolt", "Jorren", "Kestrel", "Lunna"];
const texts = ["The square hums quietly.", "Aldra smiles and nods.", "Bessin shrugs, unsure.", "A cart rattles past the tower.", "Corvel glances at Nicco and says nothing."];
let n = 0;
const narrator = { async generate() { throw new Error("unused"); }, async *stream() { const text = texts[n++ % texts.length]!; yield { type: "text_delta" as const, text }; yield { type: "completed" as const, result: { text, ...metadata } }; } };
const controller = { async propose() { return { commands: [] as CampaignCommand[], ...metadata }; } };
const reflection: ReflectionProvider = { async reflect() { return { text: JSON.stringify({ proposals: [] }), model: "stub" }; } };
const deps: SessionDeps = { world, repository, reflection_provider: reflection, trace_capacity: 50,
  createCoordinator: hooks => new TurnCoordinator(world, narrator, controller, { service, search: new HybridSearch(service) }, { diagnostics_sink: hooks.diagnostics_sink, provider_retry: false }) };
const created = GameSession.createCampaign(deps, "soak"); if (!created.ok) throw new Error("create failed");
let session = created.session;

// Setup is applied through a campaign handle the host owns (like a fixture); play itself only goes through the façade.
const host = createOpeningCampaign(world, "soak");
const id = (k: number) => `campaign_character_s${String(k).padStart(3, "0")}`;
host.apply({ expected_revision: host.revision, commands: [
  ...names.map((name, k): CampaignCommand => ({ kind: "register_character", character: { id: id(k), origin: { kind: "created" }, profile: { name, age: { kind: "exact", years: 20 + k } }, current: { current_location: k < 6 ? OPENING_LOCATION : "heartstone_lr", status: "active" } } })),
  ...names.map((_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id(k) })) ] });
session = GameSession.fromCampaign(deps, host);

const dims: RelationshipDimension[] = ["trust", "affection", "respect", "wariness"];
const sizes: Record<string, unknown>[] = [], local: number[] = [], ctx: number[] = [];
const revisions: number[] = []; let transactions = 0, failures = 0, rejected = 0, checkpoints = 0, loadMs = 0, saveMs = 0, maxSave = 0, maxLoad = 0;
const heap = () => { (globalThis as { gc?: () => void }).gc?.(); return Math.round(process.memoryUsage().heapUsed / 1048576); };
async function measure(turn: number) {
  const t0 = performance.now(), saved = await session.save(); if (!saved.ok) throw new Error("save failed"); const ms = performance.now() - t0;
  const text = await readFile(join(dir, "soak", "save.json"), "utf8"), snap = JSON.parse(text) as { snapshot: Record<string, unknown[]> };
  const s = snap.snapshot, bytes = (k: string) => JSON.stringify(s[k] ?? []).length;
  const t1 = performance.now(), v = session.getView(), viewMs = performance.now() - t1;
  sizes.push({ turn, revision: saved.saved.revision, save_bytes: text.length, premium_bytes: bytes("premium_characters"), reflection_bytes: bytes("premium_reflections"), transactions_bytes: bytes("transactions"), relationships_bytes: bytes("relationships"),
    characters: s.characters?.length, history_entries_max: Math.max(0, ...(s.premium_characters as { dynamic: { recent_developments: unknown[] } }[]).map(p => p.dynamic.recent_developments.length)), save_ms: +ms.toFixed(1), view_ms: +viewMs.toFixed(2), heap_mb: heap(), present: v.scene.present.length });
  if (turn === 0 || turn === TURNS) console.log(`domains@${turn}`, JSON.stringify(Object.fromEntries(Object.keys(s).map(k => [k, JSON.stringify(s[k]).length]))), "total", text.length);
  maxSave = Math.max(maxSave, text.length); saveMs += ms;
}
const started = performance.now(); await measure(0);
for (let turn = 1; turn <= TURNS; turn++) {
  if (turn % 25 === 0) for (const direction of ["raise", "lower"] as const) { try { host.apply({ expected_revision: host.revision, commands: [{ kind: "adjust_relationship", from_character_id: id(turn % names.length), to_character_id: "nicco", dimension: dims[turn % 4]!, direction }] }); break; } catch { /* at a bound: try the other direction */ } }
  if (turn % 37 === 0) host.apply({ expected_revision: host.revision, commands: [{ kind: "set_condition", character_id: id(turn % names.length), conditions: turn % 74 ? ["tired"] : [], status: "active" }] });
  if (turn % 60 === 0) { const gold = host.exportSnapshot().funds.find(f => f.character_id === "nicco")!.gold; host.apply({ expected_revision: host.revision, commands: [{ kind: "set_funds", character_id: "nicco", gold: gold + (turn % 120 ? -5 : 7) }] }); transactions++; }
  const input = turn % 11 === 0 ? (turn % 22 === 0 ? "/go heartstone_lr" : "/go heartstone_square") : turn % 7 === 0 ? "/wait 20" : `${names[turn % names.length]}, how are you today?`;
  const r = await session.submitPlayerInput(input);
  if (!r.ok) { if (r.error.code === "invalid_runtime_intent") rejected++; else { failures++; console.error(turn, input, r.error.code); } continue; }
  revisions.push(r.trace.revision_after); local.push(r.trace.latency_ms?.coordinator_total_ms ?? 0); if (r.trace.context_chars) ctx.push(r.trace.context_chars);
  if (turn % 100 === 0) {
    await measure(turn); checkpoints++;
    const t = performance.now(), loaded = await GameSession.loadCampaign(deps, "soak"); const ms = performance.now() - t; loadMs += ms; maxLoad = Math.max(maxLoad, ms);
    if (!loaded.ok) throw new Error("reload failed " + loaded.error.code);
    if (JSON.stringify(loaded.session.getView().scene) !== JSON.stringify(session.getView().scene)) throw new Error("reload differs at turn " + turn);
  }
}
const monotonic = revisions.every((r, i) => i === 0 || r >= revisions[i - 1]!);
const ids = host.exportSnapshot(); const dup = (xs: string[]) => xs.length !== new Set(xs).size;
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] ?? 0;
console.log(JSON.stringify({ turns: TURNS, wall_s: +((performance.now() - started) / 1000).toFixed(1), failures, rejected_runtime_intent: rejected, checkpoints, revisions_monotonic: monotonic,
  duplicate_ids: { characters: dup(ids.characters.map(c => c.id)), items: dup(ids.items.map(i => i.id)), transactions: dup(ids.transactions.map(t => t.id)) },
  local_turn_ms: { p50: +pct(local, 0.5).toFixed(2), p95: +pct(local, 0.95).toFixed(2), max: +Math.max(...local).toFixed(2) }, context_chars: { first: ctx[0], p50: pct(ctx, 0.5), max: Math.max(...ctx) },
  save_ms_avg: +(saveMs / sizes.length).toFixed(1), load_ms_avg: +(loadMs / Math.max(1, checkpoints)).toFixed(1), load_ms_max: +maxLoad.toFixed(1), max_save_bytes: maxSave, final_trace_ring: session.listTurns().length, transactions_applied: transactions }, null, 1));
console.table(sizes);

// Local cost profile of the application operations on three campaign sizes (no provider involved).
const profile: Record<string, Record<string, number>> = {};
for (const [label, total, npc] of [["small", 12, 6], ["medium", 200, 60], ["stress", 500, 200]] as const) {
  const c = createOpeningCampaign(world, `prof_${label}`), pid = (k: number) => `campaign_character_q${String(k).padStart(4, "0")}`;
  const t0 = performance.now(); const fresh = createOpeningCampaign(world, `fresh_${label}`); void fresh; const newMs = performance.now() - t0;
  const cmds: CampaignCommand[] = [...Array.from({ length: total }, (_, k): CampaignCommand => ({ kind: "register_character", character: { id: pid(k), origin: { kind: "created" }, profile: { name: `Person${k}`, age: { kind: "exact", years: 25 } }, current: { current_location: k % 3 ? "heartstone_lr" : OPENING_LOCATION, status: "active" } } })),
    ...Array.from({ length: npc }, (_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: pid(k) }))];
  for (let i = 0; i < cmds.length; i += 100) c.apply({ expected_revision: c.revision, commands: cmds.slice(i, i + 100) });
  const sess = GameSession.fromCampaign(deps, c);
  const time = async <T>(f: () => Promise<T> | T) => { const t = performance.now(); const v = await f(); return [performance.now() - t, v] as const; };
  const [viewMs] = await time(() => sess.getView()), [saveMs2] = await time(() => sess.save()), [loadMs2] = await time(() => GameSession.loadCampaign(deps, `prof_${label}`));
  const [turnMs] = await time(() => sess.submitPlayerInput("Person0, how are you today?"));
  profile[label] = { characters: total, npc_plus: npc, new_session_ms: +newMs.toFixed(2), view_ms: +viewMs.toFixed(2), save_ms: +saveMs2.toFixed(1), load_ms: +loadMs2.toFixed(1), full_stub_turn_ms: +turnMs.toFixed(1) };
}
console.table(profile);
await rm(dir, { recursive: true, force: true });

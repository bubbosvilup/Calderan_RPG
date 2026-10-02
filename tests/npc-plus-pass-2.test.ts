import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import { PREMIUM_DEVELOPMENT_RETENTION } from "../src/campaign/validation.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { contractCommands } from "../src/turn/character-contracts.js";
import { NPC_PLUS_LIMITS, npcPlusFragments, recoverNpcContext } from "../src/turn/npc-plus.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnEvent } from "../src/turn/turn-types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { collect, metadata } from "./turn-fixtures.js";

/** NPC+ Pass 2: deterministic development history from committed changes, and explicit-evidence stable contracts. */
const HOME = "campaign_household_h", TOMAS = "campaign_character_tomas";
const run = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const history = (s: DeepReadonly<CampaignSnapshot>, id: string) => s.premium_characters.find(p => p.character_id === id)!.dynamic.recent_developments;
const kinds = (s: DeepReadonly<CampaignSnapshot>, id: string) => history(s, id).map(e => e.kind);
function household(withTomas = true) {
  const f = turnFixture();
  run(f.campaign, { kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } });
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" }, { kind: "join_household", household_id: HOME, character_id: "maren" });
  if (withTomas) run(f.campaign, { kind: "register_character", character: { id: TOMAS, origin: { kind: "created" }, profile: { name: "Tomas", sex: "male" }, current: { current_location: "test_room", status: "active" } } },
    { kind: "join_household", household_id: HOME, character_id: TOMAS });
  return f;
}

// ================================================================================================ developments
test("a committed relationship change writes exactly one structured entry; current truth stays in the relationship domain", () => {
  const f = household();
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  const s = f.campaign.exportSnapshot(), last = history(s, "brenna").at(-1)!;
  assert.deepEqual(last, { kind: "relationship_changed", actor_id: "brenna", other_id: "nicco", dimension: "trust", from: "none", to: "low", revision: s.revision, world_minute: s.runtime.scene.world_time.world_minute });
  assert.deepEqual(kinds(s, "brenna"), ["joined_household", "relationship_changed"]);
  // History is not the current value: lowering it again leaves the old entry in place, and rendering follows the relationship domain.
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "lower" });
  const t = f.campaign.exportSnapshot();
  assert.equal(history(t, "brenna").filter(e => e.kind === "relationship_changed").length, 2);
  assert.match(npcPlusFragments(f.world, t, new Set(["brenna"])).find(x => x.tier === "C")!.text, /N\{trust=0\}/);
});

test("condition, legal, transaction, household-rule and movement changes write the correct entries", () => {
  const f = household();
  run(f.campaign, { kind: "set_condition", character_id: TOMAS, conditions: ["injured"] });
  run(f.campaign, { kind: "set_condition", character_id: TOMAS, conditions: [] });
  run(f.campaign, { kind: "set_legal_status", character_id: TOMAS, status: "enslaved", holder_id: "nicco" });
  run(f.campaign, { kind: "manumit", transaction_id: "campaign_transaction_free_tomas", character_id: TOMAS, by_holder_id: "nicco", documentation: "documented" });
  run(f.campaign, { kind: "add_household_rule", household_id: HOME, text: "Everyone eats together at sundown." });
  run(f.campaign, { kind: "move_character", character_id: TOMAS, location_id: "test_hall" });
  const s = f.campaign.exportSnapshot(), h = history(s, TOMAS);
  assert.deepEqual(h.map(e => e.kind), ["joined_household", "condition_added", "condition_removed", "legal_status_changed", "legal_status_changed", "person_transaction", "household_rule_added", "moved"]);
  assert.deepEqual(h.filter(e => e.kind === "legal_status_changed").map(e => e.kind === "legal_status_changed" ? `${e.from}>${e.to}` : ""), ["unestablished>enslaved", "enslaved>free"]);
  assert.deepEqual(h.at(-1), { kind: "moved", from: "test_room", to: "test_hall", revision: s.revision, world_minute: s.runtime.scene.world_time.world_minute });
  assert.ok(kinds(s, "brenna").includes("household_rule_added"), "a rule of their household is recorded for every current member");
  assert.equal(s.characters.find(c => c.id === TOMAS)!.current.current_location, "test_hall", "the location domain stays authoritative");
});

test("no entry without a committed change: invalid or stale proposals and unconsumed receipts write nothing; no duplicates", () => {
  const f = household(), before = f.campaign.exportSnapshot();
  assert.throws(() => run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "brenna", dimension: "trust", direction: "raise" }));
  assert.equal(f.campaign.exportSnapshot(), before);
  const proposal = { expected_revision: f.campaign.revision, commands: [{ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "trust", direction: "raise" } as CampaignCommand] };
  const a = f.campaign.prepare(proposal), b = f.campaign.prepare(proposal);
  f.campaign.commit(a);
  assert.throws(() => f.campaign.commit(b), "a second receipt of the same change is stale");
  assert.throws(() => f.campaign.apply(proposal), "a replay of the same proposal is stale");
  assert.equal(history(f.campaign.exportSnapshot(), "maren").filter(e => e.kind === "relationship_changed").length, 1);
});

test("retention keeps the newest 16 entries per NPC+, deterministically ordered", () => {
  const f = household();
  for (let i = 0; i < 12; i++) { run(f.campaign, { kind: "set_condition", character_id: TOMAS, conditions: ["injured"] }); run(f.campaign, { kind: "set_condition", character_id: TOMAS, conditions: [] }); }
  const s = f.campaign.exportSnapshot(), h = history(s, TOMAS);
  assert.equal(PREMIUM_DEVELOPMENT_RETENTION, 16);
  assert.equal(h.length, 16);
  assert.equal(h.at(-1)!.revision, s.revision);
  assert.ok(h.every((e, i) => i === 0 || e.revision >= h[i - 1]!.revision));
  // Same batch in a different command order gives byte-identical premium state.
  const order = (cmds: CampaignCommand[]) => { const g = household(); run(g.campaign, ...cmds); return JSON.stringify(g.campaign.exportSnapshot().premium_characters); };
  const batch: CampaignCommand[] = [{ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" }, { kind: "set_condition", character_id: TOMAS, conditions: ["injured"] }, { kind: "move_character", character_id: "maren", location_id: "test_hall" }];
  assert.equal(order(batch), order([...batch].reverse()));
});

// ================================================================================================ turns: rejected / failed / contracts
function harness(f = household(), controllerError = false) {
  let texts: string[] = [], commands: CampaignCommand[] = [];
  const service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() { const text = texts.shift() ?? "The moment passes."; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { if (controllerError) throw Object.assign(new Error("boom"), { code: "invalid_provider_response" }); return { commands: [...commands], ...metadata }; } },
    { service, search: new HybridSearch(service) }, { provider_retry: false });
  const step = async (input: string, narrations: string[], proposals: CampaignCommand[] = []) => { texts = [...narrations]; commands = proposals; return await collect(co.runTurn({ campaign: f.campaign, player_input: input })) as TurnEvent[]; };
  return { ...f, step };
}

test("a rejected proposal and a failed turn write no development", async () => {
  const h = harness();
  const before = JSON.stringify(h.campaign.exportSnapshot().premium_characters);
  // adjust_relationship needs verified evidence: an unsupported proposal is rejected and commits nothing.
  await h.step("I nod at Brenna.", ["Brenna nods back."], [{ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" }]);
  assert.equal(JSON.stringify(h.campaign.exportSnapshot().premium_characters), before);
  const failing = harness(household(), true);
  const snapshotBefore = failing.campaign.exportSnapshot();
  const events = await failing.step("I give boots to Brenna.", ["Brenna accepts the boots."]);
  assert.equal(events.at(-1)!.type, "turn_failed");
  assert.equal(failing.campaign.exportSnapshot(), snapshotBefore);
});

const contract = (narration: string) => { const f = household(); return contractCommands(narration, buildTurnContext(f.world, f.campaign.exportSnapshot()), f.campaign.exportSnapshot()); };
test("explicit self-description establishes an allowed contract; behaviour, reactions, hedges and others' claims never do", () => {
  assert.deepEqual(contract('Brenna looks at him. "I will never hurt children," she says.').map(c => c.kind === "establish_character_contract" ? [c.character_id, c.field, c.text] : []), [["brenna", "moral_boundary", "never hurt children"]]);
  assert.deepEqual(contract('"I always speak plainly," Maren says.').map(c => c.kind === "establish_character_contract" ? [c.field, c.text] : []), [["voice", "speaks plainly"]]);
  assert.deepEqual(contract('"I don\'t like crowds," Tomas mutters.').map(c => c.kind === "establish_character_contract" ? [c.field, c.text] : []), [["social_style", "dislikes crowds"]]);
  assert.deepEqual(contract('"I\'ve always been stubborn," Brenna says.').map(c => c.kind === "establish_character_contract" ? [c.field, c.text] : []), [["personality", "stubborn"]]);
  for (const narration of ["Brenna hesitates, quiet and shy.", "Tomas shouts once, then falls silent.", '"I won\'t hurt you," Brenna says.', '"Maybe I\'ve always been stubborn," Brenna says.',
    '"Would I ever hurt children?" Brenna asks.', '"If they push me, I will never hurt children," Brenna says.', '"Brenna has always been stubborn," Maren says.', "Brenna has always been stubborn.",
    '"I\'ve always been stubborn," Gerome\'s carved face seems to say.', '"I don\'t like this," Brenna says.'])
    assert.deepEqual(contract(narration), [], narration);
});

test("a full turn commits the contract with its evidence and a development; later contradiction never rewrites it", async () => {
  const h = harness();
  await h.step("Brenna, what kind of person are you?", ['Brenna meets his eyes. "I always speak plainly," she says.']);
  const s = h.campaign.exportSnapshot(), p = s.premium_characters.find(x => x.character_id === "brenna")!;
  assert.equal(p.stable.voice_contract, "speaks plainly");
  assert.deepEqual(p.stable.contract_evidence, [{ field: "voice", revision: s.revision, quote: "I always speak plainly," }]);
  assert.equal(history(s, "brenna").at(-1)!.kind, "contract_established");
  await h.step("Brenna, say that again.", ['"I always speak softly," Brenna says.']);
  assert.equal(h.campaign.exportSnapshot().premium_characters.find(x => x.character_id === "brenna")!.stable.voice_contract, "speaks plainly");
  // The campaign state layer refuses a rewrite even if one is proposed directly.
  assert.throws(() => run(h.campaign, { kind: "establish_character_contract", character_id: "brenna", field: "voice", text: "speaks softly", quote: "I always speak softly." }));
  assert.throws(() => run(h.campaign, { kind: "establish_character_contract", character_id: "gerome", field: "voice", text: "speaks softly", quote: "x" }), "only an active NPC+");
});

test("authored canon stays the source: traits render from canon and are never copied into premium state by play", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus2_canon");
  run(c, { kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" });
  run(c, { kind: "adjust_relationship", from_character_id: "korvin", to_character_id: "nicco", dimension: "respect", direction: "raise" });
  const p = c.exportSnapshot().premium_characters.find(x => x.character_id === "korvin")!;
  assert.deepEqual(p.stable, {});
  const traits = (world.getEntity("korvin") as unknown as { traits: string[] }).traits.slice(0, 3).join(", ");
  assert.ok(npcPlusFragments(world, c.exportSnapshot(), new Set(["korvin"]), "Korvin?").find(x => x.tier === "B")!.text.includes(`personality: ${traits}`));
});

// ================================================================================================ rendering, recovery, persistence, headroom
test("Tier B shows at most 3 developments, Tier C at most 2, ranked by relevance; recovery returns the exact entry", () => {
  const f = household();
  for (let i = 0; i < 6; i++) { run(f.campaign, { kind: "set_condition", character_id: TOMAS, conditions: ["injured"] }); run(f.campaign, { kind: "set_condition", character_id: TOMAS, conditions: [] }); }
  run(f.campaign, { kind: "adjust_relationship", from_character_id: TOMAS, to_character_id: "nicco", dimension: "trust", direction: "raise" });
  const s = f.campaign.exportSnapshot();
  const [b, c] = ["B", "C"].map(t => npcPlusFragments(f.world, s, new Set([TOMAS]), "Tomas, do you trust me?").find(x => x.tier === t)!.text);
  const tokens = (text: string, sep: string) => text.split(/recent[^=:]*[=:]\s*/)[1]!.split(/;|\|/)[0]!.split(sep).map(x => x.trim()).filter(Boolean);
  assert.ok(tokens(b!, ",").length <= 3 && tokens(c!, ",").length <= 2);
  assert.ok(b!.includes("trust>N:0→L"), "the development matching the question ranks first");
  const entry = history(s, TOMAS).at(-1)!;
  const handle = `npcmem:${TOMAS}:history:r${entry.revision}.0`;
  assert.deepEqual(JSON.parse(recoverNpcContext(f.world, s, handle)!.exact_payload), entry);
});

test("save/load preserves developments and contracts; tampered history never loads", async () => {
  const h = harness();
  await h.step("Brenna?", ['"I will never hurt children," Brenna says quietly.']);
  run(h.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  const s = h.campaign.exportSnapshot();
  const restored = CampaignState.restore(h.world, decodeSave(serializeSave(createSaveFile(s, h.world, "2026-10-02T12:00:00.000Z"), h.world), h.world).snapshot).exportSnapshot();
  assert.deepEqual(restored.premium_characters, s.premium_characters);
  assert.deepEqual(restored.premium_characters.find(x => x.character_id === "brenna")!.stable.moral_boundaries, ["never hurt children"]);
  const tampered = structuredClone(s) as CampaignSnapshot;
  (tampered.premium_characters[0]!.dynamic.recent_developments as unknown[]).push({ kind: "relationship_changed", actor_id: "nobody_here", other_id: "nicco", dimension: "trust", from: "none", to: "low", revision: s.revision, world_minute: 0 });
  assert.throws(() => CampaignState.restore(h.world, tampered), { code: "reference_invalid" });
  const overlong = structuredClone(s) as CampaignSnapshot;
  overlong.premium_characters[0]!.dynamic.recent_developments = Array.from({ length: 17 }, () => structuredClone(overlong.premium_characters[0]!.dynamic.recent_developments[0]!));
  assert.throws(() => CampaignState.restore(h.world, overlong), { code: "invalid_save" });
});

test("headroom: the H3 mixed 30-person scene still fits with 30 NPC+ carrying developments", async () => {
  const world = await loadWorld("data"), pad = (n: number) => String(n).padStart(3, "0");
  const c = createOpeningCampaign(world, "npcplus2_headroom");
  const commands: CampaignCommand[] = [
    ...Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "register_character", character: { id: `campaign_character_x${pad(k)}`, origin: { kind: "created" }, profile: { name: `Person${pad(k)}` }, current: { current_location: OPENING_LOCATION, status: "active" } } })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand[] => [{ kind: "create_fact", fact: { id: `campaign_fact_x${pad(k)}`, content: { kind: "campaign", statement: `Fact ${pad(k)} about the harbor ledgers.`, truth: "true" } } }, { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_x${pad(k)}`, status: "knows" } }]).flat(),
    ...Array.from({ length: 32 }, (_, k): CampaignCommand => ({ kind: "schedule_event", id: `campaign_event_x${pad(k)}`, title: `Meeting ${pad(k)}`, scheduled_world_minute: 50_000 + k * 7, participants: ["nicco"] })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand => ({ kind: "set_knowledge", knowledge: { character_id: `campaign_character_x${pad(k % 30)}`, fact_id: `campaign_fact_x${pad(Math.floor(k / 30))}`, status: "knows" } })),
    ...Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: `campaign_character_x${pad(k)}` })),
  ];
  for (let i = 0; i < commands.length; i += 100) c.apply({ expected_revision: c.revision, commands: commands.slice(i, i + 100) });
  for (const dimension of ["trust", "affection", "respect"] as const) c.apply({ expected_revision: c.revision, commands: Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "adjust_relationship", from_character_id: `campaign_character_x${pad(k)}`, to_character_id: "nicco", dimension, direction: "raise" })) });
  const context = buildTurnContext(world, c.exportSnapshot(), { input: "Person000, do you trust me?" });
  assert.ok(JSON.stringify(context).length <= 32_000);
  assert.equal(context.characters.length, 31);
  assert.equal(context.npc_plus!.diagnostics.tier_counts.B, 1);
  assert.ok(context.npc_plus!.diagnostics.chars_after <= NPC_PLUS_LIMITS.budget_characters);
});

import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot, PremiumHistoryEntry, PremiumRollup } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import { PREMIUM_DEVELOPMENT_RETENTION, PREMIUM_ROLLUP_LIMITS } from "../src/campaign/validation.js";
import { foldDevelopment } from "../src/campaign/premium-characters.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { NPC_PLUS_LIMITS, npcPlusFragments, recoverNpcContext } from "../src/turn/npc-plus.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { verifyRelationshipEvidence } from "../src/turn/household-evidence.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { collect, metadata } from "./turn-fixtures.js";

/** NPC+ Pass 3: deterministic long-term consolidation, follow proposal recall, relationship recall investigation, real-canon recovery. */
const HOME = "campaign_household_h", TOMAS = "campaign_character_tomas";
const run = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const premium = (s: DeepReadonly<CampaignSnapshot>, id: string) => s.premium_characters.find(p => p.character_id === id)!;
function household(members: readonly string[] = ["brenna", "maren"], withTomas = true) {
  const f = turnFixture();
  run(f.campaign, { kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } });
  if (members.length) run(f.campaign, ...members.map(character_id => ({ kind: "join_household", household_id: HOME, character_id }) as CampaignCommand));
  if (withTomas) run(f.campaign, { kind: "register_character", character: { id: TOMAS, origin: { kind: "created" }, profile: { name: "Tomas", sex: "male" }, current: { current_location: "test_room", status: "active" } } },
    { kind: "join_household", household_id: HOME, character_id: TOMAS });
  return f;
}
const cycle = (c: CampaignState, n: number) => { for (let i = 0; i < n; i++) { run(c, { kind: "set_condition", character_id: TOMAS, conditions: ["injured"] }); run(c, { kind: "set_condition", character_id: TOMAS, conditions: [] }); } };

// ================================================================================================ consolidation
test("the 17th entry consolidates the oldest; counters equal a fold of exactly the entries that left the window", () => {
  const f = household();
  cycle(f.campaign, 8); // joined + 16 condition entries = 17
  const p = premium(f.campaign.exportSnapshot(), TOMAS);
  assert.equal(p.dynamic.recent_developments.length, PREMIUM_DEVELOPMENT_RETENTION);
  assert.deepEqual([p.dynamic.long_term!.entries, p.dynamic.long_term!.lifecycle.joined], [1, 1]);
  const all: PremiumHistoryEntry[] = [];
  const g = household(); let prev = premium(g.campaign.exportSnapshot(), TOMAS).dynamic.recent_developments.length;
  all.push(...premium(g.campaign.exportSnapshot(), TOMAS).dynamic.recent_developments as PremiumHistoryEntry[]);
  for (let i = 0; i < 20; i++) {
    run(g.campaign, { kind: "set_condition", character_id: TOMAS, conditions: i % 2 ? [] : ["injured"] });
    run(g.campaign, { kind: "adjust_relationship", from_character_id: TOMAS, to_character_id: "nicco", dimension: "trust", direction: i % 4 < 2 ? "raise" : "lower" });
    const h = premium(g.campaign.exportSnapshot(), TOMAS).dynamic.recent_developments; all.push(...(h.slice(-2) as PremiumHistoryEntry[])); prev = h.length;
  }
  const s = g.campaign.exportSnapshot(), q = premium(s, TOMAS), folded = all.slice(0, all.length - PREMIUM_DEVELOPMENT_RETENTION);
  assert.equal(prev, PREMIUM_DEVELOPMENT_RETENTION);
  assert.deepEqual(q.dynamic.long_term, folded.reduce<PremiumRollup | undefined>((r, e) => foldDevelopment(r, e), undefined));
  assert.equal(q.dynamic.long_term!.entries + q.dynamic.recent_developments.length, all.length, "nothing lost, nothing counted twice");
  // Current authority is unaffected: the relationship domain holds the value; the roll-up holds counts.
  assert.equal(s.relationships.find(e => e.from_character_id === TOMAS)!.dimensions!.trust, "none");
});

test("no double counting: stale replays and second receipts never fold again; command order gives byte-identical roll-ups", () => {
  const f = household(); cycle(f.campaign, 9);
  const proposal = { expected_revision: f.campaign.revision, commands: [{ kind: "set_condition", character_id: TOMAS, conditions: ["injured"] } as CampaignCommand] };
  const a = f.campaign.prepare(proposal), b = f.campaign.prepare(proposal);
  f.campaign.commit(a); const after = JSON.stringify(premium(f.campaign.exportSnapshot(), TOMAS));
  assert.throws(() => f.campaign.commit(b)); assert.throws(() => f.campaign.apply(proposal));
  assert.equal(JSON.stringify(premium(f.campaign.exportSnapshot(), TOMAS)), after);
  const batch: CampaignCommand[] = [{ kind: "adjust_relationship", from_character_id: TOMAS, to_character_id: "nicco", dimension: "trust", direction: "raise" }, { kind: "set_condition", character_id: TOMAS, conditions: ["injured"] }, { kind: "move_character", character_id: TOMAS, location_id: "test_hall" }];
  const build = (cmds: CampaignCommand[]) => { const g = household(); cycle(g.campaign, 8); run(g.campaign, ...cmds); return JSON.stringify(g.campaign.exportSnapshot().premium_characters); };
  assert.equal(build(batch), build([...batch].reverse()));
});

test("the roll-up is bounded: at most 24 relationship rows and 12 condition rows; evicted rows are counted, never lost", () => {
  let r: PremiumRollup | undefined;
  for (let i = 0; i < 30; i++) r = foldDevelopment(r, { kind: "relationship_changed", actor_id: `campaign_character_a${String(i).padStart(2, "0")}`, other_id: "nicco", dimension: "trust", from: "none", to: "low", revision: i + 1, world_minute: 0 });
  for (let i = 0; i < 20; i++) r = foldDevelopment(r, { kind: "condition_added", condition: `c${String(i).padStart(2, "0")}`, revision: 40 + i, world_minute: 0 });
  assert.equal(r!.relationships.length, PREMIUM_ROLLUP_LIMITS.relationships);
  assert.equal(r!.other_relationship_changes, 6);
  assert.equal(r!.conditions.length, PREMIUM_ROLLUP_LIMITS.conditions);
  assert.equal(r!.other_condition_changes, 8);
  assert.equal(r!.relationships.some(x => x.actor_id === "campaign_character_a00"), false, "the least recently changed rows were evicted");
  assert.ok(JSON.stringify(r).length < 8_000, `serialized size is bounded by the row caps (${JSON.stringify(r).length})`);
});

test("save/load preserves roll-ups; exact roll-up recovery is typed as consolidated history; tampered roll-ups never load", () => {
  const f = household(); cycle(f.campaign, 10);
  const s = f.campaign.exportSnapshot();
  const restored = CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(s, f.world, "2026-10-02T15:00:00.000Z"), f.world), f.world).snapshot).exportSnapshot();
  assert.deepEqual(restored.premium_characters, s.premium_characters);
  const rec = recoverNpcContext(f.world, s, `npcmem:${TOMAS}:rollup:long_term`)!;
  assert.deepEqual(JSON.parse(rec.exact_payload), { type: "consolidated_history", ...premium(s, TOMAS).dynamic.long_term });
  assert.equal(rec.kind, "rollup");
  // A consolidated event's individual handle has expired; recent ones remain exact.
  const oldest = `npcmem:${TOMAS}:history:r${premium(s, TOMAS).metadata.created_revision}.0`;
  assert.equal(recoverNpcContext(f.world, s, oldest), undefined);
  const tampered = structuredClone(s) as CampaignSnapshot;
  tampered.premium_characters.find(p => p.character_id === TOMAS)!.dynamic.long_term!.last_revision = s.revision + 5;
  assert.throws(() => CampaignState.restore(f.world, tampered), { code: "reference_invalid" });
});

test("rendering: Tier B ≤ 3 recent + ≤ 1 history token; Tier C ≤ 2 recent + ≤ 1 history token; the 4k budget is unchanged", () => {
  const f = household();
  for (let i = 0; i < 10; i++) run(f.campaign, { kind: "adjust_relationship", from_character_id: TOMAS, to_character_id: "nicco", dimension: "trust", direction: i % 2 ? "lower" : "raise" });
  cycle(f.campaign, 6);
  const s = f.campaign.exportSnapshot();
  const [b, c] = (["B", "C"] as const).map(t => npcPlusFragments(f.world, s, new Set([TOMAS]), "Tomas, do you trust me?").find(x => x.tier === t && x.character_id === TOMAS)!.text);
  assert.match(b!, /history: trust_hist>N:\+\d+\/-\d+/);
  assert.match(c!, /hist=trust_hist>N:\+\d+\/-\d+/);
  assert.equal((b!.match(/_hist/g) ?? []).length, 1);
  assert.equal(NPC_PLUS_LIMITS.budget_characters, 4_000);
});

// ================================================================================================ follow recall
function harness(f = household()) {
  let texts: string[] = [], commands: CampaignCommand[] = [];
  const diagnostics: TurnDiagnostics[] = [], service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() { const text = texts.shift() ?? "The moment passes."; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: d => { diagnostics.push(d as TurnDiagnostics); } });
  const step = async (input: string, narrations: string[], proposals: CampaignCommand[] = []) => {
    texts = [...narrations]; commands = proposals;
    const events = await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
    assert.equal(events.at(-1)!.type, "turn_completed", JSON.stringify(events.at(-1)));
    return diagnostics.at(-1)!;
  };
  return { ...f, step };
}
const where = (s: DeepReadonly<CampaignSnapshot>, id: string) => s.characters.find(c => c.id === id && c.origin.kind === "created")?.current.current_location ?? s.runtime.npc_locations.find(n => n.character_id === id)?.current_location;
const COME = "Come with me, Brenna. Let's go down to the main hall.";

test("follow recall: completed narrated following of an NPC+ is proposed deterministically and authorized; audit stays clean", async () => {
  const h = harness();
  const d = await h.step(COME, ["Nicco heads down to the main hall. Brenna follows him downstairs into the hall."]); // controller proposes nothing
  assert.deepEqual([where(h.campaign.exportSnapshot(), "nicco") ?? h.campaign.exportSnapshot().runtime.scene.player_location, where(h.campaign.exportSnapshot(), "brenna")], ["test_hall", "test_hall"]);
  assert.deepEqual(d.authorization?.decisions.filter(x => x.kind === "move_character").map(x => [x.authorized, x.reason]), [[true, "authorized_narrative_confirmation"]]);
  assert.deepEqual(d.audit?.issue_kinds, []);
  assert.ok(premium(h.campaign.exportSnapshot(), "brenna").dynamic.recent_developments.some(e => e.kind === "moved"));
});

test("follow recall: a request alone, hesitation or refusal creates no proposal and moves nobody; non-NPC+ authored NPCs stay canon-placed", async () => {
  for (const narration of ["Nicco heads down to the main hall. Brenna hesitates.", "Nicco heads down to the main hall. Brenna refuses to follow him down the stairs.", "Nicco heads down to the main hall."]) {
    const h = harness();
    const d = await h.step(COME, [narration, "Nicco heads down to the main hall alone."]);
    assert.equal(where(h.campaign.exportSnapshot(), "brenna"), "test_room", narration);
    assert.deepEqual(d.authorization?.decisions.filter(x => x.kind === "move_character"), [], narration);
  }
  const plain = harness(household([], false)); // Brenna is not NPC+
  await plain.step(COME, ["Nicco heads down to the main hall. Brenna follows him downstairs into the hall.", "Nicco heads down to the main hall alone."]);
  assert.equal(where(plain.campaign.exportSnapshot(), "brenna"), "test_room");
});

// ================================================================================================ relationship recall (investigation, no repair)
test("relationship recall root cause (Pass 2 live, 0/6): the narration never evidenced a change, so there was nothing valid to propose", () => {
  const f = household();
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot());
  // Verbatim Maren replies from the six Pass 2 HH_C live runs (docs/evaluations/h5-live/npcplus2.jsonl).
  const live = ['"It wasn\'t much," she said quietly.', 'A small, uncertain smile crossed her face, and she dipped her head.', '"She\'s tougher than she looks, honestly."',
    'She looks momentarily surprised by the thanks, then gives a small, careful nod.', '"She needed someone here," she said simply.', 'A small, tired smile crossed her face, and she dipped her head.'];
  for (const dimension of ["affection", "trust"] as const)
    for (const quote of live) assert.equal(verifyRelationshipEvidence({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension, direction: "raise" }, quote, `Maren listens. ${quote}`, context).verified, false, quote);
  // Positive control: the feeling character's own evidenced act still verifies (behaviour unchanged).
  assert.equal(verifyRelationshipEvidence({ kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "maren", dimension: "protectiveness", direction: "raise" },
    "Brenna steps between Maren and the door, shielding her.", "Brenna steps between Maren and the door, shielding her.", context).verified, true);
});

// ================================================================================================ real-canon recovery
test("real canon: a relevant question recovers Korvin's public canon exactly; an unrelated one recovers nothing; private canon stays private", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus3_canon"); // Nicco at Heartstone Square; Korvin away at the market
  run(c, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" });
  const relevant = buildTurnContext(world, c.exportSnapshot(), { input: "What do I know about Korvin's trade at the market?" }).npc_plus!;
  assert.equal(relevant.diagnostics.recovered, 1);
  assert.ok(relevant.lines.some(l => l.startsWith("Recovered for Korvin [npcmem:korvin:canon:entity]: ") && l.includes((world.getEntity("korvin") as { content: string }).content.slice(0, 120))));
  assert.equal(buildTurnContext(world, c.exportSnapshot(), { input: "What is the weather like today?" }).npc_plus!.diagnostics.recovered, 0);
  assert.equal(recoverNpcContext(world, c.exportSnapshot(), "npcmem:korvin:canon:entity")!.exact_payload, (world.getEntity("korvin") as { content: string }).content);
  // At the market with Korvin present: public content is already in the scene (not recovered again); his private chunk stays on the
  // H3 holder path, never on an NPC+ line, never player knowledge.
  run(c, { kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } });
  const input = "Korvin, did you ever have a daughter? Tell me about your trade.";
  const present = buildTurnContext(world, c.exportSnapshot(), { input });
  const secret = world.getChunk("korvin.private_background")!.content;
  assert.equal(present.npc_plus!.diagnostics.recovered, 0);
  assert.equal(present.npc_plus!.lines.join("\n").includes("lost a daughter"), false);
  const access = projectKnowledgeAccess(present, undefined);
  assert.equal(access.player.some(ref => access.facts.find(f => f.ref === ref)?.text.includes("daughter")), false);
  assert.equal(recoverNpcContext(world, c.exportSnapshot(), "npcmem:korvin:canon:korvin.private_background")!.visibility, "holder_private");
  assert.ok(secret.includes("daughter"));
});

// ================================================================================================ headroom
test("headroom: H3 mixed 30-person scene + 30 NPC+ with full histories and non-empty roll-ups stays under 32k", async () => {
  const world = await loadWorld("data"), pad = (n: number) => String(n).padStart(3, "0");
  const c = createOpeningCampaign(world, "npcplus3_headroom");
  const ids = Array.from({ length: 30 }, (_, k) => `campaign_character_x${pad(k)}`);
  const commands: CampaignCommand[] = [
    ...ids.map((id, k): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name: `Person${pad(k)}`, voice: "low and even" }, current: { current_location: OPENING_LOCATION, status: "active" } } })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand[] => [{ kind: "create_fact", fact: { id: `campaign_fact_x${pad(k)}`, content: { kind: "campaign", statement: `Fact ${pad(k)} about the harbor ledgers.`, truth: "true" } } }, { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_x${pad(k)}`, status: "knows" } }]).flat(),
    ...Array.from({ length: 32 }, (_, k): CampaignCommand => ({ kind: "schedule_event", id: `campaign_event_x${pad(k)}`, title: `Meeting ${pad(k)}`, scheduled_world_minute: 50_000 + k * 7, participants: ["nicco"] })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand => ({ kind: "set_knowledge", knowledge: { character_id: ids[k % 30]!, fact_id: `campaign_fact_x${pad(Math.floor(k / 30))}`, status: "knows" } })),
    ...ids.map((id): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id })),
  ];
  for (let i = 0; i < commands.length; i += 100) c.apply({ expected_revision: c.revision, commands: commands.slice(i, i + 100) });
  for (let round = 0; round < 10; round++) {
    c.apply({ expected_revision: c.revision, commands: ids.map((id): CampaignCommand => ({ kind: "set_condition", character_id: id, conditions: round % 2 ? [] : ["injured"] })) });
    c.apply({ expected_revision: c.revision, commands: ids.map((id): CampaignCommand => ({ kind: "adjust_relationship", from_character_id: id, to_character_id: "nicco", dimension: "trust", direction: round % 4 < 2 ? "raise" : "lower" })) });
  }
  const s = c.exportSnapshot();
  assert.ok(s.premium_characters.every(p => p.dynamic.recent_developments.length === 16 && (p.dynamic.long_term?.entries ?? 0) > 0));
  const context = buildTurnContext(world, s, { input: "Person000, do you trust me?" });
  assert.ok(JSON.stringify(context).length < 32_000);
  assert.equal(context.characters.length, 31);
  assert.equal(context.npc_plus!.diagnostics.tier_counts.B, 1);
  assert.ok(context.npc_plus!.diagnostics.chars_after <= NPC_PLUS_LIMITS.budget_characters);
});

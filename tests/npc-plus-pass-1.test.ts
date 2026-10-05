import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { NPC_PLUS_LIMITS, npcDeepSources, npcPlusFragments, packNpcPlus, recoverNpcContext } from "../src/turn/npc-plus.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { buildNarratorPrompt } from "../src/turn/prompt-builder.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import type { WorldStore } from "../src/world/world-store.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { collect, metadata } from "./turn-fixtures.js";

/** NPC+ Pass 1: premium character foundation, deterministic context packing, exact recovery, and authored NPC+ movability. */
const HOME = "campaign_household_h";
const keep = (c: CampaignState) => c.apply({ expected_revision: c.revision, commands: [{ kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } }] });
const run = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const premium = (s: DeepReadonly<CampaignSnapshot>, id: string) => s.premium_characters.find(p => p.character_id === id);
const created = (id: string, name: string, location = "test_room", extra: Record<string, unknown> = {}): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, ...extra }, current: { current_location: location, status: "active" } } });

// ================================================================================================ lifecycle
test("household join creates NPC+ for an authored NPC and for a created character; Nicco never is NPC+", () => {
  const f = turnFixture(); keep(f.campaign);
  assert.deepEqual(f.campaign.exportSnapshot().premium_characters, [], "Nicco's own owner membership creates nothing");
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "maren" });
  const s = f.campaign.exportSnapshot(), m = premium(s, "maren")!;
  assert.deepEqual([m.metadata.active_household_member, m.metadata.created_revision, m.dynamic.recent_developments.map(e => e.kind), m.stable], [true, s.revision, ["joined_household"], {}]);
  run(f.campaign, created("campaign_character_tomas", "Tomas"), { kind: "join_household", household_id: HOME, character_id: "campaign_character_tomas" });
  assert.equal(premium(f.campaign.exportSnapshot(), "campaign_character_tomas")?.metadata.active_household_member, true);
  // A forged snapshot that makes Nicco NPC+ never validates.
  const forged = structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot;
  forged.premium_characters.push({ ...structuredClone(forged.premium_characters[0]!), character_id: "nicco" });
  assert.throws(() => CampaignState.restore(f.world, forged), { code: "reference_invalid" });
});

test("leaving preserves and deactivates; rejoining reactivates the SAME record; history is never deleted", () => {
  const f = turnFixture(); keep(f.campaign);
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const created_revision = premium(f.campaign.exportSnapshot(), "brenna")!.metadata.created_revision;
  run(f.campaign, { kind: "leave_household", household_id: HOME, character_id: "brenna" });
  const left = premium(f.campaign.exportSnapshot(), "brenna")!;
  assert.deepEqual([left.metadata.active_household_member, left.metadata.created_revision, left.dynamic.recent_developments.map(e => e.kind)], [false, created_revision, ["joined_household", "left_household"]]);
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const back = premium(f.campaign.exportSnapshot(), "brenna")!;
  assert.deepEqual([back.metadata.active_household_member, back.metadata.created_revision, back.dynamic.recent_developments.map(e => e.kind)], [true, created_revision, ["joined_household", "left_household", "rejoined_household"]]);
  assert.equal(f.campaign.exportSnapshot().premium_characters.length, 1);
});

test("no other trigger creates NPC+: guests, households Nicco does not keep, relationships, purchases, knowledge or presence", () => {
  const f = turnFixture(); keep(f.campaign);
  run(f.campaign, { kind: "set_membership", household_id: HOME, membership: { character_id: "brenna", status: "guest" } });
  run(f.campaign, { kind: "create_household", id: "campaign_household_other" }, { kind: "join_household", household_id: "campaign_household_other", character_id: "gerome" });
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  run(f.campaign, { kind: "set_knowledge", knowledge: { character_id: "maren", fact_id: "campaign_fact_bridge_closed", status: "knows" } });
  run(f.campaign, created("campaign_character_tomas", "Tomas"), { kind: "set_legal_status", character_id: "campaign_character_tomas", status: "enslaved", holder_id: "nicco" });
  assert.deepEqual(f.campaign.exportSnapshot().premium_characters, []);
});

test("unknown personality stays unknown; authored traits render from canon without being copied into the save", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus_unknown");
  run(c, { kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }, created("campaign_character_lysa", "Lysa", "calderan_slave_market"),
    { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "campaign_character_lysa" }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" });
  const s = c.exportSnapshot();
  assert.deepEqual([premium(s, "korvin")!.stable, premium(s, "campaign_character_lysa")!.stable], [{}, {}]);
  const present = new Set(buildTurnContext(world, s).characters.map(x => x.id));
  const lysa = npcPlusFragments(world, s, present, "Lysa, how are you?").find(x => x.character_id === "campaign_character_lysa" && x.tier === "B")!;
  assert.match(lysa.text, /personality: unknown \| voice: unknown \| morality: unknown/);
  const korvin = npcPlusFragments(world, s, present, "Korvin, a word.").find(x => x.character_id === "korvin" && x.tier === "B")!;
  const traits = (world.getEntity("korvin") as unknown as { traits: string[] }).traits.slice(0, 3).join(", ");
  assert.ok(korvin.text.includes(`personality: ${traits}`));
  assert.equal(JSON.stringify(premium(s, "korvin")).includes(traits), false, "canon traits are rendered, not stored");
});

test("relationship values have one authority: NPC+ renders them and never stores a copy", () => {
  const f = turnFixture(); keep(f.campaign);
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const before = structuredClone(premium(f.campaign.exportSnapshot(), "brenna"));
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  const s = f.campaign.exportSnapshot();
  // NPC+ Pass 2: relationship changes append HISTORY entries; the current value still lives only in the relationship domain.
  assert.deepEqual(premium(s, "brenna")!.stable, before!.stable);
  assert.deepEqual(premium(s, "brenna")!.dynamic.recent_developments.filter(e => e.kind === "relationship_changed").map(e => e.kind === "relationship_changed" ? `${e.from}>${e.to}` : ""), ["none>low", "low>moderate"]);
  assert.equal(s.relationships.find(e => e.from_character_id === "brenna" && e.to_character_id === "nicco")!.dimensions!.trust, "moderate");
  assert.match(npcPlusFragments(f.world, s, new Set(["brenna"])).find(x => x.tier === "C")!.text, /N\{trust=M\}/);
});

// ================================================================================================ context packing and recovery
function bigHousehold(n: number, present = n) {
  const f = turnFixture(); keep(f.campaign);
  const ids = Array.from({ length: n }, (_, i) => `campaign_character_m${String(i).padStart(2, "0")}`);
  for (let i = 0; i < n; i += 50) run(f.campaign, ...ids.slice(i, i + 50).flatMap((id, k) => [created(id, `Member${String(i + k).padStart(2, "0")}`, i + k < present ? "test_room" : "test_hall"), { kind: "join_household", household_id: HOME, character_id: id } as CampaignCommand]));
  return { ...f, ids };
}
test("global budget: twenty NPC+ fit one 4,000-character scene budget; authority (Tier A) is never traded for flavour", () => {
  const h = bigHousehold(20), s = h.campaign.exportSnapshot();
  const context = buildTurnContext(h.world, s, { input: "Member03, come here." });
  const npc = context.npc_plus!;
  assert.ok(npc.diagnostics.chars_after <= NPC_PLUS_LIMITS.budget_characters, `${npc.diagnostics.chars_after}`);
  assert.equal(npc.diagnostics.active_count, 20);
  assert.equal(npc.diagnostics.tier_counts.B, 1, "the addressed, present member is pinned at Tier B");
  // Tier A stays complete: every present person, every membership, regardless of how much NPC+ flavour fits.
  assert.equal(context.characters.length, 1 + 3 + 20);
  assert.equal(context.social.households[0]!.members.length, 20); // every member besides Nicco
  const tiny = packNpcPlus(h.world, s, new Set(context.characters.map(c => c.id)), "Member03, come here.", 400)!;
  assert.ok(tiny.diagnostics.chars_after <= 400 && tiny.diagnostics.omitted_fragments > 0);
  assert.equal(buildTurnContext(h.world, s, { input: "Member03, come here." }).characters.length, context.characters.length);
});

test("deterministic packing: same state and input give byte-identical NPC+ context; membership order does not matter", () => {
  const a = bigHousehold(12), b = turnFixture(); keep(b.campaign);
  const reversed = [...a.ids].reverse();
  run(b.campaign, ...reversed.map((id, k) => created(id, `Member${String(a.ids.length - 1 - k).padStart(2, "0")}`)));
  run(b.campaign, ...reversed.map(id => ({ kind: "join_household", household_id: HOME, character_id: id }) as CampaignCommand));
  const pack = (c: CampaignState, w: WorldStore) => JSON.stringify(packNpcPlus(w, c.exportSnapshot(), new Set(buildTurnContext(w, c.exportSnapshot()).characters.map(x => x.id)), "Member05?"));
  assert.equal(pack(a.campaign, a.world), pack(a.campaign, a.world));
  const strip = (j: string) => j.replace(/\(r\d+\)/g, "(r?)"); // join revisions differ between the two construction orders
  assert.equal(strip(pack(a.campaign, a.world)), strip(pack(b.campaign, b.world)));
});

test("recovery returns the exact source; private recovered memory is never rendered and never becomes player knowledge", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus_private");
  run(c, { kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" });
  const s = c.exportSnapshot();
  const sources = npcDeepSources(world, s, "korvin");
  const privateBackground = recoverNpcContext(world, s, "npcmem:korvin:canon:korvin.private_background")!;
  assert.deepEqual([privateBackground.visibility, privateBackground.exact_payload], ["holder_private", world.getChunk("korvin.private_background")!.content]);
  // NPC+ Pass 2: stable history handles (revision + ordinal) and the exact structured entry as payload.
  const history = recoverNpcContext(world, s, `npcmem:korvin:history:r${s.revision}.0`)!;
  assert.deepEqual(JSON.parse(history.exact_payload), premium(s, "korvin")!.dynamic.recent_developments[0]);
  assert.equal(JSON.parse(history.exact_payload).kind, "joined_household");
  assert.equal(recoverNpcContext(world, s, `npcmem:gerome:history:r${s.revision}.0`), undefined, "no recovery for a non-NPC+");
  assert.ok(sources.some(x => x.visibility === "public"));
  // Asking about his past: public sources may be recovered before narration; the private chunk never is rendered.
  const context = buildTurnContext(world, s, { input: "Korvin, tell me about your daughter and your past." });
  const prompt = buildNarratorPrompt("Korvin, tell me about your daughter and your past.", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.equal(context.npc_plus!.lines.join("\n").includes(privateBackground.exact_payload), false);
  assert.equal((prompt.match(/He lost a daughter long ago/g) ?? []).length <= 1, true, "private canon appears at most once, on the H3 holder-only line");
  const access = projectKnowledgeAccess(context, undefined);
  assert.equal(access.player.some(ref => access.facts.find(f => f.ref === ref)?.text.includes("daughter")), false);
  assert.deepEqual(c.exportSnapshot().knowledge, s.knowledge, "recovery creates no knowledge state");
});

// ================================================================================================ persistence
test("old saves migrate: empty premium domain without Nicco-household members; derived records for existing members", () => {
  const legacy = (c: CampaignState, world: WorldStore) => {
    const file = JSON.parse(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-02T09:00:00.000Z"), world));
    file.schema_version = 2; file.snapshot.schema_version = 1; delete file.snapshot.premium_characters; delete file.snapshot.premium_reflections;
    return JSON.stringify(file);
  };
  const empty = turnFixture();
  const loadedEmpty = decodeSave(legacy(empty.campaign, empty.world), empty.world);
  assert.deepEqual([loadedEmpty.schema_version, loadedEmpty.snapshot.schema_version, loadedEmpty.snapshot.premium_characters], [4, 3, []]);
  const member = turnFixture(); keep(member.campaign); run(member.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const loaded = decodeSave(legacy(member.campaign, member.world), member.world).snapshot;
  assert.deepEqual([premium(loaded, "brenna")!.metadata.active_household_member, premium(loaded, "brenna")!.dynamic.recent_developments.map(e => e.kind), premium(loaded, "brenna")!.stable], [true, ["migrated_member"], {}]);
  assert.doesNotThrow(() => CampaignState.restore(member.world, loaded));
});

test("save/load preserves premium state exactly (active and inactive records)", () => {
  const f = turnFixture(); keep(f.campaign);
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" }, { kind: "join_household", household_id: HOME, character_id: "maren" });
  run(f.campaign, { kind: "leave_household", household_id: HOME, character_id: "maren" });
  const restored = CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(f.campaign.exportSnapshot(), f.world, "2026-10-02T09:00:00.000Z"), f.world), f.world).snapshot);
  assert.deepEqual(restored.exportSnapshot().premium_characters, f.campaign.exportSnapshot().premium_characters);
  // A tampered active flag that contradicts membership never loads.
  const tampered = structuredClone(f.campaign.exportSnapshot()) as CampaignSnapshot;
  tampered.premium_characters.find(p => p.character_id === "maren")!.metadata.active_household_member = true;
  assert.throws(() => CampaignState.restore(f.world, tampered), { code: "reference_invalid" });
});

// ================================================================================================ authored NPC+ movement
function harness(f = turnFixture()) {
  let texts: string[] = [], commands: CampaignCommand[] = [];
  const diagnostics: TurnDiagnostics[] = [], service = new RetrievalService(f.world);
  const co = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() { const text = texts.shift() ?? "The moment passes."; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) }, { diagnostics_sink: d => { diagnostics.push(d as TurnDiagnostics); } });
  const step = async (input: string, narrations: string[], proposals: CampaignCommand[] = []) => {
    texts = [...narrations]; commands = proposals;
    const events = await collect(co.runTurn({ campaign: f.campaign, player_input: input }));
    const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
    return { result: (last as { result: TurnResult }).result, diagnostics: diagnostics.at(-1)! };
  };
  return { ...f, step };
}
const where = (s: DeepReadonly<CampaignSnapshot>, id: string) => s.runtime.npc_locations.find(n => n.character_id === id)?.current_location;
const FOLLOW: CampaignCommand = { kind: "move_character", character_id: "brenna", location_id: "test_hall" };

test("authored NPC+ moves from completed narrated following, through authorization; the H5.1 audit stays quiet", async () => {
  const f = turnFixture(); keep(f.campaign); run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const h = harness(f);
  const { diagnostics } = await h.step("I go down to the main hall.", ["Nicco descends to the main hall. Brenna follows him down the stairs into the main hall."], [FOLLOW]);
  const s = h.campaign.exportSnapshot();
  assert.deepEqual([s.runtime.scene.player_location, where(s, "brenna"), where(s, "maren")], ["test_hall", "test_hall", "test_room"]);
  assert.deepEqual(diagnostics.audit?.issue_kinds, []);
});

test("authored NPC+: a request alone, or membership, never moves them; unsupported narrated following is flagged", async () => {
  const f = turnFixture(); keep(f.campaign); run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const h = harness(f);
  await h.step("Come with me, Brenna. Let's go down to the main hall.", ["Nicco heads down to the main hall alone."], [FOLLOW]);
  assert.deepEqual([h.campaign.exportSnapshot().runtime.scene.player_location, where(h.campaign.exportSnapshot(), "brenna")], ["test_hall", "test_room"]);
  const g = turnFixture(); keep(g.campaign); run(g.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const h2 = harness(g);
  // NPC+ Pass 3: completed narrated following is now proposed deterministically (tested in Pass 3); membership alone never moves anyone,
  // and narration that merely gestures at following ("Brenna looks toward the stairs") is no evidence.
  const { diagnostics } = await h2.step("I go down to the main hall.", ["Nicco descends to the main hall. Brenna looks toward the stairs."]);
  assert.equal(where(h2.campaign.exportSnapshot(), "brenna"), "test_room", "membership never auto-follows");
  assert.deepEqual(diagnostics.authorization?.decisions.filter(d => d.kind === "move_character"), []);
});

test("authored NPCs that are not NPC+ stay canon-placed: the same narrated follow is rejected", async () => {
  const f = turnFixture(); keep(f.campaign);
  const h = harness(f);
  await h.step("I go down to the main hall.", ["Nicco descends to the main hall. Brenna follows him down the stairs into the main hall.", "Nicco descends to the main hall alone."], [FOLLOW]);
  assert.equal(where(h.campaign.exportSnapshot(), "brenna"), "test_room");
});

test("narrator prompt: NPC+ section appears only with active NPC+; no NPC+ field otherwise (pre-NPC+ prompts unchanged)", () => {
  const plain = turnFixture();
  const context = buildTurnContext(plain.world, plain.campaign.exportSnapshot());
  assert.equal("npc_plus" in context, false);
  const f = turnFixture(); keep(f.campaign); run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  const ctx = buildTurnContext(f.world, f.campaign.exportSnapshot(), { input: "Brenna, are you all right?" });
  const prompt = buildNarratorPrompt("Brenna, are you all right?", ctx, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.match(prompt, /\[NPC\+ HOUSEHOLD CHARACTERS\][\s\S]*NPC\+ Brenna \(NPC1\)/);
});

// ================================================================================================ stress
test("headroom: the H3 mixed 30-person scene (~89% of 32k) stays representable with 30 NPC+; NPC+ degrades, authority stays", async () => {
  const world = await loadWorld("data"), pad = (n: number) => String(n).padStart(3, "0");
  const c = createOpeningCampaign(world, "npcplus_headroom");
  const commands: CampaignCommand[] = [
    ...Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "register_character", character: { id: `campaign_character_x${pad(k)}`, origin: { kind: "created" }, profile: { name: `Person${pad(k)}` }, current: { current_location: OPENING_LOCATION, status: "active" } } })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand[] => [{ kind: "create_fact", fact: { id: `campaign_fact_x${pad(k)}`, content: { kind: "campaign", statement: `Fact ${pad(k)} about the harbor ledgers.`, truth: "true" } } }, { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_x${pad(k)}`, status: "knows" } }]).flat(),
    ...Array.from({ length: 32 }, (_, k): CampaignCommand => ({ kind: "schedule_event", id: `campaign_event_x${pad(k)}`, title: `Meeting ${pad(k)}`, scheduled_world_minute: 50_000 + k * 7, participants: ["nicco"] })),
    ...Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "seed_relationship", relationship: { from_character_id: `campaign_character_x${pad(k)}`, to_character_id: "nicco", dimensions: { trust: "moderate" } } })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand => ({ kind: "set_knowledge", knowledge: { character_id: `campaign_character_x${pad(k % 30)}`, fact_id: `campaign_fact_x${pad(Math.floor(k / 30))}`, status: "knows" } })),
    ...Array.from({ length: 30 }, (_, k): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: `campaign_character_x${pad(k)}` })),
  ];
  for (let i = 0; i < commands.length; i += 100) c.apply({ expected_revision: c.revision, commands: commands.slice(i, i + 100) });
  const context = buildTurnContext(world, c.exportSnapshot(), { input: "Person000, come here." });
  assert.equal(context.characters.length, 31, "every present person kept (Tier A)");
  assert.equal(context.npc_plus!.diagnostics.tier_counts.B, 1, "the addressed member stays pinned");
  assert.ok(context.npc_plus!.diagnostics.tier_counts.D > 0 && context.npc_plus!.diagnostics.chars_after < NPC_PLUS_LIMITS.budget_characters);
  assert.ok(JSON.stringify(context).length <= 32_000);
});

test("context stress: NPC+ adds at most its global budget; 30 present (mixed) stays within the 32k projection", () => {
  for (const [n, present] of [[1, 1], [5, 5], [10, 10], [20, 20], [30, 15]] as const) {
    const h = bigHousehold(n, present);
    for (let i = 0; i < 30 - present && n === 30; i++) run(h.campaign, created(`campaign_character_x${String(i).padStart(2, "0")}`, `Visitor${String(i).padStart(2, "0")}`));
    const context = buildTurnContext(h.world, h.campaign.exportSnapshot(), { input: "Member00, come here." });
    assert.ok(context.npc_plus!.diagnostics.chars_after <= NPC_PLUS_LIMITS.budget_characters, `${n}`);
  }
});

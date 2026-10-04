import { productionStub, testTrajectory, testContrast, testMovement, instantReflectionPacing } from "./production-reflection-fixtures.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD, OPENING_LOCATION } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot, ReflectionNote } from "../src/campaign/types.js";
import type { DeepReadonly } from "../src/types/readonly.js";
import { REFLECTION_LIMITS } from "../src/campaign/validation.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { NPC_PLUS_LIMITS, npcPlusFragments, recoverNpcContext } from "../src/turn/npc-plus.js";
import { mergeNotes, reflectAfterTurn, reflectionDue, reflectionEvidence, validateProposals, type Proposal, type ReflectionProvider } from "../src/turn/reflection.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { turnFixture } from "../src/dev/turn-fixture.js";

/** NPC+ Pass 6: bounded evidence-cited reflection (model stubbed; every validation is deterministic). */
const HOME = "campaign_household_h";
const run = (c: CampaignState, ...commands: CampaignCommand[]) => c.apply({ expected_revision: c.revision, commands });
const notes = (s: DeepReadonly<CampaignSnapshot>, id = "brenna") => s.premium_reflections.find(r => r.character_id === id)?.notes ?? [];
function household() {
  const f = turnFixture();
  run(f.campaign, { kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } });
  run(f.campaign, { kind: "join_household", household_id: HOME, character_id: "brenna" });
  return f;
}
/** Three relationship developments for Brenna: trust raise, raise, then wariness raise (a mixed picture). */
function withHistory() {
  const f = household();
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" });
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "wariness", direction: "raise" });
  return f;
}
const historyRefs = (s: DeepReadonly<CampaignSnapshot>) => reflectionEvidence(turnFixture().world, s, "brenna").filter(e => e.kind === "development" && / toward .+ moved /.test(e.text)).map(e => e.ref);
function stub(proposals: unknown[] | string, calls = { n: 0 }): ReflectionProvider {
  return { async reflect() { calls.n++; return { text: typeof proposals === "string" ? proposals : JSON.stringify({ proposals }), model: "stub" }; } };
}
const P = (kind: Proposal["kind"], label: string, text: string, evidence_refs: string[], confidence: Proposal["confidence"] = "medium") => ({ kind, label, text, evidence_refs, confidence });

// ================================================================================================ trigger and evidence
test("no evidence beyond joining → not due, no model call; three developments → due", async () => {
  const f = household(), calls = { n: 0 };
  assert.equal(reflectionDue(f.campaign.exportSnapshot(), "brenna"), false);
  assert.deepEqual(await reflectAfterTurn(f.campaign, f.world, stub([], calls)), []);
  assert.equal(calls.n, 0);
  const g = withHistory();
  assert.equal(reflectionDue(g.campaign.exportSnapshot(), "brenna"), true);
});

test("evidence rules: one event is no pattern; two are; a stance needs strong or two refs; a tension needs both sides and a contrast", async () => {
  const f = withHistory(), s = f.campaign.exportSnapshot(), [h1, h2, h3] = historyRefs(s), rel = "npcrel:brenna:nicco";
  const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testTrajectory(r), testContrast(r), testTrajectory({...r,evidence:r.evidence.filter(e=>e.ref===h1)})]));
  assert.equal(runs[0]!.status, "committed");
  assert.equal(runs[0]!.rejected.length, 1);
  const t = f.campaign.exportSnapshot();
  assert.deepEqual(notes(t).map(n => n.kind), ["signature_pattern", "unresolved_tension"]);
  assert.ok(notes(t).every(n => n.evidence_refs.length > 0));
});

test("forbidden inferences are rejected: motive, romance, backstory, diagnosis, absolute claims, unsupported or invented people; invented refs too", async () => {
  const f = withHistory(), s = f.campaign.exportSnapshot(), [h1, h2] = historyRefs(s), catalog = reflectionEvidence(f.world, s, "brenna");
  const names = new Map([["brenna", "Brenna"], ["maren", "Maren"], ["gerome", "Gerome"]]);
  const cases = [
    P("stance", "secret_plan", "Secretly plans to leave once she trusts Nicco.", [h1!, h2!]),
    P("stance", "growing_love", "Is falling in love with Nicco.", [h1!, h2!]),
    P("stance", "old_wounds", "Her childhood taught her to keep distance.", [h1!, h2!]),
    P("stance", "guarded_trauma", "Guarded because of trauma.", [h1!, h2!]),
    P("stance", "full_trust", "Trusts Nicco completely now.", [h1!, h2!]),
    P("stance", "maren_echo", "Treats Nicco the way she treats Maren.", [h1!, h2!]),
    P("stance", "korvin_echo", "Treats Nicco the way she once treated Korvin.", [h1!, h2!]),
    P("stance", "invented", "Leans on Nicco for safety.", ["npcmem:brenna:history:r999.0"]),
    // Pass 6 live findings: reliance, dependence and reciprocity are never recorded by any evidence, so they cannot be claimed.
    P("stance", "developing_reliance", "Trust rose while affection stayed low, suggesting a developing reliance.", [h1!, h2!]),
    P("signature_pattern", "reciprocal_wariness", "Her wariness rose in reciprocal steps with her trust.", [h1!, h2!]),
  ];
  assert.deepEqual(validateProposals(cases, catalog, { id: "brenna", name: "Brenna" }, names).rejected.map(r => r.reason),
    ["forbidden_inference", "forbidden_inference", "forbidden_inference", "forbidden_inference", "forbidden_inference", "unsupported_person", "unsupported_person", "unknown_evidence", "forbidden_inference", "forbidden_inference"]);
  // End to end: a batch of only bad proposals commits no note (and more than 6 proposals fails the whole output closed).
  const runs = await reflectAfterTurn(f.campaign, f.world, stub(cases.slice(0, 6)));
  assert.deepEqual([runs[0]!.status, runs[0]!.accepted.length, notes(f.campaign.exportSnapshot()).length], ["malformed", 0, 0]);
  const g = withHistory();
  assert.equal((await reflectAfterTurn(g.campaign, g.world, stub(cases)))[0]!.status, "malformed");
});

// ================================================================================================ merge, caps, failure modes
test("duplicates update instead of multiplying; per-kind caps hold; vanished evidence prunes notes", async () => {
  const f = withHistory(), [h1, h2] = historyRefs(f.campaign.exportSnapshot());
  await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testTrajectory(r), testTrajectory(r)]));
  assert.equal(notes(f.campaign.exportSnapshot()).length, 1);
  run(f.campaign, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "trust", direction: "raise" },
    { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "respect", direction: "raise" }, { kind: "adjust_relationship", from_character_id: "brenna", to_character_id: "nicco", dimension: "affection", direction: "raise" });
  await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testTrajectory({...r,evidence:r.evidence.filter(e=>e.ref===h1||e.ref===h2)})]));
  const updated = notes(f.campaign.exportSnapshot());
  assert.equal(updated.length, 1); assert.equal(updated[0]!.confidence, "high");
  assert.equal(updated[0]!.structured?.semantic_version, "V2.3-CVC-E1");
  // Caps: six distinct stances never exceed four.
  const capped = mergeNotes([], Array.from({ length: 6 }, (_, i) => ({ kind: "stance" as const, label: `stance_${i}`, text: `Stance ${i} toward Nicco.`, evidence_refs: [h1!], confidence: "low" as const })),
    reflectionEvidence(f.world, f.campaign.exportSnapshot(), "brenna"), 50);
  assert.equal(capped.length, REFLECTION_LIMITS.stance);
  // Evidence that no longer resolves is pruned; a note left with none is removed (no evidence → no note).
  assert.deepEqual(mergeNotes([{ id: "r1_stance_1", kind: "stance", label: "x", text: "Old note.", evidence_refs: ["npcmem:brenna:history:r1.0"], confidence: "high", created_revision: 1, updated_revision: 1 }], [], [], 50), []);
});

test("fail closed: malformed output, provider failure and a newer revision change nothing; gameplay state is untouched", async () => {
  for (const provider of [stub("not json at all"), stub('{"proposals":[],"extra":1}'), { async reflect(): Promise<never> { throw new Error("timeout"); } } as ReflectionProvider]) {
    const f = withHistory(), before = f.campaign.exportSnapshot();
    const runs = await reflectAfterTurn(f.campaign, f.world, provider, { pacing: instantReflectionPacing().pacing });
    assert.ok(["malformed", "provider_failed"].includes(runs[0]!.status));
    assert.equal(f.campaign.exportSnapshot(), before);
  }
  // Stale: a turn commits while the model is thinking → the reflection is dropped.
  const f = withHistory(), [h1, h2] = historyRefs(f.campaign.exportSnapshot());
  const racing: ReflectionProvider = { async reflect() { run(f.campaign, { kind: "set_condition", character_id: "brenna", conditions: ["recovering", "tired"] }); return { text: JSON.stringify({ proposals: [P("stance", "cautious_trust", "Approaches Nicco with cautious trust.", [h1!, h2!])] }) }; } };
  const before = f.campaign.exportSnapshot().revision;
  const runs = await reflectAfterTurn(f.campaign, f.world, racing);
  assert.deepEqual([runs[0]!.status, f.campaign.exportSnapshot().revision, notes(f.campaign.exportSnapshot()).length], ["stale", before + 1, 0]);
});

test("reflection is never authority: every other domain is byte-identical after a committed reflection", async () => {
  const f = withHistory(), [h1, h2, h3] = historyRefs(f.campaign.exportSnapshot()), before = f.campaign.exportSnapshot();
  await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testContrast(r), testTrajectory(r)]));
  const { premium_reflections: _a, revision: _r, ...rest } = f.campaign.exportSnapshot(), { premium_reflections: _b, revision: _q, ...restBefore } = before;
  assert.deepEqual(rest, restBefore);
  assert.equal(notes(f.campaign.exportSnapshot()).length, 2);
  // The campaign layer refuses notes that cite another character's evidence.
  assert.throws(() => run(f.campaign, { kind: "record_reflection", character_id: "brenna", reflected_revision: f.campaign.revision, notes: [{ id: "r1_stance_1", kind: "stance", label: "x", text: "x", evidence_refs: ["npcmem:maren:history:r1.0"], confidence: "low", created_revision: 1, updated_revision: 1 }] }));
});

// ================================================================================================ persistence, recovery, privacy, context
test("save/load preserves reflection; recovery returns the exact note with evidence and revisions", async () => {
  const f = withHistory(), [h1, h2] = historyRefs(f.campaign.exportSnapshot());
  await reflectAfterTurn(f.campaign, f.world, productionStub(r => [testTrajectory(r)]));
  const s = f.campaign.exportSnapshot();
  const restored = CampaignState.restore(f.world, decodeSave(serializeSave(createSaveFile(s, f.world, "2026-10-02T18:00:00.000Z"), f.world), f.world).snapshot).exportSnapshot();
  assert.deepEqual(restored.premium_reflections, s.premium_reflections);
  const note = notes(s)[0]!;
  assert.deepEqual(JSON.parse(recoverNpcContext(f.world, s, `npcmem:brenna:reflection:${note.id}`)!.exact_payload), { type: "reflection_note", ...note });
});

test("private evidence never reaches reflection: Korvin's private chunk is not in the catalog and cannot be cited", async () => {
  const world = await loadWorld("data");
  const c = createOpeningCampaign(world, "npcplus6_private");
  run(c, { kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }, { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: "korvin" });
  for (const d of ["trust", "respect", "wariness"] as const) run(c, { kind: "adjust_relationship", from_character_id: "korvin", to_character_id: "nicco", dimension: d, direction: "raise" });
  const catalog = reflectionEvidence(world, c.exportSnapshot(), "korvin");
  assert.equal(catalog.some(e => e.ref.includes("private_background") || e.text.includes("daughter")), false);
  const runs = await reflectAfterTurn(c, world, stub([P("stance", "guarded", "Guards a private grief around children.", ["npcmem:korvin:canon:korvin.private_background", "npcrel:korvin:nicco"])]));
  assert.equal(runs[0]!.status, "malformed");
});

test("context: Tier B shows at most 2 reflection notes and Tier C one token; the H3 mixed + 30 NPC+ scene with full reflection stays under 32k", async () => {
  const f = withHistory(), refs = historyRefs(f.campaign.exportSnapshot());
  const many: ReflectionNote[] = (["stance", "signature_pattern", "unresolved_tension"] as const).map((kind, i) => ({ id: `r1_${kind}_1`, kind, label: `note_${i}`, text: `Reflection ${i} while still careful.`, evidence_refs: [refs[0]!], confidence: "medium", created_revision: 1, updated_revision: 1 }));
  run(f.campaign, { kind: "record_reflection", character_id: "brenna", reflected_revision: f.campaign.revision, notes: many });
  const s = f.campaign.exportSnapshot();
  const b = npcPlusFragments(f.world, s, new Set(["brenna"]), "Brenna?").find(x => x.tier === "B")!.text, c = npcPlusFragments(f.world, s, new Set(["brenna"]), "Brenna?").find(x => x.tier === "C")!.text;
  assert.equal((b.split("| reflection: ")[1]!.split(" | ")[0]!.match(/"[^"]*"/g) ?? []).length, 2);
  assert.match(c, /; refl=tension:note_2/);
  // Stress: H3 mixed scene, 30 NPC+ each at the reflection caps.
  const world = await loadWorld("data"), pad = (n: number) => String(n).padStart(3, "0"), camp = createOpeningCampaign(world, "npcplus6_headroom");
  const ids = Array.from({ length: 30 }, (_, k) => `campaign_character_x${pad(k)}`);
  const commands: CampaignCommand[] = [...ids.map((id, k): CampaignCommand => ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name: `Person${pad(k)}` }, current: { current_location: OPENING_LOCATION, status: "active" } } })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand[] => [{ kind: "create_fact", fact: { id: `campaign_fact_x${pad(k)}`, content: { kind: "campaign", statement: `Fact ${pad(k)} about the harbor ledgers.`, truth: "true" } } }, { kind: "set_knowledge", knowledge: { character_id: "nicco", fact_id: `campaign_fact_x${pad(k)}`, status: "knows" } }]).flat(),
    ...Array.from({ length: 32 }, (_, k): CampaignCommand => ({ kind: "schedule_event", id: `campaign_event_x${pad(k)}`, title: `Meeting ${pad(k)}`, scheduled_world_minute: 50_000 + k * 7, participants: ["nicco"] })),
    ...Array.from({ length: 64 }, (_, k): CampaignCommand => ({ kind: "set_knowledge", knowledge: { character_id: ids[k % 30]!, fact_id: `campaign_fact_x${pad(Math.floor(k / 30))}`, status: "knows" } })),
    ...ids.map((id): CampaignCommand => ({ kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: id }))];
  for (let i = 0; i < commands.length; i += 100) camp.apply({ expected_revision: camp.revision, commands: commands.slice(i, i + 100) });
  for (const dimension of ["trust", "respect", "affection"] as const) camp.apply({ expected_revision: camp.revision, commands: ids.map((id): CampaignCommand => ({ kind: "adjust_relationship", from_character_id: id, to_character_id: "nicco", dimension, direction: "raise" })) });
  const full = (id: string): ReflectionNote[] => (Object.entries({ stance: 4, signature_pattern: 4, shared_motif: 4, emerging_role: 3, unresolved_tension: 3 }) as [ReflectionNote["kind"], number][])
    .flatMap(([kind, n]) => Array.from({ length: n }, (_, i): ReflectionNote => ({ id: `r1_${kind}_${i + 1}`, kind, label: `${kind}_${i}`, text: `A long evidence-cited ${kind} note number ${i} about ${id} that fills most of the bound.`, evidence_refs: [`npcrel:${id}:nicco`], confidence: "high", created_revision: 1, updated_revision: 1 })));
  for (let i = 0; i < ids.length; i += 10) camp.apply({ expected_revision: camp.revision, commands: ids.slice(i, i + 10).map((id): CampaignCommand => ({ kind: "record_reflection", character_id: id, reflected_revision: camp.revision, notes: full(id) })) });
  const context = buildTurnContext(world, camp.exportSnapshot(), { input: "Person000, do you trust me?" });
  assert.ok(JSON.stringify(context).length < 32_000);
  assert.equal(context.characters.length, 31);
  assert.ok(context.npc_plus!.diagnostics.chars_after <= NPC_PLUS_LIMITS.budget_characters);
});

import test from "node:test";
import assert from "node:assert/strict";
import { household } from "./pass10-support.js";
import { collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { scriptedController, scriptedNarrator, type Step } from "./provider-failure-scripts.js";
import { characterLocation } from "../src/turn/character-movement.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { TurnDiagnostics } from "../src/turn/turn-diagnostics.js";
import { ProviderError } from "../src/llm/errors.js";
import { reflectAfterTurn, reflectionEvidence, type ReflectionProvider } from "../src/turn/reflection.js";

/**
 * NPC+ Pass 10 — provider fault injection on the invitation/follow turn (no network, no retry unless stated). A failed turn commits
 * nothing; a successful turn commits exactly once; a reflection failure never undoes gameplay.
 */
const FOLLOW = "Nicco goes down the stairs. Maren follows him.", INPUT = "I go down to the main hall. Maren, come with me.";
const MOVE: CampaignCommand = { kind: "move_character", character_id: "maren", location_id: "test_hall" };
async function run(narrator: Step[], controller: Step[], commands: readonly CampaignCommand[] = [MOVE]) {
  const f = household(), service = new RetrievalService(f.world), diag: TurnDiagnostics[] = [], before = JSON.stringify(f.campaign.exportSnapshot());
  const co = new TurnCoordinator(f.world, scriptedNarrator([FOLLOW], narrator), scriptedController(commands, controller), { service, search: new HybridSearch(service) },
    { diagnostics_sink: r => diag.push(structuredClone(r) as TurnDiagnostics), provider_retry: false });
  const events = await collect(co.runTurn({ campaign: f.campaign, player_input: INPUT }));
  const snapshot = f.campaign.exportSnapshot();
  return { f, events, diag: diag[0]!, before, snapshot, commits: events.filter(e => e.type === "state_committed").length, failed: events.find(e => e.type === "turn_failed"),
    maren: characterLocation(snapshot, f.world, "maren"), moved: snapshot.premium_characters.find(p => p.character_id === "maren")!.dynamic.recent_developments.filter(e => e.kind === "moved").length };
}
for (const code of ["timeout", "rate_limited", "provider_unavailable", "network_error", "invalid_provider_response"] as const) for (const site of ["narrator", "controller"] as const)
  test(`${site} ${code}: the turn fails with that code, nothing commits, nobody moves, diagnostics name it`, async () => {
    const r = await run(site === "narrator" ? [{ fail: code }] : ["ok"], site === "controller" ? [{ fail: code }] : ["ok"]);
    assert.ok(r.failed && r.failed.type === "turn_failed");
    assert.equal(r.commits, 0); assert.equal(JSON.stringify(r.snapshot), r.before, "byte-identical state after a failed turn");
    assert.equal(r.maren, "test_room"); assert.equal(r.moved, 0);
    assert.equal(r.diag.outcome, "failure");
    assert.equal(r.diag.failure_phase, site, "diagnostics name the failing stage");
    assert.equal(r.diag.provider_code, code, "diagnostics name the provider code");
    assert.equal(r.diag.commit.attempted, false);
  });
test("narrator empty and malformed output fail closed without partial state", async () => {
  for (const step of ["empty", "malformed"] as const) { const r = await run([step], ["ok"]); assert.ok(r.failed); assert.equal(r.commits, 0); assert.equal(JSON.stringify(r.snapshot), r.before); }
});
test("a narrator stream that fails after a follow was narrated discards the draft: the follow never commits", async () => {
  const r = await run([{ partial: FOLLOW, fail: "timeout" }], ["ok"]);
  assert.ok(r.failed); assert.equal(r.commits, 0); assert.equal(r.maren, "test_room");
});
test("controller structured_output_invalid: no retry under this policy, a clean failure (the deterministic derived proposal is never applied without a completed controller)", async () => {
  const r = await run(["ok"], ["malformed"]);
  assert.ok(r.failed); assert.equal(r.commits, 0); assert.equal(r.maren, "test_room");
});
test("controller schema mismatch (a move_character without a destination) is a controller failure, not a partial commit", async () => {
  const r = await run(["ok"], ["ok"], [{ kind: "move_character", character_id: "maren" } as unknown as CampaignCommand]);
  assert.ok(r.failed); assert.equal(r.commits, 0); assert.equal(r.maren, "test_room");
});
test("controller duplicate proposal: exactly one commit, one authoritative move, one development", async () => {
  const r = await run(["ok"], ["ok"], [MOVE, MOVE]);
  assert.equal(r.commits, 1); assert.equal(r.maren, "test_hall"); assert.equal(r.moved, 1); assert.equal(r.diag.outcome, "success");
});
test("controller proposes nothing: the derived proposal still yields exactly one commit and one move", async () => {
  const r = await run(["ok"], ["ok"], []);
  assert.equal(r.commits, 1); assert.equal(r.maren, "test_hall"); assert.equal(r.moved, 1);
});

// ------------------------------------------------------------------------------------------------ reflection faults never undo gameplay
for (const fault of ["timeout", "malformed", "stale", "all_rejected", "private_evidence"] as const) test(`reflection ${fault} after a committed follow: gameplay state is untouched, the run is classified, nothing partial is stored`, async () => {
  const r = await run(["ok"], ["ok"]);
  const f = r.f;
  for (const loc of ["test_room", "test_hall"]) f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: loc }] });
  const gameplay = JSON.stringify(f.campaign.exportSnapshot());
  const refs = reflectionEvidence(f.world, f.campaign.exportSnapshot(), "maren").filter(e => / moved from /.test(e.text)).map(e => e.ref);
  const good = { kind: "shared_motif", label: "stairs_use", text: "Maren has moved between the observation room and the main hall several times.", evidence_refs: refs, confidence: "medium" };
  const provider: ReflectionProvider = { async reflect() {
    if (fault === "timeout") throw new ProviderError("timeout");
    if (fault === "malformed") return { text: "{not json" };
    if (fault === "stale") { f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "move_character", character_id: "maren", location_id: "test_room" }] }); return { text: JSON.stringify({ proposals: [good] }) }; }
    if (fault === "all_rejected") return { text: JSON.stringify({ proposals: [{ ...good, text: "Maren loves moving with Nicco." }] }) };
    return { text: JSON.stringify({ proposals: [{ ...good, evidence_refs: ["npcmem:maren:knowledge:campaign_fact_private_secret"] }] }) };
  } };
  const runs = await reflectAfterTurn(f.campaign, f.world, provider);
  const expected = { timeout: "provider_failed", malformed: "malformed", stale: "stale", all_rejected: "committed", private_evidence: "committed" }[fault];
  assert.equal(runs[0]!.status, expected);
  const after = f.campaign.exportSnapshot();
  assert.equal(after.premium_reflections.flatMap(x => x.notes).length, 0, "no note was stored");
  if (fault !== "stale" && fault !== "all_rejected" && fault !== "private_evidence") assert.equal(JSON.stringify(after), gameplay, "no state change at all");
  if (fault === "all_rejected" || fault === "private_evidence") assert.ok(runs[0]!.rejected.length > 0);
  assert.equal(characterLocation(after, f.world, "maren"), fault === "stale" ? "test_room" : "test_hall");
});

import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { projectTurnIntent, resolveTurnIntent, type IntentStageInput } from "../src/turn/stages/intent.js";
import { createDraftGenerator, type NarratorRequest } from "../src/turn/stages/narration.js";
import { assembleTurnCommands, authorizeTurn } from "../src/turn/stages/authorization.js";
import { createNarrationAuditor, deliverDraft, reconcileNarration } from "../src/turn/stages/audit.js";
import { prepareCommit } from "../src/turn/stages/commit-preparation.js";
import { SceneParticipants } from "../src/turn/scene-participants.js";
import { TurnError } from "../src/turn/turn-types.js";
import { ProviderError } from "../src/llm/errors.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import { metadata } from "./turn-fixtures.js";

/**
 * Hardening H2: the extracted stages are directly testable with deterministic fixtures, and none of them can mutate CampaignState.
 * (End-to-end order and byte-identity are pinned by turn-pipeline-golden; this file tests the stage contracts in isolation.)
 */
const transfer: CampaignCommand = { kind: "transfer_item", item_id: "boots", owner_id: "brenna", position: { kind: "carried", character_id: "brenna" } };
const ring: CampaignCommand = { kind: "transfer_item", item_id: "ring", owner_id: "gerome", position: { kind: "carried", character_id: "gerome" } };

/** Runs the stages up to final preparation for a fixture handover; returns everything the audit stage needs. */
function staged(input: string, draft: string, proposal: readonly CampaignCommand[]) {
  const { world, campaign } = turnFixture(), snapshot = campaign.exportSnapshot(), base_revision = campaign.revision;
  let commits = 0; const commit = campaign.commit.bind(campaign); campaign.commit = (r: unknown) => { commits++; return commit(r); };
  const participants = new SceneParticipants();
  const intentInput: IntentStageInput = { world, snapshot, base_revision, player_input: input, prepare: p => campaign.prepare(p), plan: (i, c) => participants.plan(i, c), finalized: [] };
  const resolved = resolveTurnIntent(intentInput), projection = projectTurnIntent(intentInput, resolved);
  const authorization = authorizeTurn({ controller: { commands: [...proposal], ...metadata }, intent: resolved.intent, draft, context: projection.context, projected: projection.projected,
    movable: projection.movable, origin: projection.origin, arrival: projection.arrival, world, mode: "hybrid", sink: undefined, debug_base: { campaign_id: snapshot.campaign_id, base_revision, player_input: input } });
  const { authorized, commands } = assembleTurnCommands({ diagnostics: authorization.diagnostics, intent: resolved.intent, projected: projection.projected });
  const prepared = campaign.prepare({ expected_revision: base_revision, commands });
  const auditor = createNarrationAuditor({ base_revision, context: projection.context, world, retrieved: { records: [], unknown: false }, player_input: input, recent: [], intent: resolved.intent,
    scene: projection.scene, turn_evidence: authorization.turn_evidence, diagnostics: authorization.diagnostics, authorized, prepared: prepared.snapshot });
  return { world, campaign, snapshot, base_revision, resolved, projection, authorization, authorized, commands, prepared, auditor, commits: () => commits, participants };
}
function narratorOf(texts: readonly string[]): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream() { const text = texts[Math.min(i++, texts.length - 1)]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
const PROMPT: NarratorRequest = { system_prompt: "system", messages: [{ role: "user", content: "turn" }] };

// ------------------------------------------------------------------------------------------------ AuditStage
test("AuditStage: clean narration passes unchanged (delivered as the draft, no reconciliation)", () => {
  const s = staged("I give boots to Brenna.", "Brenna accepts boots from Nicco.", [transfer]);
  const issues = s.auditor.check("Brenna accepts boots from Nicco.", s.authorization.turn_evidence);
  assert.deepEqual(issues, []);
  assert.deepEqual(deliverDraft("Brenna accepts boots from Nicco.", issues), { draft: "Brenna accepts boots from Nicco.", issues: [], delivered: "draft", text: "Brenna accepts boots from Nicco.", revision_issues: [] });
});
test("AuditStage: an issue-bearing draft requests reconciliation, and a clean revision is delivered", async () => {
  const draft = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
  const s = staged("I give boots to Brenna.", draft, [transfer]);
  const issues = s.auditor.check(draft, s.authorization.turn_evidence);
  assert.ok(issues.some(x => x.kind === "asserts_uncommitted_transfer" && x.item_id === "ring"), JSON.stringify(issues));
  const calls: unknown[] = [];
  const generate = createDraftGenerator({ async generate() { throw new Error("unused"); }, async *stream(r) { calls.push(r); const text = "Brenna accepts boots from Nicco."; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } }, new AbortController().signal, () => {});
  const delivery = await reconcileNarration({ auditor: s.auditor, generate, checkpoint: () => {}, prompt: PROMPT, draft, issues, outcome: s.auditor.outcome(issues), intent: s.resolved.intent, context: s.projection.context });
  assert.equal(calls.length, 1, "exactly one bounded revision request");
  assert.deepEqual([delivery.delivered, delivery.text, delivery.revision, delivery.revision_issues, delivery.draft], ["revision", "Brenna accepts boots from Nicco.", "Brenna accepts boots from Nicco.", [], draft]);
});
test("AuditStage: a revision that still fails is deterministically redacted", async () => {
  const draft = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
  const s = staged("I give boots to Brenna.", draft, [transfer]);
  const issues = s.auditor.check(draft, s.authorization.turn_evidence);
  const delivery = await reconcileNarration({ auditor: s.auditor, generate: createDraftGenerator(narratorOf([draft]), new AbortController().signal, () => {}), checkpoint: () => {},
    prompt: PROMPT, draft, issues, outcome: s.auditor.outcome(issues), intent: s.resolved.intent, context: s.projection.context });
  assert.equal(delivery.delivered, "redacted");
  assert.ok(delivery.revision_issues.length > 0);
  assert.ok(!delivery.text.includes("Gerome takes the ring"), delivery.text);
});
test("AuditStage: a stale/cancelled checkpoint after the revision call means the revision is never delivered", async () => {
  const draft = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
  const s = staged("I give boots to Brenna.", draft, [transfer]);
  const issues = s.auditor.check(draft, s.authorization.turn_evidence);
  await assert.rejects(reconcileNarration({ auditor: s.auditor, generate: createDraftGenerator(narratorOf(["Brenna accepts boots from Nicco."]), new AbortController().signal, () => {}),
    checkpoint: () => { throw new TurnError("stale_turn"); }, prompt: PROMPT, draft, issues, outcome: s.auditor.outcome(issues), intent: s.resolved.intent, context: s.projection.context }), /stale_turn/);
});
test("AuditStage never mutates state: auditing, reconciling and redacting leave the campaign snapshot identical", async () => {
  const draft = "Brenna accepts boots from Nicco. Gerome takes the ring from Nicco.";
  const s = staged("I give boots to Brenna.", draft, [transfer]);
  const before = s.campaign.exportSnapshot(), revision = s.campaign.revision;
  const issues = s.auditor.check(draft, s.authorization.turn_evidence);
  await reconcileNarration({ auditor: s.auditor, generate: createDraftGenerator(narratorOf([draft]), new AbortController().signal, () => {}), checkpoint: () => {},
    prompt: PROMPT, draft, issues, outcome: s.auditor.outcome(issues), intent: s.resolved.intent, context: s.projection.context });
  assert.equal(s.campaign.exportSnapshot(), before); assert.equal(s.campaign.revision, revision); assert.equal(s.commits(), 0);
  assert.equal(s.campaign.exportSnapshot().items.find(i => i.id === "ring")!.owner_id, "nicco", "a narrated-but-uncommitted handover never becomes state");
});

// ------------------------------------------------------------------------------------------------ other stage contracts
test("Intent/projection stages: projection is detached — no commit, no revision change, base snapshot untouched", () => {
  const { world, campaign } = turnFixture(), snapshot = campaign.exportSnapshot(), participants = new SceneParticipants();
  let commits = 0; const commit = campaign.commit.bind(campaign); campaign.commit = (r: unknown) => { commits++; return commit(r); };
  const input: IntentStageInput = { world, snapshot, base_revision: campaign.revision, player_input: "/wait 30", prepare: p => campaign.prepare(p), plan: (i, c) => participants.plan(i, c), finalized: [] };
  const resolved = resolveTurnIntent(input), projection = projectTurnIntent(input, resolved);
  assert.equal(projection.projected.runtime.scene.world_time.world_minute, snapshot.runtime.scene.world_time.world_minute + 30, "narration sees the projected time");
  assert.deepEqual([commits, campaign.revision, campaign.exportSnapshot() === snapshot], [0, 1, true], "but nothing is authoritative");
  assert.ok(Object.isFrozen(projection.projected));
});
test("Authorization stage: controller output is a proposal — unsupported commands are rejected with a reason, not applied", () => {
  const s = staged("I give boots to Brenna.", "Brenna looks at the boots.", [transfer, ring]);
  assert.deepEqual(s.authorization.diagnostics.map(d => d.authorized), [false, false]);
  assert.ok(s.authorization.diagnostics.every(d => typeof d.reason === "string" && d.reason.startsWith("rejected_")));
  assert.deepEqual(s.authorized, []); assert.equal(s.commits(), 0);
});
test("Narration stage: provider errors propagate, oversize drafts are context_too_large, inconsistent completions are narrator_failed", async () => {
  const failing: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { throw new ProviderError("timeout"); } };
  await assert.rejects(createDraftGenerator(failing, new AbortController().signal, () => {})(PROMPT), (e: unknown) => e instanceof ProviderError && e.code === "timeout");
  await assert.rejects(createDraftGenerator(narratorOf(["x".repeat(24_001)]), new AbortController().signal, () => {})(PROMPT), /context_too_large/);
  const mismatch: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: "a" }; yield { type: "completed", result: { text: "b", ...metadata } }; } };
  await assert.rejects(createDraftGenerator(mismatch, new AbortController().signal, () => {})(PROMPT), /narrator_failed/);
  let checks = 0; await createDraftGenerator(narratorOf(["Hi."]), new AbortController().signal, () => { checks++; })(PROMPT);
  assert.equal(checks, 2, "the checkpoint runs on every streamed event");
});
test("CommitPreparation: an identity failure keeps the final preparation as the receipt and reports the skip; it never commits", () => {
  const s = staged("I give boots to Brenna.", "Brenna accepts boots from Nicco.", [transfer]);
  const skipped: string[] = [];
  const plan = prepareCommit({ world: s.world, prepare: () => { throw new Error("injected"); }, prepared: s.prepared, commands: s.commands, finalized: [], player_input: "Hello.",
    delivered: 'A lean man straightens. "I\'m Oswin," he says.', scene: s.projection.scene, base_revision: s.base_revision, location_changed: false, on_skip: r => skipped.push(r) });
  assert.equal(plan.receipt, s.prepared);
  assert.deepEqual([plan.identity_skipped, skipped, plan.identity.promoted], ["injected", ["injected"], []]);
  assert.equal(s.commits(), 0);
});
test("authority guard (source): stages hold no CampaignState and never commit; the coordinator has one commit right after its final checkpoint", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  for (const file of await readdir("src/turn/stages")) {
    const code = (await readFile(`src/turn/stages/${file}`, "utf8")).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/import[^;]*\bCampaignState\b/.test(code), `${file} imports CampaignState`);
    assert.ok(!/\.commit\(/.test(code), `${file} commits`);
  }
  const coordinator = (await readFile("src/turn/turn-coordinator.ts", "utf8")).split("\n").map(l => l.trim());
  const commits = coordinator.flatMap((l, i) => /\bcampaign\.commit\(/.test(l) ? [i] : []);
  assert.equal(commits.length, 1, "exactly one authoritative commit");
  assert.equal(coordinator[commits[0]! - 1], "checkpoint();", "the final checkpoint immediately precedes the commit (no await, callback or yield between)");
});
test("CommitPreparation: location_changed suppresses new promotions (H1 semantics carried through H2)", () => {
  const s = staged("Hello.", "Brenna nods.", []);
  const plan = prepareCommit({ world: s.world, prepare: p => s.campaign.prepare(p), prepared: s.prepared, commands: s.commands, finalized: [], player_input: "Hello.",
    delivered: 'A lean man straightens. "I\'m Oswin," he says.', scene: s.projection.scene, base_revision: s.base_revision, location_changed: true, on_skip: () => {} });
  assert.deepEqual(plan.identity.skipped, [{ name: "Oswin", reason: "location_changed" }]);
  assert.equal(plan.receipt, s.prepared);
});

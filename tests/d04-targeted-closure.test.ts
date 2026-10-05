import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { dialogueFocused } from "../src/turn/prompt-builder.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { observeLosslessApply } from "../src/dev/d04-final-live.js";
import { LosslessContextCompactor } from "../src/turn/lossless-context-compaction.js";
import { passiveResponseAudit } from "../src/dev/passive-response-audit.js";
import { TargetedPaidBudget } from "../src/dev/d04-targeted-live.js";
const intent = { candidates: [], runtime: [] };
function fixture() {
  const f = turnFixture(false, { brennaKnowsBridge: true });
  const context = buildTurnContext(f.world, f.campaign.exportSnapshot());
  const access = projectKnowledgeAccess(context, undefined);
  const lines = (narration: string) => dialogueFocused([{ player: "", narration, status: "finalized" }], context)[0]!.npc_dialogue;
  const audit = (narration: string) => auditNarration({ narration, context, world: f.world, access, evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: f.campaign.exportSnapshot() });
  return { ...f, context, lines, audit };
}
test("adjacent quoted paragraph retains the known NPC delivery attribution and passes audit", () => {
  const f = fixture(), text = 'Brenna pauses, then recites from memory.\n\n"The eastern bridge is closed."';
  assert.deepEqual(f.lines(text), ['Brenna: "The eastern bridge is closed."']);
  assert.deepEqual(f.audit(text), []);
});
test("unrelated intervening paragraph clears delivery attribution and cannot grant private knowledge", () => {
  const f = fixture(), text = 'Brenna replies.\n\nRain taps against the window.\n\n"The eastern bridge is closed."';
  assert.deepEqual(f.lines(text), []);
  assert.ok(f.audit(text).some(i => i.kind === "private_player_fact"));
});
test("a new explicitly attributed speaker supersedes the preceding paragraph speaker", () => {
  const f = fixture(), text = 'Brenna pauses, then answers.\n\n"The eastern bridge is closed," Maren says.';
  assert.deepEqual(f.lines(text), ['Maren: "The eastern bridge is closed,"']);
  assert.ok(f.audit(text).some(i => i.kind === "private_player_fact"));
});
for (const beat of ["A brief pause follows.", "The silence settled.", "Another short beat passes quietly."]) {
  test(`neutral within-paragraph discourse beat retains the current speaker: ${beat}`, () => {
    const f = fixture(), text = `Brenna says, "The eastern bridge is closed." ${beat} "That bridge is closed."`;
    assert.deepEqual(f.lines(text), ['Brenna: "The eastern bridge is closed."', 'Brenna: "That bridge is closed."']);
    assert.deepEqual(f.audit(text), []);
  });
}
test("ordinary narrative or a pause naming another person cannot inherit within-paragraph speaker permissions", () => {
  const f = fixture();
  for (const beat of ["Rain taps against the window.", "A pause follows while Maren watches."]) {
    const text = `Brenna says, "The eastern bridge is closed." ${beat} "That bridge is closed."`;
    assert.deepEqual(f.lines(text), ['Brenna: "The eastern bridge is closed."']);
    assert.ok(f.audit(text).some(i => i.kind === "private_player_fact"));
  }
});
for (const prelude of ["Brenna waits by the window.", "Brenna does not speak.", "Brenna looks at a sign that says something.", "Brenna asks Maren to answer.", "Nicco replies.", "She replies."]) {
  test(`ambiguous, indirect or player prelude does not grant paragraph attribution: ${prelude}`, () => {
    assert.deepEqual(fixture().lines(`${prelude}\n\n"The eastern bridge is closed."`), []);
  });
}
test("paragraph attribution is scoped to one exchange, not the next player turn", () => {
  const context = fixture().context;
  const result = dialogueFocused([{ player: "", narration: "Brenna replies.", status: "finalized" }, { player: "", narration: '"The eastern bridge is closed."', status: "finalized" }], context);
  assert.deepEqual(result.map(r => r.npc_dialogue), [[], ["The eastern bridge is closed."]]);
});
test("evaluation observation accepts an unannotated revision request without activating or calling a provider", () => {
  const request = { system_prompt: "Frozen instructions.", messages: [{ role: "user" as const, content: "[REVISION REQUIRED] Continue the same scene." }] };
  const observed = observeLosslessApply(new LosslessContextCompactor(undefined), request);
  assert.equal(observed.activated, request);
  assert.equal(observed.observation.source_hash, null);
  assert.equal(observed.observation.changed, false);
  assert.ok(observed.observation.budget.estimated_tokens > 0);
});
test("response-clone rejection is handled immediately and cannot abort evaluation accounting", async () => {
  const response = new Response("original response");
  Object.defineProperty(response, "clone", { value: () => ({ text: async () => { throw new Error("clone aborted on transport cleanup"); } }) });
  const audit = passiveResponseAudit(response, async () => { throw new Error("must not run"); });
  assert.equal(await response.text(), "original response");
  await assert.doesNotReject(audit);
});
test("targeted paid-call accounting enforces the three-attempt absolute cap", () => {
  const budget = new TargetedPaidBudget();
  assert.deepEqual([budget.start(), budget.start(), budget.start()], [1, 2, 3]);
  assert.throws(() => budget.start(), /configuration_error/);
  assert.equal(budget.attempts, 3);
});
test("authorized private holder may disclose; non-holder and narration still cannot globalize the fact", () => {
  const f = fixture();
  const context = { ...f.context, npc_private_canon: [{ id: "ironbound", kind: "entity" as const, character_id: "maren", label: "Ironbound", summary: "A guild of smiths." }] };
  const access = projectKnowledgeAccess(context, undefined);
  assert.equal(access.player.includes(access.facts.find(x => x.id === "ironbound")!.ref), false);
  const audit = (narration: string) => auditNarration({ narration, context, world: f.world, access, evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: [], prepared: f.campaign.exportSnapshot() });
  assert.deepEqual(audit('Maren says, "Ironbound is a guild of smiths."'), []);
  assert.ok(audit('Brenna says, "Ironbound is a guild of smiths."').some(i => i.kind === "restricted_canon"));
  assert.ok(audit("Ironbound is a guild of smiths, as everyone in the room knows.").some(i => i.kind === "restricted_canon"));
});

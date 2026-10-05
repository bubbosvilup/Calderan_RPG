import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, dialogueFocused } from "../src/turn/prompt-builder.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { remainingEventMinutes } from "../src/campaign/projections.js";
import { retrievalRequired } from "../src/turn/retrieval-policy.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";

const world = await loadWorld("data");
function market() {
  const campaign = createOpeningCampaign(world, "p6_p9_audit");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market", time_advance_minutes: 600 } }] });
  return campaign;
}

test("P6.1 private sellers remain engine-present but have compact narrator presence during unrelated auction waits", () => {
  const campaign = market(), context = buildTurnContext(world, campaign.exportSnapshot());
  const input = "*waiting for the AH to start*";
  const prompt = buildNarratorPrompt(input, context, [], {}, playerIntent(input, context, campaign.exportSnapshot(), world)).messages[0]!.content;
  for (const id of ["bartolomhew", "korvin", "mistress_elara"]) {
    assert.ok(context.primary.scene.present_characters.some(c => c.id === id));
    const label = narratorIdentityGate(context)!.identities.get(id)!.observable_label;
    assert.equal(prompt.split(label).length - 1, 1, `${id}: compact background presence replaces repeated rich roster exposure`);
  }
  assert.equal(retrievalRequired(input, context, world), false, "this reported wait needs no retrieval: repetition already comes from primary context");
  assert.ok(prompt.includes("none must"), "the contract allows irrelevant NPCs to remain unmentioned");
});

test("P9 event-directed wait is a no-op, explicit bounded numeric wait can advance time without movement", () => {
  const campaign = market(), before = campaign.exportSnapshot(), context = buildTurnContext(world, before);
  for (const input of ["*waiting for the AH to start*", "*waits for the auction to start*", "*I wait.*"]) {
    const intent = playerIntent(input, context, before, world);
    assert.deepEqual(intent.runtime, [], input);
    assert.deepEqual(intent.candidates, [], input);
  }
  const intent = playerIntent("I wait 10 minutes.", context, before, world);
  assert.deepEqual(intent.runtime, [{ kind: "runtime_delta", delta: { time_advance_minutes: 10 } }]);
  campaign.apply({ expected_revision: campaign.revision, commands: [...intent.runtime] });
  assert.equal(campaign.exportSnapshot().runtime.scene.world_time.world_minute, 610);
  assert.equal(campaign.exportSnapshot().runtime.scene.player_location, before.runtime.scene.player_location);
  assert.ok(buildNarratorPrompt("", buildTurnContext(world, campaign.exportSnapshot()), [], {}, intent).messages[0]!.content.includes("World minute: 610"));
});

test("P9 scheduled events do not auto-trigger when time passes their due minute; auction opening has no authored event", () => {
  const campaign = market();
  assert.deepEqual(campaign.exportSnapshot().scheduled_events, []);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "schedule_event", id: "campaign_event_test_auction", title: "Synthetic auction opening", scheduled_world_minute: 605, participants: ["nicco"] }] });
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { time_advance_minutes: 10 } }] });
  assert.equal(remainingEventMinutes(campaign.exportSnapshot(), "campaign_event_test_auction"), -5);
  assert.equal(campaign.exportSnapshot().scheduled_events[0]!.status, "scheduled");
});

test("P9 descriptive preparation beats are not retained in dialogue-focused history and auction-begins prose has no blanket audit prohibition", () => {
  const campaign = market(), context = buildTurnContext(world, campaign.exportSnapshot());
  const recent = [{ player: "*I wait.*", narration: "*The auction is about to begin; the crowd settles.*", status: "finalized" as const }];
  assert.ok(!JSON.stringify(dialogueFocused(recent, context)).includes("crowd settles"));
  const narration = "*The auction begins.*";
  const issues = auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}),
    evidence: deriveTurnEvidence({ candidates: [], runtime: [] }, narration, context), diagnostics: [], committed: [], prepared: campaign.exportSnapshot(),
    player_input: "*I wait.*", recent, authoritative_text: JSON.stringify(context) });
  assert.deepEqual(issues, [], "a mundane auction-start beat is not inherently an unsupported durable state command");
});

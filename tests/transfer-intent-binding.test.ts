import test from "node:test";
import assert from "node:assert/strict";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { turnFixture } from "../src/dev/turn-fixture.js";
import { OFFER, runScenario, type DiagnosticScenario } from "../src/dev/controller-authorization-diagnostics.js";

/** Consolidation Pass C, A: a resolved explicit player transfer binds item, recipient and mode; autonomous NPC transfers keep their evidence path. */
type F = ReturnType<typeof turnFixture>;
const SWORD = "campaign_item_sword";
const item = (f: F, owner: string, carrier: string, id = SWORD, name = "Sword") => { f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_item", item: { id, origin: { kind: "created" }, name, owner_id: owner, position: { kind: "carried", character_id: carrier } } }] }); };
const to = (who: string, mode: "gift" | "handoff" | "lend" | "return" | "steal" | "reclaim" | "take" = "handoff", item_id = SWORD): CampaignCommand => ({ kind: "transfer_item", mode, item_id, position: { kind: "carried", character_id: who } });
const HAND = "*hands Brenna the sword*";
const sc = (s: Partial<DiagnosticScenario> & Pick<DiagnosticScenario, "narration" | "controller">): DiagnosticScenario => ({ id: "b", title: "b", input: HAND, setup: f => item(f, "nicco", "nicco"), ...s });
const cmds = (commands: CampaignCommand[], evidence: string[]) => ({ kind: "commands" as const, commands, evidence });
const ACCEPT = "Nicco offers the hilt. Brenna takes the sword and weighs it.";

test("1 intent Brenna + proposal Brenna + valid evidence -> commit", async () => {
  const r = await runScenario(sc({ narration: ACCEPT, controller: cmds([to("brenna")], ["Brenna takes the sword"]) }));
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before + 1);
});
test("2 intent Brenna + proposal Maren + 'Maren takes' evidence -> reject mismatch (no redirect)", async () => {
  const r = await runScenario(sc({ narration: "Maren grabs the sword first. Maren takes the sword and weighs it.", controller: cmds([to("maren")], ["Maren takes the sword"]) }));
  assert.equal(r.result!.authorization[0]!.reason, "rejected_controller_mismatch"); assert.equal(r.diagnostic.code, "controller_invalid_command");
  assert.match(r.diagnostic.rejected[0]!.detail, /differs from the player's resolved intent/); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("3 intent sword + proposal a different item -> reject mismatch", async () => {
  const r = await runScenario(sc({ narration: "Brenna takes the boots.", controller: cmds([to("brenna", "handoff", "boots")], ["Brenna takes the boots."]) }));
  assert.equal(r.result!.authorization[0]!.reason, "rejected_controller_mismatch"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("4 intent handoff + proposal lend -> reject mismatch (mode binding)", async () => {
  const r = await runScenario(sc({ narration: ACCEPT, controller: cmds([to("brenna", "lend")], ["Brenna takes the sword"]) }));
  assert.equal(r.result!.authorization[0]!.reason, "rejected_controller_mismatch"); assert.match(r.diagnostic.rejected[0]!.detail, /mode mismatch: proposed "lend" but the player's resolved intent is "handoff"/);
});
test("5 intent gift + proposal handoff -> reject mismatch; the gift itself commits and moves ownership", async () => {
  const input = "*gives Brenna the sword as a gift*", narration = "Nicco offers the hilt as a gift. Brenna takes the sword.";
  const bad = await runScenario(sc({ input, narration, controller: cmds([to("brenna", "handoff")], ["Brenna takes the sword"]) }));
  assert.equal(bad.result!.authorization[0]!.reason, "rejected_controller_mismatch"); assert.match(bad.diagnostic.rejected[0]!.detail, /mode mismatch: proposed "handoff" but the player's resolved intent is "gift"/);
  let fx: F | undefined;
  const good = await runScenario(sc({ input, narration, setup: f => { fx = f; item(f, "nicco", "nicco"); }, controller: cmds([to("brenna", "gift")], ["Brenna takes the sword"]) }));
  assert.equal(good.diagnostic.verdict, "committed"); assert.equal(fx!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.owner_id, "brenna");
});
test("6 intent Brenna + Brenna refuses -> no transfer, whatever the proposal", async () => {
  const r = await runScenario(sc({ narration: "Brenna refuses the sword and pushes it back.", controller: cmds([to("brenna")], ["Brenna refuses the sword"]) }));
  assert.equal(r.diagnostic.verdict, "rejected"); assert.equal(r.diagnostic.code, "contradictory_evidence"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("7 no transfer intent + NPC steals a valid item -> existing evidence path preserved", async () => {
  let fx: F | undefined;
  const r = await runScenario({ id: "s", title: "s", input: "*looks around*", narration: "Maren snatches the sword from Brenna's hand.", setup: f => { fx = f; item(f, "nicco", "brenna"); },
    controller: cmds([to("maren", "steal")], ["Maren snatches the sword from Brenna"]) });
  assert.equal(r.diagnostic.verdict, "committed", JSON.stringify(r.diagnostic.rejected));
  const s = fx!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!; assert.deepEqual([s.owner_id, s.position], ["nicco", { kind: "carried", character_id: "maren" }]);
});
test("8 no transfer intent + NPC returns the owner's item -> valid return path preserved; a false return is rejected by mode validation", async () => {
  const ok = await runScenario({ id: "r", title: "r", input: "*looks around*", narration: "Brenna hands the sword to Maren with a nod.", setup: f => item(f, "maren", "brenna"), controller: cmds([to("maren", "return")], ["Brenna hands the sword to Maren"]) });
  assert.equal(ok.diagnostic.verdict, "committed", JSON.stringify(ok.diagnostic.rejected));
  const bad = await runScenario({ id: "r", title: "r", input: "*looks around*", narration: "Brenna hands the sword to Maren with a nod.", setup: f => item(f, "nicco", "brenna"), controller: cmds([to("maren", "return")], ["Brenna hands the sword to Maren"]) });
  assert.equal(bad.diagnostic.verdict, "rejected");
});
test("9 ambiguous player intent -> never bound to a guessed target", async () => {
  const r = await runScenario({ id: "a", title: "a", input: "I give Brenna the boots and the ring", narration: "Brenna takes the boots.", controller: cmds([to("brenna", "handoff", "boots")], ["Brenna takes the boots."]) });
  assert.equal(r.result!.authorization[0]!.reason, "rejected_ambiguous_reference"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("10 multiple resolved intents -> each proposal matches its own intent; a re-moded member is rejected and the offer stays whole", async () => {
  const ids = ["pink_cotton", "pink_fluffy", "pink_shorts"], q = "She took the pink cotton shirt, then the fluffy one, and finally the shorts";
  const narration = `Brenna looks over the offered clothes. ${q}, laying them across her lap.`;
  const all = await runScenario({ id: "g", title: "g", input: OFFER, ground_garments: true, narration, controller: cmds(ids.map(i => to("brenna", "handoff", i)), [q, q, q]) });
  assert.equal(all.diagnostic.intended.length, 3); assert.equal(all.diagnostic.accepted.length, 3); assert.equal(all.diagnostic.revision_after, all.diagnostic.revision_before + 1);
  const redirect = await runScenario({ id: "g", title: "g", input: OFFER, ground_garments: true, narration, controller: cmds([to("brenna", "handoff", ids[0]!), to("brenna", "handoff", ids[1]!), to("brenna", "lend", ids[2]!)], [q, q, q]) });
  assert.equal(redirect.result!.authorization[2]!.reason, "rejected_controller_mismatch"); assert.deepEqual(redirect.diagnostic.accepted.map(a => a.source), ["both"], "only the grammar-confirmed member stands (pre-existing group rule: grammar-sourced decisions are never withdrawn); the evidence-only member is withheld as a partial group"); assert.equal(redirect.result!.authorization[1]!.reason, "rejected_evidence_partial_group");
});
test("Controller policy carries the explicit-intent binding sentence (pin updated deliberately)", async () => {
  const { CONTROLLER_POLICY } = await import("../src/llm/openrouter/state-controller.js");
  assert.match(CONTROLLER_POLICY, /When prior_state\.explicit_intent lists a resolved transfer, copy its item, recipient and transfer mode/);
  assert.match(CONTROLLER_POLICY, /never redirect an explicit player transfer to a different item, recipient or mode/);
  assert.match(CONTROLLER_POLICY, /Possession is not ownership/, "the rest of the transfer policy is untouched");
});

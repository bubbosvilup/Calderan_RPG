import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { RECEIPT_CORPUS } from "../src/dev/receipt-corpus.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { verifyEvidence } from "../src/turn/evidence-authorization.js";

/** Pass C, C: the receipt verifier recognises only phrasings that establish a change of possession, and every accepted phrasing has adversarial negatives. */
function world(carrier = "nicco") {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_item", item: { id: "campaign_item_sword", origin: { kind: "created" }, name: "Sword", owner_id: "nicco", position: { kind: "carried", character_id: carrier } } }] });
  const snap = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snap), intent = playerIntent("*hands Brenna the sword*", context, snap, f.world);
  return { context, intent };
}
const check = (text: string, narration = text, w = world()) => verifyEvidence(w.intent.candidates[0]!, text, narration, w.context, w.intent.candidates);

test("corpus: class A phrases verify, classes B, C and D never do", () => {
  for (const p of RECEIPT_CORPUS) {
    const r = check(p.text);
    assert.equal(r.verified, p.class === "A", `${p.class} "${p.text}" -> ${r.check}`);
  }
});
test("corpus: every class A phrase has adversarial negatives (modal, near-miss, negation, attempt, refusal, bystander, retraction) that never verify", () => {
  for (const p of RECEIPT_CORPUS.filter(c => c.class === "A")) {
    const { subject: s, verb: v, base: b, rest: r } = p.parts!;
    const negatives = [`${s} almost ${v} ${r}.`, `${s} could ${b} ${r}.`, `${s} might ${b} ${r}.`, `${s} does not ${b} ${r}.`, `${s} tries to ${b} ${r}.`, `${s} refuses to ${b} ${r}.`,
      `${s} fails to ${b} ${r}.`, `${s} will ${b} ${r} tomorrow.`, `${s} ${v} ${r}, then pushes it back.`, `${s} ${v} ${r}, but hands it straight back to Nicco.`, `Maren ${v} ${r}.`, `If only ${s} ${v} ${r}.`];
    for (const n of negatives) assert.equal(check(n).verified, false, `${p.text} -> "${n}"`);
  }
});
test("receipt of an item the recipient already carries is never a new transfer", () => {
  const w = world("brenna"); w.intent = { ...w.intent, candidates: [{ kind: "transfer_item", mode: "handoff", item_id: "campaign_item_sword", position: { kind: "carried", character_id: "brenna" } }] } as typeof w.intent;
  assert.equal(check("Brenna grips her own sword.", "Brenna grips her own sword.", w).verified, false);
  assert.equal(check("Brenna lifts the sword from his hand.", "Brenna lifts the sword from his hand.", w).verified, false, "the Nicco-sourced constructions apply only while Nicco holds the item");
  assert.equal(check("Brenna closes her fingers around the sword offered by Nicco.", "Brenna closes her fingers around the sword offered by Nicco.", w).verified, false);
});
test("source/subject safety: someone else's hand, another item, another subject", () => {
  assert.equal(check("Brenna lifts the sword from Maren's hand.").verified, false);
  assert.equal(check("Brenna lifts the boots from his hand.").verified, false);
  assert.equal(check("Maren lifts the sword from his hand.").verified, false);
  assert.equal(check("Brenna closes her fingers around the boots offered by Nicco.").verified, false);
  assert.equal(check("Brenna closes her fingers around the sword offered by Maren.").verified, false);
});

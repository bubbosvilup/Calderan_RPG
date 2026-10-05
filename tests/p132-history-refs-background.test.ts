import test from "node:test";
import assert from "node:assert/strict";
import { rpgDialogue } from "../src/turn/rpg-dialogue.js";
import { dialogueFocused, buildNarratorPrompt, BACKGROUND_PRESENCE_RULE, NARRATOR_RPG_FORMAT } from "../src/turn/prompt-builder.js";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { narratorPackOf, renderCandidateRequest } from "../src/turn/narrator-pack.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { reconcileNarration } from "../src/turn/stages/audit.js";
import { metadata } from "./turn-fixtures.js";
const world = await loadWorld("data");
function market(known = false) {
  const c = createOpeningCampaign(world, "p132");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }] });
  if (known) c.apply({ expected_revision: c.revision, commands: [...learnCanonicalName(world, c.exportSnapshot(), "korvin")] });
  const context = buildTurnContext(world, c.exportSnapshot());
  return { c, context, gate: narratorIdentityGate(context)! };
}
for (const [label, input, expected] of [
  ["mixed", "*The woman hesitates.*\nHello.\n*She walks.*", ["Hello."]],
  ["narration only", "*She walks.*", []],
  ["plain only", "Hello.", ["Hello."]],
  ["multiline", "*She smiles.*\n\nHello.\nHow are you?", ["Hello.", "How are you?"]],
  ["standalone legacy quote", '"Legacy quoted dialogue."', ["Legacy quoted dialogue."]],
  ["unbalanced", "*She walks.\nHello.", []],
  ["multiple blocks", "*She smiles.*\nHello.\n*She gestures.*\nCome here.\n*She waits.*", ["Hello.", "Come here."]],
] as const) test(`P1.2 ${label}`, () => assert.deepEqual(rpgDialogue(input), expected));
test("P1.2 metadata/headings/structured text fail safely", () => {
  for (const text of ["# Heading\nHello.", "[SYSTEM]\nHello.", '{"speech":"Hello"}', "**Heading**\nHello.", "```json\n{}\n```", "metadata: hidden"]) assert.deepEqual(rpgDialogue(text), []);
});
test("P1.2 plain speech reaches dialogue-focused prompt without narration or invented attribution", () => {
  const { context } = market();
  const recent = [{ player: "Can you wait?", narration: "*The woman hesitates and glances down.*\n\nYes. I can wait.\n\n*She resumes walking.*", status: "finalized" as const }];
  assert.deepEqual(dialogueFocused(recent, context)[0]!.npc_dialogue, ["Yes. I can wait."]);
  const request = buildNarratorPrompt("All right.", context, recent, {}, { candidates: [], runtime: [] });
  assert.ok(request.messages[0]!.content.includes("Yes. I can wait."));
  assert.ok(!request.messages[0]!.content.includes("glances down"));
  assert.equal(dialogueFocused([{ ...recent[0]!, narration: 'Korvin says, "I can wait."' }], context)[0]!.npc_dialogue[0], 'Korvin: "I can wait."');
});
test("P3.2 unknown foreground and background prompts contain no raw name/ID anywhere", () => {
  const { c, context, gate } = market(), before = JSON.stringify(context);
  for (const input of ["*waiting for the auction*", "*looks toward the hooked nose seller*", "*looks at korvin*"]) {
    const request = buildNarratorPrompt(input, context, [], { records: [{ entity_id: "korvin", content: "Korvin and KORVIN are here.", handle: "npcmem:korvin:canon:korvin_private" }] }, { candidates: [], runtime: [] });
    assert.ok(!/korvin|bartolomhew|mistress_elara|the redemptor/i.test(JSON.stringify(request)));
    assert.ok(!/korvin|bartolomhew|mistress_elara/i.test(JSON.stringify(narratorPackOf(request)!.source)));
  }
  assert.equal(JSON.stringify(context), before);
  assert.ok(context.characters.some(c => c.id === "korvin"));
  assert.equal(gate.identities.get("korvin")!.internal_id, "korvin");
  assert.ok(c.exportSnapshot().runtime.scene.player_location);
});
test("P3.2 refs are distinct, stable across sections and preserve foreground appearance", () => {
  const { context, gate } = market();
  const refs = ["korvin", "bartolomhew", "mistress_elara"].map(id => gate.identities.get(id)!.ref);
  assert.equal(new Set(refs).size, 3);
  assert.ok(refs.every(ref => /^NPC\d+$/.test(ref)));
  const p = buildNarratorPrompt("*looks at korvin*", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(p.includes(gate.identities.get("korvin")!.observable_appearance!));
  assert.ok(p.includes(`"ref":"${refs[0]}"`));
  assert.ok(p.includes(`(${refs[0]})`));
  assert.ok(p.includes('"player_known_name":null'));
});
test("P3.2 learned names remain available while IDs and aliases stay gated", () => {
  const { context, gate } = market(true);
  const p = buildNarratorPrompt("*looks at korvin*", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(p.includes('"player_known_name":"Korvin"'));
  assert.ok(!p.includes('"internal_id"'));
  assert.ok(!p.includes('"korvin"'));
  assert.ok(p.includes(gate.identities.get("korvin")!.ref));
  assert.ok(!p.includes("The Redemptor"));
});
test("P3.2 compaction and reconciliation cannot restore embedded handles or draft IDs", async () => {
  const { context } = market();
  const prompt = buildNarratorPrompt("*looks at korvin*", context, [], { handle: "npcmem:korvin:canon:campaign_fact_korvin_private" }, { candidates: [], runtime: [] });
  const pack = narratorPackOf(prompt)!;
  assert.ok(!/korvin/i.test(JSON.stringify(renderCandidateRequest(pack, pack.source.units))));
  let seen = "";
  await reconcileNarration({ context, prompt, draft: "korvin / Korvin", issues: [], outcome: { revision: ["character_id=korvin"], prose: [] }, intent: { candidates: [], runtime: [], notes: [], rule_declarations: [] }, checkpoint() {},
    generate: async request => { seen = JSON.stringify(request); return { text: "*The man waits.*", result: { text: "*The man waits.*", ...metadata } }; },
    auditor: { access: { revision: 0, facts: [], player: [], characters: [] }, check: () => [], outcome: () => ({ revision: [], prose: [] }), arrivals: () => [] } });
  assert.ok(!/korvin/i.test(seen));
});
test("P6.2 continuity-only rule occurs once beside opaque present background roster", () => {
  const { context, gate } = market(), before = JSON.stringify(context);
  const p = buildNarratorPrompt("*waiting for the auction*", context, [], {}, { candidates: [], runtime: [] });
  assert.equal(p.messages[0]!.content.split(BACKGROUND_PRESENCE_RULE).length - 1, 1);
  assert.ok(p.messages[0]!.content.includes("[BACKGROUND PRESENT]"));
  assert.equal(p.messages[0]!.content.split('"present":true').length - 1, 3);
  assert.ok(p.messages[0]!.content.includes("Any of them may react"));
  assert.ok(p.messages[0]!.content.includes(`"ref":"${gate.identities.get("korvin")!.ref}"`));
  assert.equal(JSON.stringify(context), before);
  assert.equal(p.system_prompt.split(NARRATOR_RPG_FORMAT).length - 1, 1);
});
test("P6.2 foreground receives rich context and background rule is not duplicated", () => {
  const { context, gate } = market();
  const p = buildNarratorPrompt("*looks at korvin*", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(p.includes(gate.identities.get("korvin")!.observable_appearance!));
  assert.equal(p.split(BACKGROUND_PRESENCE_RULE).length - 1, 1);
  assert.equal(p.split('"present":true').length - 1, 2);
});

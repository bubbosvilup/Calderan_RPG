import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { buildNarratorPrompt, NARRATOR_RPG_FORMAT, NARRATOR_PLAYER_KNOWLEDGE } from "../src/turn/prompt-builder.js";
import { projectNarratorFocus } from "../src/turn/narrator-focus.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import { learnCanonicalName } from "../src/campaign/identity-knowledge.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { narratorPackOf, renderCandidateRequest } from "../src/turn/narrator-pack.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import type { PlayerIntent } from "../src/turn/player-intent.js";

const world = await loadWorld("data"), sellers = ["bartolomhew", "korvin", "mistress_elara"];
function market() {
  const c = createOpeningCampaign(world, "p61_focus");
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market", time_advance_minutes: 600 } }] });
  return c;
}
function project(input: string, recent: readonly RecentExchange[] = [], campaign = market(), retrieval: unknown = {}, intentOverride?: PlayerIntent) {
  const context = buildTurnContext(world, campaign.exportSnapshot()), intent = intentOverride ?? playerIntent(input, context, campaign.exportSnapshot(), world);
  const focus = projectNarratorFocus(context, input, recent, intent);
  const request = buildNarratorPrompt(input, context, recent, retrieval, intent);
  return { context, focus, request, text: request.messages[0]!.content };
}

test("P6.1 auction attention compresses all unrelated sellers without changing scene truth", () => {
  const campaign = market(), snapshot = campaign.exportSnapshot(), raw = buildTurnContext(world, snapshot), before = JSON.stringify(raw);
  for (const input of ["*walks to the public auction*", "*looks around*", "*joins the bidding area*", "*waiting for the AH to start*"]) {
    const { context, focus, text } = project(input, [], campaign);
    assert.deepEqual([...focus.background], sellers);
    for (const id of sellers) {
      assert.ok(context.characters.some(c => c.id === id));
      assert.ok(context.primary.scene.present_characters.some(c => c.id === id));
      assert.ok(!text.includes(`(${id}):`));
    }
    assert.deepEqual(context, raw);
  }
  assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(campaign.exportSnapshot(), snapshot);
});

test("P6.1 each unknown background seller has one compact observable entry and no rich profile", () => {
  const { context, focus, text } = project("*waiting for the AH to start*");
  for (const id of sellers) {
    const identity = narratorIdentityGate(context)!.identities.get(id)!;
    assert.equal(text.split(identity.observable_label).length - 1, 1);
    const entry = focus.compact.find(c => c.internal_id === id)!;
    assert.equal(entry.player_known_name, null);
    assert.equal(entry.present, true);
    assert.ok(entry.observable_label.length <= identity.observable_label.length + 162);
    assert.ok(!text.includes(identity.observable_appearance!));
    assert.ok(!text.includes(context.primary.scene.present_characters.find(c => c.id === id)!.portrayal!.private_notes!));
  }
  for (const name of ["Bartolomhew", "Korvin", "Mistress Elara", "The Redemptor"]) assert.ok(!text.includes(name));
  assert.ok(text.includes("may react when causally relevant"));
});

test("P6.1 unique observable white-blond reference promotes seller with rich gated portrayal", () => {
  const { context, focus, text } = project("*looks toward the white-blond seller*");
  assert.deepEqual([...focus.foreground], ["bartolomhew"]);
  const npc = context.primary.scene.present_characters.find(c => c.id === "bartolomhew")!;
  assert.ok(text.includes(npc.appearance!));
  assert.ok(text.includes(npc.portrayal!.personality[0]!));
  assert.ok(!text.includes("Bartolomhew"));
  assert.ok(!text.includes("The Redemptor"));
});

test("P6.1 explicit address and stable references promote only the targeted seller", () => {
  for (const input of ["Korvin, what do you sell?", "*approaches korvin*", "*looks at [NPC3]*"]) {
    const { focus } = project(input);
    assert.equal(focus.foreground.size, 1, input);
  }
});

test("P6.1 ambiguous observable references do not pick an arbitrary seller", () => {
  assert.equal(project("*looks at the man*").focus.foreground.size, 0);
});

test("P6.1 recent player focus lasts only the existing bounded inactivity window", () => {
  const entry = (player: string): RecentExchange => ({ player, narration: "*The market continues.*", status: "finalized" });
  assert.ok(project("How much?", [entry("Korvin, show me your stock.")]).focus.foreground.has("korvin"));
  assert.ok(project("How much?", [entry("*looks toward the white-blond seller*")]).focus.foreground.has("bartolomhew"));
  assert.ok(!project("How much?", [entry("Korvin, show me your stock."), entry("All right."), entry("Thank you.")]).focus.foreground.has("korvin"));
});

test("P6.1 narrator roster repetition alone never retains focus", () => {
  const recent: RecentExchange[] = [{ player: "*I look around*", narration: "*Bartolomhew stands near Korvin; Mistress Elara watches.*", status: "finalized" }];
  assert.equal(project("What next?", recent).focus.foreground.size, 0);
});

test("P6.1 explicit attention shift backgrounds seller again without canonical movement", () => {
  const campaign = market(), before = campaign.exportSnapshot();
  const { focus } = project("*walks back to the auction*", [{ player: "*looks at Bartolomhew*", narration: "*The man smiles.*", status: "finalized" }], campaign);
  assert.ok(focus.background.has("bartolomhew"));
  assert.deepEqual(campaign.exportSnapshot(), before);
  assert.ok(project("What next?", [{ player: "*looks at Bartolomhew*", narration: "*The man smiles.*", status: "finalized" }, { player: "*walks back to the auction*", narration: "*The crowd settles.*", status: "finalized" }], campaign).focus.background.has("bartolomhew"));
});

test("P6.1 current intent recipients and physical targets promote actors", () => {
  assert.ok(project("*He punches Korvin in the face.*").focus.foreground.has("korvin"));
  assert.ok(project("Take it.", [], market(), {}, { candidates: [], runtime: [], resolved_references: [{ phrase: "recipient", ids: ["korvin"], basis: "exact" }] }).focus.foreground.has("korvin"));
});

test("P6.1 player-authored actor and projected arrival can become foreground", () => {
  assert.ok(project("*Korvin shoves Nicco.*").focus.foreground.has("korvin"));
  assert.ok(project("Here.", [], market(), {}, { candidates: [], runtime: [{ kind: "runtime_delta", delta: { character_movements: [{ character_id: "korvin", current_location: "calderan_slave_market" }] } }] }).focus.foreground.has("korvin"));
});

test("P6.1 learned primary name survives foreground projection and alias remains gated", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [...learnCanonicalName(world, campaign.exportSnapshot(), "bartolomhew")] });
  const { text } = project("*looks at Bartolomhew*", [], campaign);
  assert.ok(text.includes('"player_known_name":"Bartolomhew"'));
  assert.ok(!text.includes("The Redemptor"));
});

test("P6.1 retrieval and market lore cannot restore rich background biographies", () => {
  const { context, text, request } = project("*waiting for the AH to start*", [], market(), { records: [
    { entity_id: "korvin", content: "ZZQBACKGROUNDPROFILE Korvin's long biography." },
    { entity_id: "calderan_slave_market", content: "The public auction operates by day. Korvin's ZZQBACKGROUNDLORE shop has its own specialties." },
  ] });
  assert.ok(!text.includes("ZZQBACKGROUND"));
  assert.ok(text.includes("The public auction operates by day."));
  for (const id of sellers) assert.equal(text.split(narratorIdentityGate(context)!.identities.get(id)!.observable_label).length - 1, 1);
  const pack = narratorPackOf(request)!;
  assert.ok(!renderCandidateRequest(pack, pack.source.units).messages[0]!.content.includes("ZZQBACKGROUND"));
});

test("P6.1 background legal state and knowledge restrictions survive using internal references", () => {
  const { text, context } = project("*waiting for the AH to start*");
  for (const l of context.social.legal) assert.ok(text.includes(`${l.character_id}: legally ${l.status}`));
  for (const id of sellers) assert.ok(text.includes(`${id}: CAN USE`));
  assert.ok(text.includes("DO NOT USE"));
});

test("P6.1 targeted seller question still supplies source material", () => {
  const { focus, text } = project("Tell me about the private sellers and their specialties.");
  for (const id of sellers) assert.ok(focus.foreground.has(id));
  assert.ok(text.includes("Beastfolk"));
});

test("P6.1 background NPC+ does not restore rich material and existing addressed tier promotes it", () => {
  const campaign = market();
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "join_household", household_id: "campaign_household_heartstone", character_id: "korvin" }] });
  const context = buildTurnContext(world, campaign.exportSnapshot(), { input: "*waiting for the AH to start*" });
  assert.ok(context.npc_plus?.lines.length);
  const text = buildNarratorPrompt("*waiting for the AH to start*", context, [], {}, { candidates: [], runtime: [] }).messages[0]!.content;
  assert.ok(!text.includes("core="));
  assert.equal(text.split(narratorIdentityGate(context)!.identities.get("korvin")!.observable_label).length - 1, 1);
  const addressed = buildTurnContext(world, campaign.exportSnapshot(), { input: "What do you think?" });
  assert.ok(addressed.npc_plus?.lines.some(l => l.startsWith("NPC+ ")));
  assert.ok(projectNarratorFocus(addressed, "What do you think?", [], { candidates: [], runtime: [] }).foreground.has("korvin"));
});

test("P6.1 P1/P3 rules and P9 no-op waits remain unchanged", () => {
  const campaign = market(), { context, request } = project("*waiting for the AH to start*", [], campaign);
  assert.equal(request.system_prompt.split(NARRATOR_RPG_FORMAT).length - 1, 1);
  assert.equal(request.system_prompt.split(NARRATOR_PLAYER_KNOWLEDGE).length - 1, 1);
  assert.deepEqual(playerIntent("*waiting for the AH to start*", context, campaign.exportSnapshot(), world).runtime, []);
});

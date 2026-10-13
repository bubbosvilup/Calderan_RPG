import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { narratorEphemeralCharacters } from "../src/campaign/promotion.js";
import { buildPromotedCharacter } from "../src/campaign/promotion.js";
import { activeTradeOffer } from "../src/campaign/trade.js";
import { CONTROLLER_SCHEMA } from "../src/llm/controller-schema.js";
import { authorizeCommands } from "../src/turn/command-authorizer.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";
import { establishNames } from "../src/turn/name-establishment.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { asPlan, readOffer } from "./offer-fixtures.js";

/**
 * Consolidation block 5B, AUTH-2: narration (and a name established by narration) is NOT persistence authority. A person narration introduces is
 * PROVISIONAL; they become a persistent CampaignCharacter only inside an action that already carries explicit authority (the person Actual Offer Accept).
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market", LR = "heartstone_lr";
let serial = 0;
function campaignAt(location: string, extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `auth2_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }, ...extra] });
  return c;
}
const at = (narration: string, player = "*looks around*", location = MARKET): RecentExchange => ({ player, narration, status: "finalized", location_id: location });
const names = (c: CampaignState, recent: readonly RecentExchange[]) => establishNames(recent, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);
const createdCount = (c: CampaignState) => c.exportSnapshot().characters.filter(x => x.origin.kind === "created").length;
const roundTrip = (c: CampaignState) => CampaignState.restore(world, decodeSave(serializeSave(createSaveFile(c.exportSnapshot(), world, "2026-10-12T12:00:00.000Z"), world), world).snapshot);

const INTRO = at('Korvin leads Nicco past the canvas partition to the last cage.\n"Brenna. Thirty-two. Came to me through a debt auction in Ashford, was a river hauler before the debt caught up," Korvin says.\nBrenna coughs behind the bars, feverish, and does not lift her head.', "*checks the cages*");
const OFFER = at('Korvin taps his ledger. "Five. She\'s a burden I paid four for." He holds the pen over the page. "Papers included. Clean transfer, debt-forfeiture chain, no liens. You walk her out that gate, she\'s yours."\nBrenna does not open her eyes.', "Name your price, Korvin.");
const gold = (c: CampaignState) => c.exportSnapshot().funds.find(f => f.character_id === "nicco")!.gold;

test("A1: narration introduces an unknown person by name -> PROVISIONAL, no CampaignCharacter, no command", () => {
  const c = campaignAt(LR), before = createdCount(c);
  const r = names(c, [at("A thin woman named Lysa sweeps the steps.", "*looks around*", LR)]);
  assert.deepEqual(r.provisional.map(p => [p.name, p.ref]), [["Lysa", "narrated:lysa"]]);
  assert.deepEqual(r.commands, []);
  assert.equal(createdCount(c), before);
});
test("A2: a self-introduction names the provisional person and still persists nothing", () => {
  const c = campaignAt(LR), before = createdCount(c), revision = c.revision;
  const r = names(c, [at('A tired porter sets down his crate. "My name is Hollis."', "*looks around*", LR)]);
  assert.deepEqual(r.provisional.map(p => [p.name, p.name_source]), [["Hollis", "self_disclosed"]]);
  assert.deepEqual(r.commands, []); assert.equal(createdCount(c), before); assert.equal(c.revision, revision);
});
test("A3: repeated narration about the same person reuses ONE provisional identity (same ref), never duplicates", () => {
  const c = campaignAt(LR);
  const first = at('A tired porter sets down his crate. "My name is Hollis."', "*looks around*", LR);
  const second = at('The porter straightens up. "My name is Hollis, like I said."', "so you are Hollis?", LR);
  const a = names(c, [first]), b = names(c, [first, second]);
  assert.deepEqual([a.provisional.map(p => p.ref), b.provisional.map(p => p.ref)], [["narrated:hollis"], ["narrated:hollis"]]);
  assert.equal(new Set([...a.provisional, ...b.provisional].map(p => p.ref)).size, 1);
  assert.equal(createdCount(c), 0);
});
test("A4: an existing persistent person is reused: late naming sets the name on the SAME record, no second record", () => {
  const woman = buildPromotedCharacter({ label: "the woman", established: { sex: "female", descriptor: "woman" }, evidence: ["The woman lies on the sofa."], location_id: LR, trigger: "purchase_unnamed_subject", promoted_revision: 3, world_minute: 600 });
  const c = createOpeningCampaign(world, `auth2_a4_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR, time_advance_minutes: 0 } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  const built = { ...woman, origin_snapshot: { ...woman.origin_snapshot!, promoted_revision: c.revision + 1, promoted_world_minute: minute } };
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: built }] });
  const recent = [at("*The tall woman lies on the sofa, her breathing shallow.*\n\nWhat do I call you.", "*lets her rest*", LR), at("*Her eyes stay half-open.*\n\nMira.\n\n*She says it without ceremony.*", "name's nicco, what about you?", LR)];
  const r = names(c, recent), count = c.exportSnapshot().characters.length;
  assert.deepEqual([r.provisional, r.named.map(n => [n.character_id, n.name])], [[], [[built.id, "Mira"]]]);
  c.apply({ expected_revision: c.revision, commands: [...r.commands] });
  assert.equal(c.exportSnapshot().characters.length, count, "no second record");
  assert.equal(c.exportSnapshot().characters.find(x => x.id === built.id)!.profile.name, "Mira");
});
test("A5: a canonical name never becomes a provisional person or a CampaignCharacter", () => {
  const c = campaignAt(MARKET), before = createdCount(c);
  const r = names(c, [at('A stout man grins. "Name\'s Korvin."', "*listens*")]);
  assert.deepEqual([r.provisional, r.commands, createdCount(c)], [[], [], before]);
});
test("A6/A7: the person Actual Offer Accept materializes the SAME provisional person, exactly once, atomically with the purchase", () => {
  const c = campaignAt(MARKET), recent = [INTRO, OFFER];
  const provisional = names(c, [INTRO]).provisional.find(p => p.name === "Brenna")!;
  assert.deepEqual([provisional.ref, provisional.location_id], ["narrated:brenna", MARKET]);
  const r = asPlan(readOffer(world, c.exportSnapshot(), "Done. *pays him*", recent, c.revision));
  const planned = (r.commands.find(x => x.kind === "register_character") as Extract<CampaignCommand, { kind: "register_character" }>).character;
  assert.equal(planned.origin_snapshot!.ephemeral_ref, provisional.ref, "the plan carries the provisional identity as provenance");
  c.apply({ expected_revision: c.revision, commands: r.offer.commands as CampaignCommand[] });
  assert.equal(narratorEphemeralCharacters(c.exportSnapshot()).length, 0, "an offer is a proposal: nothing durable");
  const standing = activeTradeOffer(c.exportSnapshot().trade_offers)!;
  const before = c.revision;
  c.commit(c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: standing.id }] }));
  assert.equal(c.revision, before + 1, "ONE settlement commit");
  const persisted = narratorEphemeralCharacters(c.exportSnapshot());
  assert.equal(persisted.length, 1);
  const brenna = persisted[0]!;
  assert.deepEqual([brenna.id, brenna.profile.name, brenna.current.current_location, brenna.origin_snapshot!.ephemeral_ref], [planned.id, "Brenna", MARKET, provisional.ref]);
  assert.equal(c.exportSnapshot().legal_statuses.find(l => l.character_id === brenna.id)?.holder_id, "nicco");
  assert.equal(c.exportSnapshot().characters.filter(x => x.profile.name === "Brenna").length, 1, "no duplicate");
});
test("A8: a failed or never-accepted purchase leaves the person non-persistent", () => {
  const c = campaignAt(MARKET, [{ kind: "set_funds", character_id: "nicco", gold: 2 }]);
  const r = asPlan(readOffer(world, c.exportSnapshot(), "Done. *pays him*", [INTRO, OFFER], c.revision));
  c.apply({ expected_revision: c.revision, commands: r.offer.commands as CampaignCommand[] });
  const standing = activeTradeOffer(c.exportSnapshot().trade_offers)!;
  assert.throws(() => c.prepare({ expected_revision: c.revision, commands: [{ kind: "accept_trade_offer", offer_id: standing.id }] }), /insufficient_funds/);
  assert.deepEqual([narratorEphemeralCharacters(c.exportSnapshot()).length, gold(c), c.exportSnapshot().legal_statuses], [0, 2, []]);
});
test("A9/A10: the Controller and narration cannot create, retire or merge a character (schema has no such kind; the authorizer refuses every one)", () => {
  const kinds = JSON.stringify(CONTROLLER_SCHEMA);
  for (const forbidden of ["register_character", "retire_character", "merge_characters", "materialize_character"]) assert.ok(!kinds.includes(`"${forbidden}"`), forbidden);
  const c = campaignAt(LR), snapshot = c.exportSnapshot(), context = buildTurnContext(world, snapshot);
  const evidence = deriveTurnEvidence({ candidates: [], runtime: [] }, "A woman named Lysa sweeps.", context);
  const proposals: CampaignCommand[] = [
    { kind: "register_character", character: { id: "campaign_character_lysa", origin: { kind: "created" }, profile: { name: "Lysa" }, current: { current_location: LR, status: "active" } } },
    { kind: "retire_character", character_id: "campaign_character_lysa", reason: "operator_retired" }, { kind: "merge_characters", source_id: "campaign_character_lysa", target_id: "nicco" },
    { kind: "join_household", household_id: "heartstone_household", character_id: "narrated_lysa" }];
  assert.deepEqual(authorizeCommands(proposals, evidence, context, snapshot, world).map(d => d.authorized), [false, false, false, false]);
});
test("A11: save/load never turns a provisional person into a persistent one (nothing of them is saved)", () => {
  const c = campaignAt(LR);
  const r = names(c, [at('A tired porter sets down his crate. "My name is Hollis."', "*looks around*", LR)]);
  assert.equal(r.provisional.length, 1);
  const again = roundTrip(c);
  assert.deepEqual(again.exportSnapshot().characters, c.exportSnapshot().characters);
  assert.ok(!again.exportSnapshot().characters.some(x => x.profile.name === "Hollis"));
});
test("A12: legacy persistent characters created by the old name-driven rule stay valid and keep working", () => {
  const legacy = buildPromotedCharacter({ label: "Mira", established: { name: "Mira", sex: "female", descriptor: "woman" }, evidence: ['Mira: "Mira."'], location_id: LR, trigger: "name_established", promoted_revision: 2, world_minute: 600, name_source: "self_disclosed" });
  const c = createOpeningCampaign(world, `auth2_a12_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: LR } }] });
  const minute = c.exportSnapshot().runtime.scene.world_time.world_minute;
  c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { ...legacy, origin_snapshot: { ...legacy.origin_snapshot!, promoted_revision: c.revision + 1, promoted_world_minute: minute } } }] });
  const loaded = roundTrip(c);
  assert.equal(loaded.exportSnapshot().characters.find(x => x.id === legacy.id)?.profile.name, "Mira");
  assert.ok(buildTurnContext(world, loaded.exportSnapshot()).characters.some(x => x.id === legacy.id), "still a present, targetable person");
});
test("AUTH-2 producer audit (source): the only places that build or register a narrated person are the provisional materializer (person offers, Keep track since block 12) and the engine's own preparation", async () => {
  const files: string[] = [];
  const walk = async (dir: string) => { for (const e of await readdir(dir, { withFileTypes: true })) { const p = `${dir}/${e.name}`; if (e.isDirectory()) await walk(p); else if (p.endsWith(".ts")) files.push(p); } };
  await walk("src");
  const builders: string[] = [], registrars: string[] = [];
  for (const f of files) {
    if (f.startsWith("src/dev/")) continue;
    const code = (await readFile(f, "utf8")).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    if (/buildPromotedCharacter\(/.test(code)) builders.push(f);
    if (/kind: "register_character"/.test(code) && f !== "src/campaign/types.ts") registrars.push(f);
  }
  assert.deepEqual(builders.sort(), ["src/campaign/promotion.ts", "src/turn/provisional-people.ts"]);
  assert.deepEqual(registrars.sort(), ["src/turn/commerce/person-offers.ts", "src/turn/keep-track.ts"]);
});

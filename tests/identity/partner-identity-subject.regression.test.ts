import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import { identityNameFactId, learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import type { TurnResult } from "../../src/turn/turn-types.js";
import { collect, metadata } from "../support/turn-fixtures.js";

/**
 * Partner identity guard and the speaker of a self-introduction (REPO-12). The guard protects a bound canonical conversation partner from an
 * invented name, but it must charge a self-introduction only to the person NarrationFacts attributed the line to: "My name is Brenna," spoken by
 * the captive while Korvin is the partner is the captive's own introduction, never a rename of Korvin. Real data/ world, scripted offline
 * narration, no controller commands.
 */
const world = await loadWorld("data"), MARKET = "calderan_slave_market";
let serial = 0;
const captive = (id: string, revision: number, minute: number, label = "the woman"): CampaignCommand[] => [
  { kind: "register_character", character: { id, origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" },
    origin_snapshot: { source: "narrator_ephemeral", trigger: "player_kept", label, promoted_revision: revision, promoted_world_minute: minute, location_id: MARKET,
      established: { descriptor: "woman", appearance: ["red-haired"], role: "narrated captive; legal status unestablished" }, evidence: ["fixture"] } } },
  { kind: "set_legal_status", character_id: id, status: "enslaved", holder_id: "korvin" }];
function scene(options: { readonly learned?: boolean; readonly captives?: readonly string[]; readonly advance?: number } = {}) {
  const campaign = createOpeningCampaign(world, `partner_subject_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } },
    ...(options.advance ? [{ kind: "runtime_delta", delta: { time_advance_minutes: options.advance } } as const] : []),
    ...(options.learned === false ? [] : learnCanonicalName(world, campaign.exportSnapshot(), "korvin"))] });
  for (const id of options.captives ?? []) campaign.apply({ expected_revision: campaign.revision, commands: captive(id, campaign.revision + 1, campaign.exportSnapshot().runtime.scene.world_time.world_minute) });
  let text = "";
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turn = async (input: string, narration: string) => {
    text = narration;
    const events = await collect(co.runTurn({ campaign, player_input: input }));
    const last = events.at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 400));
    const result = (last as { result: TurnResult }).result;
    const delivered = (events.find(e => e.type === "narration_completed") as { text: string }).text;
    return { result, delivered, snapshot: campaign.exportSnapshot(), conflict: !!result.narration_reconciliation?.issues.some(i => i.kind === "canonical_name_conflict") };
  };
  const profile = (id: string) => campaign.exportSnapshot().characters.find(c => c.id === id)?.profile;
  const knows = (id: string) => campaign.exportSnapshot().knowledge.some(k => k.character_id === "nicco" && k.fact_id === identityNameFactId(id) && k.status === "knows");
  return { campaign, turn, profile, knows };
}
const BRENNA = "campaign_character_brenna", SECOND = "campaign_character_second";
const OFFER = ["*looks at the woman in the cage* Korvin, what about her?", 'Korvin taps the cage. "Five." He glances at the woman behind the bars. "Papers included. Clean transfer, no liens."'] as const;
const ASK = "What is your name?";
const korvinUnchanged = (s: ReturnType<typeof scene>, snapshot: ReturnType<ReturnType<typeof scene>["campaign"]["exportSnapshot"]>) => {
  assert.equal(snapshot.characters.filter(c => c.id === "korvin").length, 0, "Korvin gets no campaign record, alias or rename");
  assert.equal(snapshot.characters.filter(c => c.profile.name === "Korvin").length, 0, "no duplicate Korvin");
  assert.equal(s.knows("korvin"), true, "the player still knows Korvin's canonical name");
};

test("R1: Korvin is the partner and a narrated (non-persistent) captive gives a unique name: the captive is the provisional Lira and Korvin is unchanged", async () => {
  const s = scene();
  const korvin = await s.turn("Korvin, what do you have?", 'Korvin jerks his chin at a cage where a red-haired woman sits chained in the straw. "Five for her. Papers included."');
  assert.equal(korvin.result.scene_participants!.plan.focus, "korvin", "Korvin is the conversation partner");
  const r = await s.turn(ASK, 'The woman lifts her head from the straw. "My name is Lira," she whispers.');
  assert.equal(r.conflict, false, "the captive's own introduction is not a rename of Korvin");
  assert.match(r.delivered, /My name is Lira/, "the line reaches the player unrevised");
  assert.deepEqual(r.result.identity?.provisional.map(p => p.name), ["Lira"]);
  assert.equal(r.snapshot.characters.filter(c => c.origin.kind === "created").length, 0, "a name from narration creates no Campaign Character (AUTH-2)");
  korvinUnchanged(s, r.snapshot);
});

test("R2: the persistent captive says \"My name is Brenna\" while Korvin is the partner: the SAME record is named Brenna, never Korvin (the Actual Offer D1 line)", async () => {
  const s = scene({ captives: [BRENNA] });
  await s.turn(...OFFER);
  const r = await s.turn(ASK, 'The woman lifts her head from the straw. "My name is Brenna," she whispers.');
  assert.equal(r.conflict, false, "no canonical_name_conflict: the speaker is the captive");
  assert.equal(r.delivered, 'The woman lifts her head from the straw. "My name is Brenna," she whispers.', "the delivered narration is not cut");
  assert.equal(s.profile(BRENNA)?.name, "Brenna");
  assert.equal(s.profile(BRENNA)?.name_source, "self_disclosed");
  assert.equal(world.listEntities().filter(e => e.type === "character" && /^brenna\b/i.test(e.name ?? "")).length, 0, "no canonical Brenna exists: no collision to resolve");
  korvinUnchanged(s, r.snapshot);
});

test("R2 (canonical collision): a temporary captive who claims an absent canon figure's exact name follows the canon rule (no provisional person) and is still not charged to Korvin", async () => {
  const s = scene();
  const korvin = await s.turn("Korvin, what do you have?", 'Korvin jerks his chin at a cage where a red-haired woman sits chained in the straw. "Five for her. Papers included."');
  assert.equal(korvin.result.scene_participants!.plan.focus, "korvin", "Korvin is the conversation partner");
  const r = await s.turn(ASK, 'The woman lifts her head from the straw. "My name is Pellan," she whispers.');
  assert.equal(r.conflict, false, "the collision is the captive's, not a rename of Korvin");
  assert.deepEqual(r.result.identity?.provisional.map(p => p.name) ?? [], [], "an absent canon figure owns their whole name: no provisional duplicate");
  assert.equal(r.snapshot.characters.filter(c => c.profile.name === "Pellan").length, 0, "no campaign duplicate of the canon figure");
  korvinUnchanged(s, r.snapshot);
});

test("R3: Korvin says \"My name is Korvin.\": no false conflict and nobody is created", async () => {
  const s = scene({ captives: [BRENNA] });
  await s.turn(...OFFER);
  const r = await s.turn("Korvin, what is your name?", 'Korvin snorts. "My name is Korvin. You already knew that."');
  assert.equal(r.conflict, false);
  assert.equal(s.profile(BRENNA)?.name, undefined, "the captive is not named Korvin");
  korvinUnchanged(s, r.snapshot);
});

test("R4: the captive says \"His name is Korvin.\": a name presented for someone else is not a self-introduction", async () => {
  const s = scene({ captives: [BRENNA] });
  await s.turn(...OFFER);
  const r = await s.turn(ASK, 'The woman lifts her head from the straw. "His name is Korvin," she whispers.');
  assert.equal(r.conflict, false);
  assert.equal(s.profile(BRENNA)?.name, undefined, "the captive is not named Korvin");
  korvinUnchanged(s, r.snapshot);
});

test("R5: two captives could have spoken \"My name is Lira.\": fail closed, nobody is named Lira and Korvin is unchanged", async () => {
  const s = scene({ captives: [BRENNA, SECOND] });
  await s.turn("*looks at the two women in the cage* Korvin, what about them?", 'Korvin taps the cage. "Five each." He glances at the two women behind the bars.');
  const r = await s.turn(ASK, 'A woman behind the bars whispers, "My name is Lira."');
  assert.equal(s.profile(BRENNA)?.name, undefined);
  assert.equal(s.profile(SECOND)?.name, undefined);
  assert.equal(r.snapshot.characters.filter(c => c.profile.name === "Lira").length, 0, "an ambiguous speaker names nobody");
  korvinUnchanged(s, r.snapshot);
});

test("R6: a kept persistent captive self-introduces while Korvin is the partner: the same id is named in place, nothing new is created", async () => {
  const s = scene({ captives: [BRENNA] });
  const before = s.campaign.exportSnapshot().characters.length;
  await s.turn(...OFFER);
  const r = await s.turn(ASK, 'The woman lifts her head from the straw. "My name is Sela," she whispers.');
  assert.equal(r.conflict, false);
  assert.equal(s.profile(BRENNA)?.name, "Sela");
  assert.equal(r.snapshot.characters.length, before, "no new character");
  const record = r.snapshot.characters.find(c => c.id === BRENNA)!;
  assert.equal(record.origin_snapshot?.trigger, "player_kept", "origin snapshot untouched");
  korvinUnchanged(s, r.snapshot);
});

test("R7: a canonical character self-identifies: the canonical identity is reused (name learned on the canon id), no duplicate", async () => {
  const s = scene({ learned: false, advance: 600, captives: [BRENNA] });
  await s.turn("looks for private licensed sellers", "*A short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail, watching the crowd.*");
  const r = await s.turn("perhaps interested in buying, what's your name?", '*The seller squints at you.*\n\n"My name is Korvin."\n\n*He nods.*\n\nWhat are you after?');
  assert.equal(r.conflict, false);
  assert.equal(s.knows("korvin"), true, "the canonical name is learned on the canonical actor");
  assert.equal(r.snapshot.characters.filter(c => c.profile.name === "Korvin").length, 0, "no campaign duplicate of Korvin");
  assert.equal(r.snapshot.characters.filter(c => c.origin.kind === "created").length, 1, "only the pre-existing captive record");
  assert.equal(s.profile(BRENNA)?.name, undefined, "the captive is not named Korvin");
});

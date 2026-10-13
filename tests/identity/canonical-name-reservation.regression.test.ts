import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import { identityNameFactId, learnCanonicalName } from "../../src/campaign/identity-knowledge.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { trackablePeople } from "../../src/turn/identity/keep-track.js";
import { canonicalHandleOwners, reservedForAnotherIdentity } from "../../src/world/canonical-names.js";
import type { EphemeralSceneParticipant } from "../../src/turn/identity/scene-participants.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import type { TurnResult } from "../../src/turn/turn-types.js";
import { collect, metadata } from "../support/turn-fixtures.js";

/**
 * Canonical names and aliases are reserved identity handles (REPO-12 policy decision). A non-canonical person, provisional or persistent, never
 * acquires an exact canonical name or alias through self-introduction or name disclosure. The collision fails closed for the NAME ESTABLISHMENT
 * only: the same id stays, the name stays unset, the canonical character is untouched, nothing merges and nothing is created. Real data/ world,
 * scripted offline narration, no controller commands.
 */
const world = await loadWorld("data"), MARKET = "calderan_slave_market", CAPTIVE = "campaign_character_captive";
let serial = 0;
function scene(options: { readonly learned?: boolean; readonly advance?: number } = {}) {
  const campaign = createOpeningCampaign(world, `canonical_reservation_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } },
    ...(options.advance ? [{ kind: "runtime_delta", delta: { time_advance_minutes: options.advance } } as const] : []),
    ...(options.learned === false ? [] : learnCanonicalName(world, campaign.exportSnapshot(), "korvin"))] });
  const minute = campaign.exportSnapshot().runtime.scene.world_time.world_minute;
  const captive: CampaignCommand[] = [
    { kind: "register_character", character: { id: CAPTIVE, origin: { kind: "created" }, profile: {}, current: { current_location: MARKET, status: "active" },
      origin_snapshot: { source: "narrator_ephemeral", trigger: "player_kept", label: "the woman", promoted_revision: campaign.revision + 1, promoted_world_minute: minute, location_id: MARKET,
        established: { descriptor: "woman", appearance: ["red-haired"], role: "narrated captive; legal status unestablished" }, evidence: ["fixture"] } } },
    { kind: "set_legal_status", character_id: CAPTIVE, status: "enslaved", holder_id: "korvin" }];
  campaign.apply({ expected_revision: campaign.revision, commands: captive });
  let text = "";
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turn = async (input: string, narration: string) => {
    text = narration;
    const events = await collect(co.runTurn({ campaign, player_input: input }));
    const last = events.at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 400));
    return { result: (last as { result: TurnResult }).result, snapshot: campaign.exportSnapshot() };
  };
  const knows = (id: string) => campaign.exportSnapshot().knowledge.some(k => k.character_id === "nicco" && k.fact_id === identityNameFactId(id) && k.status === "knows");
  return { campaign, turn, knows };
}
const OFFER = ["*looks at the woman in the cage* Korvin, what about her?", 'Korvin taps the cage. "Five." He glances at the woman behind the bars. "Papers included."'] as const;
const ASK = "What is your name?";
const says = (name: string) => `The woman lifts her head from the straw. "My name is ${name}," she whispers.`;
const record = (s: ReturnType<typeof scene>) => s.campaign.exportSnapshot().characters.find(c => c.id === CAPTIVE)!;
/** The person keeps the same id, no name and no new record; the canonical owner is untouched and gets no campaign record. */
function failedClosed(s: ReturnType<typeof scene>, r: Awaited<ReturnType<ReturnType<typeof scene>["turn"]>>, name: string, owner: string, before: number, established = name) {
  assert.equal(record(s).profile.name, undefined, "the name stays unset");
  assert.ok(r.result.identity?.skipped.some(x => x.name === established && x.reason === "canonical_name_reserved"), JSON.stringify(r.result.identity?.skipped));
  assert.equal(r.snapshot.characters.length, before, "no character created");
  assert.equal(r.snapshot.characters.filter(c => c.profile.name?.toLowerCase() === name.toLowerCase() || (c.profile.aliases ?? []).some(a => a.toLowerCase() === name.toLowerCase())).length, 0, "no duplicate carries the handle");
  assert.equal(r.snapshot.characters.some(c => c.id === owner), false, "the canonical owner gets no campaign record (no merge, no rename)");
  assert.equal(s.knows(owner), false, "the player learns nothing about the canonical owner");
  assert.deepEqual(world.getEntity(owner)?.id, owner);
}

test("the reserved handles are exact canonical names and aliases, owned per identity; a canonical character's own name is not a collision", () => {
  assert.deepEqual(canonicalHandleOwners(world, "Pellan"), ["pellan"]);
  assert.deepEqual(canonicalHandleOwners(world, "  doran   HALE "), ["captain_doran_hale"], "aliases are reserved too (normalized case and spacing)");
  assert.deepEqual(canonicalHandleOwners(world, "Mira"), [], "a shared first name is not an exact handle");
  assert.equal(reservedForAnotherIdentity(world, "Korvin", "korvin"), false);
  assert.equal(reservedForAnotherIdentity(world, "Korvin", CAPTIVE), true);
});

test("1. an unnamed persistent non-canonical person who says \"My name is Pellan.\" keeps the same id and no name (canonical Pellan untouched)", async () => {
  const s = scene();
  await s.turn(...OFFER);
  const before = s.campaign.exportSnapshot().characters.length;
  const r = await s.turn(ASK, says("Pellan"));
  failedClosed(s, r, "Pellan", "pellan", before);
  assert.equal(record(s).origin_snapshot?.trigger, "player_kept", "the record itself is unchanged");
});

test("2. the same with a canonical alias (\"Doran Hale\", an alias of Captain Doran Hale) is rejected", async () => {
  const s = scene();
  await s.turn(...OFFER);
  const before = s.campaign.exportSnapshot().characters.length;
  const r = await s.turn(ASK, says("Doran Hale"));
  // The scene reading establishes the token "Doran"; the self-introduction fact's whole name "Doran Hale" is the reserved alias it claims.
  failedClosed(s, r, "Doran Hale", "captain_doran_hale", before, "Doran");
  assert.equal(r.snapshot.characters.filter(c => c.profile.name === "Doran").length, 0, "not named by the token either");
});

test("3. the actual canonical character self-identifies with its own canonical name: allowed and reused on the canonical id", async () => {
  const s = scene({ learned: false, advance: 600 });
  await s.turn("looks for private licensed sellers", "*A short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail, watching the crowd.*");
  const r = await s.turn("perhaps interested in buying, what's your name?", '*The seller squints at you.*\n\n"My name is Korvin."\n\n*He nods.*\n\nWhat are you after?');
  assert.equal(s.knows("korvin"), true);
  assert.equal(r.snapshot.characters.filter(c => c.profile.name === "Korvin").length, 0, "no campaign duplicate");
  assert.ok(!r.result.identity?.skipped.some(x => x.reason === "canonical_name_reserved"));
  assert.equal(record(s).profile.name, undefined);
});

test("4. a non-canonical unique name is allowed: the same persistent id is named in place", async () => {
  const s = scene();
  await s.turn(...OFFER);
  const r = await s.turn(ASK, says("Sela"));
  assert.equal(record(s).profile.name, "Sela");
  assert.equal(record(s).profile.name_source, "self_disclosed");
  assert.ok(!r.result.identity?.skipped.some(x => x.reason === "canonical_name_reserved"));
});

test("5/6. a rejected collision changes no id and no revision beyond the turn's unrelated authoritative changes, and merges or duplicates nothing", async () => {
  const rejected = scene(), control = scene();
  await rejected.turn(...OFFER); await control.turn(...OFFER);
  const r = await rejected.turn(ASK, says("Pellan"));
  const c = await control.turn(ASK, "The woman lifts her head from the straw, then looks away without a word.");
  assert.equal(r.snapshot.revision, c.snapshot.revision, "the same revision as an identical turn that names nobody");
  const shape = (snapshot: typeof r.snapshot) => snapshot.characters.map(x => ({ id: x.id, origin: x.origin.kind, profile: x.profile, location: x.current.current_location }));
  assert.deepEqual(shape(r.snapshot), shape(control.campaign.exportSnapshot()), "identical character records: no rename, merge or duplicate");
  assert.deepEqual(r.snapshot.legal_statuses, c.snapshot.legal_statuses);
});

test("before materialization: a provisional person never carries a reserved handle, and Keep track refuses a canonical alias like a canonical name", async () => {
  const s = scene();
  await s.turn("Korvin, what do you have?", 'Korvin jerks his chin at a cage where a red-haired woman sits chained in the straw. "Five for her. Papers included."');
  const r = await s.turn(ASK, 'A second woman in the next cage lifts her head. "My name is Pellan," she whispers.');
  assert.deepEqual(r.result.identity?.provisional.filter(p => p.name === "Pellan") ?? [], [], "no provisional Pellan");
  const snapshot = s.campaign.exportSnapshot();
  const participant = (n: number, name: string): EphemeralSceneParticipant => ({ id: `scene_npc_${n}`, ref: `P${n}`, role: "person", display_name: "Woman", standing: "ordinary_local", established_name: name,
    location_id: MARKET, locality: [MARKET], created_turn: 1, last_addressed_turn: 1, departed: false });
  const list = trackablePeople({ recent: [], context: buildTurnContext(world, snapshot), world, snapshot, participants: [participant(1, "Doran Hale"), participant(2, "Pellan"), participant(3, "Sela")] });
  assert.deepEqual(list.filter(p => p.participant_id).map(p => [p.label, p.blocked]), [["Doran Hale", "canonical_name"], ["Pellan", "canonical_name"], ["Sela", undefined]]);
});

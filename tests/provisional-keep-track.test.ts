import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { makeRig, MARKET, type Rig } from "./benchmark/harness.js";
import { createPlaytestServer } from "../src/ui/server.js";
import { keepToken, keptCharacter, trackablePeople } from "../src/turn/keep-track.js";
import { nextParticipantSeed, SceneParticipants, type EphemeralSceneParticipant } from "../src/turn/scene-participants.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";
import type { CampaignCommand } from "../src/campaign/types.js";

/**
 * Consolidation Block 12 (KPG-1, PER-2A, ID-2): [ Keep track ], the player's explicit deterministic action that persists ONE provisional person of the scene
 * as the SAME identity. PERSIST-A..F are the permanent save/reload regressions the block requires; the rest are the fail-closed and authority cases.
 */
const HOLLIS_1 = ["I watch the crowd.", "*A lean porter drops a crate beside Nicco and wipes his brow.*\n\n\"My name is Hollis,\" he says. \"Mind your feet.\""] as const;
const HOLLIS_2 = ["so you are Hollis?", "*The porter straightens up.*\n\n\"My name is Hollis, like I said.\""] as const;
const GUARD = ["I approach a guard.", "*The guard looks Nicco over, hand on his spear.*\n\n\"Keep moving,\" he says."] as const;
const rigs: Rig[] = [];
async function rig(commands: readonly CampaignCommand[] = []): Promise<Rig> { const r = await makeRig({ world: "market", commands }, `b12_${rigs.length}`); rigs.push(r); return r; }
test.after(async () => { for (const r of rigs) await r.release(); });

const people = (r: Rig) => r.coordinator.trackablePeople(r.campaign);
const tokenOf = (r: Rig, label: string) => { const p = people(r).find(x => x.label === label); assert.ok(p, `no Keep track entry ${label}: ${JSON.stringify(people(r).map(x => x.label))}`); return p.token; };
const revision = (r: Rig) => r.session.getView().session.revision;
const keep = (r: Rig, token: unknown, expected_revision: unknown = revision(r)) => r.session.keepTrack({ token, expected_revision });
const created = (r: Rig) => r.campaign.exportSnapshot().characters.filter(c => c.origin.kind === "created");
const say = async (r: Rig, [player, narration]: readonly [string, string]) => { const out = await r.say(player, narration); assert.ok(out.ok, out.error); };

test("PERSIST-A/E: a named provisional person kept, saved and reloaded is the same id, name, name source and location; no NPC+, household, legal or transaction", async () => {
  const r = await rig();
  await say(r, HOLLIS_1);
  const before = r.campaign.revision, calls = r.calls();
  const out = keep(r, tokenOf(r, "Hollis"));
  assert.ok(out.ok && out.changed, JSON.stringify(out));
  assert.equal(r.campaign.revision, before + 1, "exactly one revision");
  assert.deepEqual(r.calls(), calls, "no Narrator or Controller call");
  const [hollis, ...more] = created(r);
  assert.equal(more.length, 0);
  assert.equal(hollis!.profile.name, "Hollis"); assert.equal(hollis!.profile.name_source, "self_disclosed");
  assert.equal(hollis!.current.current_location, MARKET); assert.equal(hollis!.origin_snapshot?.trigger, "player_kept"); assert.equal(hollis!.origin_snapshot?.ephemeral_ref, "narrated:hollis");
  const snap = r.campaign.exportSnapshot();
  assert.equal(snap.premium_characters.length, 0); assert.equal(snap.transactions.length, 0);
  assert.ok(!snap.legal_statuses.some(l => l.character_id === hollis!.id));
  assert.ok(!snap.households.some(h => h.members.some(m => m.character_id === hollis!.id)));
  // The kept person appears among the scene's persistent people with a character card (the drawer), and no longer as a temporary one.
  assert.ok(r.session.getPlayUiView().participants.some(p => p.name === "Hollis" && p.card), "persistent drawer card");
  assert.deepEqual(r.session.getProvisionalPeopleView().people, []);
  await r.reload();
  const [again, ...others] = created(r);
  assert.equal(others.length, 0);
  assert.deepEqual({ id: again!.id, name: again!.profile.name, at: again!.current.current_location }, { id: hollis!.id, name: "Hollis", at: MARKET });
  assert.ok(r.session.getPlayUiView().participants.some(p => p.name === "Hollis" && p.card), "still in the drawer after reload");
  await say(r, HOLLIS_2);
  assert.equal(created(r).length, 1, "narrated again: the same persistent person, never a second one");
  assert.deepEqual(people(r), []);
});

test("PERSIST-B: an untracked incidental person is NOT persisted by save/reload, and is still only provisional afterwards", async () => {
  const r = await rig();
  await say(r, HOLLIS_1);
  const rev = r.campaign.revision;
  await r.reload();
  assert.equal(created(r).length, 0); assert.equal(r.campaign.revision, rev);
  assert.deepEqual(people(r).map(p => p.label), ["Hollis"], "PER-2A: the named provisional person is re-read from the restored recent exchanges");
});

test("PERSIST-C: replays and stale retries never duplicate: double press, a stale page, and the same token after reload all answer `already` with no revision", async () => {
  const r = await rig();
  await say(r, HOLLIS_1);
  const token = tokenOf(r, "Hollis"), rendered = revision(r);
  assert.ok(keep(r, token, rendered).ok);
  const after = r.campaign.revision;
  for (const attempt of [keep(r, token, rendered), keep(r, token), keep(r, token, 999)]) {
    assert.ok(attempt.ok && !attempt.changed && attempt.already, JSON.stringify(attempt));
  }
  await r.reload();
  const replay = keep(r, token, rendered);
  assert.ok(replay.ok && replay.already); assert.equal(r.campaign.revision, after); assert.equal(created(r).length, 1);
});

test("PERSIST-D: an unnamed temporary person kept before any name keeps the same id when they later introduce themselves", async () => {
  const r = await rig();
  await say(r, GUARD);
  assert.ok(keep(r, tokenOf(r, "Guard")).ok);
  const [guard] = created(r);
  assert.equal(guard!.profile.name, undefined); assert.equal(guard!.origin_snapshot?.ephemeral_ref, "scene_npc_1");
  assert.equal(r.coordinator.participants(r.campaign).active().length, 0, "the kept participant left the temporary registry");
  await say(r, ["What's your name, guard?", "*The guard sighs.*\n\n\"My name is Doran,\" he says. \"Now keep moving.\""]);
  const after = created(r);
  assert.equal(after.length, 1, "no second person");
  assert.equal(after[0]!.id, guard!.id); assert.equal(after[0]!.profile.name, "Doran");
});

test("PERSIST-F: Keep track then the explicit Heartstone rite: the same id becomes NPC+ and survives save/reload", async () => {
  const r = await rig([{ kind: "runtime_delta", delta: { player_location: "heartstone_lr" } }]);
  await say(r, ["I look around the hall.", "*A courier waits by the hearth, rain on her cloak.*\n\n\"My name is Tamsin,\" she says. \"I carry letters for the Keeper.\""]);
  assert.ok(keep(r, tokenOf(r, "Tamsin")).ok);
  const id = created(r)[0]!.id;
  const card = r.session.getPlayUiView().participants.find(p => p.name === "Tamsin")?.card;
  assert.ok(card);
  assert.ok(r.session.completeHeartstoneRite({ ref: card.ref, expected_revision: revision(r) }).ok);
  await r.reload();
  const snap = r.campaign.exportSnapshot();
  assert.deepEqual(snap.premium_characters.map(p => p.character_id), [id]);
  assert.deepEqual(created(r).map(c => c.id), [id]);
});

test("fail closed: malformed, forged and other-campaign tokens are unknown; a stale revision is refused; nothing changes", async () => {
  const a = await rig(), b = await rig();
  await say(a, HOLLIS_1); await say(b, HOLLIS_1);
  const rev = b.campaign.revision;
  for (const token of [undefined, 42, "Hollis", "narrated:hollis", "z".repeat(24), "0123456789abcdef01234567", tokenOf(a, "Hollis")]) {
    const out = keep(b, token);
    assert.ok(!out.ok && out.reason === "unknown_person", `${String(token)}: ${JSON.stringify(out.ok ? out : out.reason)}`);
  }
  for (const stale of [rev - 1, rev + 1, "3", null, -1]) { const out = keep(b, tokenOf(b, "Hollis"), stale); assert.ok(!out.ok && out.reason === "stale", String(stale)); }
  assert.equal(b.campaign.revision, rev); assert.equal(created(b).length, 0);
  assert.notEqual(tokenOf(a, "Hollis"), tokenOf(b, "Hollis"), "tokens are campaign-bound");
});

test("fail closed: a person no longer in the scene (the player left) cannot be kept with an old token", async () => {
  const r = await rig();
  await say(r, HOLLIS_1);
  const token = tokenOf(r, "Hollis");
  assert.ok(r.session.overridePlayerLocation({ target: "heartstone_lr", expected_revision: revision(r) }).ok);
  const out = keep(r, token);
  assert.ok(!out.ok && out.reason === "unknown_person"); assert.equal(created(r).length, 0);
});

test("fail closed, never a merge by name: a same-name persistent person elsewhere, two temporary people sharing a name, and a canon figure's exact name", async () => {
  const r = await rig([{ kind: "register_character", character: { id: "campaign_character_hollis", origin: { kind: "created" }, profile: { name: "Hollis", sex: "male" }, current: { current_location: "heartstone_lr", status: "active" } } }]);
  await say(r, HOLLIS_1);
  const hollis = people(r).find(p => p.label === "Hollis")!;
  assert.equal(hollis.blocked, "same_name_persistent");
  const rev = r.campaign.revision, out = keep(r, hollis.token);
  assert.ok(!out.ok && out.reason === "same_name_persistent"); assert.equal(r.campaign.revision, rev);
  assert.deepEqual(created(r).map(c => c.id), ["campaign_character_hollis"]);
  assert.equal(r.campaign.exportSnapshot().characters.find(c => c.id === "campaign_character_hollis")!.current.current_location, "heartstone_lr", "the persistent Hollis is untouched");

  // Pure reading: two unlinked temporary participants both named Mira, and one carrying a canon figure's exact name.
  const canonName = r.world.listEntities().find(e => e.type === "character" && e.name && /\s/.test(e.name))!.name!;
  const participant = (n: number, name: string): EphemeralSceneParticipant => ({ id: `scene_npc_${n}`, ref: `P${n}`, role: "person", display_name: "Woman", standing: "ordinary_local", established_name: name,
    location_id: MARKET, locality: [MARKET], created_turn: 1, last_addressed_turn: 1, departed: false });
  const snapshot = r.campaign.exportSnapshot();
  const list = trackablePeople({ recent: [], context: buildTurnContext(r.world, snapshot), world: r.world, snapshot, participants: [participant(1, "Mira"), participant(2, "Mira"), participant(3, canonName)] });
  assert.deepEqual(list.map(p => [p.label, p.blocked]), [["Mira (1)", "ambiguous_name"], ["Mira (2)", "ambiguous_name"], [canonName, "canonical_name"]]);
  assert.equal(new Set(list.map(p => p.token)).size, 3, "distinct people keep distinct opaque tokens");
});

test("materialization copies identity facts only: condition and background claims stay out of authoritative state; a captive gets no legal record", async () => {
  const r = await rig();
  await say(r, ["I look at the pen.", "*Korvin gestures at the pen. A young woman sits chained among the captives, feverish, red hair matted.*\n\n\"That one is Lysa,\" Korvin says. \"She was a weaver in Velm before the debts.\""]);
  const lysa = people(r).find(p => p.label === "Lysa");
  assert.ok(lysa?.captive);
  assert.ok(keep(r, lysa.token).ok);
  const [kept] = created(r);
  assert.equal(kept!.current.conditions, undefined, "no narrated condition becomes current state");
  assert.equal(kept!.origin_snapshot?.established.background, undefined, "no background claim is recorded");
  assert.equal(kept!.origin_snapshot?.established.condition, undefined);
  assert.equal(kept!.origin_snapshot?.established.role, "narrated captive; legal status unestablished");
  assert.ok(!r.campaign.exportSnapshot().legal_statuses.some(l => l.character_id === kept!.id), "legal status is never fabricated from narration");
});

test("ID-2: participant ids continue past every recorded scene_npc_<n> after a load, so a new temporary person never inherits a kept one's token", async () => {
  const r = await rig();
  await say(r, GUARD);
  const token = tokenOf(r, "Guard");
  assert.ok(keep(r, token).ok);
  assert.equal(nextParticipantSeed(r.campaign.exportSnapshot()), 2);
  await r.reload();
  await say(r, ["I approach another guard.", "*A second guard, younger, nods at Nicco.*"]);
  const fresh = people(r);
  assert.deepEqual(fresh.map(p => p.ref), ["scene_npc_2"]);
  assert.notEqual(fresh[0]!.token, token);
  const out = keep(r, fresh[0]!.token);
  assert.ok(out.ok && out.changed, "a new person, not `already`");
  assert.equal(created(r).length, 2);
  assert.equal(new SceneParticipants(0).active().length, 0);
  assert.equal(keptCharacter(r.campaign.exportSnapshot(), keepToken(r.campaign.exportSnapshot().campaign_id, "scene_npc_1", MARKET)), created(r)[0]!.id);
});

test("POST /api/people/keep: the browser sends only token and revision; the state lists temporary people without ids; success moves them to the persistent list", async t => {
  const r = await rig();
  await say(r, HOLLIS_1);
  const server = createPlaytestServer(r.session); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); }));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (body: unknown) => { const res = await fetch(`${base}/api/people/keep`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify(body) }); return { status: res.status, data: await res.json() as any }; };
  const before = await (await fetch(`${base}/api/session`)).json() as any;
  assert.deepEqual(before.provisional.people.map((p: any) => [p.label, p.keepable]), [["Hollis", true]]);
  assert.doesNotMatch(JSON.stringify(before.provisional), /narrated:|scene_npc_|campaign_character/);
  assert.ok(!before.play.participants.some((p: any) => p.name === "Hollis"), "not in the persistent list before Keep track");
  const token = before.provisional.people[0].token;
  assert.equal((await post({ token, expected_revision: before.revision - 1 })).status, 409);
  assert.equal((await post({ token: "0123456789abcdef01234567", expected_revision: before.revision })).status, 422);
  // Extra fields are ignored: the client cannot choose a name, location, legal status or household.
  const ok = await post({ token, expected_revision: before.revision, name: "Lord Hollis", location: "heartstone_lr", legal_status: "free", household: true });
  assert.equal(ok.status, 200); assert.equal(ok.data.ok, true); assert.equal(ok.data.revision, before.revision + 1);
  assert.deepEqual(ok.data.provisional.people, []);
  assert.ok(ok.data.play.participants.some((p: any) => p.name === "Hollis" && p.card));
  const [hollis] = created(r);
  assert.equal(hollis!.profile.name, "Hollis"); assert.equal(hollis!.current.current_location, MARKET);
  const again = await post({ token, expected_revision: before.revision });
  assert.equal(again.status, 200); assert.equal(again.data.already, true); assert.equal(again.data.revision, before.revision + 1);
});

test("the client sends only the opaque token and the rendered revision to /api/people/keep", async () => {
  const client = await readFile(join("src", "ui", "client.js"), "utf8");
  assert.match(client, /fetch\("\/api\/people\/keep", \{ method: "POST", headers: \{ "Content-Type": "application\/json" \}, body: JSON\.stringify\(\{ token, expected_revision: currentRevision \}\) \}\)/);
  assert.doesNotMatch(client.slice(client.indexOf("function renderProvisional"), client.indexOf("function showError")), /openCharacter/, "temporary people never open the character drawer");
});

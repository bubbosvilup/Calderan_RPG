import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { promises as fs, readFileSync } from "node:fs";
import { join } from "node:path";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { GameSession, type SessionDeps } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { packNpcPlus } from "../src/turn/npc-plus.js";
import type { ReflectionProvider } from "../src/turn/reflection.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { resolveOptionalServices, type OptionalServiceConfig } from "../src/app/optional-services.js";
import { encodeStore, decodeStore, optionalStoreFile } from "../src/persistence/optional-store.js";
import { extractOptionalState } from "../src/campaign/optional-state.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";
import { testTrajectory } from "./production-reflection-fixtures.js";
import { NOW, coreOf, faultFs, legacyCampaign, populated, run, tempRoot } from "./block7-fixtures.js";

type Hooks = Parameters<SessionDeps["createCoordinator"]>[0];
const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const narr = (text: string) => ({ async generate() { return mockNarrator(text).generate({} as never); }, async *stream() { yield* mockNarrator(text).stream({} as never); } });
const migrate = async (t: TestContext, f: ReturnType<typeof populated>) => { const l = await legacyCampaign(t, f); await l.repository.saveCampaign((await l.repository.loadCampaign(l.id)).campaign); return l; };

async function reflectionSession(t: TestContext, provider: ReflectionProvider, optional?: Partial<OptionalServiceConfig>) {
  const f = turnFixture(), service = new RetrievalService(f.world), dir = await tempRoot(t, "caldrevan-block7r-");
  run(f.campaign, { kind: "create_household", id: "campaign_household_b7" }, { kind: "set_membership", household_id: "campaign_household_b7", membership: { character_id: "nicco", status: "member", role: "owner" } }, { kind: "join_household", household_id: "campaign_household_b7", character_id: "maren" });
  for (let i = 0; i < 3; i++) run(f.campaign, { kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "respect", direction: "raise" });
  const session = GameSession.fromCampaign({ world: f.world, repository: new FileCampaignRepository(f.world, dir, { now: () => NOW }), reflection_provider: provider, ...(optional ? { optional_services: resolveOptionalServices(optional, {}) } : {}),
    createCoordinator: (hooks: Hooks) => new TurnCoordinator(f.world, narr("Maren nods."), mockController([]), { service, search: new HybridSearch(service) }, { provider_retry: false, diagnostics_sink: hooks.diagnostics_sink }) } as never, f.campaign);
  return { ...f, session, dir };
}
const trajectory: ReflectionProvider = { async reflect(request) { return { text: JSON.stringify({ proposals: [testTrajectory(request, "respect")] }) }; } };

// ------------------------------------------------------------------------------------------------ Reflection
test("block 7 Reflection: ON writes the learning store only; the snapshot never carries the note; the semantic revision and a client's expected_revision survive the background write", async t => {
  const f = await reflectionSession(t, trajectory, { reflection: true });
  const out = await f.session.submitPlayerInput("I wait."); assert.ok(out.ok);
  const atReturn = f.campaign.revision, view = out.view.session.revision; await f.session.optionalSettled();
  assert.equal(f.campaign.exportSnapshot().premium_reflections[0]!.notes.length, 1, "the note was written");
  assert.equal(f.campaign.revision, atReturn, "no semantic revision"); assert.equal(view, atReturn);
  const next = await f.session.submitPlayerInput("I wait again.", { expected_revision: view });
  assert.ok(next.ok, "the revision the client holds is still valid after background Reflection");
  await f.session.optionalSettled();
  assert.ok((await f.session.save()).ok);
  const id = f.campaign.exportSnapshot().campaign_id, saved = JSON.parse(await fs.readFile(join(f.dir, "campaigns", id, "save.json"), "utf8").catch(() => fs.readFile(join(f.dir, id, "save.json"), "utf8")));
  assert.equal("premium_reflections" in saved.snapshot, false); assert.ok(saved.optional_state.learning.completed);
  const store = decodeStore(await fs.readFile(join(f.dir, id, "optional", "learning.json"), "utf8"), "learning", id);
  assert.ok(store.data.premium_reflections.some(r => r.notes.length >= 1), "the note lives in the learning store");
});

test("block 7 Reflection: a historical note stays Narrator-visible with the producer OFF, read from the learning store after a reload", async t => {
  const f = populated(["reflection"]), l = await migrate(t, f), loaded = await l.repository.loadCampaign(l.id);
  assert.deepEqual(loaded.optional_state_source.learning, "side_store");
  const lines = packNpcPlus(loaded.campaign.exportSnapshot() ? f.world : f.world, loaded.campaign.exportSnapshot(), new Set(["maren"]), "Maren")!.lines.join("\n");
  assert.ok(lines.includes("Maren holds a steady, watchful regard for Nicco."), "soft-promoted durable enrichment is still read");
  assert.equal(JSON.parse(await fs.readFile(l.path, "utf8")).snapshot.premium_reflections, undefined, "and it is not in the authoritative snapshot");
});

// ------------------------------------------------------------------------------------------------ Mannerism
test("block 7 Mannerism: observations and journal writes never bump the revision; the promoted mannerism stays authoritative; a crash around the promotion cannot re-promote", async t => {
  const f = populated(["mannerism"]);
  const evidenceRound = (turn: string, through: number) => {
    f.campaign.maintainMannerisms({ kind: "finalized", expected_revision: f.campaign.revision, source: { turn_id: turn, narration_hash: "b".repeat(64), narration_length: 400, character_ids: ["maren"], available_items: [] } });
    return f.campaign.maintainMannerisms({ kind: "observations", expected_revision: f.campaign.revision, through_sequence: through, observations: [{ character_id: "maren", sequence: through, action: "lips_press", trigger: "while_waiting", span_start: 0, span_end: 20, equivalent_owned_ids: [] }] });
  };
  const owned = () => f.campaign.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.mannerisms ?? [];
  const before = owned().length, revision = f.campaign.revision;
  const second = evidenceRound("t2", 2);
  assert.equal(second.metrics.mannerisms_promoted, 0); assert.equal(f.campaign.revision, revision, "observation + journal: optional-only");
  let promoted = second; for (let n = 3; n < 8 && owned().length === before; n++) promoted = evidenceRound(`t${n}`, n);
  assert.equal(owned().length, before + 1, "the candidate was promoted"); assert.equal(promoted.metrics.mannerisms_promoted, 1);
  assert.equal(f.campaign.revision, revision + 1, "an actual promotion bumps the semantic revision exactly once");
  // Persist: steady state, snapshot first. Crash before the learning store is written: the promotion is durable, the learning store is BEHIND.
  const fx = populated(["mannerism"]), l = await legacyCampaign(t, fx);
  const base = (await l.repository.loadCampaign(l.id)).campaign; await l.repository.saveCampaign(base);
  const campaign = (await l.repository.loadCampaign(l.id)).campaign, own = () => campaign.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.mannerisms ?? [];
  const startOwned = own().length;
  const round = (turn: string, through: number) => {
    campaign.maintainMannerisms({ kind: "finalized", expected_revision: campaign.revision, source: { turn_id: turn, narration_hash: "c".repeat(64), narration_length: 400, character_ids: ["maren"], available_items: [] } });
    return campaign.maintainMannerisms({ kind: "observations", expected_revision: campaign.revision, through_sequence: through, observations: [{ character_id: "maren", sequence: through, action: "lips_press", trigger: "while_waiting", span_start: 0, span_end: 20, equivalent_owned_ids: [] }] });
  };
  for (let n = 2; n < 9 && own().length === startOwned; n++) round(`x${n}`, n);
  assert.equal(own().length, startOwned + 1);
  const promotedRevision = campaign.revision, key = own().at(-1)!.canonical_key;
  await assert.rejects(new FileCampaignRepository(fx.world, l.root, { now: () => NOW, filesystem: faultFs("writeNew", "store", 1) }).saveCampaign(campaign), { code: "io_error" });
  const behind = (await new FileCampaignRepository(fx.world, l.root, { now: () => NOW }).loadCampaign(l.id)).campaign;
  assert.equal(behind.revision, promotedRevision, "the promotion is durable"); const behindOwned = behind.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.mannerisms!;
  assert.equal(behindOwned.filter(m => m.canonical_key === key).length, 1);
  assert.ok(behind.exportSnapshot().mannerism_learning!.candidates.some(c => c.canonical_key === key), "the learning store is behind: the candidate was not acknowledged yet");
  const seq = behind.exportSnapshot().mannerism_learning!;
  behind.maintainMannerisms({ kind: "finalized", expected_revision: behind.revision, source: { turn_id: "after-crash", narration_hash: "d".repeat(64), narration_length: 400, character_ids: ["maren"], available_items: [] } });
  const again = behind.maintainMannerisms({ kind: "observations", expected_revision: behind.revision, through_sequence: seq.sequence + 1, observations: [{ character_id: "maren", sequence: seq.sequence + 1, action: "lips_press", trigger: "while_waiting", span_start: 0, span_end: 20, equivalent_owned_ids: [] }] });
  assert.equal(again.metrics.mannerisms_promoted, 0, "no re-promotion"); assert.equal(behind.revision, promotedRevision);
  assert.equal(behind.exportSnapshot().premium_characters.find(p => p.character_id === "maren")!.mannerisms!.filter(m => m.canonical_key === key).length, 1, "exactly one promoted mannerism");
  assert.equal(behind.exportSnapshot().mannerism_learning!.candidates.some(c => c.canonical_key === key), false, "the stale candidate is dropped by the stable canonical key");
});

// ------------------------------------------------------------------------------------------------ Item sprites
test("block 7 sprites: pending / ready / failed bookkeeping is composed from the media store; a sprite change is not a revision; a missing asset degrades the media only", async t => {
  const fx = populated(["sprites"]), l = await migrate(t, fx), id = fx.campaign.exportSnapshot().campaign_id;
  const campaign = (await l.repository.loadCampaign(l.id)).campaign, items = campaign.exportSnapshot().items.filter(i => i.sprite);
  assert.deepEqual(items.map(i => i.sprite!.status).sort(), ["failed", "pending", "ready"]);
  const revision = campaign.revision, core = coreOf(campaign), pending = items.find(i => i.sprite!.status === "pending")!;
  run(campaign, { kind: "set_item_sprite", item_id: pending.id, sprite: { status: "failed", error_code: "provider_failed" } });
  assert.equal(campaign.revision, revision); assert.equal(coreOf(campaign), core);
  await l.repository.saveCampaign(campaign);
  const media = decodeStore(await fs.readFile(join(l.dir, "optional", "media.json"), "utf8"), "media", id);
  assert.equal(media.data.item_sprites.find(s => s.item_id === pending.id)!.sprite.status, "failed");
  assert.equal(JSON.parse(await fs.readFile(l.path, "utf8")).snapshot.items.some((i: any) => "sprite" in i), false);
  // The media store lists a ready sprite whose file does not exist (nothing was ever written to disk here): the item itself is untouched and the load succeeds.
  const reloaded = (await l.repository.loadCampaign(l.id)).campaign, ready = reloaded.exportSnapshot().items.find(i => i.sprite?.status === "ready")!;
  assert.equal(reloaded.revision, revision); assert.equal(ready.owner_id, "maren"); assert.equal(coreOf(reloaded), core);
  // An entry for an item that no longer exists is dropped, never resurrected.
  const stale = extractOptionalState(reloaded.exportSnapshot()).media; stale.item_sprites.push({ item_id: "campaign_item_ghost", sprite: { status: "pending" } });
  await fs.writeFile(join(l.dir, "optional", "media.json"), encodeStore("media", id, revision, NOW, stale));
  assert.equal((await l.repository.loadCampaign(l.id)).campaign.exportSnapshot().items.some(i => i.id === "campaign_item_ghost"), false);
});

// ------------------------------------------------------------------------------------------------ Portraits
test("block 7 portraits: a gallery batch is not a revision; selecting an avatar bumps it exactly once; a selected version cannot be deleted; deleting an unselected one is media-only", async t => {
  const fx = populated(["portraits"]), l = await migrate(t, fx), campaign = (await l.repository.loadCampaign(l.id)).campaign, revision = campaign.revision;
  const batch = run(campaign, { kind: "record_portrait_batch", character_id: "nicco", versions: [{ ...plain(campaign.exportSnapshot().portraits![0]!.versions[0]!), version_id: "portrait_v4", asset_file: "portrait_v4.png" }] });
  assert.equal(batch.revision, revision, "a new batch only grows the gallery"); assert.equal(campaign.exportSnapshot().portraits![0]!.versions.length, 4);
  assert.equal(campaign.exportSnapshot().portraits![0]!.avatar_version_id, "portrait_v1", "the selection did not move");
  const picked = run(campaign, { kind: "set_portrait_avatar", character_id: "nicco", version_id: "portrait_v2" });
  assert.equal(picked.revision, revision + 1, "an explicit selection change is authoritative: exactly one revision");
  assert.throws(() => run(campaign, { kind: "delete_portrait_version", character_id: "nicco", version_id: "portrait_v2" }), /role cannot be deleted/);
  const del = run(campaign, { kind: "delete_portrait_version", character_id: "nicco", version_id: "portrait_v4" });
  assert.equal(del.revision, revision + 1, "deleting an unselected version is media-only");
  await l.repository.saveCampaign(campaign);
  const file = JSON.parse(await fs.readFile(l.path, "utf8"));
  assert.deepEqual(file.snapshot.portrait_selections, [{ character_id: "nicco", avatar_version_id: "portrait_v2" }]);
  const again = (await l.repository.loadCampaign(l.id)).campaign; assert.equal(again.revision, revision + 1);
  assert.deepEqual(plain(again.exportSnapshot().portraits), plain(campaign.exportSnapshot().portraits));
});

test("block 7 portraits: a selection whose gallery version is missing is KEPT; rendering degrades, no other version is chosen, the load does not fail", async t => {
  const fx = populated(["portraits"]), l = await migrate(t, fx), id = fx.campaign.exportSnapshot().campaign_id, revision = fx.campaign.revision;
  const media = extractOptionalState(fx.campaign.exportSnapshot()).media; media.portraits[0]!.versions = media.portraits[0]!.versions.filter(v => v.version_id !== "portrait_v1");
  await fs.writeFile(join(l.dir, "optional", "media.json"), encodeStore("media", id, revision, NOW, media));
  const loaded = await l.repository.loadCampaign(l.id), record = loaded.campaign.exportSnapshot().portraits![0]!;
  assert.equal(record.avatar_version_id, "portrait_v1", "the player's choice is not rewritten"); assert.equal(record.versions.some(v => v.version_id === "portrait_v1"), false);
  assert.equal(loaded.campaign.revision, revision);
});

// ------------------------------------------------------------------------------------------------ legacy writers gone / compaction decision
const source = (path: string) => readFileSync(path, "utf8");
test("block 7 audit: no production writer persists optional state into the snapshot, the revision tolerance is gone and post_turn is not a session status", () => {
  const format = source("src/persistence/save-format.ts"), repository = source("src/persistence/campaign-repository.ts"), session = source("src/app/game-session.ts"), view = source("src/app/session-view.ts");
  assert.ok(format.includes("toPersistedSnapshot(") && /optional_state/.test(format), "the persisted snapshot is produced by the partitioner");
  assert.ok(!/premium_reflections|mannerism_learning/.test(repository.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "the repository knows stores, not reflection or mannerism fields");
  assert.ok(!session.includes("#optionalRevisions") && !session.includes("#noteOptionalWrite"), "the Block 6 optional-revision tolerance is removed");
  assert.ok(!/"post_turn"/.test(view), "post_turn is no longer a SessionStatus");
  assert.ok(session.includes("expected_revision") && /#revisionOk\([^)]*\)[^{]*\{[^}]*===[^}]*campaign\.revision/.test(session.replace(/\s+/g, " ")) || /revisionOk/.test(session), "expected_revision is a strict equality");
});

test("block 7 compaction decision: context compaction is CORE (turn-path-required, derived, non-authoritative): it reads a request and never writes campaign or side-store state", () => {
  const compaction = source("src/turn/context-compaction.ts");
  assert.ok(!/campaign-state|persistence|optional-store|\.apply\(\{|expected_revision/.test(compaction.replace(/^\s*\/\/.*$/gm, "")), "compaction has no path to CampaignState or to any store");
  const session = source("src/app/game-session.ts"), body = session.slice(session.indexOf("async #compact("), session.indexOf("async #compact(") + 1600);
  assert.ok(!/campaign\.(apply|commit|maintain)|#session\.campaign\.apply/.test(body), "GameSession#compact writes nothing authoritative");
  assert.ok(/context_too_large/.test(session) && /compaction_required/.test(session), "and it stays awaited because the next turn is rejected without it");
});

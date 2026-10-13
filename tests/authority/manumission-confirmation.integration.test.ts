import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GameSession } from "../../src/app/game-session.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { CONTROLLER_SCHEMA } from "../../src/llm/controller-schema.js";
import { auditNarration } from "../../src/turn/audit/narration-audit.js";
import { buildTurnContext } from "../../src/turn/context/context-builder.js";
import { pendingClaims } from "../../src/turn/audit/pending-audit.js";
import { resolveTurnIntent, type IntentStageInput } from "../../src/turn/stages/intent.js";
import { deriveTurnEvidence } from "../../src/turn/authorization/turn-evidence.js";
import { projectKnowledgeAccess } from "../../src/turn/context/narrative-authority.js";
import { countingController, NARRATION, sessionWith, stepNarrator, type NarratorStep } from "../support/turn-reliability-fixtures.js";

/**
 * Consolidation block 5A, AUTH-1: the player's words "I free <person>" PROPOSE a manumission; only the explicit Confirm in the interface commits it.
 * End-to-end through GameSession with counted stub providers (no network).
 */
const BRENNA = "brenna", MAREN = "campaign_character_maren";
const key = (n: number) => `auth1_turn_${String(n).padStart(4, "0")}`;
const heldBy = (id: string, holder = "nicco"): CampaignCommand => ({ kind: "set_legal_status", character_id: id, status: "enslaved", holder_id: holder });
const maren = (): CampaignCommand => ({ kind: "register_character", character: { id: MAREN, origin: { kind: "created" }, profile: { name: "Maren", age: { kind: "exact", years: 19 } }, current: { current_location: "test_room", status: "active" } } });
const FREE_BRENNA = "I hereby free you, Brenna.";

async function harness(options: { setup?: readonly CampaignCommand[]; steps?: readonly NarratorStep[]; controller?: readonly CampaignCommand[] } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "block5a-auth1-"));
  const narrator = stepNarrator(options.steps ?? [{ text: "Brenna goes very still and searches Nicco's face." }]), controller = countingController(options.controller ?? []);
  const h = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: campaign => campaign.apply({ expected_revision: campaign.revision, commands: [...(options.setup ?? [heldBy(BRENNA)])] }) });
  return { ...h, dir, narrator, controller, cleanup: () => rm(dir, { recursive: true, force: true }) };
}
type H = Awaited<ReturnType<typeof harness>>;
const say = (h: H, n: number, text: string) => h.session.submitPlayerInput(text, { turn_key: key(n), expected_revision: h.campaign.revision });
const legal = (h: H, id = BRENNA) => h.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === id);
const cards = (h: H) => h.session.getConfirmationView().cards;
const manumissions = (h: H) => h.campaign.exportSnapshot().transactions.filter(t => t.kind === "manumission").length;
const calls = (h: H) => h.narrator.calls() + h.controller.calls();
const systemOf = (h: H, i = 0) => `${h.narrator.requests[i]!.system_prompt}\n${h.narrator.requests[i]!.messages.map(m => String(m.content)).join("\n")}`;
const done = async (h: H) => { await h.session.shutdown({ discard_unsaved: true }); await h.cleanup(); };

test("A1: 'I hereby free you' PROPOSES: a card appears, the legal state is unchanged, no manumission is recorded, the revision does not move", async () => {
  const h = await harness();
  try {
    const revision = h.campaign.revision;
    const outcome = await say(h, 1, FREE_BRENNA);
    assert.equal(outcome.ok, true);
    assert.equal(legal(h)?.status, "enslaved"); assert.equal(legal(h)?.holder_id, "nicco");
    assert.equal(manumissions(h), 0);
    assert.equal(h.campaign.revision, revision, "recognizing the words changes no authoritative state");
    assert.equal(cards(h).length, 1);
    assert.equal(cards(h)[0]!.title, "Free Brenna?");
    assert.ok(outcome.ok && outcome.trace.committed_command_kinds.every(k => k !== "manumit"));
  } finally { await done(h); }
});
test("A2: Confirm commits the deterministic manumission once, calls NO Narrator or Controller, and leaves household/location untouched", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const ref = cards(h)[0]!.ref, before = h.campaign.exportSnapshot(), count = calls(h);
    const outcome = h.session.confirmPending({ ref, expected_revision: h.campaign.revision });
    assert.deepEqual([outcome.ok, outcome.ok && outcome.status], [true, "confirmed"]);
    const after = h.campaign.exportSnapshot();
    assert.equal(legal(h)?.status, "free"); assert.equal(legal(h)?.holder_id, undefined);
    assert.equal(manumissions(h), 1);
    assert.equal(after.revision, before.revision + 1);
    assert.deepEqual(after.households, before.households, "household membership is a separate dimension");
    assert.equal(after.runtime.npc_locations.length, before.runtime.npc_locations.length);
    assert.equal(calls(h), count, "zero provider calls");
    const again = h.session.confirmPending({ ref, expected_revision: before.revision });
    assert.deepEqual([again.ok, again.ok && again.replayed], [true, true]);
    assert.equal(manumissions(h), 1, "a repeat never frees twice");
  } finally { await done(h); }
});
test("A3: Cancel leaves everything as it was; the proposal can be made again later", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const ref = cards(h)[0]!.ref, snapshot = JSON.stringify(h.campaign.exportSnapshot());
    assert.equal(h.session.cancelPending({ ref, expected_revision: h.campaign.revision }).ok, true);
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), snapshot);
    assert.equal(cards(h).length, 0);
    const refused = h.session.confirmPending({ ref, expected_revision: h.campaign.revision });
    assert.equal(refused.ok, false);
    await say(h, 2, FREE_BRENNA);
    assert.equal(cards(h).length, 1, "a fresh request after a cancel is a fresh card");
    assert.notEqual(cards(h)[0]!.ref, ref);
  } finally { await done(h); }
});
test("A4: hedged, negated, questioned, conditional and quoted-as-fiction statements create no card and no command", async () => {
  const h = await harness();
  try {
    let n = 1;
    for (const text of ["Maybe one day I'll free you, Brenna.", "If I wanted to, I could free you.", "Would you like me to free you, Brenna?", "I will not free you.", "Are you free tomorrow, Brenna?", "*frees her from the chains*", "You're free to go outside.", "Brenna, you are not free yet.", "I am considering whether to free you."]) {
      const outcome = await say(h, n++, text);
      assert.equal(outcome.ok, true, text);
      assert.equal(cards(h).length, 0, `no card for: ${text}`);
      assert.equal(legal(h)?.status, "enslaved", text);
    }
    assert.equal(manumissions(h), 0);
  } finally { await done(h); }
});
test("A5: a person Nicco does not hold (held by someone else, or already free) cannot be proposed for freeing", async () => {
  const other = await harness({ setup: [maren(), heldBy(BRENNA, MAREN)] });
  try {
    const outcome = await say(other, 1, FREE_BRENNA);
    assert.equal(outcome.ok, true);
    assert.equal(cards(other).length, 0); assert.equal(legal(other)?.holder_id, MAREN);
  } finally { await done(other); }
  const free = await harness({ setup: [{ kind: "set_legal_status", character_id: BRENNA, status: "free" }] });
  try { await say(free, 1, FREE_BRENNA); assert.equal(cards(free).length, 0); } finally { await done(free); }
});
test("A6: with two held people present, an unnamed request is ambiguous (no card); a named one binds exactly that person", async () => {
  const h = await harness({ setup: [maren(), heldBy(BRENNA), heldBy(MAREN)] });
  try {
    await say(h, 1, "I hereby free you.");
    assert.equal(cards(h).length, 0, "ambiguity proposes nothing");
    await say(h, 2, "I hereby free you, Maren.");
    assert.equal(cards(h).length, 1);
    assert.equal(cards(h)[0]!.title, "Free Maren?");
    const ref = cards(h)[0]!.ref;
    assert.equal(h.session.confirmPending({ ref, expected_revision: h.campaign.revision }).ok, true);
    assert.equal(legal(h, MAREN)?.status, "free"); assert.equal(legal(h)?.status, "enslaved", "only the named person is freed");
  } finally { await done(h); }
});
test("A7: the same request twice is ONE card (dedup); a changed payload supersedes it", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const first = cards(h)[0]!.ref;
    await say(h, 2, FREE_BRENNA);
    assert.deepEqual(cards(h).map(c => c.ref), [first], "same interpretation, same card");
    await say(h, 3, "I hereby free you, Brenna. Here are the signed papers.");
    assert.equal(cards(h).length, 1);
    assert.notEqual(cards(h)[0]!.ref, first, "the documented version replaces the undocumented one");
    assert.equal(h.session.getConfirmationView().recent.some(r => r.status === "invalidated"), true);
    assert.equal(h.session.confirmPending({ ref: first, expected_revision: h.campaign.revision }).ok, false, "the superseded card cannot be confirmed");
    const ref = cards(h)[0]!.ref;
    assert.equal(h.session.confirmPending({ ref, expected_revision: h.campaign.revision }).ok, true);
    const t = h.campaign.exportSnapshot().legal_statuses.find(l => l.character_id === BRENNA)!;
    assert.equal(t.transfer?.documentation, "documented");
  } finally { await done(h); }
});
test("A8: confirm-time revalidation: if Brenna stopped being held by Nicco, Confirm refuses and changes nothing", async () => {
  const h = await harness({ setup: [maren(), heldBy(BRENNA)] });
  try {
    await say(h, 1, FREE_BRENNA);
    const ref = cards(h)[0]!.ref;
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "set_legal_status", character_id: BRENNA, status: "enslaved", holder_id: MAREN }] });
    const snapshot = JSON.stringify(h.campaign.exportSnapshot());
    const outcome = h.session.confirmPending({ ref, expected_revision: h.campaign.revision });
    assert.equal(outcome.ok, false); assert.equal(!outcome.ok && outcome.reason, "invalidated"); assert.equal(!outcome.ok && outcome.terminal_reason, "holder_changed");
    assert.equal(JSON.stringify(h.campaign.exportSnapshot()), snapshot);
    assert.equal(manumissions(h), 0);
  } finally { await done(h); }
});
test("A9: binding is by id: a rename keeps the same card and the confirmation frees the same person", async () => {
  const h = await harness({ setup: [maren(), heldBy(MAREN)] });
  try {
    await say(h, 1, "I hereby free you, Maren.");
    const before = cards(h)[0]!;
    assert.match(before.title, /Free (?:Maren|Young Slave|Slave)\?/);
    const profile = h.campaign.exportSnapshot().characters.find(c => c.id === MAREN)!.profile;
    h.campaign.apply({ expected_revision: h.campaign.revision, commands: [{ kind: "set_profile", character_id: MAREN, profile: { ...profile, name: "Maren Vale" } }] });
    const after = cards(h)[0]!;
    assert.equal(after.ref, before.ref, "the same record, the same opaque ref");
    assert.equal(h.session.confirmPending({ ref: before.ref, expected_revision: h.campaign.revision }).ok, true);
    assert.equal(legal(h, MAREN)?.status, "free", "the confirmation acted on the same subject id");
  } finally { await done(h); }
});
test("A10: the Narrator is told the three states: current state unchanged, a PROPOSAL awaiting confirmation, and no fake intermediate status", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const prompt = systemOf(h);
    assert.match(prompt, /Brenna: legally enslaved; legal holder Nicco/, "the real legal status is still shown");
    assert.match(prompt, /Proposed player actions awaiting the player's explicit confirmation/);
    assert.match(prompt, /PROPOSAL awaiting the player's explicit confirmation in the interface: Brenna is STILL legally enslaved/);
    assert.doesNotMatch(prompt, /legally (?:pending|freeing|being freed|partially)/i, "no intermediate legal status is invented");
    assert.doesNotMatch(prompt, /Manumission \(authoritative\)|is now legally free/);
    // A later turn that does not mention the request still tells the Narrator the proposal is pending.
    await say(h, 2, "I look at the window.");
    assert.match(systemOf(h, 1), /Proposed player actions awaiting/);
  } finally { await done(h); }
});
test("A11: after Cancel or Confirm the pending block is gone from the Narrator context; after Confirm the status is simply free", async () => {
  const h = await harness({ steps: [{ text: "Brenna stares." }, { text: "Brenna breathes out." }] });
  try {
    await say(h, 1, FREE_BRENNA);
    const ref = cards(h)[0]!.ref;
    assert.equal(h.session.confirmPending({ ref, expected_revision: h.campaign.revision }).ok, true);
    await say(h, 2, "I look at Brenna.");
    const prompt = systemOf(h, 1);
    assert.doesNotMatch(prompt, /Proposed player actions awaiting/);
    assert.match(prompt, /Brenna: legally free/);
  } finally { await done(h); }
});
test("A12: audit guard: narrating the act as completed before Confirm is withdrawn (revised, then redacted); reactions and hesitation pass", async () => {
  const h = await harness({ steps: [{ text: "Brenna is now free, and the papers are signed." }, { text: "Brenna stares at Nicco, afraid to hope that the words are real." }] });
  try {
    const outcome = await say(h, 1, FREE_BRENNA);
    assert.equal(outcome.ok, true);
    assert.ok(outcome.ok && outcome.trace.audit_issue_kinds.includes("uncommitted_pending_confirmation"), "the completion claim was caught");
    assert.equal(outcome.ok && /now free|papers are signed/.test(outcome.narration), false, "the claim never reaches the player");
    assert.match(outcome.ok ? outcome.narration : "", /afraid to hope/);
    assert.equal(legal(h)?.status, "enslaved");
  } finally { await done(h); }
});
test("A13: audit guard (pure): completion claims are flagged; proposals, emotion, questions, negation, hopes and unchaining are not", () => {
  const subjects = [{ kind: "manumission", name: "Brenna" }];
  const flagged = ["Brenna is now free.", "Nicco frees Brenna with a flourish.", "Brenna is no longer a slave.", "She has become a free woman.", "The papers are signed and sealed, and Brenna's freedom is hers.",
    'Brenna laughs through tears. "I am free now."', "Nicco grants her her freedom."];
  for (const s of flagged) assert.ok(pendingClaims([s], subjects).length > 0, s);
  const allowed = ["Brenna stares at Nicco, hardly daring to hope she might one day be free.", "Nicco says he means to free her, and Brenna waits for the papers.", "Is Brenna free now?", "Brenna is not free yet.",
    "Nicco frees Brenna from her chains.", 'Nicco says, "You are free, Brenna," and she waits to see whether the words hold.', "Brenna wonders whether she will be free by morning.", "Brenna remains a slave in the eyes of the law."];
  for (const s of allowed) assert.deepEqual(pendingClaims([s], subjects).map(c => c.sentence), [], s);
  assert.deepEqual(pendingClaims(["Brenna is now free."], []), [], "nothing pending, nothing to guard");
});
test("A14: after Confirm, completion narration is allowed (the guard applies only while the request is pending)", async () => {
  const h = await harness({ steps: [{ text: "Brenna stares." }, { text: "Brenna is now free, and she knows it." }] });
  try {
    await say(h, 1, FREE_BRENNA);
    h.session.confirmPending({ ref: cards(h)[0]!.ref, expected_revision: h.campaign.revision });
    const outcome = await say(h, 2, "I look at Brenna.");
    assert.equal(outcome.ok, true);
    assert.equal(outcome.ok && outcome.trace.audit_issue_kinds.includes("uncommitted_pending_confirmation"), false);
    assert.match(outcome.ok ? outcome.narration : "", /now free/);
  } finally { await done(h); }
});
test("A15: a failed turn creates no card; a replayed turn_key creates no duplicate and makes zero provider calls", async () => {
  const failing = await harness({ steps: [{ fail: "provider_unavailable" }] });
  try {
    const outcome = await say(failing, 1, FREE_BRENNA);
    assert.equal(outcome.ok, false);
    assert.equal(cards(failing).length, 0, "nothing was finalized, nothing is proposed");
  } finally { await done(failing); }
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const count = calls(h), ref = cards(h)[0]!.ref, revision = h.campaign.revision;
    const replay = await h.session.submitPlayerInput(FREE_BRENNA, { turn_key: key(1), expected_revision: revision });
    assert.equal(replay.ok && replay.replayed, true);
    assert.equal(calls(h), count, "a replay calls no provider");
    assert.deepEqual(cards(h).map(c => c.ref), [ref], "no duplicate pending");
    assert.equal(h.session.getConfirmationView().recent.length, 0);
  } finally { await done(h); }
});
test("A16: a pending card and its Confirm survive save and reload; a crash before the save loses the mutation and the terminal state TOGETHER", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA); await h.session.save();
    const ref = cards(h)[0]!.ref;
    const reloaded = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(reloaded.ok, true);
    if (reloaded.ok) {
      assert.equal(reloaded.session.getConfirmationView().cards[0]?.ref, ref);
      const view = reloaded.session.getView();
      const outcome = reloaded.session.confirmPending({ ref, expected_revision: view.session.revision });
      assert.equal(outcome.ok, true);
      assert.equal((await reloaded.session.save()).ok, true);
      await reloaded.session.shutdown({ discard_unsaved: true });
    }
    const final = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(final.ok, true);
    if (final.ok) { assert.equal(final.session.getConfirmationView().cards.length, 0); await final.session.shutdown({ discard_unsaved: true }); }
    const file = JSON.parse(await readFile(join(h.dir, "turn_fixture", "save.json"), "utf8")) as { snapshot: { legal_statuses: { character_id: string; status: string }[] }; interaction_metadata: { pending_confirmations: { status: string; terminal_reason?: string }[] } };
    assert.equal(file.snapshot.legal_statuses.find(l => l.character_id === BRENNA)?.status, "free", "the mutation and the terminal state are in the SAME file");
    assert.deepEqual(file.interaction_metadata.pending_confirmations.map(r => [r.status, r.terminal_reason]), [["confirmed", "player_confirmed"]]);
  } finally { await done(h); }
});

// ------------------------------------------------------------------------------------------------ authority invariant
test("A17: the intent stage NEVER emits a legal-status command from text: across many phrasings, runtime commands carry no manumit/set_legal_status/transfer_person", async () => {
  const h = await harness({ setup: [maren(), heldBy(BRENNA), heldBy(MAREN)] });
  try {
    const snapshot = h.campaign.exportSnapshot();
    const base = { world: h.world, snapshot, base_revision: snapshot.revision, prepare: (p: unknown) => h.campaign.prepare(p), plan: () => ({ participants: [], turn: undefined, addressed: [] }) as never, finalized: [] } as unknown as IntentStageInput;
    for (const text of [FREE_BRENNA, "I hereby free you, Maren.", "You are free now, Brenna. No one owns you.", "*grants Brenna her freedom*", "I manumit you, Brenna.", "I sell you to nobody.", "Brenna, you are my slave no more."]) {
      const resolved = resolveTurnIntent({ ...base, player_input: text });
      const kinds = resolved.intent.runtime.map(c => c.kind);
      for (const forbidden of ["manumit", "set_legal_status", "transfer_person"]) assert.ok(!kinds.includes(forbidden as never), `${forbidden} from: ${text}`);
    }
  } finally { await done(h); }
});
test("A18: the Controller cannot propose any legal-status mutation (its schema has no such kind)", () => {
  const kinds = JSON.stringify(CONTROLLER_SCHEMA);
  for (const forbidden of ["manumit", "set_legal_status", "transfer_person", "accept_trade_offer"]) assert.ok(!kinds.includes(`"${forbidden}"`), forbidden);
});
test("A19: Actual Offer Accept and the NPC+ Promote action keep their own explicit authority: neither touches the confirmation log", async () => {
  const source = await readFile("src/app/game-session.ts", "utf8");
  for (const method of ["acceptTradeOffer", "completeHeartstoneRite"]) {
    const start = source.indexOf(`  ${method}(`), end = source.indexOf("\n  }\n", start);
    assert.ok(start > 0 && end > start, method);
    assert.doesNotMatch(source.slice(start, end), /#confirmations|PendingConfirmation|confirmPending/, `${method} must not be migrated to PendingConfirmation`);
  }
});
test("A20: the audit guard is registered as an issue kind and the pending claim path never touches state (auditNarration is pure over a pending proposal)", async () => {
  const h = await harness();
  try {
    const snapshot = h.campaign.exportSnapshot(), context = buildTurnContext(h.world, snapshot);
    const issues = auditNarration({ narration: "Brenna is now free.", context, world: h.world, access: projectKnowledgeAccess(context, undefined), evidence: deriveTurnEvidence({ candidates: [], runtime: [] }, "Brenna is now free.", context), diagnostics: [], committed: [], prepared: snapshot,
      pending: [{ kind: "manumission", subject_id: BRENNA, actor_id: "nicco", payload: { holder_id: "nicco", documentation: "unestablished" } }] }).filter(i => i.kind === "uncommitted_pending_confirmation");
    assert.equal(issues.length, 1);
    assert.match(issues[0]!.correction, /still legally enslaved/);
    assert.equal(h.campaign.revision, snapshot.revision);
  } finally { await done(h); }
});
void NARRATION;

// ------------------------------------------------------------------------------------------------ Block 4 interaction (turn_key) and entry-point audit
test("A21: turn_key replay after a save and a reload: still zero provider calls, still ONE pending record, and the receipt and the pending record became durable together", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const ref = cards(h)[0]!.ref;
    assert.equal((await h.session.save()).ok, true);
    const reloaded = await GameSession.loadCampaign(h.deps, "turn_fixture");
    assert.equal(reloaded.ok, true);
    if (reloaded.ok) {
      const count = calls(h), s = reloaded.session;
      const replay = await s.submitPlayerInput(FREE_BRENNA, { turn_key: key(1), expected_revision: s.getView().session.revision });
      assert.equal(replay.ok && replay.replayed, true);
      assert.equal(calls(h), count, "the stored receipt answers; no provider is called");
      assert.deepEqual(s.getConfirmationView().cards.map(c => c.ref), [ref], "no duplicate pending after a replay");
      await s.shutdown({ discard_unsaved: true });
    }
  } finally { await done(h); }
});
test("A22: Confirm idempotency is by ref/status, separate from turn_key: replaying the ORIGINAL key after Confirm neither re-creates the card nor re-frees", async () => {
  const h = await harness();
  try {
    await say(h, 1, FREE_BRENNA);
    const ref = cards(h)[0]!.ref, revision = h.campaign.revision;
    assert.equal(h.session.confirmPending({ ref, expected_revision: revision }).ok, true);
    const count = calls(h), after = h.campaign.revision;
    const replay = await h.session.submitPlayerInput(FREE_BRENNA, { turn_key: key(1), expected_revision: revision });
    assert.equal(replay.ok && replay.replayed, true);
    assert.equal(calls(h), count);
    assert.equal(cards(h).length, 0, "the replay executes nothing, so it proposes nothing");
    assert.equal(h.campaign.revision, after); assert.equal(manumissions(h), 1);
    // A NEW turn with the same words after the person is already free proposes nothing (the act is no longer possible).
    await say(h, 2, FREE_BRENNA);
    assert.equal(cards(h).length, 0);
  } finally { await done(h); }
});
test("A23: concurrent submissions of the same turn_key run once and create one pending record", async () => {
  let open = () => {}; const hold = new Promise<void>(r => { open = r; });
  const dir = await mkdtemp(join(tmpdir(), "block5a-auth1-"));
  const narrator = stepNarrator([{ text: "Brenna goes very still." }], () => hold), controller = countingController([]);
  const h = sessionWith(narrator, controller, { save_dir: dir, autosave: false, setup: campaign => campaign.apply({ expected_revision: campaign.revision, commands: [heldBy(BRENNA)] }) });
  try {
    const revision = h.campaign.revision;
    const first = h.session.submitPlayerInput(FREE_BRENNA, { turn_key: key(1), expected_revision: revision });
    const second = h.session.submitPlayerInput(FREE_BRENNA, { turn_key: key(1), expected_revision: revision });
    open(); await Promise.all([first, second]);
    assert.equal(narrator.calls(), 1);
    assert.equal(h.session.getConfirmationView().cards.length, 1);
  } finally { await h.session.shutdown({ discard_unsaved: true }); await rm(dir, { recursive: true, force: true }); }
});
test("A24: entry-point audit: the only production code that builds a `manumit` command is the confirm-time builder; legal-status mutation by text has no other path", async () => {
  const { readdir } = await import("node:fs/promises");
  const walk = async (dir: string): Promise<string[]> => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(e => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))).flat();
  const files = (await walk("src")).filter(f => f.endsWith(".ts") && !f.startsWith(join("src", "campaign")) && !f.startsWith(join("src", "dev")));
  const holders = { manumit: [] as string[], set_legal_status: [] as string[], transfer_person: [] as string[] };
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const kind of Object.keys(holders) as (keyof typeof holders)[]) if (new RegExp(`kind: "${kind}"`).test(text)) holders[kind].push(file.replaceAll("\\", "/"));
  }
  assert.deepEqual(holders.manumit, ["src/turn/authorization/pending-proposals.ts"], "manumit is built only for the deterministic confirm command");
  // The remaining two are the Actual Offer plan builders (settled only by the explicit Accept), never a text-to-state shortcut.
  assert.deepEqual(holders.set_legal_status, ["src/turn/commerce/person-offers.ts"]);
  assert.deepEqual(holders.transfer_person, ["src/turn/commerce/person-offers.ts"]);
});

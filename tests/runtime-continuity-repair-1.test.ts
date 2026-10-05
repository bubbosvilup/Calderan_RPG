import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { playerIntent } from "../src/turn/player-intent.js";
import { projectKnowledgeAccess } from "../src/turn/narrative-authority.js";
import { auditNarration } from "../src/turn/narration-audit.js";
import { deriveTurnEvidence } from "../src/turn/turn-evidence.js";
import { authorizeCommands } from "../src/turn/command-authorizer.js";
import { narratedDepartures } from "../src/turn/scene-departure.js";
import { playerAuthoredEvents } from "../src/turn/player-authored-events.js";
import { RecentConversation, RECENT_CONVERSATION_TURNS, type RecentExchange } from "../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { parseControllerProposal } from "../src/llm/controller-schema.js";
import type { NarratorProvider } from "../src/llm/narrator-provider.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Runtime Continuity Repair 1: recent-conversation window, temporary participant departure, player-authored event authority and
 * grounding guards. Scenario and phrasing are the Calderan Long-Form Narrator Trial 1 failures (Gatherer's Inn, Jessa Rook,
 * the evaluation-only patron Dell Harrow, Captain Doran Hale). Offline only: no LLM is called.
 */
const world = await loadWorld("data");
const DELL = "campaign_character_eval_dell_harrow";
const registerDell: CampaignCommand = { kind: "register_character", character: { id: DELL, origin: { kind: "created" },
  profile: { name: "Dell Harrow", age: { kind: "exact", years: 38 }, sex: "male", species: "Human", appearance: { description: "A thick-armed dockworker in a salt-stained coat." } },
  current: { current_location: "gatherers_inn", status: "active", presentation: "Sour-tempered and loud after a long shift." } } };
let serial = 0;
function inn(options: { dell?: boolean; doran?: boolean } = {}): CampaignState {
  const campaign = createOpeningCampaign(world, `continuity_repair_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "gatherers_inn",
    ...(options.doran ? { character_movements: [{ character_id: "captain_doran_hale", current_location: "gatherers_inn" }] } : {}) } }, ...(options.dell === false ? [] : [registerDell])] });
  return campaign;
}
const contextOf = (c: CampaignState) => buildTurnContext(world, c.exportSnapshot());
const leave: CampaignCommand = { kind: "leave_scene", character_id: DELL };
function audit(c: CampaignState, input: string, narration: string, extra: { committed?: readonly CampaignCommand[]; recent?: readonly RecentExchange[]; authoritative_text?: string } = {}) {
  const snapshot = c.exportSnapshot(), context = buildTurnContext(world, snapshot), intent = playerIntent(input, context, snapshot, world);
  const prepared = extra.committed?.length ? c.prepare({ expected_revision: c.revision, commands: [...extra.committed] }).snapshot : snapshot;
  return auditNarration({ narration, context, world, access: projectKnowledgeAccess(context, {}), evidence: deriveTurnEvidence(intent, narration, context), diagnostics: [], committed: extra.committed ?? [], prepared, player_input: input,
    recent: extra.recent ?? [], authoritative_text: extra.authoritative_text ?? JSON.stringify({ context }) });
}
const kinds = (issues: readonly { kind: string }[]) => issues.map(i => i.kind);
function narrator(texts: readonly string[], seen: GenerationRequest[] = []): NarratorProvider {
  let i = 0;
  return { async generate() { throw new Error("unused"); }, async *stream(request) { seen.push(request); const text = texts[Math.min(i++, texts.length - 1)]!; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } };
}
function coordinatorFor(texts: readonly string[], commands: readonly CampaignCommand[] = [], seen: GenerationRequest[] = []) {
  const service = new RetrievalService(world);
  return new TurnCoordinator(world, narrator(texts, seen), { async propose() { return { commands: [...commands], ...metadata }; } }, { service, search: new HybridSearch(service) });
}
async function turn(coordinator: TurnCoordinator, campaign: CampaignState, input: string): Promise<TurnResult> {
  const events = await collect(coordinator.runTurn({ campaign, player_input: input }));
  const last = events.at(-1)!; assert.equal(last.type, "turn_completed", JSON.stringify(last));
  return (last as { result: TurnResult }).result;
}
const ex = (n: number, size = 40): RecentExchange => ({ player: `player ${n} ${"p".repeat(size)}`, narration: `narration ${n} ${"n".repeat(size)}`, status: "finalized" });

// ------------------------------------------------------------------------------------------------ recent conversation
test("recent 1: twelve ordinary turns remain available, in exact order", () => {
  assert.equal(RECENT_CONVERSATION_TURNS, 12);
  const recent = new RecentConversation();
  for (let n = 1; n <= 12; n++) recent.add(ex(n));
  assert.deepEqual(recent.forPrompt().map(e => e.player.split(" ")[1]), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
});
test("recent 2: turn 13 evicts the oldest when there is no budget pressure", () => {
  const recent = new RecentConversation();
  for (let n = 1; n <= 13; n++) recent.add(ex(n));
  assert.equal(recent.entries().length, 12);
  assert.equal(recent.entries()[0]!.player.split(" ")[1], "2"); assert.equal(recent.entries().at(-1)!.player.split(" ")[1], "13");
});
test("recent 2b: a failed exchange never displaces a completed one (live validation T15 finding)", () => {
  const recent = new RecentConversation();
  for (let n = 1; n <= 14; n++) recent.add(n === 10 ? { player: `player ${n}`, narration: "", status: "state_failed" } : ex(n));
  assert.equal(recent.forPrompt().length, 12);
  assert.deepEqual(recent.forPrompt().map(e => Number(e.player.split(" ")[1])), [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14]);
});
test("recent 3: budget pressure evicts oldest complete turns; no exchange is ever cut; order is kept", () => {
  const recent = new RecentConversation();
  for (let n = 1; n <= 12; n++) recent.add(ex(n, 1_400)); // ~2.9k characters per exchange: 16k budget holds five
  const kept = recent.entries();
  assert.ok(kept.length < 12 && kept.length >= 4, `kept ${kept.length}`);
  assert.ok(recent.serializedLength() <= recent.max_characters);
  assert.deepEqual(kept.map(e => Number(e.player.split(" ")[1])), Array.from({ length: kept.length }, (_, i) => 13 - kept.length + i));
  for (const e of kept) { assert.equal(e.player.length, `player ${e.player.split(" ")[1]} `.length + 1_400); assert.ok(e.narration.endsWith("n".repeat(1_400))); }
  // An exchange that alone exceeds the budget is not stored (never truncated).
  recent.add({ player: "huge", narration: "x".repeat(17_000), status: "finalized" });
  assert.ok(!recent.entries().some(e => e.player === "huge"));
});
test("recent 4: only delivered narration is stored; rejected drafts, revisions and failed turns never enter history", async () => {
  const campaign = inn();
  // Draft narrates an uncommitted departure (audit issue) → revision is delivered. History holds the revision, not the draft.
  const coordinator = coordinatorFor(["Dell grumbles, slaps down his coat and walks out into the night.", "Dell grumbles and glares at the door, but stays on his stool."]);
  const result = await turn(coordinator, campaign, "*Nicco keeps eating.*");
  assert.equal(result.narration_reconciliation?.delivered, "revision");
  assert.deepEqual(coordinator.recent(campaign).entries().map(e => e.narration), ["Dell grumbles and glares at the door, but stays on his stool."]);
  // A failed turn after narration records only what was shown (nothing), never the undelivered draft.
  const failing = new TurnCoordinator(world, narrator(["Jessa sets down a bowl of stew."]), { async propose() { throw new Error("controller down"); } }, { service: new RetrievalService(world), search: new HybridSearch(new RetrievalService(world)) });
  const events = await collect(failing.runTurn({ campaign, player_input: "Is the stew good?" }));
  assert.equal(events.at(-1)!.type, "turn_failed");
  assert.deepEqual(failing.recent(campaign).entries().map(e => [e.status, e.narration]), [["state_failed", ""]]);
  assert.deepEqual(failing.recent(campaign).forPrompt(), []);
});
test("recent 5: campaign isolation and the prompt carries all twelve delivered exchanges in order", async () => {
  const a = inn({ dell: false }), b = inn({ dell: false }), seen: GenerationRequest[] = [];
  const coordinator = coordinatorFor(["Jessa nods."], [], seen);
  for (let n = 1; n <= 13; n++) await turn(coordinator, a, `Question number ${n}?`);
  await turn(coordinator, b, "Only question in b?");
  assert.equal(coordinator.recent(a).entries().length, 12); assert.equal(coordinator.recent(b).entries().length, 1);
  const last = JSON.stringify(seen.at(-2)!.messages); // campaign a, turn 13: turns 1..12 replayed, oldest first
  for (let n = 1; n <= 12; n++) assert.ok(last.includes(`Question number ${n}?`), `turn ${n}`);
  assert.ok(last.indexOf("Question number 1?") < last.indexOf("Question number 12?"));
  assert.ok(!JSON.stringify(seen.at(-1)!.messages).includes("Question number"));
});

// ------------------------------------------------------------------------------------------------ departure
const POSITIVE = ["Dell walks out.", "Dell leaves the inn.", "Dell glares at Nicco. He steps through the door and leaves.", "Dell heads outside.", "Dell disappears into the street.", "Dell is gone.",
  "Dell Harrow had settled his tab and left with minimal further provocation.", "Dell grabs his coat. The door banged shut behind him.",
  "Dell muttered something and fished coins from his coat. He glared at Nicco, then at Doran. He pulled his coat tighter and shouldered through the door into the street."];
const NEGATIVE = ["Dell threatens to leave.", "\"You should leave,\" Jessa tells Dell.", "Dell looks toward the door.", "Dell starts toward the door.", "If Dell leaves, the room will settle.",
  "Dell doesn't leave.", "Dell turns for the door.", "Jessa tells Dell to walk out.", "Dell's patience is gone.", "Dell stumbles out of his chair.", "The common room had gone quiet.", "Dell will leave soon.",
  "Dell is about to walk out.", "Jessa watches Dell as if he might leave."];
test("departure 1: completed exits are evidence; threats, invitations, movement toward the door, conditionals and negations are not", () => {
  const context = contextOf(inn({ doran: true }));
  for (const text of POSITIVE) assert.deepEqual(narratedDepartures(text, context).map(d => d.character_id), [DELL], text);
  for (const text of NEGATIVE) assert.deepEqual(narratedDepartures(text, context), [], text);
  // Pronoun resolution follows the nearest named subject: Doran (canonical) leaving is not Dell leaving.
  assert.deepEqual(narratedDepartures("Doran nods to Jessa. He walks out.", context), []);
});
test("departure 2: a present temporary NPC leaves through controller proposal + narration evidence; the record stays", async () => {
  const campaign = inn(), coordinator = coordinatorFor(["Dell drains the last of his ale, shrugs into his coat and walks out into the night."], [leave]);
  const result = await turn(coordinator, campaign, "*Nicco watches him.*");
  assert.deepEqual(result.authorization.map(a => [a.command.kind, a.authorized, a.reason]), [["leave_scene", true, "authorized_narrative_confirmation"]]);
  assert.equal(result.narration_reconciliation?.delivered, "draft");
  const dell = campaign.exportSnapshot().characters.find(c => c.id === DELL)!;
  assert.equal(dell.current.current_location, undefined); assert.equal(dell.profile.name, "Dell Harrow");
  assert.ok(!contextOf(campaign).characters.some(c => c.id === DELL));
});
test("departure 3: an absent temporary NPC cannot leave again; canonical and unknown characters cannot use leave_scene", () => {
  const campaign = inn();
  campaign.apply({ expected_revision: campaign.revision, commands: [leave] });
  assert.throws(() => campaign.prepare({ expected_revision: campaign.revision, commands: [leave] }), /not present/);
  assert.throws(() => campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "leave_scene", character_id: "jessa_rook" }] }), /created/);
  assert.throws(() => campaign.prepare({ expected_revision: campaign.revision, commands: [{ kind: "leave_scene", character_id: "campaign_character_nobody" }] }));
  assert.throws(() => campaign.prepare({ expected_revision: campaign.revision - 1, commands: [leave] })); // stale revision
  const context = contextOf(campaign), snapshot = campaign.exportSnapshot();
  const ev = deriveTurnEvidence(playerIntent("hm", context, snapshot, world), "Dell walks out.", context);
  assert.deepEqual(authorizeCommands([leave, { kind: "leave_scene", character_id: "jessa_rook" }], ev, context, snapshot).map(d => d.reason), ["rejected_reference_invalid", "rejected_reference_invalid"]);
  assert.deepEqual(parseControllerProposal(JSON.stringify({ commands: [leave] })), [leave]); // controller vocabulary
});
test("departure 4: leave_scene requires exact departure evidence in the narration", async () => {
  for (const text of ["Dell glares at Nicco and orders another ale.", "Dell starts toward the door, then thinks better of it and sits.", "\"Get out,\" Jessa tells Dell."]) {
    const campaign = inn(), result = await turn(coordinatorFor([text], [leave]), campaign, "*Nicco sips his drink.*");
    assert.deepEqual(result.authorization.map(a => [a.authorized, a.reason]), [[false, "rejected_insufficient_confirmation"]], text);
    assert.equal(campaign.exportSnapshot().characters.find(c => c.id === DELL)!.current.current_location, "gatherers_inn");
  }
});
test("departure 5 (long-form regression): Dell leaves at N; absent from state at N+1; narrator context never lists him; no resurrection", async () => {
  const campaign = inn({ doran: true }), seen: GenerationRequest[] = [];
  const coordinator = coordinatorFor(["Dell muttered something under his breath and fished coins from his coat. He glared at Nicco, then at Doran. He pulled his coat tighter and shouldered through the door into the street."], [leave], seen);
  await turn(coordinator, campaign, "What happens to him now?");
  assert.ok(!contextOf(campaign).characters.some(c => c.id === DELL)); // N+1 scene state
  // N+1: nothing re-adds him; N+2 narrator context does not list him as present.
  const later = coordinatorFor(["Jessa wipes the counter where Dell had been sitting."], [], seen);
  await turn(later, campaign, "Sorry about the mess. I'll help clean it up if you like.");
  await turn(later, campaign, "Thank you for dinner.");
  const prompt = seen.at(-1)!.messages[0]!.content;
  const present = prompt.slice(prompt.indexOf("[PRESENT AND ABLE TO REACT]"), prompt.indexOf("Only these people exist here"));
  assert.ok(!present.includes("Dell") && present.includes(narratorIdentityGate(contextOf(campaign))!.identities.get("jessa_rook")!.observable_label), present);
  assert.ok(!contextOf(campaign).characters.some(c => c.id === DELL));
  // Narration that brings him back ("sat hunched and brooding") is an absent participant; remembering his exit is fine.
  assert.ok(kinds(audit(campaign, "Thank you for dinner.", "Nearby, Dell Harrow sat hunched and brooding at the counter.")).includes("absent_participant"));
  assert.deepEqual(kinds(audit(campaign, "Thank you for dinner.", "Jessa wipes the spot where Dell had been sitting.")), []);
});
test("departure 6: a narrated exit without a committed leave_scene is reconciled (the patron is still here)", () => {
  const campaign = inn();
  assert.ok(kinds(audit(campaign, "*Nicco sits back.*", "Dell pulled his coat tighter and shouldered through the door into the street.")).includes("uncommitted_departure"));
  assert.deepEqual(kinds(audit(campaign, "*Nicco sits back.*", "Dell pulled his coat tighter and shouldered through the door into the street.", { committed: [leave] })), []);
});

// ------------------------------------------------------------------------------------------------ player-authored events
const GRAB = "*The man gets up, stumbles against Nicco's stool and grabs his arm hard, knocking Nicco's cup over and spilling it across the counter.*";
const SHOVE = "*When the man shoves him in the chest, Nicco keeps his feet and moves so the counter is between them.* Jessa, is there anyone we can call for this?";
test("player 1: the long-form inputs resolve to authored grab, spill and shove events (actor Dell, target Nicco)", () => {
  const context = contextOf(inn());
  const grab = playerAuthoredEvents(GRAB, context);
  assert.ok(grab.some(e => e.action_class === "grab" && e.actor_id === DELL && e.target_id === "nicco" && !e.negated), JSON.stringify(grab));
  assert.ok(grab.some(e => e.action_class === "spill" && !e.negated));
  assert.ok(playerAuthoredEvents(SHOVE, context).some(e => e.action_class === "shove" && e.actor_id === DELL && e.target_id === "nicco" && !e.negated));
  const negated = playerAuthoredEvents("*Dell doesn't grab Nicco, and Nicco doesn't hit back.*", context);
  assert.ok(negated.length > 0 && negated.every(e => e.negated), JSON.stringify(negated));
});
test("player 2: explicit grab, shove and spill are preserved (the exact live drafts that were softened)", () => {
  const campaign = inn();
  assert.deepEqual(kinds(audit(campaign, GRAB, "Dell's grip tightens on Nicco's arm, his thick fingers digging in as the overturned cup rolls off the counter edge and ale spreads in a thin sheet across the wood.")), []);
  assert.deepEqual(kinds(audit(campaign, GRAB, "Dell's fingers close hard around Nicco's sleeve as the cup goes over.")), []);
  assert.deepEqual(kinds(audit(campaign, SHOVE, "The shove caught Nicco square in the chest but he braced against the counter edge and stayed upright, putting the length of the bar between himself and the dockworker.")), []);
  assert.deepEqual(kinds(audit(campaign, GRAB, "Nicco's cup tips and falls, ale spilling across the counter and dripping to the floor.")), []);
  // Without the authored act, the same restraint is still an uncommitted narrator consequence.
  assert.ok(kinds(audit(campaign, "*Nicco sips his ale.*", "Dell's grip tightens on Nicco's arm, his thick fingers digging in.")).includes("uncommitted_constraint"));
});
test("player 3: an explicit injury is preserved as authored; added severe consequences are rejected", () => {
  const campaign = inn();
  const CUT = "*Dell's knife cuts Nicco's forearm.*";
  assert.deepEqual(kinds(audit(campaign, CUT, "Blood wells from the shallow cut on Nicco's forearm.")), []);
  assert.ok(kinds(audit(campaign, CUT, "Nicco's hand is severed at the wrist.")).includes("uncommitted_condition"));
  assert.ok(kinds(audit(campaign, "*Dell grabs Nicco's wrist.*", "Nicco's wrist breaks with a sharp crack.")).includes("uncommitted_condition"));
  assert.ok(kinds(audit(campaign, "*Dell shoves Nicco.*", "Nicco is knocked unconscious.")).includes("uncommitted_condition"));
  assert.ok(kinds(audit(campaign, "*Dell grabs Nicco.*", "Dell pins Nicco to the floor.")).includes("uncommitted_constraint"));
  assert.ok(kinds(audit(campaign, "*Dell shoves Nicco.*", "Nicco falls hard to the floor.")).includes("uncommitted_condition")); // knockdown not authored
});
test("player 4: negated or movement-only player text authorizes nothing", () => {
  const campaign = inn();
  assert.ok(kinds(audit(campaign, "*Dell doesn't grab Nicco.*", "Dell grabs Nicco's arm and holds it.")).includes("uncommitted_constraint"));
  assert.ok(kinds(audit(campaign, "*Dell moves toward the door.*", "Dell has left the inn.")).includes("uncommitted_departure"));
  assert.deepEqual(kinds(audit(campaign, "*Dell walks out of the inn.*", "Dell walks out of the inn without a word.")), []); // player-authored exit is restated
});
test("player 5: the revision outcome keeps player-authored events and no longer calls them unrecordable", () => {
  const campaign = inn();
  const coordinator = coordinatorFor(["Dell pins Nicco to the counter.", "Dell's fingers close hard around Nicco's arm as the cup goes over."]);
  return turn(coordinator, campaign, GRAB).then(result => {
    assert.equal(result.narration_reconciliation?.delivered, "revision");
    assert.equal(result.narration, "Dell's fingers close hard around Nicco's arm as the cup goes over.");
  });
});

// ------------------------------------------------------------------------------------------------ grounding
test("grounding 1: unsupported exact prices are caught; supported and qualitative prices are allowed", () => {
  const campaign = inn();
  for (const text of ["\"Three coppers for the bowl,\" Jessa says.", "\"That'll be two copper bits.\"", "\"Four coppers, then the door.\"", "\"It's a copper for the stew.\""])
    assert.ok(kinds(audit(campaign, "How much?", text)).includes("invented_price"), text);
  assert.deepEqual(kinds(audit(campaign, "How much?", "\"Three coppers for the bowl,\" Jessa says.", { authoritative_text: "A bowl of stew costs three coppers at the Gatherer's Inn." })), []);
  assert.deepEqual(kinds(audit(campaign, "I'll pay three coppers for the bowl.", "\"Three coppers it is,\" Jessa says.")), []);
  for (const text of ["\"It's a cheap meal,\" Jessa says.", "\"Prices are fair here. Stew's modest.\"", "Dell fumbled a few coins onto the counter.", "\"More than usual, tonight.\"", "Two copper pots hang by the hearth."])
    assert.deepEqual(kinds(audit(campaign, "How much?", text)), [], text);
});
test("grounding 2: unscaffolded active staff are caught; ambient patrons are allowed", () => {
  const campaign = inn({ doran: true });
  for (const text of ["A serving woman brings the food.", "The inn's bouncer grabs Dell by the collar.", "Doran speaks to one of Jessa's employees.", "Captain Doran Hale stood near the door speaking quietly with one of the serving staff.", "The common room had gone quieter, and the serving woman near the kitchen door stopped where she stood."])
    assert.ok(kinds(audit(campaign, "Evening.", text)).includes("absent_participant"), text);
  for (const text of ["Low conversation drifts from the other patrons.", "Someone at a distant table laughs.", "A couple at a far table put down their cups."])
    assert.deepEqual(kinds(audit(campaign, "Evening.", text)), [], text);
  assert.deepEqual(kinds(audit(campaign, "*Nicco waves to the serving woman.*", "The serving woman nods back.")), []); // player-authored
});
test("grounding 3: fabricated prior payments and conversations are caught; supported earlier agreements are allowed", () => {
  const campaign = inn();
  const recent: RecentExchange[] = [{ player: "I used to work with plants and herbs, before I came here.", narration: "Jessa nods. \"Herbs, then.\"", status: "finalized" },
    { player: "Let's make a deal: I bring you fresh roots tomorrow.", narration: "\"Deal,\" Jessa says.", status: "finalized" }];
  assert.ok(kinds(audit(campaign, "Thanks.", "\"Room's paid through tonight,\" Jessa says.", { recent })).includes("fabricated_prior_event"));
  assert.ok(kinds(audit(campaign, "Thanks.", "\"You've already paid for the week.\"", { recent })).includes("fabricated_prior_event"));
  assert.ok(kinds(audit(campaign, "Thanks.", "\"You told me you were a soldier.\"", { recent })).includes("fabricated_prior_event"));
  assert.deepEqual(kinds(audit(campaign, "Thanks.", "\"As we agreed, the roots come tomorrow,\" Jessa says.", { recent })), []);
  assert.deepEqual(kinds(audit(campaign, "Thanks.", "\"You told me you worked with herbs.\"", { recent })), []);
  assert.deepEqual(kinds(audit(campaign, "I already paid for the room, right?", "\"You paid for the room already, yes,\" Jessa says.", { recent })), []);
  assert.deepEqual(kinds(audit(campaign, "Thanks.", "\"Have you paid for the room yet?\"", { recent })), []); // a question is not an assertion
});
test("grounding 4: unsupported hard legal procedure is caught; qualitative law-enforcement judgments are allowed", () => {
  const campaign = inn({ doran: true });
  for (const text of ["\"That's drunk and disorderly, maybe minor assault if you wanted to press it.\"", "\"If you're not hurt and you don't want to file a complaint, that's the end of it.\"",
    "\"Unless there is blood drawn or broken property, the Guard does not crowd the cells.\"", "\"Step outside and walk it off before I decide this warrants a holding cell at the post.\"", "\"The law requires three nights in a cell.\""])
    assert.ok(kinds(audit(campaign, "What happens to him now?", text)).includes("invented_procedure"), text);
  for (const text of ["\"That's enough to bring the Guard into it,\" Hale says.", "\"I can remove him from the inn.\"", "Hale doesn't think the matter warrants further action.", "\"He's done here tonight.\""])
    assert.deepEqual(kinds(audit(campaign, "What happens to him now?", text)), [], text);
});
test("grounding 5: the delivered long-form turns now carry their defects as audit issues (GLM T16, Gemini T17 latch)", () => {
  const campaign = inn({ doran: true });
  const glm16 = "Doran watched him go, then turned back to Nicco. \"Spilled drink, grabbed arm, shoved. That's drunk and disorderly, maybe minor assault if you wanted to press it.\"\n\n\"You heard her. Four coppers, then the door.\"";
  const found = kinds(audit(campaign, "What happens to him now? I don't want him punished for more than he actually did.", glm16));
  assert.ok(found.includes("invented_procedure") && found.includes("invented_price"), found.join());
  // The latch falling back into place is not a person's knockdown (the Gemini T17 false positive).
  assert.deepEqual(kinds(audit(campaign, "Sorry about the mess.", "The captain watched him go until the latch fell back into place, then turned to give Jessa Rook a brief, recognizing nod.")), []);
});

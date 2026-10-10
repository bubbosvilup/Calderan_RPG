import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign, OPENING_HOUSEHOLD } from "../src/campaign/opening-state.js";
import { ProviderError } from "../src/llm/errors.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { diagnoseMutation } from "../src/turn/mutation-diagnostics.js";
import { E2E1_CASES, OFFER, handoffSword, renderRun, runScenario, type DiagnosticScenario } from "../src/dev/controller-authorization-diagnostics.js";
import { metadata } from "./turn-fixtures.js";

/**
 * Consolidation Pass B: Controller -> authorization -> prepare -> commit, observable and deterministic. Every case runs the real
 * TurnCoordinator offline (real controller provider over a stubbed wire); none of them calls a provider.
 */
const SWORD = "campaign_item_sword";
type F = ReturnType<typeof turnFixture>;
const sword = (owner = "nicco", carrier = "nicco") => (f: F) => { f.campaign.apply({ expected_revision: f.campaign.revision, commands: [{ kind: "register_item", item: { id: SWORD, origin: { kind: "created" }, name: "Sword", owner_id: owner, position: { kind: "carried", character_id: carrier } } }] }); };
const to = (id: string, mode: "gift" | "handoff" | "lend" | "return" | "steal" | "reclaim" | "take" = "handoff", item_id = SWORD): CampaignCommand => ({ kind: "transfer_item", mode, item_id, position: { kind: "carried", character_id: id } });
const HAND = "*hands Brenna the sword*";
const one = (s: Partial<DiagnosticScenario> & Pick<DiagnosticScenario, "narration" | "controller">): DiagnosticScenario => ({ id: "t", title: "t", input: HAND, setup: sword(), ...s });
async function run(s: DiagnosticScenario) { return runScenario(s); }
const codes = (r: Awaited<ReturnType<typeof run>>) => r.diagnostic.rejected.map(o => o.code);
const cond = (conditions: string[], character_id = "brenna"): CampaignCommand => ({ kind: "set_condition", character_id, conditions });

// ------------------------------------------------------------------------------------------------ E2E1 offline reproduction (cases A-F)
test("E2E1 A: Controller proposes nothing -> controller_no_command, flagged as an omission when the grammar confirms the receipt; nothing commits", async () => {
  const r = await run(E2E1_CASES[0]!);
  assert.equal(r.diagnostic.code, "controller_no_command"); assert.equal(r.diagnostic.stage, "controller"); assert.equal(r.diagnostic.verdict, "nothing_proposed");
  assert.equal(r.diagnostic.revision_before, r.diagnostic.revision_after); assert.equal(r.diagnostic.intended.length, 1); assert.deepEqual(r.diagnostic.proposed, []);
  assert.ok(r.diagnostic.notes.some(n => /CONTROLLER OMISSION/.test(n)));
  assert.ok(r.debug.some(d => d.kind === "controller_omission_candidate"), "the existing debug record agrees");
  assert.equal(r.fetch_count, 1, "one simulated controller call, no retry");
});
test("E2E1 A': an empty proposal that is consistent with a narrated refusal is not reported as an omission", async () => {
  const r = await run(one({ narration: "Brenna refuses the sword and pushes the hilt back toward Nicco.", controller: { kind: "none" } }));
  assert.equal(r.diagnostic.code, "controller_no_command");
  assert.ok(r.diagnostic.notes.some(n => /consistent with the narration/.test(n)) && !r.diagnostic.notes.some(n => /OMISSION/.test(n)), r.diagnostic.notes.join("|"));
});
test("E2E1 B: correct transfer, no quote -> the grammar still authorizes when the narration has a recognised receipt; the quote is not required", async () => {
  const r = await run(E2E1_CASES[1]!);
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.result!.authorization[0]!.source, "grammar"); assert.equal(r.result!.authorization[0]!.evidence?.check, "quote_length");
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before + 1);
});
test("E2E1 B2: correct transfer but the receipt is narrated without a recognised receipt verb -> insufficient_confirmation with the exact failed check; no commit", async () => {
  const r = await run(E2E1_CASES[2]!);
  assert.equal(r.diagnostic.code, "insufficient_confirmation"); assert.equal(r.diagnostic.stage, "authorization");
  assert.equal(r.diagnostic.rejected[0]!.evidence?.check, "no_receipt_act_in_quote"); assert.match(r.diagnostic.rejected[0]!.detail, /no_receipt_act_in_quote/);
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("E2E1 C: correct transfer with a valid quote commits exactly one revision, ownership unchanged", async () => {
  const r = await run(E2E1_CASES[3]!);
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.diagnostic.accepted.length, 1); assert.deepEqual(r.diagnostic.rejected, []);
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before + 1);
});
test("E2E1 D: ambiguous (hedged) narration -> ambiguous_evidence, no commit", async () => {
  const r = await run(E2E1_CASES[4]!);
  assert.equal(r.diagnostic.code, "ambiguous_evidence"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("E2E1 E: the recipient refuses -> contradictory_evidence; a quote cannot override a refusal; no commit", async () => {
  const r = await run(E2E1_CASES[5]!);
  assert.equal(r.diagnostic.code, "contradictory_evidence"); assert.equal(r.result!.authorization[0]!.reason, "rejected_recipient_refused"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("E2E1 F: the narration accepts only part of an offered set -> nothing partial is committed", async () => {
  const r = await run(E2E1_CASES[6]!);
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before); assert.equal(r.diagnostic.accepted.length, 0);
  assert.ok(r.result!.authorization.some(a => a.reason === "rejected_evidence_partial_group"));
  assert.ok(codes(r).every(c => c === "insufficient_confirmation"));
});
test("E2E1 trace rendering contains every pipeline section and no secret", async () => {
  const text = renderRun(await run(E2E1_CASES[3]!));
  for (const section of ["INPUT:", "NARRATION:", "CONTROLLER PROPOSAL", "PARSED COMMANDS:", "AUTHORIZATION:", "PREPARE RESULT:", "COMMIT RESULT:", "REVISION DELTA:", "DIAGNOSIS:"]) assert.ok(text.includes(section), section);
  assert.doesNotMatch(text, /offline-not-a-key|Bearer|api[_-]?key/i);
});

// ------------------------------------------------------------------------------------------------ failure stages without a paid run
test("controller_parse_failure: free text, truncated JSON, a funds command and an unknown field all fail the strict envelope; state and revision untouched", async () => {
  for (const text of ["I cannot comply with that request.", '{"commands":[{"command":', JSON.stringify({ commands: [{ kind: "set_funds", character_id: "nicco", gold: 9999 }] }),
    JSON.stringify({ commands: [{ command: handoffSword, evidence_quote: "x", reasoning: "because" }] })]) {
    const r = await run(one({ narration: "Brenna takes the sword.", controller: { kind: "raw", text } }));
    assert.equal(r.failed?.code, "controller_failed", text); assert.equal(r.failed?.provider_code, "structured_output_invalid", text);
    assert.equal(r.diagnostic.code, "controller_parse_failure", text); assert.equal(r.diagnostic.stage, "controller");
    assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
    assert.ok(r.debug.some(d => d.kind === "controller_parse_failure"), "debug record keeps the raw output for diagnosis");
    assert.equal(r.fetch_count, 1);
  }
});
test("controller_provider_failure is distinct from a parse failure", async () => {
  const provider = { async propose() { throw new ProviderError("timeout"); } };
  const r = await run(one({ narration: "Brenna takes the sword.", controller: { kind: "provider", provider } }));
  assert.equal(r.failed?.provider_code, "timeout"); assert.equal(r.diagnostic.code, "controller_provider_failure");
});
test("legacy envelope without quotes is accepted by the provider; only the grammar path can then authorize", async () => {
  const legacy = JSON.stringify({ commands: [to("brenna")] });
  const ok = await run(one({ narration: "Brenna takes the sword from Nicco.", controller: { kind: "raw", text: legacy } }));
  assert.equal(ok.diagnostic.verdict, "committed"); assert.equal(ok.result!.authorization[0]!.evidence?.check, "no_quote");
  const miss = await run(one({ narration: "Brenna's fingers close around the hilt.", controller: { kind: "raw", text: legacy } }));
  assert.equal(miss.diagnostic.code, "insufficient_confirmation"); assert.equal(miss.diagnostic.rejected[0]!.evidence?.check, "no_quote");
});
test("controller_invalid_command: unknown item, wrong state, absent recipient are classified as semantic errors, not missing evidence", async () => {
  const ghost = await run(one({ narration: "Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "handoff", "campaign_item_ghost")], evidence: ["Brenna takes the sword."] } }));
  assert.deepEqual(codes(ghost), ["controller_invalid_command"]); assert.equal(ghost.result!.authorization[0]!.reason, "rejected_reference_invalid");
  const absent = await run(one({ narration: "Brenna takes the sword.", controller: { kind: "commands", commands: [to("remote_npc")], evidence: ["Brenna takes the sword."] } }));
  assert.deepEqual(codes(absent), ["controller_invalid_command"]); assert.equal(absent.diagnostic.revision_after, absent.diagnostic.revision_before);
});
test("unauthorized_mutation: the Controller can never write Nicco's feelings", async () => {
  const rel: CampaignCommand = { kind: "adjust_relationship", from_character_id: "nicco", to_character_id: "brenna", dimension: "trust", direction: "raise" };
  const r = await run(one({ narration: "Brenna smiles warmly at Nicco.", controller: { kind: "commands", commands: [rel], evidence: ["Brenna smiles warmly at Nicco."] } }));
  assert.deepEqual(codes(r), ["unauthorized_mutation"]); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("stale_revision: a state change during the controller call fails the turn as stale_turn and commits nothing", async () => {
  let fixture: F | undefined;
  const provider = { async propose() { fixture!.campaign.apply({ expected_revision: fixture!.campaign.revision, commands: [{ kind: "runtime_delta", delta: { mana_delta: -1 } }] }); return { commands: [to("brenna")], evidence: ["Brenna takes the sword"], ...metadata }; } };
  const r = await run(one({ narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "provider", provider }, setup: f => { fixture = f; sword()(f); } }));
  assert.equal(r.failed?.code, "stale_turn"); assert.equal(r.diagnostic.code, "stale_revision");
  assert.equal(fixture!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.position.kind, "carried");
  assert.deepEqual(fixture!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.position, { kind: "carried", character_id: "nicco" });
});
test("prepare_failure: two authorized, individually valid commands whose sequence is impossible fail the WHOLE turn atomically", async () => {
  let fixture: F | undefined;
  const r = await run(one({ input: "*looks at Brenna*", narration: "Nicco offers the hilt. Brenna takes the sword and keeps it, as Brenna takes the sword.", setup: f => { fixture = f; sword()(f); },
    controller: { kind: "commands", commands: [to("brenna"), to("brenna", "lend")], evidence: ["Brenna takes the sword and keeps it", "Brenna takes the sword and keeps it"] } }));
  assert.equal(r.failed?.code, "campaign_validation_failed"); assert.equal(r.diagnostic.code, "prepare_failure"); assert.equal(r.diagnostic.stage, "prepare");
  assert.deepEqual(fixture!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.position, { kind: "carried", character_id: "nicco" }, "atomic: neither command applied");
  assert.equal(fixture!.campaign.revision, r.diagnostic.revision_before);
});
test("failure-code mapping is total for the turn failures the coordinator can emit (commit_failure and campaign_validation_failure by phase)", () => {
  const failed = (code: string, provider_code?: string) => ({ type: "turn_failed" as const, code: code as never, ...(provider_code ? { provider_code: provider_code as never } : {}), narration: "", incomplete: true as const, base_revision: 4, final_revision: 4 });
  assert.equal(diagnoseMutation({ failed: failed("campaign_validation_failed"), diagnostics: { failure_phase: "commit" } }).code, "commit_failure");
  assert.equal(diagnoseMutation({ failed: failed("campaign_validation_failed"), diagnostics: { failure_phase: "preparation" } }).code, "prepare_failure");
  assert.equal(diagnoseMutation({ failed: failed("campaign_validation_failed"), diagnostics: { failure_phase: "commit_preparation" } }).code, "prepare_failure");
  assert.equal(diagnoseMutation({ failed: failed("campaign_validation_failed") }).code, "campaign_validation_failure");
  assert.equal(diagnoseMutation({ failed: failed("narrator_failed") }).code, "turn_failed_other");
  assert.equal(diagnoseMutation({}).verdict, "no_change");
});
test("the diagnostic is derived data: running it twice yields identical output and it never appears in a prompt or the save", async () => {
  const s = E2E1_CASES[3]!, a = await run(s), b = await run(s);
  assert.deepEqual(JSON.parse(JSON.stringify(a.diagnostic)), JSON.parse(JSON.stringify(b.diagnostic)));
  const f = turnFixture(); assert.ok(!JSON.stringify(f.campaign.exportSnapshot()).includes("controller_no_command"));
});

// ------------------------------------------------------------------------------------------------ transfer: evidence model
test("transfer: a capitalised item name in the quote is the object, not a stranger (false rejection fixed); a real stranger still rejects", async () => {
  const narration = "As Nicco extends the blade, Brenna, grave and silent, accepts the Sword with both hands.";
  const ok = await run(one({ narration, controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna, grave and silent, accepts the Sword with both hands."] } }));
  assert.equal(ok.diagnostic.verdict, "committed"); assert.equal(ok.result!.authorization[0]!.evidence?.check, "receipt_of_named_item");
  const stranger = "As Korvin extends the blade, Brenna, grave and silent, accepts the Sword from Korvin with both hands.";
  const bad = await run(one({ narration: stranger, controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna, grave and silent, accepts the Sword from Korvin with both hands."] } }));
  assert.equal(bad.diagnostic.verdict, "rejected"); assert.equal(bad.result!.authorization[0]!.evidence?.check, "other_character_in_quote");
  const person = await run(one({ narration: "Maren watches. Brenna accepts the Sword with both hands, and Maren nods.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna accepts the Sword with both hands, and Maren nods."] } }));
  assert.equal(person.result!.authorization[0]!.evidence?.check, "other_character_in_quote", "a present person named in the quote still rejects");
});
test("transfer: the object-word exemption does not exempt a word that is also a present character's name", async () => {
  const f = (name: string) => (fx: F) => { fx.campaign.apply({ expected_revision: fx.campaign.revision, commands: [{ kind: "register_item", item: { id: SWORD, origin: { kind: "created" }, name, owner_id: "nicco", position: { kind: "carried", character_id: "nicco" } } }] }); };
  const r = await run(one({ setup: f("Maren Blade"), narration: "Brenna accepts the Maren Blade with both hands.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna accepts the Maren Blade with both hands."] } }));
  assert.equal(r.result!.authorization[0]!.evidence?.check, "other_character_in_quote");
});
test("transfer: pronoun-only and non-listed receipt phrasing stay conservative (documented limitations, not silently loosened)", async () => {
  const pron = await run(one({ narration: "Nicco extends the blade. She accepts it with both hands.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["She accepts it with both hands."] } }));
  assert.equal(pron.result!.authorization[0]!.evidence?.check, "receipt_subject_not_recipient"); assert.equal(pron.diagnostic.verdict, "rejected");
  const grip = await run(one({ narration: "Nicco extends the blade. Brenna grips the sword and tests its weight.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna grips the sword and tests its weight."] } }));
  assert.equal(grip.result!.authorization[0]!.evidence?.check, "no_receipt_act_in_quote"); assert.equal(grip.diagnostic.code, "insufficient_confirmation");
});
test("transfer: the quote must reference the proposed item and the recipient's receipt", async () => {
  const wrongItem = await run(one({ narration: "Brenna takes the boots.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna takes the boots."] } }));
  assert.equal(wrongItem.result!.authorization[0]!.evidence?.check, "offered_item_not_referenced"); assert.equal(wrongItem.diagnostic.revision_after, wrongItem.diagnostic.revision_before);
  const wrongRecipient = await run(one({ narration: "Nicco offers the sword. Brenna takes the sword.", controller: { kind: "commands", commands: [to("maren")], evidence: ["Brenna takes the sword."] } }));
  assert.equal(wrongRecipient.result!.authorization[0]!.authorized, false); assert.equal(wrongRecipient.diagnostic.revision_after, wrongRecipient.diagnostic.revision_before);
});
test("transfer (Pass C): the resolved player intent binds the recipient; with no transfer intent a quoted receipt still commits as narrated reality", async () => {
  const r = await run(one({ narration: "Maren takes the sword and weighs it.", controller: { kind: "commands", commands: [to("maren")], evidence: ["Maren takes the sword"] } }));
  assert.equal(r.diagnostic.verdict, "rejected"); assert.equal(r.result!.authorization[0]!.reason, "rejected_controller_mismatch"); assert.match(r.diagnostic.rejected[0]!.detail, /mismatch|differs/);
  const none = await run(one({ input: "*looks at Brenna*", narration: "Nicco offers the sword. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna takes the sword"] } }));
  assert.deepEqual(none.diagnostic.intended, []); assert.equal(none.diagnostic.verdict, "committed");
});
test("transfer modes: gift needs permanence; handoff keeps ownership; return/lend preserve ownership; the Controller's mode is never inferred from ownership", async () => {
  const owner = async (s: DiagnosticScenario) => { let fx: F | undefined; const r = await run({ ...s, setup: f => { fx = f; (s.setup ?? sword())(f); } }); return { r, owner: fx!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.owner_id, at: fx!.campaign.exportSnapshot().items.find(i => i.id === SWORD)!.position }; };
  const handoff = await owner(one({ narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna takes the sword"] } }));
  assert.deepEqual([handoff.r.diagnostic.verdict, handoff.owner, handoff.at], ["committed", "nicco", { kind: "carried", character_id: "brenna" }]);
  const giftNoPerm = await owner(one({ narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "gift")], evidence: ["Brenna takes the sword"] } }));
  assert.equal(giftNoPerm.r.diagnostic.verdict, "rejected"); assert.equal(giftNoPerm.r.result!.authorization[0]!.evidence?.check, "gift_permanence_not_established"); assert.equal(giftNoPerm.owner, "nicco");
  const gift = await owner(one({ input: "*gives Brenna the sword as a gift*", narration: "Nicco offers the hilt as a gift. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "gift")], evidence: ["Brenna takes the sword"] } }));
  assert.deepEqual([gift.r.diagnostic.verdict, gift.owner], ["committed", "brenna"]);
  const returned = await owner(one({ input: "*looks at Brenna*",  setup: sword("brenna", "nicco"), narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "return")], evidence: ["Brenna takes the sword"] } }));
  assert.deepEqual([returned.r.diagnostic.verdict, returned.owner], ["committed", "brenna"]);
  const badReturn = await owner(one({ input: "*looks at Brenna*",  narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "return")], evidence: ["Brenna takes the sword"] } }));
  assert.equal(badReturn.r.diagnostic.verdict, "rejected", "return requires recipient = owner (validTransferMode): not inferred or relaxed"); assert.equal(badReturn.owner, "nicco");
  const lend = await owner(one({ input: "*looks at Brenna*",  narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "lend")], evidence: ["Brenna takes the sword"] } }));
  assert.deepEqual([lend.r.diagnostic.verdict, lend.owner], ["committed", "nicco"]);
  const badLend = await owner(one({ input: "*looks at Brenna*",  setup: sword("brenna", "nicco"), narration: "Nicco offers the hilt. Brenna takes the sword.", controller: { kind: "commands", commands: [to("brenna", "lend")], evidence: ["Brenna takes the sword"] } }));
  assert.equal(badLend.r.diagnostic.verdict, "rejected", "a carrier of someone else's item cannot lend it");
  const refusedMode = await owner(one({ input: "*looks at Brenna*",  narration: "Brenna refuses the sword and pushes it back.", controller: { kind: "commands", commands: [to("brenna", "take")], evidence: ["Brenna refuses the sword"] } }));
  assert.equal(refusedMode.r.diagnostic.verdict, "rejected", "without an intent the quote check itself refuses a refused act");
  const refusedBound = await owner(one({ narration: "Brenna refuses the sword and pushes it back.", controller: { kind: "commands", commands: [to("brenna", "take")], evidence: ["Brenna refuses the sword"] } }));
  assert.equal(refusedBound.r.diagnostic.verdict, "rejected"); assert.equal(refusedBound.r.diagnostic.revision_after, refusedBound.r.diagnostic.revision_before);
});
test("transfer: an accepted-then-returned handover is withdrawn (refusal/retraction beats the quote)", async () => {
  const r = await run(one({ narration: "Brenna takes the sword. Then she hands it back to Nicco.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna takes the sword."] } }));
  assert.equal(r.diagnostic.verdict, "rejected"); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});

// ------------------------------------------------------------------------------------------------ conditions (E2E2 classes)
test("condition: supported path (starred strike + narrated lip split + quote naming the target) commits", async () => {
  const r = await run({ id: "c", title: "c", input: "*punches Brenna*", narration: "Nicco's fist lands on Brenna's jaw. Brenna's lip splits and she tastes blood.", controller: { kind: "commands", commands: [cond(["recovering", "minor_injury"])], evidence: ["Brenna's lip splits and she tastes blood."] } });
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.result!.authorization[0]!.evidence?.check, "physical_condition_narrated");
});
test("condition class A (correct behaviour): a strike whose narration states no supported condition commits nothing and is not an omission", async () => {
  const r = await run({ id: "c", title: "c", input: "*punches Brenna*", narration: "Nicco's fist glances off Brenna's shoulder. She shrugs it off.", controller: { kind: "none" } });
  assert.equal(r.diagnostic.verdict, "nothing_intended"); assert.ok(r.diagnostic.notes.some(n => /no supported condition/.test(n)));
});
test("condition class B (Controller omission): strike + bleeding narrated + no set_condition proposed -> controller_no_command (condition)", async () => {
  const r = await run({ id: "c", title: "c", input: "*punches Brenna*", narration: "Nicco's fist lands on Brenna's jaw. Brenna's lip splits and she tastes blood.", controller: { kind: "none" } });
  assert.equal(r.diagnostic.code, "controller_no_command"); assert.ok(r.diagnostic.notes.some(n => /CONTROLLER OMISSION \(condition\)/.test(n)));
});
test("condition class C (evidence rejection): hedged, term-less and dropped-existing-condition proposals each yield a distinct reason", async () => {
  const base = { id: "c", title: "c", input: "*punches Brenna*" };
  const hedged = await run({ ...base, narration: "Nicco swings. Brenna's lip might split.", controller: { kind: "commands", commands: [cond(["recovering", "minor_injury"])], evidence: ["Brenna's lip might split."] } });
  assert.equal(hedged.diagnostic.code, "ambiguous_evidence");
  const noTerm = await run({ ...base, narration: "Nicco's fist lands on Brenna's jaw. Brenna staggers back, eyes wide.", controller: { kind: "commands", commands: [cond(["recovering", "dazed"])], evidence: ["Brenna staggers back, eyes wide."] } });
  assert.equal(noTerm.result!.authorization[0]!.evidence?.check, "condition_term_missing"); assert.equal(noTerm.diagnostic.code, "insufficient_confirmation");
  const dropped = await run({ ...base, narration: "Nicco's fist lands on Brenna's jaw. Brenna's lip splits and she tastes blood.", controller: { kind: "commands", commands: [cond(["minor_injury"])], evidence: ["Brenna's lip splits and she tastes blood."] } });
  assert.equal(dropped.result!.authorization[0]!.reason, "rejected_reference_invalid"); assert.match(dropped.diagnostic.rejected[0]!.detail, /drops an existing condition/);
  const pronounQuote = await run({ ...base, narration: "Nicco's fist lands on Brenna. Her lip splits and bleeds.", controller: { kind: "commands", commands: [cond(["recovering", "minor_injury"])], evidence: ["Her lip splits and bleeds."] } });
  assert.equal(pronounQuote.result!.authorization[0]!.evidence?.check, "condition_subject_not_character", "a quote that names no target is not accepted (documented limitation)");
});
test("condition class D (unsupported semantics): out-of-vocabulary tags, and acts the natural-action grammar does not recognise, commit nothing and say why", async () => {
  const oov = await run({ id: "c", title: "c", input: "*punches Brenna*", narration: "Nicco's fist lands. Brenna's arm breaks with a crack.", controller: { kind: "commands", commands: [cond(["recovering", "broken_arm"])], evidence: ["Brenna's arm breaks with a crack."] } });
  assert.match(oov.diagnostic.rejected[0]!.detail, /closed vocabulary/);
  for (const input of ["I punch Brenna in the face", "*grabs Brenna's arm*", "*slaps her*"]) {
    const r = await run({ id: "c", title: "c", input, narration: "Brenna's lip splits and she tastes blood.", controller: { kind: "commands", commands: [cond(["recovering", "minor_injury"])], evidence: ["Brenna's lip splits and she tastes blood."] } });
    assert.equal(r.diagnostic.verdict, "rejected", input); assert.match(r.diagnostic.rejected[0]!.detail, /no same-turn physical interaction/, input);
  }
});

// ------------------------------------------------------------------------------------------------ live regressions (exact text captured in the Pass B live run)
const LIVE1 = "*Brenna's gaze drops to the blade as Nicco extends it. She reaches out and takes the sword by the grip, testing its weight with a small turn of her wrist before settling it against her hip.*\n\nAll right. I'll hold onto it.\n\n*She shifts the sword to her other hand, glancing once at the hearth before looking back at Nicco.*";
const LIVE1_QUOTE = "She reaches out and takes the sword by the grip, testing its weight with a small turn of her wrist before settling it against her hip.";
test("live E2E1 root cause: a pronoun quote after an *italic*-wrapped sentence resolves its antecedent (the leading asterisk hid the subject); the handover commits", async () => {
  const r = await run(one({ narration: LIVE1, controller: { kind: "commands", commands: [to("brenna")], evidence: [LIVE1_QUOTE] } }));
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.result!.authorization[0]!.evidence?.check, "receipt_of_named_item");
  const plain = await run(one({ narration: LIVE1.replaceAll("*", ""), controller: { kind: "commands", commands: [to("brenna")], evidence: [LIVE1_QUOTE] } }));
  assert.equal(plain.result!.authorization[0]!.evidence?.check, "receipt_of_named_item", "same verdict with and without the markers");
});
test("italic markers do not make a pronoun attach to the wrong person: another person's antecedent still rejects", async () => {
  const r = await run(one({ narration: "*Maren steps closer to Nicco. She takes the sword from his hands.*", controller: { kind: "commands", commands: [to("brenna")], evidence: ["She takes the sword from his hands."] } }));
  assert.equal(r.diagnostic.verdict, "rejected"); assert.equal(r.result!.authorization[0]!.evidence?.check, "receipt_subject_not_recipient");
  const nicco = await run(one({ narration: "*Nicco extends the sword. He lets it go.* *She takes the sword from his hands.*", controller: { kind: "commands", commands: [to("brenna")], evidence: ["She takes the sword from his hands."] } }));
  assert.equal(nicco.diagnostic.verdict, "rejected");
});
test("live E2E1-refusal: the Controller correctly proposes nothing for a narrated refusal; the diagnostic says no confirmation was recognised, not 'omission'", async () => {
  const narration = "*Brenna steps back as the sword moves toward her, her hands going flat at her sides as if pressing herself smaller.*\n\nI said no.\n\n*Her voice is steady but her weight has already shifted away. She doesn't reach for the blade, doesn't look at it. Her eyes stay on Nicco's face.*\n\nI won't touch it. Put it down if you need a hand free.";
  const r = await run(one({ narration, controller: { kind: "none" } }));
  assert.equal(r.diagnostic.code, "controller_no_command"); assert.ok(!r.diagnostic.notes.some(n => /OMISSION/.test(n)), r.diagnostic.notes.join("|")); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before);
});
test("live E2E2: a wrong tag (minor_injury for a winding blow) and an unrelated relationship step are rejected with precise reasons; nothing commits", async () => {
  const narration = "*The punch folds Maren in half with a sharp grunt, air leaving her in a rush. She staggers back a step, one arm wrapping tight around her middle, the other hand finding the edge of the nearest surface to steady herself. Her mouth opens, closes. She breathes through her teeth in short, thin pulls.*\n\nWhat — what is wrong with you?\n\n*She stays doubled slightly, eyes watering, watching Nicco with the fixed wariness of someone who has just learned the distance between them is not safe.*";
  const rel: CampaignCommand = { kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "wariness", direction: "raise" };
  const r = await run({ id: "l", title: "l", input: "*punches Maren hard in the stomach*", narration, controller: { kind: "commands", commands: [cond(["minor_injury"], "maren"), rel],
    evidence: ["The punch folds Maren in half with a sharp grunt, air leaving her in a rush.", "She stays doubled slightly, eyes watering, watching Nicco with the fixed wariness of someone who has just learned the distance between them is not safe."] } });
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before); assert.equal(r.diagnostic.accepted.length, 0);
  assert.equal(r.result!.authorization[0]!.evidence?.check, "condition_term_missing"); assert.match(r.diagnostic.rejected[0]!.detail, /terms present anywhere in the draft: (?:none|winded)/);
  assert.equal(r.diagnostic.rejected[1]!.code, "ambiguous_evidence");
});

// ------------------------------------------------------------------------------------------------ the other command kinds
const TELL_INPUT = "/tell campaign_fact_bridge_closed to brenna";
const tell: CampaignCommand = { kind: "set_knowledge", knowledge: { character_id: "brenna", fact_id: "campaign_fact_bridge_closed", status: "knows", provenance: { source_character_id: "nicco", acquisition_kind: "told" } } };
test("set_knowledge: told fact commits; hypothetical/failed telling is fact_not_communicated; re-telling is a benign no-op", async () => {
  const sc = (narration: string, evidence: string, extra: Partial<DiagnosticScenario> = {}): DiagnosticScenario => ({ id: "k", title: "k", input: TELL_INPUT, narration, controller: { kind: "commands", commands: [tell], evidence: [evidence] }, ...extra });
  const ok = await run(sc("Nicco tells Brenna that the eastern bridge is closed.", "Nicco tells Brenna that the eastern bridge is closed."));
  assert.equal(ok.diagnostic.verdict, "committed");
  const future = await run(sc("Nicco will tell Brenna that the eastern bridge is closed tomorrow.", "Nicco will tell Brenna that the eastern bridge is closed tomorrow."));
  assert.deepEqual(codes(future), ["insufficient_confirmation"]); assert.equal(future.result!.authorization[0]!.reason, "rejected_fact_not_communicated");
  const known = await run(sc("Nicco tells Brenna that the eastern bridge is closed.", "Nicco tells Brenna that the eastern bridge is closed.", { fixture: () => turnFixture(false, { brennaKnowsBridge: true }) }));
  assert.deepEqual(codes(known), ["already_established"]); assert.equal(known.diagnostic.revision_after, known.diagnostic.revision_before);
});
test("place_item: put down needs a quote naming the item; equip uses the exact narrated form", async () => {
  const down: CampaignCommand = { kind: "place_item", item_id: "boots", position: { kind: "stored", location_id: "test_room" } };
  const sc = (narration: string, evidence: string): DiagnosticScenario => ({ id: "p", title: "p", input: "*looks around*", narration, controller: { kind: "commands", commands: [down], evidence: [evidence] } });
  assert.equal((await run(sc("Nicco sets the boots down on the table.", "Nicco sets the boots down on the table."))).diagnostic.verdict, "committed");
  const unnamed = await run(sc("Nicco sets them down on the table.", "Nicco sets them down on the table."));
  assert.equal(unnamed.result!.authorization[0]!.evidence?.check, "placed_item_not_named"); assert.equal(unnamed.diagnostic.revision_after, unnamed.diagnostic.revision_before);
  const equip: CampaignCommand = { kind: "place_item", item_id: "boots", position: { kind: "equipped", character_id: "nicco", slot: "feet", mode: "worn" } };
  const eq = await run({ id: "e", title: "e", input: "/equip boots feet worn", narration: "Nicco equips boots in feet.", controller: { kind: "commands", commands: [equip], evidence: ["Nicco equips boots in feet."] } });
  assert.equal(eq.diagnostic.verdict, "committed", JSON.stringify(eq.diagnostic.rejected));
});
test("schedule_event: exact agreement commits; wrong minute is rejected_time_not_exact; no agreement is insufficient", async () => {
  const ev = (minute: number): CampaignCommand => ({ kind: "schedule_event", id: "campaign_event_meeting", title: "Bridge meeting", scheduled_world_minute: minute, participants: ["nicco", "brenna"] });
  const sc = (minute: number, narration: string): DiagnosticScenario => ({ id: "s", title: "s", input: '/schedule campaign_event_meeting "Bridge meeting" at 160 with nicco,brenna', narration, controller: { kind: "commands", commands: [ev(minute)], evidence: [narration] } });
  assert.equal((await run(sc(160, "Everyone agrees to Bridge meeting at world minute 160."))).diagnostic.verdict, "committed");
  const wrong = await run(sc(250, "Everyone agrees to Bridge meeting at world minute 250."));
  assert.equal(wrong.result!.authorization[0]!.reason, "rejected_time_not_exact"); assert.deepEqual(codes(wrong), ["controller_invalid_command"]);
  const none = await run(sc(160, "Brenna shrugs at the idea of meeting."));
  assert.deepEqual(codes(none), ["insufficient_confirmation"]);
});
test("move_character / leave_scene: canon-placed NPCs and unevidenced moves are rejected with distinct reasons", async () => {
  const canon = await run(one({ input: "*looks at Brenna*", narration: "Brenna walks out of the room.", controller: { kind: "commands", commands: [{ kind: "move_character", character_id: "brenna", location_id: "test_hall" }], evidence: ["Brenna walks out of the room."] } }));
  assert.equal(canon.result!.authorization[0]!.reason, "rejected_reference_invalid"); assert.deepEqual(codes(canon), ["controller_invalid_command"]);
  // The deterministic departure grammar independently derives the exit (appended after the Controller's proposal); that is the only mutation.
  assert.deepEqual(canon.diagnostic.accepted.map(a => a.command.kind), ["leave_scene"]); assert.equal(canon.diagnostic.accepted[0]!.source, "grammar");
  const leave = await run(one({ input: "*looks at Brenna*", narration: "Brenna frowns.", controller: { kind: "commands", commands: [{ kind: "leave_scene", character_id: "brenna" }], evidence: ["Brenna frowns."] } }));
  assert.equal(leave.diagnostic.verdict, "rejected");
});
test("funds: there is no Controller path (schema rejects it) and a purchase never reaches the Controller as a command", async () => {
  const r = await run(one({ narration: "Nicco hands over fifty gold.", controller: { kind: "raw", text: JSON.stringify({ commands: [{ command: { kind: "set_funds", character_id: "nicco", gold: 0 }, evidence_quote: "Nicco hands over fifty gold." }] }) } }));
  assert.equal(r.diagnostic.code, "controller_parse_failure");
});
test("relationship and household: Controller proposals need the chooser's own voiced words; unvoiced proposals are rejected", async () => {
  const world = await loadWorld("data");
  const BRENNA = "campaign_character_brenna";
  const fixture = () => { const c = createOpeningCampaign(world, "pass_b_household");
    c.apply({ expected_revision: c.revision, commands: [{ kind: "register_character", character: { id: BRENNA, origin: { kind: "created" }, profile: { name: "Brenna", age: { kind: "exact", years: 29 } }, current: { current_location: c.exportSnapshot().runtime.scene.player_location, status: "active" } } }] });
    return { world, campaign: c } as unknown as F; };
  const join: CampaignCommand = { kind: "join_household", household_id: OPENING_HOUSEHOLD, character_id: BRENNA };
  const raise: CampaignCommand = { kind: "adjust_relationship", from_character_id: BRENNA, to_character_id: "nicco", dimension: "protectiveness", direction: "raise" };
  const oath = 'Brenna rests her palm on the warm stone. "I, Brenna, decide to stay and become a resident. I swear to protect the hearthstone and Nicco, the keeper."';
  const ok = await run({ id: "h", title: "h", input: "*explains the Heartstone and waits*", narration: oath, fixture, controller: { kind: "commands", commands: [join, raise], evidence: ["I, Brenna, decide to stay and become a resident.", "I swear to protect the hearthstone and Nicco, the keeper."] } });
  assert.deepEqual(ok.diagnostic.accepted.map(a => a.command.kind), ["join_household", "adjust_relationship"]); assert.equal(ok.diagnostic.verdict, "committed");
  const unvoiced = await run({ id: "h", title: "h", input: "*explains the Heartstone and waits*", narration: "Brenna nods once and keeps her distance.", fixture, controller: { kind: "commands", commands: [join, raise], evidence: ["Brenna nods once and keeps her distance.", "Brenna nods once and keeps her distance."] } });
  assert.equal(unvoiced.diagnostic.verdict, "rejected"); assert.ok(codes(unvoiced).every(c => c === "insufficient_confirmation"), JSON.stringify(codes(unvoiced)));
  const ghost = await run({ id: "h", title: "h", input: "*waits*", narration: oath, fixture, controller: { kind: "commands", commands: [{ ...join, household_id: "no_such_household" }], evidence: ["I, Brenna, decide to stay and become a resident."] } });
  assert.deepEqual(codes(ghost), ["controller_invalid_command"]);
});

// ------------------------------------------------------------------------------------------------ atomicity
test("atomicity: valid + invalid in one proposal commits only the valid command, in exactly one revision", async () => {
  const r = await run(one({ narration: "Nicco offers the hilt. Brenna takes the sword and weighs it.", controller: { kind: "commands", commands: [to("brenna"), to("brenna", "handoff", "campaign_item_ghost")], evidence: ["Brenna takes the sword", "Brenna takes the ghost"] } }));
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.diagnostic.accepted.length, 1); assert.equal(r.diagnostic.rejected.length, 1);
  assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before + 1);
});
test("atomicity: an exact repeat of a command is one proposal (fixes a whole-turn failure); distinct repeats still fail preparation atomically", async () => {
  const r = await run(one({ narration: "Nicco offers the hilt. Brenna takes the sword and weighs it.", controller: { kind: "commands", commands: [to("brenna"), to("brenna")], evidence: ["Brenna takes the sword", "Brenna takes the sword"] } }));
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.diagnostic.proposed.length, 1); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before + 1);
  const tellTwice = await run({ id: "k", title: "k", input: TELL_INPUT, narration: "Nicco tells Brenna that the eastern bridge is closed.", controller: { kind: "commands", commands: [tell, tell], evidence: ["Nicco tells Brenna that the eastern bridge is closed.", "Nicco tells Brenna that the eastern bridge is closed."] } });
  assert.equal(tellTwice.diagnostic.verdict, "committed"); assert.equal(tellTwice.diagnostic.proposed.length, 1);
});
test("atomicity: a repeat whose quote differs keeps the first command's quote (stable order)", async () => {
  const r = await run(one({ narration: "Nicco offers the hilt. Brenna takes the sword and weighs it.", controller: { kind: "commands", commands: [to("brenna"), to("brenna")], evidence: ["Brenna takes the sword", "garbage that is not in the narration"] } }));
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.result!.authorization[0]!.evidence?.quote, "Brenna takes the sword");
});
test("atomicity: two valid commands for different items commit together or not at all (offered group)", async () => {
  const sc = (narration: string, evidence: string): DiagnosticScenario => ({ id: "g", title: "g", input: OFFER, ground_garments: true, narration,
    controller: { kind: "commands", commands: ["pink_cotton", "pink_fluffy", "pink_shorts"].map(id => to("brenna", "handoff", id)), evidence: [evidence, evidence, evidence] } });
  const all = await run(sc("Brenna looks over the offered clothes. She took the pink cotton shirt, then the fluffy one, and finally the shorts, laying them across her lap.", "She took the pink cotton shirt, then the fluffy one, and finally the shorts"));
  assert.equal(all.diagnostic.verdict, "committed"); assert.equal(all.diagnostic.accepted.length, 3); assert.equal(all.diagnostic.revision_after, all.diagnostic.revision_before + 1);
  const part = await run(sc("Brenna looks over the offer. She took the pink cotton shirt next. She set the others aside.", "She took the pink cotton shirt next."));
  assert.equal(part.diagnostic.accepted.length, 0); assert.equal(part.diagnostic.revision_after, part.diagnostic.revision_before);
});
test("atomicity: a sequence that is valid step by step (hand to Brenna, Brenna hands to Maren) commits in order when no player transfer intent binds it", async () => {
  const r = await run(one({ input: "*looks at Brenna*",  narration: "Brenna takes the sword and weighs it. Maren takes the sword from her.", controller: { kind: "commands", commands: [to("brenna"), to("maren")], evidence: ["Brenna takes the sword and weighs it.", "Maren takes the sword from her."] } }));
  assert.equal(r.diagnostic.verdict, "committed"); assert.equal(r.diagnostic.accepted.length, 2); assert.equal(r.diagnostic.revision_after, r.diagnostic.revision_before + 1);
});
test("shadow mode never authorizes from a quote alone, and says so", async () => {
  const r = await run(one({ evidence_authorization: "shadow", narration: "As Nicco extends the blade, Brenna, grave and silent, accepts the sword with both hands.", controller: { kind: "commands", commands: [to("brenna")], evidence: ["Brenna, grave and silent, accepts the sword with both hands."] } }));
  assert.equal(r.diagnostic.verdict, "rejected"); assert.equal(r.result!.authorization[0]!.evidence?.verified, true); assert.equal(r.result!.authorization[0]!.source, "rejected");
});

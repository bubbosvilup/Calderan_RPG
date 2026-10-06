import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { STRONG_TRAITS, strongCanonicalMatch, traitMatches } from "../src/turn/canonical-interaction-targets.js";
import { narratorIdentityGate } from "../src/turn/narrator-identity.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";
import { collect, metadata } from "./turn-fixtures.js";

/**
 * Canonical NPC casting / ephemeral duplication. Playtest shape: the narrator renders a present (background) canonical actor from
 * their observable label; the player engages that person by description; the engine failed to cast the canonical actor and created
 * a temporary duplicate (or left the actor unbound), whose invented name (Vaelra, Harren) P3 continuity then faithfully preserved.
 * Real data/ world, scripted offline narration, no controller commands.
 */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market";
const ELARA_SCENE = "*Near a silk awning, a woman with long straight platinum-blonde hair and green-hazel eyes stands in elegant, expensive clothing, slowly working a decorative fan as she watches the crowd.*";
const KORVIN_SCENE = "*In the back rows, a short, compact seller with large damaged hands, a hooked nose and small, perceptive eyes leans on a pen rail, watching Nicco come.*";
let serial = 0;
function scene(location = MARKET) {
  const campaign = createOpeningCampaign(world, `casting_${++serial}`);
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }, { kind: "runtime_delta", delta: { time_advance_minutes: 630 } }] });
  let text = "", request: GenerationRequest | undefined;
  const service = new RetrievalService(world);
  const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(r) { request = r; yield { type: "text_delta", text }; yield { type: "completed", result: { text, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  const turn = async (input: string, narration = "*The market noise goes on.*") => {
    text = narration;
    const last = (await collect(co.runTurn({ campaign, player_input: input }))).at(-1)!;
    assert.equal(last.type, "turn_completed", JSON.stringify(last).slice(0, 300));
    const result = (last as { result: TurnResult }).result, prompt = request!.messages[0]!.content;
    return { result, plan: result.scene_participants!.plan, prompt, system: request!.system_prompt,
      foreground: [...prompt.matchAll(/^Character [^(]+\(([^)]+)\)/gm)].map(m => m[1]!).filter(id => id !== "nicco"),
      background: (prompt.match(/\[BACKGROUND PRESENT\]\n([\s\S]*?)BACKGROUND PRESENCE/)?.[1] ?? "").split("\n").filter(Boolean).map(l => (JSON.parse(l) as { ref: string }).ref) };
  };
  return { campaign, turn };
}
const ref = (campaign: CampaignState, id: string) => narratorIdentityGate(buildTurnContext(world, campaign.exportSnapshot()))!.identities.get(id)!.ref;
const context = (location = MARKET) => { const c = createOpeningCampaign(world, `casting_ctx_${++serial}`); c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: location } }] }); return buildTurnContext(world, c.exportSnapshot()); };

// ------------------------------------------------------------------------------------------------ A: Elara-like woman
test("A: the narrated Elara-like woman engaged as 'the woman with the fan' is Elara, not a temporary duplicate", async () => {
  for (const engage of ["*walks up to the woman with the fan* Good day.", "*approaches the woman with the fan* Good day.", "*goes up to the woman with the decorative fan* Who are you?", "*walks over to the platinum-haired woman* Who are you?"]) {
    const s = scene();
    await s.turn("*looks around the market*", ELARA_SCENE);
    const t = await s.turn(engage, "*She lowers the fan a fraction.*");
    assert.equal(t.plan.created, null, `${engage}: no temporary duplicate`);
    assert.equal(t.plan.focus, "mistress_elara", engage);
    assert.deepEqual(t.plan.participants, [], engage);
    assert.deepEqual(t.foreground, [ref(s.campaign, "mistress_elara")], engage);
    assert.equal(t.prompt.includes("[SCENE PARTICIPANTS]"), false, engage);
  }
});
test("A/P3.3: asking the cast woman's name offers Elara's canonical self-disclosure, never an invented name slot", async () => {
  const s = scene();
  await s.turn("*looks around the market*", ELARA_SCENE);
  const t = await s.turn("*goes up to the woman with the decorative fan* Who are you?", "*She considers him.*");
  assert.match(t.system, /CONTROLLED SELF-DISCLOSURE/);
  assert.match(t.system, /"canonical_name_for_own_spoken_introduction_only":"Mistress Elara"/);
  assert.equal(t.prompt.includes("Mistress Elara"), false, "the name stays masked outside the disclosure capability");
});
test("A: where Elara is not eligible, the same description stays a valid temporary person", async () => {
  const s = scene("gatherers_inn");
  await s.turn("*looks around the common room*", ELARA_SCENE);
  const t = await s.turn("*walks up to the woman with the fan* Good day.", "*She lowers the fan.*");
  assert.equal(t.plan.created, "scene_npc_1");
  assert.equal(t.foreground.includes("mistress_elara"), false);
});

// ------------------------------------------------------------------------------------------------ B: Korvin-like seller
test("B: 'the seller' just narrated with Korvin's traits is Korvin; a strong direct description is Korvin too", async () => {
  for (const engage of ["*walks up to the seller* What have you got?", "*approaches the seller* What have you got?", "*walks up to the seller and asks what he sells*"]) {
    const s = scene();
    await s.turn("*heads into the back rows of the private sellers*", KORVIN_SCENE);
    const t = await s.turn(engage, "*He spits to one side.*\n\nLabor stock, mostly.");
    assert.equal(t.plan.focus, "korvin", engage);
    assert.equal(t.plan.created, null, engage);
    assert.deepEqual(t.foreground, [ref(s.campaign, "korvin")], engage);
  }
  const s = scene();
  const direct = await s.turn("*walks up to the short, compact man with large damaged hands and a hooked nose*");
  assert.equal(direct.plan.focus, "korvin");
  assert.equal(direct.plan.created, null, "the strongly described man is not a new temporary Man");
});
test("B: where Korvin is not eligible, a Korvin-like seller is not cast as Korvin", async () => {
  const s = scene("gatherers_inn");
  await s.turn("*looks around*", KORVIN_SCENE);
  const t = await s.turn("*walks up to the seller* What have you got?");
  assert.notEqual(t.plan.focus, "korvin");
  assert.equal(t.foreground.includes(ref(s.campaign, "korvin")), false);
  // Jessa Rook (1 trait) is not cast; any foregrounding of her comes from the pre-existing P6 single-partner "you" rule.
  assert.equal(t.plan.addressed.includes("jessa_rook"), false);
});

// ------------------------------------------------------------------------------------------------ C: weak matches never hijack
test("C: one or two generic traits never cast a canonical actor (temporary person remains allowed)", async () => {
  const cases: readonly (readonly [string, string])[] = [
    ["*A blonde woman with a fan watches the crowd.*", "*walks up to the woman* Hello."],
    ["*A woman with a fan watches the crowd.*", "*walks up to the woman with the fan* Hello."],
    ["*A short man leans on a rail.*", "*walks up to the man* Hello."],
    ["*A man with scarred hands leans on a rail.*", "*walks up to the man with scarred hands* Hello."],
    ["*A woman with green eyes and expensive clothes passes.*", "*walks up to the woman* Hello."],
  ];
  for (const [narration, engage] of cases) {
    const s = scene();
    await s.turn("*looks around the market*", narration);
    const t = await s.turn(engage, "*The person looks up.*");
    assert.equal(t.plan.created, "scene_npc_1", `${narration} → ${engage}: ephemeral creation allowed`);
    assert.deepEqual(t.foreground, [], `${narration} → ${engage}: no canonical cast`);
  }
  const ctx = context();
  for (const weak of ["the blonde woman", "the short seller", "the woman with a fan", "the man with scarred hands", "a woman with green eyes", "the woman in expensive clothes", "the man with a hooked nose", "the blonde woman with a fan"])
    assert.equal(strongCanonicalMatch(ctx, weak), undefined, weak);
});
test("C: trait counting is per authored trait, not per word ('hooked nose' is one trait)", () => {
  const korvin = narratorIdentityGate(context())!.identities.get("korvin")!.observable_appearance!;
  assert.equal(traitMatches(korvin, "a hooked nose"), 1);
  assert.equal(traitMatches(korvin, "large damaged hands"), 1);
  assert.equal(traitMatches(korvin, "short, compact, with large damaged hands and a hooked nose"), 4);
  assert.ok(STRONG_TRAITS >= 3);
});

// ------------------------------------------------------------------------------------------------ D: ambiguity fails safe
test("D: a description evidencing two eligible canonical actors casts neither", async () => {
  const ctx = context();
  const mixed = "a short, compact man with large damaged hands, a clerical tonsure and a paternal easy smile";
  assert.equal(strongCanonicalMatch(ctx, mixed), undefined);
  const s = scene();
  await s.turn("*looks around the market*", `*Near the pens stands ${mixed}.*`);
  const t = await s.turn("*walks up to the man* Hello.");
  assert.deepEqual(t.foreground, []);
  assert.notEqual(t.plan.focus, "korvin");
  assert.notEqual(t.plan.focus, "bartolomhew");
});
test("D: two narrated people sharing the referenced noun leave the reference unresolved (no arbitrary pick)", async () => {
  const s = scene();
  await s.turn("*looks around*", `${ELARA_SCENE}\n\n*Beside a cart, a woman in a plain grey shawl counts coins.*`);
  const t = await s.turn("*walks up to the woman* Hello.");
  assert.equal(t.foreground.includes(ref(s.campaign, "mistress_elara")), false);
});

// ------------------------------------------------------------------------------------------------ E: the rule is evidence-based
test("E: a strong unique match casts any eligible canonical actor (Bartolomhew), with sex and role compatibility", async () => {
  const s = scene();
  await s.turn("*looks around*", "*A tall man with blond hair turned white, a clerical tonsure and a paternal easy smile watches the auction.*");
  const t = await s.turn("*walks up to the man* Good day.");
  assert.equal(t.plan.focus, "bartolomhew");
  assert.equal(t.plan.created, null);
  const ctx = context();
  assert.equal(strongCanonicalMatch(ctx, "a woman with long straight platinum-blonde hair, green-hazel eyes and a decorative fan"), "mistress_elara");
  assert.equal(strongCanonicalMatch(ctx, "a man with long straight platinum-blonde hair, green-hazel eyes and a decorative fan"), undefined, "sex mismatch");
  assert.equal(strongCanonicalMatch(ctx, "a guard, short and compact, with large damaged hands and a hooked nose"), undefined, "role mismatch: Korvin is no guard");
});

// ------------------------------------------------------------------------------------------------ F: explicit names unchanged
test("F: explicit canonical names still resolve normally", async () => {
  for (const [input, id] of [["Korvin, what do you sell?", "korvin"], ["*walks up to Mistress Elara* Good day.", "mistress_elara"], ["*approaches korvin*", "korvin"]] as const) {
    const t = await scene().turn(input);
    assert.equal(t.plan.focus, id, input);
    assert.equal(t.plan.created, null, input);
  }
});

// ------------------------------------------------------------------------------------------------ G: ephemeral continuity
test("G: an established temporary person is never re-cast as canonical by a later matching narration", async () => {
  const s = scene();
  await s.turn("*looks around*", "*A woman with a red scarf sells ribbons from a tray.*");
  const first = await s.turn("*walks up to the woman with the red scarf* Hello.", "*She smiles.*");
  assert.equal(first.plan.created, "scene_npc_1");
  await s.turn("What do you sell?", ELARA_SCENE);
  const later = await s.turn("*turns to the woman* And her?");
  assert.equal(later.plan.addressed.includes("scene_npc_1"), true, "the established temporary woman keeps the definite noun");
  assert.notEqual(later.plan.focus, "mistress_elara");
});

// ------------------------------------------------------------------------------------------------ P6: background discipline
test("P6: casting one canonical actor leaves the other present canonical actors in the background", async () => {
  const s = scene();
  await s.turn("*heads into the back rows of the private sellers*", KORVIN_SCENE);
  const t = await s.turn("*walks up to the seller* What have you got?");
  assert.deepEqual(t.foreground, [ref(s.campaign, "korvin")]);
  assert.ok(t.background.includes(ref(s.campaign, "mistress_elara")));
  assert.ok(t.background.length >= 2);
  const idle = await scene().turn("*looks around the market*");
  assert.deepEqual(idle.foreground, [], "mere presence never foregrounds");
});

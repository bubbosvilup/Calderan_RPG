import test from "node:test";
import assert from "node:assert/strict";
import { loadWorld } from "../src/world/loader.js";
import { createOpeningCampaign } from "../src/campaign/opening-state.js";
import type { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { narratorEphemeralCharacters } from "../src/campaign/promotion.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { resolvePersonTransactions } from "../src/turn/person-transactions.js";
import { establishNames } from "../src/turn/name-establishment.js";
import type { RecentExchange } from "../src/turn/recent-conversation.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import type { GenerationRequest } from "../src/llm/types.js";
import { backgroundGrounding, backgroundTopics, classifyBackgroundClaim } from "../src/turn/background-grounding.js";
import { DEFAULT_CONTROLLER_MODEL, DEFAULT_CONTROLLER_FALLBACK_MODELS } from "../src/llm/openrouter/state-controller.js";
import { DEFAULT_REFLECTION_MODEL } from "../src/llm/openrouter/reflection-provider.js";
import { DEFAULT_MANNERISM_EXTRACTOR_MODEL } from "../src/llm/openrouter/mannerism-extractor.js";
import { DEFAULT_NARRATOR_MODEL } from "../src/llm/openrouter/minimax-narrator.js";
import { collect, metadata } from "./turn-fixtures.js";

/** Ephemeral Background Grounding V1: deterministic need detection, canon possibility block, proper-name guardrail, persistence. */
const world = await loadWorld("data");
const MARKET = "calderan_slave_market";
let serial = 0;
function market(extra: readonly CampaignCommand[] = []): CampaignState {
  const c = createOpeningCampaign(world, `background_${++serial}`);
  c.apply({ expected_revision: c.revision, commands: [{ kind: "runtime_delta", delta: { player_location: MARKET } }, ...extra] });
  return c;
}
const at = (narration: string, player = "*looks around*"): RecentExchange => ({ player, narration, status: "finalized", location_id: MARKET });
const PEN = at("A woman sits in the nearest pen, her wrists bound, watching the auction crowd.");
const grounding = (c: CampaignState, input: string, recent: readonly RecentExchange[] = [PEN]) => backgroundGrounding(world, buildTurnContext(world, c.exportSnapshot()), input, recent);
/** Asserts the block offers possibilities without assigning an origin to anyone. */
function assertNoAssignment(block: string) {
  assert.doesNotMatch(block, /\b(?:she|he|they|the (?:captive|elf|dwarf|woman|man)) (?:is|was|comes?|came) from\b/i);
  assert.match(block, /not as a selection list; it assigns nothing to anyone/);
}

test("A. human captive asked for origin: grounding present, several canon regions available, no origin assigned", () => {
  const g = grounding(market(), "I ask her where she is from.")!;
  assert.deepEqual(g.topics, ["origin"]);
  for (const place of ["Davenport", "Ironbound", "Khar-Dune", "Zul-Rath", "Vaelrost", "Skardgard", "Blackwater"]) assert.ok(g.block.includes(place), place);
  assert.match(g.block, /do not invent named cities, regions, nations, cultures or factions/);
  assert.match(g.block, /usually one fact, never the whole life story/);
  assert.match(g.block, /war prisoners, convicted criminals, hereditary slavery, debt/);
  assertNoAssignment(g.block);
  assert.doesNotMatch(g.block, /Northern Forest|Central Oasis/); // placeholders are never offered as proper names
  assert.match(g.block, /central oasis \(descriptive label; proper name not established\)/); assert.match(g.block, /Woodsong Forest/);
  assert.ok(g.block.length < 4000, String(g.block.length));
  assert.doesNotMatch(g.block, /relationships/); // narrator prompt bound
});
test("B. elf captive: elven population-center canon appears as a possibility, never as her origin", () => {
  const g = grounding(market(), "I ask the elf woman in the cage where she comes from.")!;
  assert.match(g.block, /People: Elves:/); assert.match(g.block, /not the exclusive homeland of all elves/);
  assert.match(g.block, /Related places \(possible, never assumed for an individual\): Woodsong Forest/);
  assertNoAssignment(g.block);
});
test("C. dwarf captive: Dragon's Teeth ancestral canon appears, no personal birthplace forced", () => {
  const g = grounding(market(), "I ask the dwarf captive where he grew up.")!;
  assert.match(g.block, /People: Dwarves:/); assert.match(g.block, /ancestral\s+homeland is the Dragon's Teeth Mountains/);
  assert.match(g.block, /never assumed for an individual\): The Dragon's Teeth Mountains/);
  assertNoAssignment(g.block);
});
test("D. non-background questions and Nicco's own past produce no grounding block", () => {
  const c = market();
  for (const input of ["I look at the nearest cage.", "What is she wearing?", "Does she look injured?", "Where am I from, again?", "I walk to the auction block."]) assert.equal(grounding(c, input), undefined, input);
  // Nobody to ask: the empty opening square (the market always has its canonical sellers present, who may be asked).
  const empty = createOpeningCampaign(world, `background_empty_${++serial}`);
  assert.equal(backgroundGrounding(world, buildTurnContext(world, empty.exportSnapshot()), "Where are you from?", []), undefined);
  assert.ok(grounding(c, "Where are you from?", []), "present canonical sellers can be asked");
  assert.deepEqual(backgroundTopics("What did you do before this?"), ["prior_life"]);
  // Live validation regression: the uninverted reported-question form.
  assert.deepEqual(backgroundTopics("I ask her what she did before she ended up here."), ["prior_life"]);
  assert.deepEqual(backgroundTopics("How did you end up in chains?"), ["enslavement"]);
  assert.deepEqual(backgroundTopics("Do you have any family waiting back home?"), ["family_home"]);
});
test("D2. the block reaches the narrator prompt only on background turns; ordinary turns are byte-identical to no grounding", async () => {
  const prompts: string[] = [];
  const run = async (input: string) => {
    const c = market(), service = new RetrievalService(world);
    const co = new TurnCoordinator(world, { async generate() { throw new Error("unused"); }, async *stream(r: GenerationRequest) { prompts.push(r.messages.at(-1)!.content); yield { type: "text_delta", text: "She looks at Nicco." }; yield { type: "completed", result: { text: "She looks at Nicco.", ...metadata } }; } },
      { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) });
    co.recent(c).add(PEN);
    await collect(co.runTurn({ campaign: c, player_input: input }));
  };
  await run("I ask her where she is from.");
  await run("I look at the nearest cage.");
  assert.match(prompts[0]!, /\[BACKGROUND GROUNDING \? origin\]/);
  assert.ok(prompts[0]!.indexOf("[BACKGROUND GROUNDING") > prompts[0]!.indexOf("[UNESTABLISHED DETAILS]") && prompts[0]!.indexOf("[BACKGROUND GROUNDING") < prompts[0]!.indexOf("[PLAYER ACTION"));
  assert.doesNotMatch(prompts[1]!, /BACKGROUND GROUNDING/);
});
test("E-G. proper-name guardrail: canon places verify, invented named places do not, unnamed places are generic", () => {
  const check = (t: string) => classifyBackgroundClaim(t, world);
  assert.deepEqual(check("I'm from Davenport."), { status: "verified", entity_ids: ["davenport"], unresolved: [] });
  assert.deepEqual(check("A village near the Marches."), { status: "unverified", entity_ids: [], unresolved: ["Marches"] });
  assert.equal(check("From a village south of Calderan.").status, "verified");
  assert.deepEqual(check("A fishing village on the southern coast."), { status: "generic", entity_ids: [], unresolved: [] });
  assert.equal(check("I was born in the Dragon's Teeth.").status, "verified");
  assert.equal(check("My father worked the mines at Frostspire.").status, "verified");
  assert.equal(check("Sold by the Duke's men after the harvest failed.").status, "generic"); // titles are not places
  assert.deepEqual(check("I hail from Lowmere, in the East.").unresolved, ["Lowmere"]);
});
const OFFER = at('Korvin taps his ledger. "Five. She\'s a burden I paid four for." He holds the pen over the page. "Papers included. Clean transfer, debt-forfeiture chain, no liens. You walk her out that gate, she\'s yours."\nIlsa does not look up.', "Name your price, Korvin.");
const intro = (origin: string) => at(`Korvin leads Nicco past the canvas partition to the last cage.\n"Ilsa. Twenty-four. ${origin}," Korvin says.\nIlsa sits behind the bars with tired grey eyes and does not lift her head.`, "*checks the cages*");
const buy = (recent: readonly RecentExchange[]) => {
  const c = market(), r = resolvePersonTransactions("Done. *pays him*", buildTurnContext(world, c.exportSnapshot()), c.exportSnapshot(), recent, c.revision, { world });
  c.apply({ expected_revision: c.revision, commands: r.commands as CampaignCommand[] });
  return { c, ilsa: narratorEphemeralCharacters(c.exportSnapshot()).find(x => x.profile.name === "Ilsa")! };
};
test("F/I. purchase promotion: a verified origin survives; an invented named place is not frozen; other facts unchanged; nothing added", () => {
  const verified = buy([intro("Came to me from Davenport, was a net mender on the docks"), OFFER]).ilsa.origin_snapshot!;
  assert.deepEqual(verified.established.background!.map(b => [b.source, b.by]), [["seller", "Korvin"]]); assert.match(verified.established.background![0]!.text, /Came to me from Davenport, was a net mender on the docks/);
  const { c, ilsa } = buy([intro("Came to me from the Marches, was a net mender"), OFFER]);
  const o = ilsa.origin_snapshot!;
  assert.equal(o.established.background, undefined);
  assert.deepEqual([o.established.name, o.established.age, o.established.sex], ["Ilsa", { kind: "exact", years: 24 }, "female"]); // appearance/age/etc. unchanged
  assert.ok(o.established.appearance?.includes("grey eyes"));
  // Unknown stays unknown: no origin, occupation, family or reason is invented at promotion.
  assert.deepEqual(Object.keys(o.established).sort(), ["age", "appearance", "descriptor", "name", "role", "sex"].filter(k => k in o.established).sort());
  // Raw provenance may quote the sentence, but the narrator-facing projection carries no Marches background.
  const projected = buildTurnContext(world, c.exportSnapshot()).characters.find(x => x.id === ilsa.id)!.established_origin!;
  assert.equal(projected.background, undefined);
});
test("F2. name-establishment promotion applies the same guardrail to self-stated origins", () => {
  const promote = (line: string) => {
    const c = market(), recent = [at(`A woman in the nearest pen looks up. "My name is Ilsa," she says. "${line}"`, "What's your name?")];
    const r = establishNames(recent, buildTurnContext(world, c.exportSnapshot()), world, c.exportSnapshot(), [], c.revision);
    const reg = r.commands.find(x => x.kind === "register_character") as Extract<CampaignCommand, { kind: "register_character" }>;
    return reg.character.origin_snapshot!.established.background;
  };
  assert.deepEqual(promote("I'm from Skardgard.")?.map(b => [b.text, b.source]), [["I'm from Skardgard.", "self"]]);
  assert.equal(promote("I was born near the Marches."), undefined);
  assert.deepEqual(promote("I grew up on a farm south of here.")?.map(b => b.text), ["I grew up on a farm south of here."]); // generic is kept
});
test("H. an already established origin is authoritative in the block; candidate lore never replaces it", () => {
  const { c, ilsa } = buy([intro("Came to me from Davenport, was a net mender on the docks"), OFFER]);
  const g = backgroundGrounding(world, buildTurnContext(world, c.exportSnapshot()), "I ask Ilsa where her family is.", [at("Ilsa stands beside Nicco.")])!;
  assert.ok(g, "grounding expected");
  assert.match(g.block, /Already established \(authoritative; never offer alternatives to these\):\n- Ilsa: Came to me from Davenport, was a net mender on the docks[,.]? \(stated by Korvin\)/);
  assert.ok(g.block.indexOf("Already established") < g.block.indexOf("Named places"));
  assert.ok(ilsa.id);
});
test("J. model routing is unchanged by background grounding", () => {
  assert.deepEqual([DEFAULT_NARRATOR_MODEL, DEFAULT_CONTROLLER_MODEL, ...DEFAULT_CONTROLLER_FALLBACK_MODELS, DEFAULT_REFLECTION_MODEL, DEFAULT_MANNERISM_EXTRACTOR_MODEL],
    ["z-ai/glm-5.2", "openai/gpt-6-luna", "anthropic/claude-haiku-5.5", "anthropic/claude-haiku-5.5", "openai/gpt-6-luna"]);
});

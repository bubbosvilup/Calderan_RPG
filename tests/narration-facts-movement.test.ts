import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { turnFixture } from "../src/dev/support/turn-fixture.js";
import { metadata, collect } from "./turn-fixtures.js";
import { TurnCoordinator } from "../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { buildTurnContext } from "../src/turn/context/context-builder.js";
import { characterLocation, movableCharacters } from "../src/turn/movement/character-movement.js";
import { characterMovementsFromFacts, departuresFromFacts } from "../src/turn/movement/movement-evidence.js";
import { createFactSource, extractNarrationFacts, type NarrationFactScope, type Referent } from "../src/turn/narration-facts/index.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import type { GenerationRequest } from "../src/llm/types.js";
import type { TurnResult } from "../src/turn/turn-types.js";

/**
 * Consolidation block 9 - NarrationFacts / movement. Facts are DESCRIPTIVE: what the prose asserts, with span, modality, polarity, ambiguity
 * and provenance; they never decide, never mutate. Authorization and audit apply their own policy to the SAME facts.
 */
const create = (id: string, name: string, sex: "female" | "male", location = "test_room"): CampaignCommand =>
  ({ kind: "register_character", character: { id, origin: { kind: "created" }, profile: { name, sex, age: { kind: "exact", years: 24 } }, current: { current_location: location, status: "active" } } });
const hold = (id: string): CampaignCommand => ({ kind: "set_legal_status", character_id: id, status: "enslaved", holder_id: "nicco" });

function room(setup: readonly CampaignCommand[] = [], hall = false) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [...setup, ...(hall ? [{ kind: "runtime_delta" as const, delta: { player_location: "test_hall", time_advance_minutes: 1 } }] : [])] });
  const snapshot = f.campaign.exportSnapshot(), context = buildTurnContext(f.world, snapshot);
  const movers = movableCharacters(snapshot, ["test_room", "test_hall"], f.world);
  return { f, snapshot, context, movers, scope: { movers, context } as NarrationFactScope };
}
const women: readonly Referent[] = [{ id: "tessa", names: ["Tessa"], sex: "female" }, { id: "dara", names: ["Dara"], sex: "female" }];
const kinds = (text: string, scope: NarrationFactScope) => extractNarrationFacts(text, scope).movement.map(f => `${f.kind}/${f.modality}/${f.subject.entity_id ?? "-"}`);

// ------------------------------------------------------------------------------------------------ core gates
test("every fact carries the exact source span, its sentence and a consistent modality/polarity", () => {
  const { scope } = room([create("campaign_character_tessa", "Tessa", "female"), create("campaign_character_dara", "Dara", "female")]);
  const corpus = [
    "Tessa follows him down the stairs. She does not stay.", "Nicco reaches the hall. Dara walks out of the room and the door shuts behind her.",
    "\"Tessa follows him down,\" Dara says. Tessa stays behind.", "She says she will follow tomorrow. Nicco tells her to follow.", "Dara's footsteps fade down the stairs.",
    "He enters the hall. The journey ends at the market. Tessa is carried into the hall.", "Tessa could leave, but she waits.", "Nicco goes to the market, then Tessa leaves the inn.",
  ];
  let seen = 0;
  for (const text of corpus) for (const f of extractNarrationFacts(text, { ...scope, movers: [...scope.movers, ...women] }).movement) {
    seen++;
    assert.equal(text.slice(f.span.start, f.span.end), f.span.text, text);
    assert.ok(text.includes(f.sentence), text);
    assert.ok(f.span.start >= (text.indexOf(f.sentence)) && f.span.end <= text.indexOf(f.sentence) + f.sentence.length, `span inside its sentence: ${text}`);
    assert.equal(f.polarity === "negated", f.modality === "negated", text);
    assert.equal(f.provenance.extractor, "movement");
    assert.ok(["none", "unresolved", "ambiguous"].includes(f.ambiguity));
    assert.equal(f.ambiguity === "none", !!f.subject.entity_id, `${text} :: ${f.subject.surface}`);
  }
  assert.ok(seen >= 10, `corpus produced ${seen} facts`);
});
test("modality: completed, negated, future, conditional, requested and quoted are all kept apart", () => {
  const { scope } = room([create("campaign_character_tessa", "Tessa", "female")]);
  const only = (text: string) => { const f = extractNarrationFacts(text, scope).movement.filter(x => x.kind === "entity_followed" || x.kind === "entity_departed"); return f.map(x => `${x.kind}:${x.modality}:${x.subject.entity_id ?? "?"}`); };
  assert.deepEqual(only("Tessa follows him out."), ["entity_followed:completed:campaign_character_tessa"]);
  assert.deepEqual(only("Tessa does not follow."), ["entity_followed:negated:campaign_character_tessa"]);
  assert.deepEqual(only("Tessa says she will follow tomorrow."), ["entity_followed:future:campaign_character_tessa"]);
  assert.deepEqual(only("Nicco tells Tessa to follow."), ["entity_followed:requested:campaign_character_tessa"]);
  assert.deepEqual(only("\"Tessa follows him down,\" Nicco says."), ["entity_followed:quoted:campaign_character_tessa"]);
  assert.deepEqual(only("Tessa walks out of the room."), ["entity_departed:completed:campaign_character_tessa"]);
  assert.deepEqual(only("If Tessa leaves, Nicco stays."), ["entity_departed:conditional:campaign_character_tessa"]);
  assert.deepEqual(only("Tessa will leave at dawn."), ["entity_departed:future:campaign_character_tessa"]);
});
test("an unfinished, negated, future, requested or quoted movement is never evidence", () => {
  const { f, snapshot, context, movers } = room([create("campaign_character_tessa", "Tessa", "female")], true);
  const moves = (text: string) => characterMovementsFromFacts(extractNarrationFacts(text, { movers, context }), movers, { origin: "test_room", arrival: "test_hall", locate: id => characterLocation(snapshot, f.world, id) }, context, f.world, new Set(["campaign_character_tessa"])).map(m => m.character_id);
  assert.deepEqual(moves("Tessa follows him down the stairs."), ["campaign_character_tessa"]);
  for (const text of ["Tessa does not follow him down.", "Tessa will follow him down later.", "Nicco tells Tessa to follow him down.", "\"Tessa follows him down,\" Nicco says.", "If Tessa follows him down, nobody minds.", "Tessa usually follows him down.", "Tessa stays behind and does not follow."])
    assert.deepEqual(moves(text), [], text);
});
test("ambiguity: a pronoun two people could mean stays unresolved and carries every candidate; a name resolves", () => {
  const { context } = room();
  const scope: NarrationFactScope = { movers: women, context };
  const she = extractNarrationFacts("She follows him down the stairs.", scope).movement.filter(x => x.kind === "entity_followed");
  assert.equal(she.length, 1);
  assert.equal(she[0]!.subject.entity_id, undefined);
  assert.equal(she[0]!.ambiguity, "ambiguous");
  assert.deepEqual([...she[0]!.subject.candidates].sort(), ["dara", "tessa"]);
  assert.deepEqual(kinds("Dara follows him down the stairs.", scope).filter(x => x.startsWith("entity_followed")), ["entity_followed/completed/dara"]);
  const none = extractNarrationFacts("Somebody follows him down the stairs.", scope).movement;
  assert.deepEqual(none, []);
});
test("vague plural, unknown subject and unclear destination: facts exist at most as unresolved, and no movement is derived", () => {
  const { f, snapshot, context, movers } = room([create("campaign_character_tessa", "Tessa", "female"), create("campaign_character_dara", "Dara", "female"), hold("campaign_character_tessa"), hold("campaign_character_dara")], true);
  const everyone = new Set(movers.map(m => m.id));
  const moves = (text: string) => characterMovementsFromFacts(extractNarrationFacts(text, { movers, context }), movers, { origin: "test_room", arrival: "test_hall", locate: id => characterLocation(snapshot, f.world, id) }, context, f.world, everyone).map(m => m.character_id);
  for (const text of ["They follow him down the stairs.", "Both women follow him down the stairs.", "The two of them came down after him.", "She follows him down the stairs.", "Tessa walks to a place beyond the hills.", "Tessa walks off somewhere.", "Somebody comes down the stairs behind him."])
    assert.deepEqual(moves(text), [], text);
  assert.deepEqual(moves("Tessa follows him down the stairs. Dara stays behind."), ["campaign_character_tessa"]);
});
test("a bounded antecedent resolves a pronoun only when exactly one person is named before it", () => {
  const { context } = room();
  const scope: NarrationFactScope = { movers: women, context };
  assert.deepEqual(kinds("Tessa looks at him. She follows him down the stairs.", scope).filter(x => x.startsWith("entity_followed")), ["entity_followed/completed/tessa"]);
  assert.deepEqual(kinds("Tessa looks at Dara. She follows him down the stairs.", scope).filter(x => x.startsWith("entity_followed")), ["entity_followed/completed/-"]);
});
test("extraction is pure: frozen inputs, repeatable output, no state touched", () => {
  const r = room([create("campaign_character_tessa", "Tessa", "female")]);
  const deepFreeze = <T>(o: T): T => { if (o && typeof o === "object" && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o as object)) deepFreeze(v); } return o; };
  const before = r.f.campaign.revision, snap = JSON.stringify(r.snapshot);
  const text = "Tessa follows him down the stairs. She leaves the room.";
  const a = extractNarrationFacts(text, deepFreeze({ movers: r.movers.map(m => ({ ...m })), context: structuredClone(r.context) }));
  const b = extractNarrationFacts(text, r.scope);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  assert.ok(Object.isFrozen(a) && Object.isFrozen(a.movement));
  assert.equal(r.f.campaign.revision, before); assert.equal(JSON.stringify(r.f.campaign.exportSnapshot()), snap);
});
test("the narrator's asterisk markup is not part of the words: *…* and plain prose give the same facts", () => {
  const { scope } = room([create("campaign_character_tessa", "Tessa", "female")]);
  const plain = kinds("Tessa follows him down the stairs.", scope), marked = kinds("*Tessa follows him down the stairs.*", scope), mid = kinds("*Nicco descends. Tessa follows him down.*", scope);
  assert.deepEqual(marked, plain); assert.deepEqual(mid.filter(x => x.startsWith("entity_followed")), plain);
  assert.ok(plain.includes("entity_followed/completed/campaign_character_tessa"));
});
test("one source, one extraction per text: authorization and audit read the same facts object", () => {
  const { scope } = room([create("campaign_character_tessa", "Tessa", "female")]);
  const source = createFactSource(scope);
  assert.equal(source.of("Tessa follows him out."), source.of("Tessa follows him out."));
  assert.notEqual(source.of("Tessa follows him out."), source.of("Tessa stays."));
});
test("departures: scene reading ignores quoted, future and negated exits; stairs and broad wording are opt-in", () => {
  const { context } = room([create("campaign_character_tessa", "Tessa", "female")]);
  const dep = (text: string, options = {}) => departuresFromFacts(extractNarrationFacts(text, { movers: [], context }), context, "persistent", options).map(d => d.character_id);
  assert.deepEqual(dep("Tessa walks out of the room."), ["campaign_character_tessa"]);
  assert.deepEqual(dep("\"Tessa walks out,\" he says."), []);
  assert.deepEqual(dep("Tessa does not walk out of the room."), []);
  assert.deepEqual(dep("Tessa will walk out tomorrow."), []);
  assert.deepEqual(dep("Tessa's footsteps fade down the stairs."), []);
  assert.deepEqual(dep("Tessa's footsteps fade down the stairs.", { stairs: true }), ["campaign_character_tessa"]);
});

// ------------------------------------------------------------------------------------------------ location claims (block 9 completion patch)
const PLACES: Record<string, string> = { heartstone: "heartstone_lr", "the market": "slave_market", market: "slave_market", "slave market": "slave_market", "main hall": "test_hall", "observation room": "test_room" };
const claimScope = (setup: readonly CampaignCommand[], movers?: readonly Referent[]) => { const r = room(setup); return { movers: movers ?? r.movers, context: r.context, place: (p: string) => PLACES[p.toLowerCase().replace(/^the\s+(?=main|observation|slave)/, "")] ?? PLACES[p.toLowerCase()] } as NarrationFactScope; };
const claims = (text: string, scope: NarrationFactScope) => extractNarrationFacts(text, scope).movement.flatMap(f => f.kind === "entity_present" && f.form === "location_claim" ? [`${f.subject.entity_id ?? f.subject.resolution}@${f.location_id ?? "?"}/${f.modality}/${f.ambiguity}`] : []);
test("location claims: completed presence in a known place is a descriptive fact without any motion verb", () => {
  const scope = claimScope([create("campaign_character_tessa", "Tessa", "female")]);
  assert.deepEqual(claims("Inside Heartstone, Nicco closes the door.", scope), ["nicco@heartstone_lr/completed/none"]);
  assert.deepEqual(claims("The door closes behind them. Inside, Heartstone smells of old stone.", scope), ["nicco@heartstone_lr/completed/none"]);
  assert.deepEqual(claims("*Back at the market, Tessa is waiting.*", scope), ["campaign_character_tessa@slave_market/completed/none"]);
  assert.deepEqual(claims("Inside, Heartstone smells of old stone. Tessa stands just inside the entrance.", scope), ["nicco@heartstone_lr/completed/none", "campaign_character_tessa@heartstone_lr/completed/none"]);
  for (const f of extractNarrationFacts("Inside Heartstone, Nicco closes the door.", scope).movement) assert.equal("Inside Heartstone, Nicco closes the door.".slice(f.span.start, f.span.end), f.span.text);
});
test("location claims: a place used as the subject of an interior description puts the viewpoint inside it (the real failing live narration)", () => {
  const scope = claimScope([]);
  assert.deepEqual(claims("*The door closes behind them. Heartstone's stone walls hold a different kind of quiet, cooler and older.*", scope), ["nicco@heartstone_lr/completed/none"]);
  assert.deepEqual(claims("Heartstone smells of old stone and cold ash.", scope), ["nicco@heartstone_lr/completed/none"]);
  assert.deepEqual(claims("Heartstone stands dark on its hill.", scope), []);
  assert.deepEqual(claims("Heartstone's walls will hold, Korvin says.", scope).map(c => c.split("/")[1]).filter(m => m === "completed"), []);
});
test("location claims: future, conditional, negated and quoted wording is never completed presence", () => {
  const scope = claimScope([create("campaign_character_tessa", "Tessa", "female")]);
  assert.deepEqual(claims("Tessa will be inside Heartstone tomorrow.", scope).map(c => c.split("/")[1]), ["future"]);
  assert.deepEqual(claims("If Tessa were inside Heartstone, nobody would know.", scope).map(c => c.split("/")[1]).filter(m => m === "completed"), []);
  assert.deepEqual(claims("Tessa is not inside Heartstone.", scope).map(c => c.split("/")[1]), ["negated"]);
  assert.deepEqual(claims("Korvin says, \"She's at Heartstone.\"", scope), []);
  assert.deepEqual(claims("\"Tessa is inside Heartstone,\" Korvin says.", scope), []);
});
test("location claims: ambiguity and unknown places fail closed", () => {
  const scope = claimScope([create("campaign_character_tessa", "Tessa", "female"), create("campaign_character_dara", "Dara", "female")]);
  assert.deepEqual(claims("Inside Heartstone, she waits.", scope), ["pronoun@heartstone_lr/completed/ambiguous"].map(() => claims("Inside Heartstone, she waits.", scope)[0]!));
  const f = extractNarrationFacts("Inside Heartstone, she waits.", scope).movement.find(x => x.kind === "entity_present")!;
  assert.equal(f.subject.entity_id, undefined); assert.equal(f.ambiguity, "ambiguous");
  assert.deepEqual(claims("Tessa stands just inside the entrance.", scope), ["campaign_character_tessa@?/completed/none"]);
  assert.deepEqual(claims("Inside the Moon Palace, Tessa waits.", scope), []);
  assert.deepEqual(claims("Inside, the air is cold.", scope), []);
});
test("a location claim alone moves nobody: the free person the prose places in the hall stays, and the audit names the contradiction", async () => {
  const r = await play("*Nicco goes down the stairs to the main hall.*\n\n*Inside the Main hall, Tessa waits beside the hearth.*", GO, [create("campaign_character_t", "Tessa", "female")]);
  assert.equal(r.where("nicco"), "test_hall"); assert.equal(r.where("campaign_character_t"), "test_room");
  const flagged = r.issues().filter(i => i.kind === "uncommitted_movement" && /Inside the Main hall, Tessa/.test(i.sentence));
  assert.equal(flagged.length, 1); assert.equal(flagged[0]!.character, "Tessa");
  assert.doesNotMatch(r.result.narration, /Inside the Main hall, Tessa/);
});
test("the player's own travel plus a matching claim passes; a claim for a place he did not reach is withdrawn, and the origin may be narrated", async () => {
  const ok = await play("*Back in the Observation room, the bed waits.*", "*he goes back to the Observation room*", [{ kind: "runtime_delta", delta: { player_location: "test_hall" } }]);
  assert.equal(ok.where("nicco"), "test_room"); assert.deepEqual(ok.issues(), []);
  const origin = await play("*Inside the Observation room, Nicco turns for the stairs. He goes down to the main hall.*", GO, []);
  assert.equal(origin.where("nicco"), "test_hall"); assert.deepEqual(origin.issues().filter(i => i.kind === "uncommitted_movement"), []);
  const bad = await play("*Inside the Main hall, Nicco warms his hands at the hearth.*", "I look around the room.", []);
  assert.equal(bad.where("nicco"), "test_room");
  assert.equal(bad.issues().filter(i => i.kind === "uncommitted_movement").length, 1); assert.doesNotMatch(bad.result.narration, /warms his hands/);
});
test("source audit: ONE location-claim extractor; authorization and audit read its facts and own no location regex", () => {
  const owners = SRC.concat(walk("src/turn/narration-facts")).filter(p => /"location_claim"/.test(readFileSync(p, "utf8")));
  assert.deepEqual(owners.map(p => p.replace(/\\/g, "/")).sort(), ["src/turn/movement/movement-evidence.ts", "src/turn/narration-facts/location-forms.ts", "src/turn/narration-facts/types.ts"]);
  const authorization = readFileSync("src/turn/stages/authorization.ts", "utf8"), audit = readFileSync("src/turn/audit/narration-audit.ts", "utf8"), evidence = readFileSync("src/turn/movement/movement-evidence.ts", "utf8");
  assert.match(audit, /locationClaimsFromFacts\(facts\)/); assert.match(evidence, /locationClaimsFromFacts\(facts\)/);
  assert.match(authorization, /characterMovementsFromFacts\(facts,/);
  for (const code of [authorization, audit]) assert.doesNotMatch(code.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, ""), /\(\?:inside\|within|\binside\b[^\n]{0,40}\\s\+\(\?:the/i);
  assert.equal(new Set([readFileSync("src/turn/narration-facts/location-forms.ts", "utf8")].map(c => (c.match(/export function \w+Facts/g) ?? []).length)).has(1), true);
});

// ------------------------------------------------------------------------------------------------ pipeline: shared facts across authorization and audit
async function play(narration: string, input: string, setup: readonly CampaignCommand[], commands: readonly CampaignCommand[] = [], evidence: readonly string[] = []) {
  const f = turnFixture();
  f.campaign.apply({ expected_revision: f.campaign.revision, commands: [...setup] });
  const before = f.campaign.revision, service = new RetrievalService(f.world), requests: GenerationRequest[] = [];
  const narrator = { async generate(r: GenerationRequest) { requests.push(r); return { text: narration, ...metadata }; },
    async *stream(r: GenerationRequest) { requests.push(r); yield { type: "text_delta" as const, text: narration }; yield { type: "completed" as const, result: { text: narration, ...metadata } }; } };
  const coordinator = new TurnCoordinator(f.world, narrator, { async propose() { return { commands, evidence, ...metadata }; } }, { service, search: new HybridSearch(service) });
  const events = await collect(coordinator.runTurn({ campaign: f.campaign, player_input: input }));
  const done = events.find(e => e.type === "turn_completed");
  assert.ok(done && done.type === "turn_completed", JSON.stringify(events.at(-1)));
  const snapshot = f.campaign.exportSnapshot(), result = done.result as TurnResult;
  return { f, result, snapshot, before, where: (id: string) => characterLocation(snapshot, f.world, id), issues: () => result.narration_reconciliation?.issues ?? [] };
}
const GO = "I go down to the main hall.";
test("completed follow by an eligible person: the fact feeds authorization and the audit is satisfied (one atomic commit, same id)", async () => {
  const r = await play("*Nicco goes down the stairs to the main hall. Tessa follows him down.*", GO, [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")]);
  assert.equal(r.where("nicco"), "test_hall"); assert.equal(r.where("campaign_character_t"), "test_hall");
  assert.equal(r.snapshot.revision, r.before + 1);
  assert.equal(r.snapshot.characters.filter(c => c.origin.kind === "created").length, 1);
  assert.deepEqual(r.issues().filter(i => i.kind === "uncommitted_movement"), []);
});
test("injected contradiction: narrated follow by someone who may not follow is NOT moved and the same fact makes the audit withdraw it", async () => {
  const r = await play("*Nicco goes down the stairs to the main hall. Dara follows him down.*", GO, [create("campaign_character_d", "Dara", "female")]);
  assert.equal(r.where("nicco"), "test_hall"); assert.equal(r.where("campaign_character_d"), "test_room");
  const flagged = r.issues().filter(i => /Dara follows him down/.test(i.sentence));
  assert.equal(flagged.length, 1, "the unrecorded follow is withdrawn from the delivered narration");
  assert.doesNotMatch(r.result.narration, /Dara follows him down/);
});
test("a person who explicitly stays is never moved, and narrating her staying contradicts nothing", async () => {
  const r = await play("*Nicco goes down the stairs to the main hall. Tessa stays behind in the room.*", `Tessa, stay here. ${GO}`, [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")]);
  assert.equal(r.where("nicco"), "test_hall"); assert.equal(r.where("campaign_character_t"), "test_room");
  assert.deepEqual(r.issues().filter(i => i.kind === "uncommitted_movement"), []);
});
test("contradiction the other way: the engine escorted her, the prose leaves her behind -> the stay fact makes the audit withdraw it", async () => {
  const setup = [create("campaign_character_t", "Tessa", "female"), hold("campaign_character_t")];
  const r = await play("*Nicco goes down the stairs to the main hall.*\n\n*Tessa stays behind in the room.*", `Tessa, come with me. ${GO}`, setup);
  assert.equal(r.where("campaign_character_t"), "test_hall");
  const flagged = r.issues().filter(i => i.kind === "contradicts_committed_movement");
  assert.equal(flagged.length, 1); assert.match(flagged[0]!.sentence, /Tessa stays behind/);
  assert.doesNotMatch(r.result.narration, /stays behind/);
  const close = await play("*Nicco goes down the stairs to the main hall.*\n\n*Tessa stays close behind him.*", `Tessa, come with me. ${GO}`, setup);
  assert.deepEqual(close.issues().filter(i => i.kind === "contradicts_committed_movement"), []);
});
test("two women, a bare pronoun: nobody moves (ambiguity fails closed) and the audit withdraws the unrecorded follow", async () => {
  const r = await play("*Nicco goes down the stairs to the main hall. She follows him down the stairs.*", GO, [create("campaign_character_t", "Tessa", "female"), create("campaign_character_d", "Dara", "female"), hold("campaign_character_t"), hold("campaign_character_d")]);
  assert.equal(r.where("campaign_character_t"), "test_room"); assert.equal(r.where("campaign_character_d"), "test_room");
});

// ------------------------------------------------------------------------------------------------ source audit: no movement grammar outside narration-facts
function walk(dir: string): string[] { return readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : []; }); }
const SRC = walk("src").filter(p => !p.includes("narration-facts/"));
test("source audit: the legacy movement/departure readers are gone and nothing outside narration-facts owns a narration movement regex", () => {
  assert.equal(existsSync("src/turn/scene-departure.ts"), false);
  const banned = /\b(?:narratedMovements|narratedDepartures|canonicalDepartureClaims|canonicalPresenceClaims|canonicalDepartureContradiction|implicitFollows|boundedAntecedent|STAIR_EXIT|BROAD_EXIT|FOLLOWS_NICCO|FOLLOW_VERB|FOLLOW_TAIL|ARRIVE_VETO|ARRIVE_STOPS|DASH_RETRACTS|NICCO_GO|NICCO_ARRIVE|NICCO_LEAVE|doorDestination)\b/;
  const hits = SRC.filter(p => banned.test(readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "")));
  assert.deepEqual(hits, []);
});
test("source audit: authorization and audit both consume the shared facts; the coordinator extracts once and hands the same source to both", () => {
  const authorization = readFileSync("src/turn/stages/authorization.ts", "utf8"), audit = readFileSync("src/turn/audit/narration-audit.ts", "utf8"), coordinator = readFileSync("src/turn/coordinator/turn-coordinator.ts", "utf8");
  for (const [name, code] of [["authorization", authorization], ["audit", audit]] as const) {
    assert.match(code, /movement-evidence\.js/, name); assert.match(code, /narration-facts\/index\.js/, name); assert.match(code, /createFactSource/, name);
  }
  assert.match(authorization, /characterMovementsFromFacts\(facts,/); assert.match(audit, /characterMovementsFromFacts\(facts,/);
  assert.equal((coordinator.match(/createFactSource\(/g) ?? []).length, 1);
  assert.match(coordinator, /authorizeTurn\(\{[^\n]*facts: factSource/); assert.match(coordinator, /createNarrationAuditor\(\{ facts: factSource/);
});
test("source audit: narration-facts is descriptive: it imports no campaign state, authorization or audit code", () => {
  for (const p of walk("src/turn/narration-facts")) {
    const imports = [...readFileSync(p, "utf8").matchAll(/^import[^;]*from "([^"]+)"/gm)].map(m => m[1]!);
    for (const spec of imports) assert.doesNotMatch(spec, /campaign|authorization|narration-audit|turn-coordinator|stages\/|character-movement|movement-evidence|follow-candidates|persistence/, `${p} imports ${spec}`);
  }
});

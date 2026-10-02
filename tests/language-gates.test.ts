import test from "node:test";
import assert from "node:assert/strict";
import { DISQUALIFY_FAILSAFE, GATES, type GateId } from "../src/turn/language/gates.js";
import { cueGate } from "../src/turn/language/cues.js";

/**
 * Hardening H1: characterization and locked verdict matrix for every negation/modality gate.
 *
 * LEGACY holds verbatim copies of each gate's pre-H1 local regex (extracted from source before migration, full definitions — never
 * truncated). Every migrated gate must reproduce its legacy verdict on the whole probe corpus. The only permitted divergence is the
 * documented H1 fix: in FIXED gates, "no hesitation" / "no warning" / "no word" (and, in disqualify, "no/without hesitation") are no
 * longer read as negation. Those gates must equal legacy on the probe with exactly those phrases neutralised.
 */
const LEGACY: Readonly<Record<GateId, RegExp>> = {
  disqualify: /\b(?:not|never|no|nor|maybe|perhaps|might|could|would|should|can|cannot|will|shall|may|if|unless|whether|almost|nearly|imagin\w*|consider\w*|pretend\w*|suppos\w*|refus\w*|declin\w*|reject\w*|instead|steps? back|stepped back|stepping back|backs? away|backed away|backing away|draws? back|drew back|pulls? back|pulled back|(?:hands?|handed|gives?|gave|pushes?|pushed|returns?|returned|holds?|held)(?: \w+){0,4} back|(?:tells?|told|asks?|asked|urges?|urged|orders?|ordered|invites?|invited) (?:him|her|them|nicco|\w+) to|stops?|stopped|hesitat\w*|wants? to|wanted to|about to|going to|intends? to|plans? to|starts? to|started to|begins? to|began to|tries to|tried to|thinks? better|opens? (?:his|her) mouth)\b|n't\b|'ll\b|\?/i,
  refusal: /\b(?:refus\w*|declin\w*|reject\w*)\b/i,
  movement_not_done: /\b(?:could|would|should|might|may|can|will|won't|shall|plans?|planning|planned|intends?|wants?|wanted|going to|about to|ready to|tries to|tried to|later|someday|maybe|perhaps|if|unless|whether|toward|towards|looks?|looked|looking|glances?|glanced|stares?|imagines?|thinks?|promises?|says he'?ll|not|never|no longer)\b|n't\b|\?/i,
  departure_not_done: /\b(?:not|never|no|nor|won't|will|would|could|should|might|may|can|cannot|if|unless|until|whether|threaten\w*|about to|going to|ready to|starts? to|started to|begins? to|began to|tries to|tried to|wants? to|wanted to|means? to|intends? to|almost|nearly|toward|towards|for the door|to (?:leave|go|walk|get out|head|step)|as if|as though)\b|n't\b|\?/i,
  grounding_hedged: /\b(?:if|would|could|might|maybe|perhaps|suppose|unless|whether|not|never|no|haven't|hasn't|didn't|don't|won't)\b|n't\b|\?/i,
  household_not_a_choice: /\b(?:if|maybe|perhaps|would|could|might|not|never|don'?t know|for now|tonight|for a while|until|someday|one day)\b|\?/i,
  relationship_hedged: /\b(?:if|maybe|perhaps|would|could|might|almost|nearly|pretend\w*|about to|wants? to|tries to)\b|\?/i,
  captive_fact_hedge: /\b(?:maybe|perhaps|probably|possibly|might|seems?|seemed|as if|impossible to tell|hard to tell|or so|or less|or more|guess)\b/i,
  audit_negated: /\b(?:not|never|no|nor|without|n't|almost|nearly|would|could|might|will|if)\b|n't\b/i,
  audit_source_denial: /\b(?:if|whether|not|never|no one|nobody|haven't|hasn't|don't|didn't|won't|can't|nor|without)\b|n't\s*$/i,
  audit_hypothetical: /\b(?:if|would|could|suppose|imagine|were to|unless|might)\b/i,
  audit_denied: /\b(?:not|never|no longer|not yet|isn't|wasn't|won't|if|whether|would|might|could|maybe)\b|n't\b|\?/i,
  natural_action_hedge: /\b(?:almost|nearly|pretends?|pretending|considers?|considering|thinks? about|wants? to|wanting to|would like to|plans? to|about to|tries to|trying to|starts? to|begins? to|reaches? for|reaching for|imagines?|dreams? of|doesn'?t|does not|didn'?t|never|won'?t|will|would|could|might|should|if|someday|maybe|yesterday|earlier)\b/i,
  transaction_hedge: /\b(?:if|maybe|perhaps|would|could|should|might|not|never|don'?t|won'?t|how much|let me (?:look|see|think)|thinking|consider\w*)\b|\?/i,
  player_event_negated: /\b(?:not|never|no(?! (?:warning|hesitation|word))|nor|almost|nearly|pretends?|pretending|threaten\w*|tries to|tried to|trying to|attempts? to|wants? to|wanted to|about to|going to|starts? to|started to|begins? to|reaches? for|would|could|might|will|should|if|unless|without)\b|n't\b/i,
  // H5.1: new gate, no pre-H1 legacy — this literal is its reference definition, held independently of the cue table.
  // NPC+ Pass 4: new gates, no pre-H1 legacy — reference definitions held independently of the cue table.
  absent_reference: /\b(?:not|never|no(?! (?:warning|hesitation|word))|nor|without|cannot|almost|nearly|would|could|might|if|unless|were to|suppose|imagine|imagines?|remember\w*|recall\w*|according to|used to|(?:thinks?|thought) of)\b|n't\b/i,
  past_displacement: /\b(?:yesterday|earlier|ago|last night)\b/i,
  // NPC+ Pass 9: new gates, no pre-H1 legacy — reference definitions held independently of the cue table.
  follow_not_done: /\b(?:could|would|should|might|may|can|will|won't|shall|plans?|planning|planned|intends?|wants?|wanted|going to|about to|ready to|tries to|tried to|someday|maybe|perhaps|if|unless|whether|toward|towards|looks?|looked|looking|glances?|glanced|stares?|imagines?|thinks?|promises?|says he'?ll|not|never|no longer|almost|nearly|refus\w*|declin\w*|reject\w*|yesterday|earlier|ago|last night|tomorrow|remember\w*|recall\w*|used to|usually|normally|typically|generally|habitually|frequently|invariably|regularly|routinely|customarily|ordinarily|always|often|sometimes|occasionally|as usual|whenever|every time|each time)\b|n't\b|\?/i,
  invitation_not_offered: /\b(?:not|never|if|unless|were to|suppos\w*|imagin\w*|yesterday|earlier|ago|last night|tomorrow|someday|one day|remember\w*|recall\w*|used to|threaten\w*|must|(?:have|has) to|or else|order\w*|command\w*|don'?t|doesn'?t|didn'?t|won'?t)\b|n't\b/i,
  player_movement_not_done: /\b(?:not|never|nor|cannot|don'?t|doesn'?t|didn'?t|won'?t|would|could|should|might|may|can|will|shall|would like to|almost|nearly|pretends?|pretending|considers?|considering|thinks? about|thinking|wants? to|wanting to|plans? to|plans?|planning|intends? to|about to|going to|tries to|trying to|starts? to|begins? to|dreams? of|imagines?|maybe|perhaps|if|unless|whether|suppose|someday|one day|later|tomorrow|tonight|yesterday|earlier)\b|n't\b|'ll\b|\?/i,
};
/** Gates carrying the intended H1 bare-no / no-hesitation fix. Every other gate must be verdict-identical to legacy. */
const FIXED: ReadonlySet<GateId> = new Set(["disqualify", "departure_not_done", "grounding_hedged", "audit_negated"]);
// Order matters: the hesitation noun is neutralised while its "no"/"without" is still visible to the look-behind.
const neutralise = (s: string) => s.replace(/(?<=\b(?:no|without) )hesitat\w*/gi, "zz").replace(/\bno(?= (?:warning|hesitation|word|zz))/gi, "zz");
/** H1 change 3 (disqualify only): attempted / act-scoped epistemic cues ADD vetoes. */
const FAILSAFE = cueGate({ cues: DISQUALIFY_FAILSAFE });
const expectedVerdict = (id: GateId, p: string) => !FIXED.has(id) ? LEGACY[id].test(p) : LEGACY[id].test(neutralise(p)) || (id === "disqualify" && FAILSAFE.test(p));

const CUE_WORDS = ["not", "never", "no", "nor", "cannot", "does not", "no longer", "not yet", "no one", "nobody", "without", "won't", "don't", "didn't", "haven't",
  "hasn't", "isn't", "wasn't", "can't", "doesnt", "didnt", "dont", "wont", "doesn't", "refuses", "refused", "declines", "declined", "rejects", "rejected", "instead",
  "steps back", "stepped back", "stepping back", "backs away", "backed away", "backing away", "draws back", "drew back", "pulls back", "pulled back",
  "hands the boots back", "gives them right back", "pushes the coin back", "returned it back", "holds it back", "stops", "stop", "stopped", "hesitates", "hesitated",
  "hesitation", "hesitantly", "thinks better", "opens her mouth", "tells him to", "asked Brenna to", "orders them to", "would", "could", "should", "might", "may",
  "can", "will", "shall", "would like to", "if", "unless", "whether", "until", "were to", "suppose", "supposedly", "maybe", "perhaps", "probably", "possibly",
  "seems", "seem", "seemed", "as if", "as though", "guess", "impossible to tell", "hard to tell", "or so", "or less", "or more", "imagine", "imagines", "imagined",
  "tries to", "tried to", "trying to", "attempts to", "attempt to", "wants to", "want to", "wanted to", "wanting to", "wants", "want", "wanted", "about to",
  "going to", "ready to", "starts to", "start to", "started to", "begins to", "begin to", "began to", "intends to", "intend to", "intends", "plans to", "plan to",
  "plans", "plan", "planning", "planned", "means to", "mean to", "reaches for", "reach for", "reaching for", "almost", "nearly", "pretends", "pretend", "pretending",
  "pretended", "threatens", "threatened", "threatening", "considers", "consider", "considering", "considered", "thinks about", "think about", "thinks", "think",
  "thinking", "dreams of", "dream of", "promises", "promise", "says he'll", "says hell", "looks", "look", "looked", "looking", "glances", "glance", "glanced",
  "stares", "stare", "toward", "towards", "for the door", "to leave", "to go", "to walk", "to get out", "to head", "to step", "later", "someday", "one day",
  "for now", "tonight", "for a while", "yesterday", "earlier", "don't know", "dont know", "how much", "let me look", "let me see", "let me think", "no hesitation",
  "no warning", "no word", "no words", "No hesitation", "NO WARNING", "without hesitation", "without a word", "she'll", "I'll", "?",
  "seems to", "seemed to", "as if to", "attempted to", "seems pleased", "as if they"];
/** Substrings of cue words that must not match as whole words. */
const DECOYS = ["nothing", "notice", "knot", "nod", "nods", "north", "noon", "nobleman", "nevertheless", "norm", "cannon", "canny", "mayor", "willow", "willing",
  "shallow", "ifrit", "shelf", "untilled", "wonton", "stopwatch", "hesitancy", "seamstress", "wantonly", "planet", "lookout", "tonights", "earliest", "anyway",
  "guesthouse", "mightily", "nora", "notary", "nobody's", "unrefusable", "trytonot", "imaginary friend"];
const TEMPLATES = (w: string) => [w, `She ${w} it.`, `${w} she takes it.`, `She takes it, ${w}.`, `Brenna ${w} take the boots`, `"${w}," she says.`, `he said he ${w}`];
const PROBES = [...new Set([...CUE_WORDS, ...DECOYS].flatMap(TEMPLATES))];

test("characterization: every migrated gate reproduces its legacy verdicts on the probe corpus", () => {
  assert.ok(PROBES.length > 1200, `probe corpus too small: ${PROBES.length}`);
  for (const id of Object.keys(LEGACY) as GateId[]) {
    const mismatches = PROBES.filter(p => GATES[id].test(p) !== expectedVerdict(id, p));
    assert.deepEqual(mismatches, [], `${id} diverges from legacy`);
  }
});
test("characterization: the H1 fix is live — each FIXED gate differs from legacy only on the documented phrases", () => {
  for (const id of FIXED) {
    const changed = PROBES.filter(p => GATES[id].test(p) !== LEGACY[id].test(p));
    const removed = changed.filter(p => LEGACY[id].test(p) && !GATES[id].test(p)), added = changed.filter(p => !LEGACY[id].test(p) && GATES[id].test(p));
    assert.ok(removed.length > 0, `${id}: bare-no fix not live`);
    for (const p of removed) assert.match(p, /\b(?:no|without) (?:warning|hesitation|word)/i, `${id}: unexpected removed veto on ${JSON.stringify(p)}`);
    if (id !== "disqualify") assert.deepEqual(added, [], `${id}: only disqualify may add vetoes`);
    else { assert.ok(added.length > 0, "disqualify fail-safe not live"); for (const p of added) assert.ok(FAILSAFE.test(p), `disqualify: unexpected added veto on ${JSON.stringify(p)}`); }
  }
});
test("gates are non-global and stateless across repeated .test calls", () => {
  for (const [id, gate] of Object.entries(GATES)) {
    assert.equal(gate.global, false, id); assert.equal(gate.sticky, false, id); assert.equal(gate.ignoreCase, true, id);
    const probe = "She would take it.", first = gate.test(probe);
    for (let i = 0; i < 5; i++) assert.equal(gate.test(probe), first, id);
  }
});

/**
 * Locked negation/modality matrix. Gates are EXPECTED to differ; this table makes every difference explicit. A change to any gate or
 * cue that flips a cell must update this table in the same change, with a reason. X = vetoes (not a completed/asserted act).
 */
const CUES = {
  plain_assertion: "She takes it.", explicit_negation: "She does not take it.", contraction_negation: "She doesn't take it.",
  bare_no: "She has no intention of taking it.", no_hesitation: "She takes it, no hesitation.", no_warning: "She leaves, no warning.",
  no_word: "She leaves, no word to anyone.", refusal: "She refuses it.", hesitation: "She hesitates, then takes it.",
  retraction: "She steps back.", seems: "She seems to take it.", probably: "She probably takes it.", tries: "She tries to take it.",
  attempts: "She attempts to take it.", almost: "She almost takes it.", question: "Does she take it?", looks: "She looks at the door.",
  glances: "She glances at the door.", toward: "She walks toward the door.", without: "She takes it without a word.",
  without_hesitation: "She takes it without hesitation.", pretends: "She pretends to take it.", future: "She'll take it.",
  conditional: "If she takes it, fine.", modal: "She would take it.", told_to: "Brenna tells him to take it.",
} as const;
//                                          plain│neg│n't│no│no-hes│no-warn│no-word│refuse│hesit│retract│seems│prob│tries│attempts│almost│?│looks│glance│toward│without│w/o-hes│pretend│'ll│if│would│told-to
const EXPECTED: Readonly<Record<GateId, string>> = {
  disqualify:             ".XXX...XXXXXXXXX.....XXXXX",
  refusal:                ".......X..................",
  movement_not_done:      ".XX.........X..XXXX....XX.",
  departure_not_done:     ".XXX........X.XX..X....XX.",
  grounding_hedged:       ".XXX...........X.......XX.",
  household_not_a_choice: ".X.............X.......XX.",
  relationship_hedged:    "............X.XX.....X.XX.",
  captive_fact_hedge:     "..........XX..............",
  audit_negated:          ".XXX..........X....XX..XX.",
  audit_source_denial:    ".X.................XX..X..",
  audit_hypothetical:     ".......................XX.",
  audit_denied:           ".XX............X.......XX.",
  natural_action_hedge:   ".XX.........X.X......X.XX.",
  transaction_hedge:      ".X.............X.......XX.",
  player_event_negated:   ".XXX........XXX....XXX.XX.",
  player_movement_not_done: ".XX.........X.XX.....XXXX.",
  absent_reference:         ".XXX..........X....XX..XX.",
  past_displacement:        "..........................",
  // NPC+ Pass 9. follow_not_done = movement_not_done minus `later`, plus refusal/almost (so it also vetoes refuse/almost/tries).
  // NPC+ Pass 10: plus the HABITUAL cues (usually/normally/always/whenever…): a tendency is not this turn's follow.
  // invitation_not_offered reads player input: questions and modal requests stay invitations; negation and "if" do not.
  follow_not_done:          ".XX....X....X.XXXXX....XX.",
  invitation_not_offered:   ".XX....................X..",
};
test("locked negation/modality verdict matrix (divergence between gates is explicit, never accidental)", () => {
  const cues = Object.values(CUES);
  assert.deepEqual(Object.keys(EXPECTED).sort(), Object.keys(GATES).sort(), "every gate must have a matrix row");
  for (const [id, row] of Object.entries(EXPECTED) as [GateId, string][]) {
    assert.equal(row.length, cues.length, `${id}: row width`);
    const actual = cues.map(c => GATES[id].test(c) ? "X" : ".").join("");
    assert.equal(actual, row, `${id}: matrix row changed`);
  }
});
test("matrix invariants: no gate vetoes a plain assertion; only refusal-aware gates veto refusal", () => {
  for (const [id, gate] of Object.entries(GATES)) assert.equal(gate.test(CUES.plain_assertion), false, id);
  const refusing = Object.entries(GATES).filter(([, g]) => g.test(CUES.refusal)).map(([id]) => id).sort();
  // NPC+ Pass 9: follow_not_done is refusal-aware on purpose ("Maren refuses to follow" must never resolve to Nicco's arrival).
  assert.deepEqual(refusing, ["disqualify", "follow_not_done", "refusal"]);
  for (const id of ["disqualify", "departure_not_done", "grounding_hedged", "audit_negated", "player_event_negated"] as const) {
    for (const phrase of [CUES.no_hesitation, CUES.no_warning, CUES.no_word]) assert.equal(GATES[id].test(phrase), false, `${id}: ${phrase}`);
  }
});

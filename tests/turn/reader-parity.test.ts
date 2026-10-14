import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadWorld } from "../../src/world/loader.js";
import { createOpeningCampaign } from "../../src/campaign/opening-state.js";
import type { CampaignState } from "../../src/campaign/campaign-state.js";
import type { CampaignCommand } from "../../src/campaign/types.js";
import { turnFixture } from "../../src/dev/support/turn-fixture.js";
import { GameSession, type SessionDeps } from "../../src/app/game-session.js";
import { FileCampaignRepository } from "../../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../../src/turn/coordinator/turn-coordinator.js";
import { RetrievalService } from "../../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../../src/retrieval/hybrid-search.js";
import type { NarratorProvider } from "../../src/llm/narrator-provider.js";
import type { CuratedLabel } from "../../src/dev/maintenance/playthrough-manifest.js";
import type { SourcePair } from "../../src/dev/maintenance/playthrough-csv.js";
import { COORDINATOR_TAPS } from "../benchmark/harness.js";
import { runAll } from "../benchmark/runner.js";
import { SCENARIOS } from "../benchmark/scenarios.js";
import { RECEIPT_CORPUS } from "../support/receipt-corpus.js";
import { collect, metadata, setup } from "../support/turn-fixtures.js";
import { tapCoordinator, turnParity, type TappedTurn, type TurnParity } from "../support/reader-parity.js";
import * as F from "../fixtures/person-offer-playthrough.js";

/**
 * Block B5, AUD-2 parity. Every reader that commit preparation or the household evidence ran OUTSIDE the turn's shared NarrationFacts source is read
 * twice on every turn of four corpora (its fallback reading, and its reading through the turn's one fact source) and the two must be equal:
 *   1. the modern benchmark (all deterministic scenarios, real GameSession rigs);
 *   2. the curated historical playthrough records (legacy quoted prose);
 *   3. the recorded live person-offer playthrough (RPG format; Korvin's name reveal, negotiation, Accept, the bought woman's name, going home);
 *   4. the possession receipt corpus and the NPC+ contract corpus as turns (quoted and RPG-format self-descriptions, positive and negative).
 * Each turn first proves the rebuilt inputs faithful (`self_check`): the committed list reproduces the committed state, every lane emits only its declared
 * kinds, and the fallback readings reproduce the turn's own household evidence, identity result and committed contracts.
 */
const turns: { corpus: string; turn: TappedTurn }[] = [];
let corpus = "benchmark";
const sink = (turn: TappedTurn) => turns.push({ corpus, turn });

// 1. Benchmark.
COORDINATOR_TAPS.push((coordinator, world) => tapCoordinator(coordinator, world, sink));
const bench = await runAll(SCENARIOS);
COORDINATOR_TAPS.length = 0;

// 2. Curated historical playthrough records.
corpus = "curated_playthrough";
const curated = JSON.parse(await readFile("tests/playthrough/curated.json", "utf8")) as { fixtures: (CuratedLabel & SourcePair)[] };
for (const fixture of curated.fixtures) {
  const s = setup(fixture.assistant_response, fixture.expected.filter(c => c.kind !== "runtime_delta"), fixture.row === 115);
  tapCoordinator(s.coordinator, s.world, sink);
  await collect(s.coordinator.runTurn({ campaign: s.campaign, player_input: fixture.player_message }));
}

// 3. The recorded live person-offer playthrough, through a real GameSession.
corpus = "person_offer_playthrough";
const world = await loadWorld("data"), dir = await mkdtemp(join(tmpdir(), "caldrevan-reader-parity-"));
{
  const campaign: CampaignState = createOpeningCampaign(world, "reader_parity_playthrough");
  campaign.apply({ expected_revision: campaign.revision, commands: [{ kind: "runtime_delta", delta: { player_location: "calderan_slave_market" } }, { kind: "runtime_delta", delta: { time_advance_minutes: 600 } }] });
  let narration = "";
  const narrator: NarratorProvider = { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } };
  const service = new RetrievalService(world);
  const coordinator = new TurnCoordinator(world, narrator, { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  tapCoordinator(coordinator, world, sink);
  const deps: SessionDeps = { world, repository: new FileCampaignRepository(world, dir), createCoordinator: () => coordinator };
  const session = GameSession.fromCampaign(deps, campaign);
  const turn = async (t: F.FixtureTurn) => { narration = t.narration; assert.ok((await session.submitPlayerInput(t.player)).ok); };
  for (const t of [F.SELLERS_ROW, F.KORVIN_NAME_REVEAL, F.OFFER_300, F.HAGGLE, F.LOWBALL, F.DONE_DEAL, F.PAYS_PROSE, F.GIVE_GOLD_PROSE]) await turn(t);
  const card = session.getTradeView().offer!;
  assert.ok(session.acceptTradeOffer({ ref: card.ref, expected_revision: session.getView().session.revision }).ok);
  for (const t of [F.ASK_NAME_1, F.ASK_NAME_2, F.GO_HOME]) await turn(t);
  await session.shutdown({ discard_unsaved: true });
}
await rm(dir, { recursive: true, force: true });

// 4. Receipt corpus and NPC+ contract corpus, each phrase one turn in the offline fixture world with an NPC+ household present.
corpus = "phrase_corpora";
const HOME = "campaign_household_h";
const CONTRACT_LINES = ['Brenna looks at him. "I will never hurt children," she says.', '"I always speak plainly," Maren says.', '"I\'ve always been stubborn," Brenna says.',
  "Brenna hesitates, quiet and shy.", '"I won\'t hurt you," Brenna says.', '"Maybe I\'ve always been stubborn," Brenna says.', '"Would I ever hurt children?" Brenna asks.',
  '"If they push me, I will never hurt children," Brenna says.', '"Brenna has always been stubborn," Maren says.', '"I don\'t like this," Brenna says.',
  "*Brenna looks at him.*\n\nI will never hurt children.", "*Maren folds her hands.*\n\nI always speak plainly.", "*Brenna shrugs.*\n\nI've always been stubborn.",
  'Brenna smiles. "I want to stay here. This is my home."', "*Maren sets down the bowl.*\n\nI want to stay here. This is my home.", '"I trust you," Brenna says, and takes his hand.'];
for (const narration of [...CONTRACT_LINES, ...RECEIPT_CORPUS.map(p => p.text)]) {
  const f = turnFixture(), service = new RetrievalService(f.world);
  const run = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  run({ kind: "create_household", id: HOME, name: "Home" }, { kind: "set_membership", household_id: HOME, membership: { character_id: "nicco", status: "member", role: "owner" } });
  run({ kind: "join_household", household_id: HOME, character_id: "brenna" }, { kind: "join_household", household_id: HOME, character_id: "maren" });
  const coordinator = new TurnCoordinator(f.world, { async generate() { throw new Error("unused"); }, async *stream() { yield { type: "text_delta", text: narration }; yield { type: "completed", result: { text: narration, ...metadata } }; } },
    { async propose() { return { commands: [], ...metadata }; } }, { service, search: new HybridSearch(service) }, { provider_retry: false });
  tapCoordinator(coordinator, f.world, sink);
  await collect(coordinator.runTurn({ campaign: f.campaign, player_input: "Tell me about yourself." }));
}

const parity = turns.map(t => ({ ...t, parity: turnParity(t.turn) }));
const of = (name: string) => parity.filter(p => p.corpus === name);
const describe = (p: TurnParity) => p.checks.filter(c => !c.equal).map(c => `${c.reader}: ${JSON.stringify(c.text).slice(0, 120)}\n  fallback ${JSON.stringify(c.fallback).slice(0, 400)}\n  shared   ${JSON.stringify(c.shared).slice(0, 400)}`);

test("every corpus ran, the benchmark outcomes are unchanged by the tap, and every turn was rebuilt faithfully", t => {
  for (const name of ["benchmark", "curated_playthrough", "person_offer_playthrough", "phrase_corpora"]) {
    const checks = of(name).flatMap(p => p.parity.checks);
    t.diagnostic(`${name}: ${of(name).length} turns; ${["late_naming", "household_speech", "character_contract"].map(r => `${r} ${checks.filter(c => c.reader === r).length} read, ${checks.filter(c => c.reader === r && c.exercised).length} with output, ${checks.filter(c => c.reader === r && !c.equal).length} differ`).join("; ")}`);
  }
  assert.equal(bench.failed, 0); assert.equal(bench.passed, bench.total);
  for (const name of ["benchmark", "curated_playthrough", "person_offer_playthrough", "phrase_corpora"]) assert.ok(of(name).length > 0, name);
  assert.equal(of("phrase_corpora").length, CONTRACT_LINES.length + RECEIPT_CORPUS.length);
  for (const p of parity) assert.deepEqual(p.parity.self_check, [], `${p.corpus}: ${p.turn.player_input.slice(0, 80)}`);
});
for (const reader of ["late_naming", "household_speech"] as const) test(`AUD-2 parity: ${reader} reads the same through the turn's shared facts on every corpus turn (switched)`, () => {
  const checks = parity.flatMap(p => p.parity.checks.filter(c => c.reader === reader).map(c => ({ ...c, corpus: p.corpus })));
  assert.ok(checks.length >= parity.length, "one check per turn at least");
  assert.ok(checks.some(c => c.exercised), `${reader} produced output on some turn (the corpus exercises it)`);
  assert.deepEqual(parity.flatMap(p => describe({ ...p.parity, checks: p.parity.checks.filter(c => c.reader === reader) })), []);
});
test("AUD-2 parity does NOT hold for NPC+ contracts: the shared RPG reading adds a contract for each plain RPG self-description, so contracts keep their reading", () => {
  const checks = parity.flatMap(p => p.parity.checks.filter(c => c.reader === "character_contract"));
  assert.ok(checks.some(c => c.exercised && c.equal), "quoted self-descriptions read the same both ways");
  const differing = checks.filter(c => !c.equal);
  assert.deepEqual(differing.map(c => c.text).sort(), ["*Brenna looks at him.*\n\nI will never hurt children.", "*Brenna shrugs.*\n\nI've always been stubborn.", "*Maren folds her hands.*\n\nI always speak plainly."]);
  for (const c of differing) { assert.deepEqual(c.fallback, [], "the current reading makes no contract of a plain RPG line"); assert.equal((c.shared as readonly unknown[]).length, 1); }
});
test("the corpora exercise every lane that can commit in a turn", () => {
  const lanes = new Set(parity.flatMap(p => p.turn.result.committed.map(c => c.lane)));
  for (const lane of ["player_runtime", "preferred_authorization", "trade", "late_naming", "name_knowledge", "character_contract", "person_offer"]) assert.ok(lanes.has(lane as never), lane);
});

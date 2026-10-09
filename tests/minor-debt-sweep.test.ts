import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { turnFixture } from "../src/dev/turn-fixture.js";
import { CampaignState } from "../src/campaign/campaign-state.js";
import type { CampaignCommand, CampaignSnapshot } from "../src/campaign/types.js";
import { createSaveFile, decodeSave, serializeSave } from "../src/persistence/save-format.js";
import { reflectionDue, reflectionEvidence, reflectAfterTurn, type ReflectionProvider } from "../src/turn/reflection.js";
import { npcDeepSources, recoverNpcContext } from "../src/turn/npc-plus.js";
import { captureProductionReflection } from "../src/turn/structured-reflection-maintenance.js";
import { buildTurnContext } from "../src/turn/context-builder.js";
import { GameSession } from "../src/app/game-session.js";
import { FileCampaignRepository } from "../src/persistence/campaign-repository.js";
import { TurnCoordinator } from "../src/turn/turn-coordinator.js";
import { RetrievalService } from "../src/retrieval/retrieval-service.js";
import { HybridSearch } from "../src/retrieval/hybrid-search.js";
import { mockController, mockNarrator } from "./turn-fixtures.js";
import { instantReflectionPacing, productionStub, testTrajectory } from "./production-reflection-fixtures.js";

const HOME = "campaign_household_minor_debt";
function fixture() {
  const f = turnFixture();
  const run = (...commands: CampaignCommand[]) => f.campaign.apply({ expected_revision: f.campaign.revision, commands });
  run({ kind: "create_household", id: HOME }, { kind: "set_membership", household_id: HOME,
    membership: { character_id: "nicco", status: "member", role: "owner" } }, { kind: "join_household", household_id: HOME, character_id: "maren" });
  return { ...f, run, snapshot: () => f.campaign.exportSnapshot() };
}
const save = (f: ReturnType<typeof fixture>, snapshot = f.snapshot()) => serializeSave(createSaveFile(snapshot, f.world, "2026-10-05T12:00:00.000Z"), f.world);

test("D-16 current records omit deprecated refs; old nonempty refs round-trip without granting recovery", () => {
  const f = fixture();
  assert.equal(Object.hasOwn(f.snapshot().premium_characters[0]!.dynamic, "private_memory_refs"), false);
  const legacy = structuredClone(f.snapshot()) as CampaignSnapshot;
  legacy.premium_characters[0]!.dynamic.private_memory_refs = ["campaign_fact_bridge_closed"];
  const restored = CampaignState.restore(f.world, decodeSave(save(f, legacy), f.world).snapshot).exportSnapshot();
  assert.deepEqual(restored.premium_characters[0]!.dynamic.private_memory_refs, ["campaign_fact_bridge_closed"]);
  const handle = "npcmem:maren:knowledge:campaign_fact_bridge_closed";
  assert.equal(recoverNpcContext(f.world, restored, handle), undefined);
  assert.deepEqual(buildTurnContext(f.world, restored), buildTurnContext(f.world, f.snapshot()));
  const live = CampaignState.restore(f.world, restored);
  live.apply({ expected_revision: live.revision, commands: [{ kind: "set_knowledge", knowledge: {
    character_id: "maren", fact_id: "campaign_fact_bridge_closed", status: "knows" } }] });
  assert.ok(recoverNpcContext(f.world, live.exportSnapshot(), handle));
  assert.ok(npcDeepSources(f.world, live.exportSnapshot(), "maren").some(s => s.handle === handle));
  assert.equal(save(f, restored), save(f, legacy));
});

test("D-16 old schema migration stays readable and omits unsupported new-runtime refs", () => {
  const f = fixture(), old = JSON.parse(save(f));
  old.schema_version = 2; old.snapshot.schema_version = 1; delete old.snapshot.player_characters; delete old.snapshot.next_item_sequence;
  delete old.snapshot.premium_characters; delete old.snapshot.premium_reflections;
  const restored = decodeSave(JSON.stringify(old), f.world).snapshot;
  assert.equal(restored.premium_characters[0]!.dynamic.recent_developments[0]!.kind, "migrated_member");
  assert.equal(Object.hasOwn(restored.premium_characters[0]!.dynamic, "private_memory_refs"), false);
  assert.equal(reflectionDue(restored, "maren"), false);
  CampaignState.restore(f.world, restored);
});

test("D-17 initial lifecycle records never reach the generic trigger but stay available as evidence", async () => {
  const f = fixture(), snapshot = structuredClone(f.snapshot()) as CampaignSnapshot;
  const stamp = snapshot.premium_characters[0]!.dynamic.recent_developments[0]!;
  assert.ok(stamp.kind === "joined_household");
  // Isolate the counting predicate over both bootstrap kinds, without changing a live campaign.
  snapshot.premium_characters[0]!.dynamic.recent_developments = [stamp,
    { ...stamp, kind: "migrated_member" }, { ...stamp, kind: "joined_household" }];
  assert.equal(reflectionDue(snapshot, "maren"), false);
  assert.equal(reflectionEvidence(f.world, snapshot, "maren").filter(e => e.kind === "development").length, 3);
  let calls = 0;
  assert.deepEqual(await reflectAfterTurn(f.campaign, f.world, { async reflect() { calls++; return { text: '{"proposals":[]}' }; } }), []);
  assert.equal(calls, 0);
});

test("D-17 joining plus two substantive changes is not due; a third mixed change is", async () => {
  const f = fixture();
  f.run({ kind: "move_character", character_id: "maren", location_id: "test_hall" });
  f.run({ kind: "set_condition", character_id: "maren", conditions: ["minor_injury"] });
  assert.equal(reflectionDue(f.snapshot(), "maren"), false);
  f.run({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "respect", direction: "raise" });
  assert.equal(reflectionDue(f.snapshot(), "maren"), true);
  const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(() => []), instantReflectionPacing());
  assert.equal(runs[0]!.status, "committed");
  assert.equal(reflectionDue(f.snapshot(), "maren"), false, "cursor excludes already reflected changes");
});

test("D-17 voluntary leave/rejoin still triggers and remains membership trajectory evidence", async () => {
  const f = fixture();
  for (let i = 0; i < 2; i++) {
    f.run({ kind: "leave_household", household_id: HOME, character_id: "maren" });
    assert.equal(reflectionDue(f.snapshot(), "maren"), false, "inactive members do not reflect");
    f.run({ kind: "join_household", household_id: HOME, character_id: "maren" });
    assert.equal(reflectionDue(f.snapshot(), "maren"), i === 1);
  }
  const entries = captureProductionReflection(f.campaign, f.world, "maren").catalog;
  assert.equal(entries.filter(e => e.evidence_type === "household_membership").length, 5);
  const runs = await reflectAfterTurn(f.campaign, f.world, productionStub(request => [{
    subject_character_id: "maren", confidence: "high", evidence_refs: request.evidence.filter(e => e.evidence_type === "household_membership").map(e => e.ref),
    claim: { type: "membership_trajectory", household_id: HOME, operations: ["join", "leave", "rejoin", "leave", "rejoin"], join_count: 1, rejoin_count: 2, leave_count: 2 }
  }]), instantReflectionPacing());
  assert.equal(runs[0]!.accepted.length, 1);
  assert.equal(f.snapshot().premium_reflections[0]!.notes[0]!.structured!.proposal.claim.type, "membership_trajectory");
});

test("D-17 new-contract and changed-rollup alternatives remain independent of the generic threshold", async () => {
  const f = fixture();
  f.run({ kind: "establish_character_contract", character_id: "maren", field: "voice", text: "I speak softly.", quote: "I speak softly." });
  assert.equal(reflectionDue(f.snapshot(), "maren"), true);
  await reflectAfterTurn(f.campaign, f.world, productionStub(() => []), instantReflectionPacing());
  assert.equal(reflectionDue(f.snapshot(), "maren"), false);
  f.run({ kind: "establish_character_contract", character_id: "maren", field: "social_style", text: "I ask before helping.", quote: "I ask before helping." });
  assert.equal(reflectionDue(f.snapshot(), "maren"), true);
  const g = fixture();
  for (let i = 0; i < 18; i++) g.run({ kind: "set_condition", character_id: "maren", conditions: i % 2 === 0 ? ["minor_injury"] : [] });
  const rolled = structuredClone(g.snapshot()) as CampaignSnapshot;
  assert.ok(rolled.premium_characters[0]!.dynamic.long_term);
  // Isolate the rollup alternative in the pure predicate; production history stays intact.
  rolled.premium_characters[0]!.dynamic.recent_developments = [];
  assert.equal(reflectionDue(rolled, "maren"), true);
});

async function sessionFixture(t: TestContext, provider?: ReflectionProvider) {
  const f = fixture();
  for (let i=0;i<3;i++) f.run({ kind: "adjust_relationship", from_character_id: "maren", to_character_id: "nicco", dimension: "respect", direction: "raise" });
  const dir=await mkdtemp(join(tmpdir(), "caldrevan-minor-debt-")); t.after(() => rm(dir,{recursive:true,force:true}));
  const service=new RetrievalService(f.world), coordinator=new TurnCoordinator(f.world,mockNarrator("Maren nods."),mockController([]),{service,search:new HybridSearch(service)});
  const session=GameSession.fromCampaign({world:f.world,repository:new FileCampaignRepository(f.world,dir),createCoordinator:()=>coordinator,...(provider?{reflection_provider:provider}:{})},f.campaign);
  return {...f,session};
}

test("D-20 OFF performs no reflection maintenance or wait and allows the next command", async t => {
  const f=await sessionFixture(t), events:string[]=[];
  assert.equal(reflectionDue(f.snapshot(),"maren"),true,"even due evidence is ignored with maintenance OFF");
  for(let i=0;i<2;i++) {
    const result=await f.session.submitPlayerInput("I wait.",{onEvent:event=>events.push(event.type)});
    assert.ok(result.ok); assert.equal(f.session.getView().session.status,"idle");
  }
  assert.equal(events.includes("post_turn_completed"),false);
  assert.deepEqual(f.snapshot().premium_reflections,[]);
  assert.ok((await f.session.save()).ok);
});

test("D-20 SHADOW remains awaited, serial, validated, persisted once and hidden from narration", async t => {
  let started!:()=>void, release!:()=>void, calls=0;
  const entered=new Promise<void>(resolve=>{started=resolve;}), gate=new Promise<void>(resolve=>{release=resolve;});
  const provider:ReflectionProvider={async reflect(request){calls++;started();await gate;return{text:JSON.stringify({proposals:[testTrajectory(request,"respect")]})};}};
  const f=await sessionFixture(t,provider), events:string[]=[];
  const pending=f.session.submitPlayerInput("I wait.",{onEvent:event=>events.push(event.type)});
  await entered;
  try {
    assert.equal(events.includes("turn_completed"),true);
    assert.equal(f.session.getView().session.status,"post_turn");
    const next=await f.session.submitPlayerInput("I wait.");assert.equal(next.ok,false);
    assert.equal((await f.session.save()).ok,false);
  } finally {release();}
  assert.ok((await pending).ok);assert.equal(calls,1);
  const snapshot=f.snapshot();assert.equal(snapshot.premium_reflections[0]!.notes.length,1);
  assert.ok(snapshot.premium_reflections[0]!.notes[0]!.structured);
  assert.equal(reflectionDue(snapshot,"maren"),false);
  assert.ok(buildTurnContext(f.world,snapshot,{input:"Maren, how are you?"}).npc_plus!.lines.every(l=>!l.includes(" | reflection:")&&!l.includes("; refl=")));
  assert.ok((await f.session.submitPlayerInput("I wait.")).ok);assert.equal(calls,1);
  assert.ok((await f.session.save()).ok);
});

import test from "node:test";
import assert from "node:assert/strict";
import { prepareD04BakeoffCases, evaluateBakeoffCandidate } from "../src/dev/d04-compaction-bakeoff.js";
import { legalExtractiveCandidate, optimisticLowerBound, requestBreakdown, verifyBakeoffCache } from "../src/dev/d04-compressor-benchmark.js";
import { ContextBudgetManager } from "../src/turn/context-budget.js";
import { renderCandidateRequest } from "../src/turn/narrator-pack.js";
const cases = prepareD04BakeoffCases();
test("bakeoff records valid but insufficient output without calling it a semantic failure", async () => {
  const {A}=await cases, candidate=legalExtractiveCandidate(A);
  const evaluation=evaluateBakeoffCandidate({...A,compression_request:{...A.compression_request,target_budget_tokens:1}},{candidate},1);
  assert.equal(evaluation.validator_pass,true); assert.equal(evaluation.accepted,false); assert.equal(evaluation.target_success,false);
  assert.equal(evaluation.deterministic_fidelity,"extractive_contract_pass"); assert.equal(evaluation.validator_rejections,0);
  assert.ok(evaluation.compression_ratio !== null); assert.equal(evaluation.human_semantic_review_required,true);
});
test("bakeoff denies compression credit to a candidate that removes negative knowledge", async () => {
  const {B}=await cases, candidate=legalExtractiveCandidate(B);
  const broken={...candidate,units:candidate.units.map(u=>({...u,text:u.text.replace("does not know","knows")}))};
  const evaluation=evaluateBakeoffCandidate(B,{candidate:broken},1);
  assert.equal(evaluation.validator_pass,false); assert.equal(evaluation.target_success,false);
  assert.equal(evaluation.final_estimated_tokens,null); assert.equal(evaluation.compression_ratio,null);
  assert.equal(evaluation.validator_rejections,1); assert.equal(evaluation.human_semantic_review_required,false);
});
test("Case C byte accounting covers the rebuilt full request exactly and retains fixed categories", async () => {
  const {C}=await cases, legal=legalExtractiveCandidate(C);
  const before=requestBreakdown(C), after=requestBreakdown(C,legal.units);
  for (const b of [before,after]) {
    assert.equal(Object.values(b.bytes).reduce((a,v)=>a+v,0),b.serialized_message_bytes);
    assert.equal(Math.ceil(Object.values(b.token_equivalents).reduce((a,v)=>a+v,0)),b.estimated_tokens);
  }
  for (const key of ["fixed_protected","recent_conversation","retrieval_lore","scene_state","other"] as const) assert.equal(before.bytes[key],after.bytes[key]);
});
test("optimistic Case C lower bound does not exceed a concrete legal result", async () => {
  const {C}=await cases, legal=legalExtractiveCandidate(C);
  const measured=new ContextBudgetManager(C.context_policy).measure(renderCandidateRequest(C.narrator_validation_pack,legal.units));
  assert.ok(optimisticLowerBound(C).estimated_tokens<=measured.estimated_tokens);
  assert.ok(optimisticLowerBound(C).estimated_tokens>C.compression_request.target_budget_tokens);
});
test("offline control verifies cache hit and model/source/target/policy misses with no paid calls", async () => {
  const {A}=await cases, candidate=legalExtractiveCandidate(A);
  const result=await verifyBakeoffCache(A,A,"offline-control",{candidate});
  assert.equal(result.verified,true); assert.equal(result.paid_calls,0); assert.equal(result.offline_provider_calls,1);
  assert.ok(result.changed_target !== undefined && result.original_target !== undefined && result.changed_target < result.original_target);
});

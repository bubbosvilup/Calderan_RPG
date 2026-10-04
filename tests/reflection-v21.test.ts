import test from "node:test";
import assert from "node:assert/strict";
import { turnFixture } from "../src/dev/turn-fixture.js";
import type { CampaignCommand } from "../src/campaign/types.js";
import { structuredReflectionEvidence, type StructuredProposal } from "../src/dev/reflection-v2.js";
import { validateStructuredClaimV21 } from "../src/dev/reflection-v21.js";
function fixture() {
 const f=turnFixture(false,{courtyard:true}), H="campaign_household_v21";
 const run=(c:CampaignCommand)=>f.campaign.apply({expected_revision:f.campaign.revision,commands:[c]});
 run({kind:"create_household",id:H,name:"V21 house"});run({kind:"set_membership",household_id:H,membership:{character_id:"nicco",status:"member",role:"owner"}});run({kind:"join_household",household_id:H,character_id:"maren"});
 const cat=()=>structuredReflectionEvidence(f.world,f.campaign.exportSnapshot(),"maren").structured;
 const rel=(dimension:"trust"|"wariness",direction:"raise"|"lower"="raise")=>run({kind:"adjust_relationship",from_character_id:"maren",to_character_id:"nicco",dimension,direction});
 const p=(claim:StructuredProposal["claim"],type:string):StructuredProposal=>({subject_character_id:"maren",confidence:"high",claim,evidence_refs:cat().filter(e=>e.evidence_type===type).map(e=>e.ref)});
 const check=(proposal:unknown)=>validateStructuredClaimV21(proposal,cat(),"maren");return{...f,H,run,cat,rel,p,check};
}
const trust={type:"relationship_trajectory",target_character_id:"nicco",dimension:"trust",from:"none",to:"moderate",direction:"increase",transition_count:2};
test("V21 trajectories accept corroborating snapshot and other-dimension context",()=>{
 const f=fixture();f.rel("trust");f.rel("trust");f.rel("wariness");f.rel("wariness");
 const p=f.p(trust,"relationship_change"),snapshot=f.cat().find(e=>e.evidence_type==="relationship_snapshot")!;
 const result=f.check({...p,evidence_refs:[...p.evidence_refs,snapshot.ref]});assert.equal(result.accepted,true);
 assert.equal(result.evidence_roles.filter(e=>e.role==="SUPPORTING").length,2);assert.equal(result.evidence_roles.filter(e=>e.role==="CONTEXT").length,2);assert.equal(result.evidence_roles.filter(e=>e.role==="CORROBORATING").length,1);
});
test("V21 all exact count/direction/endpoint and missing transition checks remain strict",()=>{
 const f=fixture();f.rel("trust");f.rel("trust");const p=f.p(trust,"relationship_change");
 for(const claim of [{...trust,transition_count:1},{...trust,direction:"decrease"},{...trust,to:"high"}])assert.equal(f.check({...p,claim}).accepted,false);
 assert.equal(f.check({...p,evidence_refs:[p.evidence_refs[1]]}).accepted,false);
 f.rel("trust","lower");const included=f.check(f.p(trust,"relationship_change"));assert.equal(included.accepted,false);assert.ok(included.reasons.includes("claim_count_mismatch"));assert.ok(included.evidence_roles.some(e=>e.role==="CONTRADICTORY"));
});
test("V21 historical trajectory survives uncited later decline; current contrast cannot use stale snapshot",()=>{
 const f=fixture();f.rel("trust");f.rel("trust");f.rel("wariness");f.rel("wariness");const before=f.cat(),p=f.p(trust,"relationship_change");
 const historical={...p,evidence_refs:before.filter(e=>e.evidence_type==="relationship_change"&&e.payload.dimension==="trust").map(e=>e.ref)};
 const snapshot=before.find(e=>e.evidence_type==="relationship_snapshot")!;f.rel("trust","lower");
 assert.equal(f.check(historical).accepted,true);
 const current=f.cat().find(e=>e.evidence_type==="relationship_snapshot")!;
 assert.equal(f.check({...historical,evidence_refs:[...historical.evidence_refs,current.ref]}).accepted,true);
 const contrast=f.p({type:"relationship_contrast",target_character_id:"nicco",dimension_a:"trust",state_a:"moderate",dimension_b:"wariness",state_b:"moderate"},"relationship_snapshot");
 const stale={...snapshot,ref:"stale_snapshot"};assert.equal(validateStructuredClaimV21({...contrast,evidence_refs:[stale.ref]},[...f.cat(),stale],"maren").accepted,false);
});
test("V21 same-endpoint contradictory snapshot rejects; historical changes accompany current comparison",()=>{
 const f=fixture();f.rel("trust");f.rel("trust");f.rel("wariness");f.rel("wariness");const cat=f.cat(),p=f.p(trust,"relationship_change"),support=cat.filter(e=>e.evidence_type==="relationship_change"&&e.payload.dimension==="trust");
 const snapshot=cat.find(e=>e.evidence_type==="relationship_snapshot")!,bad={...snapshot,ref:"inconsistent_snapshot",revision:support.at(-1)!.revision,payload:{...snapshot.payload,dimensions:{trust:"low"}}};
 assert.ok(validateStructuredClaimV21({...p,evidence_refs:[...support.map(e=>e.ref),bad.ref]},[...cat,bad],"maren").reasons.includes("contradictory_evidence"));
 const contrast=f.p({type:"relationship_contrast",target_character_id:"nicco",dimension_a:"trust",state_a:"moderate",dimension_b:"wariness",state_b:"moderate"},"relationship_snapshot");
 assert.equal(f.check({...contrast,evidence_refs:[...contrast.evidence_refs,...p.evidence_refs]}).accepted,true);
});
test("V21 condition/membership/movement support tolerates known same-subject context, not wrong facts",()=>{
 const f=fixture();for(const conditions of [["sore_wrist"],[],["sore_wrist"]])f.run({kind:"set_condition",character_id:"maren",conditions});
 f.run({kind:"add_household_rule",household_id:f.H,text:"Keep the landing clear."});
 const contexts=f.cat().filter(e=>["canon","household_context"].includes(e.evidence_type)).map(e=>e.ref);
 const condition=f.p({type:"condition_trajectory",condition_id:"sore_wrist",operations:["add","remove","add"],episode_count:2},"condition_change");assert.equal(f.check({...condition,evidence_refs:[...condition.evidence_refs,...contexts]}).accepted,true);assert.equal(f.check({...condition,claim:{...condition.claim,episode_count:3}}).accepted,false);
 f.run({kind:"leave_household",household_id:f.H,character_id:"maren"});f.run({kind:"join_household",household_id:f.H,character_id:"maren"});
 const member=f.p({type:"membership_trajectory",household_id:f.H,operations:["join","leave","rejoin"],join_count:1,rejoin_count:1,leave_count:1},"household_membership");assert.equal(f.check({...member,evidence_refs:[...member.evidence_refs,...contexts]}).accepted,true);assert.equal(f.check({...member,claim:{...member.claim,rejoin_count:2}}).accepted,false);
 for(const location_id of ["test_hall","test_room"])f.run({kind:"move_character",character_id:"maren",location_id});
 const move=f.p({type:"movement_trajectory",locations:["test_room","test_hall","test_room"],transition_count:2},"movement");assert.equal(f.check({...move,evidence_refs:[...move.evidence_refs,...contexts]}).accepted,true);assert.equal(f.check({...move,claim:{...move.claim,psychology:"without settling"}}).accepted,false);
});
test("V21 statements and environmental context require their own independent support",()=>{
 const f=fixture();f.run({kind:"establish_character_contract",character_id:"maren",field:"voice",text:"plain speech",quote:"I report supply counts plainly."});f.run({kind:"establish_character_contract",character_id:"maren",field:"social_style",text:"keeps records",quote:"I keep shared supply records."});
 const refs=f.cat().filter(e=>e.evidence_type==="self_statement").map(e=>e.ref),extra=f.cat().filter(e=>e.evidence_type==="household_membership"||e.evidence_type==="canon").map(e=>e.ref);
 const statement=f.p({type:"self_statement_synthesis",statement_refs:refs},"self_statement");assert.equal(f.check({...statement,evidence_refs:[...refs,...extra]}).accepted,true);assert.equal(f.check({...statement,evidence_refs:extra}).accepted,false);
 for(const text of ["Keep tools dry.","Keep stairs clear."])f.run({kind:"add_household_rule",household_id:f.H,text});
 const environment=f.p({type:"environmental_motif",household_id:f.H,event_type:"rule_added",occurrence_count:2},"household_context");assert.equal(f.check({...environment,evidence_refs:[...environment.evidence_refs,...refs]}).accepted,true);assert.equal(f.check({...environment,claim:{...environment.claim,occurrence_count:3}}).accepted,false);
});
test("V21 unknown references, foreign subject, unknown semantics and psychology still reject",()=>{
 const f=fixture();f.rel("trust");f.rel("trust");const p=f.p(trust,"relationship_change"),cat=f.cat();
 assert.equal(f.check({...p,evidence_refs:[...p.evidence_refs,"missing"]}).accepted,false);
 const foreign={...cat[0]!,ref:"foreign",subject_character_id:"brenna"};assert.equal(validateStructuredClaimV21({...p,evidence_refs:[...p.evidence_refs,foreign.ref]},[...cat,foreign],"maren").accepted,false);
 const unknown={...cat[0]!,ref:"unknown_semantics",evidence_type:"unclassified"};assert.ok(validateStructuredClaimV21({...p,evidence_refs:[...p.evidence_refs,unknown.ref]},[...cat,unknown],"maren").reasons.includes("irrelevant_evidence"));
 assert.equal(f.check({...p,text:"Maren is receptive."}).accepted,false);
});

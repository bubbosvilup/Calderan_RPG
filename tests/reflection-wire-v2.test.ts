import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestScopedReflectionWire} from '../src/dev/reflection-wire-v2.js';
import {schemaMatches,type StructuredEvidence} from '../src/dev/reflection-v2.js';
import {V2_SCHEMA,validateStructuredClaimV23} from '../src/dev/reflection-v23.js';
const evidence=(ref:string,revision:number,from:string,to:string):StructuredEvidence=>({ref,revision,evidence_version:2,evidence_type:'movement',subject_character_id:'subject',owner_character_id:'subject',world_minute:revision,event_id:ref,payload:{from,to}});
test('request enums retain exact movement endpoints, including repeated endpoints; canonical uniqueness remains local',()=>{
 const catalog=[evidence('move:1',1,'a','b'),evidence('move:2',2,'b','a')];
 const request={character:{id:'subject'},evidence:catalog},w=requestScopedReflectionWire(request,catalog);
 const p={subject_character_id:'subject',evidence_refs:['move:1','move:2'],confidence:'high',claim:{type:'movement_trajectory',locations:['a','b','a'],transition_count:2}};
 assert.equal(validateStructuredClaimV23(p,catalog,'subject').accepted,true);
 assert.equal(schemaMatches(w.schema,{proposals:[p]}),true);
 assert.equal(schemaMatches(w.schema,{proposals:[{...p,evidence_refs:['foreign:ref']}]}),false);
 const dup={proposals:[{...p,evidence_refs:['move:1','move:1']}]};
 assert.equal(schemaMatches(w.schema,dup),true);assert.equal(schemaMatches(V2_SCHEMA,dup),false);
 assert.deepEqual(w,requestScopedReflectionWire(request,catalog));
});
test('hidden authoritative movement exposes contextual false rejection without altering V2.3',()=>{
 const catalog=[evidence('move:1',1,'a','b'),evidence('move:2',2,'b','c')];
 const w=requestScopedReflectionWire({character:{id:'subject'},evidence:[catalog[0]!]},catalog);
 const p={subject_character_id:'subject',evidence_refs:['move:1','move:2'],confidence:'high',claim:{type:'movement_trajectory',locations:['a','b','c'],transition_count:2}};
 assert.equal(validateStructuredClaimV23(p,catalog,'subject').accepted,true);
 assert.equal(schemaMatches(V2_SCHEMA,{proposals:[p]}),true);
 assert.equal(schemaMatches(w.schema,{proposals:[p]}),false);
 assert.deepEqual(w.domains.locations,['a','b']);
});
test('altered visible evidence cannot supply enum authority',()=>{
 const catalog=[evidence('move:1',1,'a','b')];
 assert.throws(()=>requestScopedReflectionWire({character:{id:'subject'},evidence:[{...catalog[0]!,payload:{from:'invented',to:'b'}}]},catalog),/mismatch/);
});

/** Final offline audit and unqualified candidate receipt. */
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sha} from './lib.mjs';
import {V2_SCHEMA,V2_SYSTEM} from '../../../.build/src/dev/reflection-v23.js';
import {reflectionWireSchema} from '../../../.build/src/dev/reflection-wire.js';
const dir='saves/structured-reflection-wire-v2',read=n=>{const b=readFileSync(`${dir}/${n}`);return b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8').replace(/^\uFEFF/,'');},json=n=>JSON.parse(read(n)),plan=json('preregistered-plan.json'),local=json('local-equivalence.json');
assert.equal(sha(read('preregistered-plan.json')),read('preregistered-plan.sha256').trim());
for(const [path,hash] of Object.entries(plan.frozen_file_hashes))assert.equal(sha(readFileSync(path)),hash,path);
assert.equal(sha(readFileSync('src/dev/reflection-v23.ts')),'10906ce6390b5051fa4fec0637ef1dec33683d5a536a68b4b55aae9d08d61c1d');
assert.equal(sha(V2_SCHEMA),'c870bf85c44eb2dea558a5a9904e0dde91ecd74f9a93eb2ff3f7986cb3a724ba');assert.equal(sha(V2_SYSTEM),'fa80b3d799d05f5800eed9d0dfd09433b61f2714bfac0630b35635ee68a83a09');assert.equal(sha(reflectionWireSchema('WIRE_ALIBABA_V1')),'ba621d1dd29bddbd0e5688027211896b4734b73f5ff696d61e2ee789a08042fd');
assert.equal(local.result,'FAIL');assert.equal(plan.dispatch_allowed,false);assert.ok(!existsSync(`${dir}/dispatch-started.json`));assert.ok(read('dispatch-gate.log').includes('paid dispatch prohibited'));
for(const c of [...plan.screen,...plan.confirmation]){assert.equal(sha(c.request),c.request_sha);assert.equal(sha(c.snapshot),c.snapshot_sha);assert.equal(sha(c.wire_schema),c.wire_sha);}
// Scan privately; credentials never appear in results or artifacts.
const secrets=[...readFileSync('APIKEY.env','utf8').matchAll(/sk-[A-Za-z0-9_-]{20,}/g)].map(m=>m[0]);
const sourceFiles=['src/dev/reflection-wire-v2.ts','tests/reflection-wire-v2.test.ts','docs/evaluations/STRUCTURED_REFLECTION_WIRE_V2.md',...['build','run','verify'].map(n=>`docs/evaluations/d09-reflection/request-wire-v2-${n}.mjs`)];
for(const path of [...sourceFiles,...readdirSync(dir).map(n=>`${dir}/${n}`)])assert.ok(!secrets.some(s=>readFileSync(path).includes(Buffer.from(s))),'Credential audit');
const decode=n=>{const b=readFileSync(`${dir}/${n}`);return b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8');};
assert.ok(!decode('typecheck.log').includes('error TS'));assert.ok(decode('unit.log').includes('# pass 1965'));assert.ok(decode('unit.log').includes('# fail 0'));assert.ok(decode('unit.log').includes('# todo 4'));assert.ok(decode('playthrough.log').includes('# pass 25'));assert.ok(decode('playthrough.log').includes('# fail 0'));
const freeze={status:'NOT_QUALIFIED_DO_NOT_ADOPT',blocker:'OTHER:AUTHORITATIVE_VISIBLE_CATALOG_MISMATCH',wire_version:'WIRE_ALIBABA_V2',generator_source:'src/dev/reflection-wire-v2.ts',generator_source_sha:sha(readFileSync('src/dev/reflection-wire-v2.ts')),wire_schema_set_sha:sha([...plan.screen,...plan.confirmation].map(c=>({id:c.id,wire_sha:c.wire_sha}))),model:plan.provider_freeze.model,provider:plan.provider_freeze.provider,canonical_schema_sha:sha(V2_SCHEMA),v23_source_sha:sha(readFileSync('src/dev/reflection-v23.ts')),prompt_sha:sha(V2_SYSTEM),pacing:plan.policy,retry:'Technical only; maximum two attempts; no repair, quality or semantic reroll',physical_calls:0,qualified:false,production_adoption:false,plan_sha:sha(read('preregistered-plan.json'))};
writeFileSync(`${dir}/freeze.json`,JSON.stringify(freeze,null,2));
const verification={local_gate:'FAIL',requests:40,canonical_valid_samples:local.canonical_valid_samples,false_rejections:local.false_rejections,paid_dispatch_prevented:true,physical_calls:0,cost_usd:0,credential_leaks:0,frozen_authority_hashes:'MATCH',typecheck:'PASS',unit:{passed:1965,failed:0,todo:4},playthrough:{passed:25,failed:0},production_changes:0};
writeFileSync(`${dir}/final-verification.json`,JSON.stringify(verification,null,2));
writeFileSync(`${dir}/artifact-hashes.json`,JSON.stringify(Object.fromEntries(readdirSync(dir).filter(n=>n!=='artifact-hashes.json').map(n=>[n,sha(readFileSync(`${dir}/${n}`))])),null,2));console.log(JSON.stringify({...verification,generator_sha:freeze.generator_source_sha,schema_set_sha:freeze.wire_schema_set_sha},null,2));

/** Read-only integrity, test-log and credential verification. Never prints credentials. */
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {sha} from './lib.mjs';
import {V2_SCHEMA,V2_SYSTEM} from '../../../.build/src/dev/reflection-v23.js';
import {exactBenchmarkCredential} from '../../../.build/src/dev/reflection-benchmark.js';
const dir='saves/d09-reflection-targeted-exposure',read=n=>readFileSync(`${dir}/${n}`),m=JSON.parse(read('manifest.json')),review=JSON.parse(read('blind-review.json')),scored=JSON.parse(read('scored-results.json')),freeze=JSON.parse(read('freeze.json')),execution=JSON.parse(read('execution-freeze.json'));
assert.equal(sha(read('manifest.json')),read('manifest.sha256').toString().trim());assert.equal(sha(read('blind-review.json')),read('blind-review.sha256').toString().trim());assert.equal(scored.blind_review_sha,sha(read('blind-review.json')));assert.equal(review.responses_sha,sha(read('responses.json')));assert.equal(freeze.targeted_manifest_sha,sha(read('manifest.json')));
for(const[p,h]of Object.entries(m.source_hashes))assert.equal(sha(readFileSync(p)),h);
assert.equal(sha(V2_SCHEMA),m.freeze.canonical_schema_sha);assert.equal(sha(V2_SYSTEM),m.freeze.prompt_sha);assert.equal(execution.runner_sha,sha(readFileSync('docs/evaluations/d09-reflection/targeted-exposure-run.mjs')));assert.equal(execution.validation_sha,sha(readFileSync('docs/evaluations/d09-reflection/wire-cvc-provider-validation.mjs')));
for(const c of m.cases){assert.equal(sha(c.request),c.request_sha);assert.equal(sha(c.snapshot),c.snapshot_sha);assert.equal(sha(c.body),c.body_sha);assert.equal(sha(c.wire_schema),c.wire_sha);}
for(const s of scored.scored){const v=review.reviews.find(v=>v.id===s.id);assert.equal(sha(s.proposal),v.proposal_sha);}
assert.ok(Date.parse(review.review_completed_at)<=Date.parse(scored.scored_at));assert.equal(review.reviews.length,scored.scored.length);assert.equal(m.policy.max_new_physical_calls,32);
const decode=n=>{const b=read(n);return b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8');};
assert.ok(!decode('typecheck.log').includes('error TS'));assert.ok(decode('unit.log').includes('# pass 1972'));assert.ok(decode('unit.log').includes('# fail 0'));assert.ok(decode('unit.log').includes('# todo 4'));assert.ok(decode('playthrough.log').includes('# pass 25'));assert.ok(decode('playthrough.log').includes('# fail 0'));
const key=exactBenchmarkCredential({env:process.env.OPENROUTER_API_KEY,fileText:readFileSync('APIKEY.env','utf8')}),files=[];
const collect=p=>{for(const e of readdirSync(p,{withFileTypes:true})){const path=`${p}/${e.name}`;if(e.isDirectory())collect(path);else files.push(path);}};collect(dir);
files.push('docs/evaluations/D09_REFLECTION_TARGETED_EXPOSURE_SOAK.md',...readdirSync('docs/evaluations/d09-reflection').filter(n=>n.startsWith('targeted-exposure-')&&n.endsWith('.mjs')).map(n=>`docs/evaluations/d09-reflection/${n}`));
for(const p of files){const b=readFileSync(p),content=b.toString('utf8');assert.ok(!b.includes(Buffer.from(key)),'Exact credential detected');assert.ok(!/sk-or-v1-[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9_-]{40,}|Bearer\s+[A-Za-z0-9_-]{30,}/.test(content),'Credential pattern detected');}
const result={verified_at:new Date().toISOString(),source_freeze:'MATCH',request_snapshot_body_wire_hashes:'MATCH',runner_execution_hash:'MATCH',blind_review_before_scoring:'MATCH',test_logs:'PASS',credential_scan:'CLEAN',files_scanned:files.length,physical_budget:32,production_changed:false};writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));

/** Local artifact integrity/security audit; no provider calls and no secret output. */
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-v21',freeze=JSON.parse(readFileSync(`${dir}/candidate-freeze.json`,'utf8'));
if(sha(readFileSync(freeze.source_file))!==freeze.source_sha)throw Error('Candidate changed');
if(sha(readFileSync(freeze.dependency_source_file))!==freeze.dependency_source_sha||sha(readFileSync('.build/src/dev/reflection-v21.js'))!==freeze.compiled_sha)throw Error('Frozen dependency/compiled candidate changed');
const historical=JSON.parse(readFileSync(`${dir}/v2-historical-preservation.json`,'utf8'));
for(const [name,hash]of Object.entries(historical.artifact_hashes))if(sha(readFileSync(`saves/d09-reflection-v2/${name}`))!==hash)throw Error('Historical V2 changed');
const oldManifest=JSON.parse(readFileSync('saves/d09-reflection-v2/oos-manifest.json','utf8'));
const bytes=readFileSync(`${dir}/oos-manifest.json`,'utf8'),m=JSON.parse(bytes);
if(sha(bytes)!==readFileSync(`${dir}/oos-manifest.sha256`,'utf8').trim()||m.cases.length!==48||new Set(m.cases.map(c=>c.request_sha)).size!==48||m.cases.some(c=>sha(c.request)!==c.request_sha))throw Error('Corpus changed');
if(m.cases.some(c=>oldManifest.cases.some(old=>old.request_sha===c.request_sha)))throw Error('Historical request reused');
const outputs=readFileSync(`${dir}/oos-outputs.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
if(outputs.length!==48||new Set(outputs.map(o=>o.id)).size!==48||outputs.flatMap(o=>o.attempts).length!==48)throw Error('Call accounting');
const review=readFileSync(`${dir}/blind-semantic-review.json`,'utf8');if(sha(review)!==readFileSync(`${dir}/blind-review.sha256`,'utf8').trim())throw Error('Review changed');
const env=readFileSync('APIKEY.env','utf8'),secret=process.env.OPENROUTER_API_KEY??env.match(/sk-or-v1-[A-Za-z0-9]+/)?.[0];
if(!secret)throw Error('Credential audit cannot silently skip an unavailable key');
const trackedDiff=execFileSync('git',['diff','38c48d4'],{encoding:'utf8'});
if(trackedDiff.includes(secret))throw Error('Credential found in tracked candidate/report diff');
for(const name of readdirSync('docs/evaluations/d09-reflection').filter(n=>n.startsWith('v21-')))if(readFileSync(`docs/evaluations/d09-reflection/${name}`).includes(Buffer.from(secret)))throw Error('Credential found in tracked evaluation harness');
const hashes={};for(const name of readdirSync(dir).filter(n=>n!=='artifact-hashes.json')){const path=`${dir}/${name}`;if(statSync(path).isFile()){const data=readFileSync(path);if(secret&&data.includes(Buffer.from(secret)))throw Error(`Credential found in artifact ${name}`);hashes[name]=sha(data);}}
writeFileSync(`${dir}/artifact-hashes.json`,JSON.stringify(hashes,null,2));console.log(JSON.stringify({candidate_unchanged:true,frozen_dependency_unchanged:true,historical_v2_files_unchanged:Object.keys(historical.artifact_hashes).length,manifest_unchanged:true,requests:48,unique_requests:48,reused_v2_requests:0,physical_calls:48,review_unchanged:true,credential_artifact_matches:0,artifact_files:Object.keys(hashes).length}));

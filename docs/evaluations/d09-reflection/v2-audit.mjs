/** Local artifact integrity/security audit; no provider calls and no secret output. */
import {readFileSync,writeFileSync,readdirSync,statSync} from 'node:fs';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-v2',freeze=JSON.parse(readFileSync(`${dir}/candidate-freeze.json`,'utf8'));
if(sha(readFileSync(freeze.source_file))!==freeze.source_sha)throw Error('Candidate changed');
const bytes=readFileSync(`${dir}/oos-manifest.json`,'utf8'),m=JSON.parse(bytes);
if(sha(bytes)!==readFileSync(`${dir}/oos-manifest.sha256`,'utf8').trim()||m.cases.length!==48||new Set(m.cases.map(c=>c.request_sha)).size!==48||m.cases.some(c=>sha(c.request)!==c.request_sha))throw Error('Corpus changed');
const outputs=readFileSync(`${dir}/oos-outputs.jsonl`,'utf8').trim().split('\n').map(JSON.parse);
if(outputs.length!==48||new Set(outputs.map(o=>o.id)).size!==48||outputs.flatMap(o=>o.attempts).length!==48)throw Error('Call accounting');
const review=readFileSync(`${dir}/blind-semantic-review.json`,'utf8');if(sha(review)!==readFileSync(`${dir}/blind-review.sha256`,'utf8').trim())throw Error('Review changed');
const env=readFileSync('APIKEY.env','utf8'),match=env.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.+?)\s*$/m),secret=match?.[1].replace(/^['"]|['"]$/g,'');
const hashes={};for(const name of readdirSync(dir).filter(n=>n!=='artifact-hashes.json')){const path=`${dir}/${name}`;if(statSync(path).isFile()){const data=readFileSync(path);if(secret&&data.includes(Buffer.from(secret)))throw Error(`Credential found in artifact ${name}`);hashes[name]=sha(data);}}
writeFileSync(`${dir}/artifact-hashes.json`,JSON.stringify(hashes,null,2));console.log(JSON.stringify({candidate_unchanged:true,manifest_unchanged:true,requests:48,unique_requests:48,physical_calls:48,review_unchanged:true,credential_artifact_matches:0,artifact_files:Object.keys(hashes).length}));

/** Offline traces only. No API calls, no campaign files, no semantic scoring. */
import {writeFileSync,readFileSync,readdirSync,statSync} from 'node:fs';
import {sha} from './d09-reflection/lib.mjs';
import {TurnCoordinator} from '../../.build/src/turn/turn-coordinator.js';
import {setup,collect,transfer,mockNarrator} from '../../.build/tests/turn-fixtures.js';
import {scriptedController,fakeRetry} from '../../.build/tests/provider-failure-scripts.js';
import {maintenanceCall,ReliabilityMetrics,diagnosticCall} from '../../.build/src/llm/reliability.js';
import {ProviderError} from '../../.build/src/llm/errors.js';
const rows=[];
for(const faults of [['malformed','ok'],['malformed','malformed'],[{fail:'timeout'},'ok']]){const f=setup(),records=[],base=f.campaign.revision,ctl=scriptedController([transfer],faults),retry=fakeRetry();const events=await collect(new TurnCoordinator(f.world,mockNarrator('Brenna accepts boots from Nicco.'),ctl,f.retrieval,{reliability_contract:true,provider_retry:retry.policy,diagnostics_sink:r=>records.push(r)}).runTurn({campaign:f.campaign,player_input:'I give boots to Brenna.'}));rows.push({kind:'critical_controller',faults,base_revision:base,final_revision:f.campaign.revision,physical_calls:ctl.calls(),commit_events:events.filter(e=>e.type==='state_committed').length,final_outcome:events.at(-1).type,attempts:records[0].provider_attempts,counters:records[0].provider_reliability});}
let n=0;const metrics=new ReliabilityMetrics(),retry=fakeRetry();await maintenanceCall({subsystem:'reflection',policy:retry.policy,checkpoint:()=>{},metrics,run:async()=>{if(n++===0)throw new ProviderError('invalid_provider_response',undefined,undefined,'finish_reason_length');return 1;}});rows.push({kind:'maintenance_retry',physical_calls:n,counters:metrics.counters});let logs=[];await diagnosticCall(async()=>{throw new ProviderError('timeout');},c=>logs.push(c));rows.push({kind:'diagnostic_skip',failures:logs,commits:0});
writeFileSync('saves/provider-reliability/retry-traces.json',JSON.stringify({mode:'DETERMINISTIC FAULT INJECTION, not live measured rates',live_physical_calls:0,rows},null,2));
writeFileSync('saves/provider-reliability/live-probe.json',JSON.stringify({run:false,physical_calls:0,cost_usd:0,reason:'Real adapter wire fault injection covers the technical contract. No new paid provider sample or campaign mutation is necessary; live usable-response rates remain unmeasured.'},null,2));
const freeze=JSON.parse(readFileSync('saves/d09-reflection-v22/candidate-freeze.json'));
if(sha(readFileSync(freeze.source_file))!==freeze.source_sha)throw Error('V22 changed');
const preserved=JSON.parse(readFileSync('saves/d09-reflection-v22/v21-historical-preservation.json'));
for(const[n,h]of Object.entries(preserved.artifact_hashes))if(sha(readFileSync(`saves/d09-reflection-v21/${n}`))!==h)throw Error('Historical V21 changed');
const secrets=[process.env.OPENROUTER_API_KEY,...(readFileSync('APIKEY.env','utf8').match(/sk-or-v1-[A-Za-z0-9]+/g)??[])].filter(Boolean);
if(!secrets.length)throw Error('Credential audit cannot silently skip');
for(const dir of ['saves/d09-reflection-v22','saves/provider-reliability']){const hashes={};for(const name of readdirSync(dir).filter(n=>n!=='artifact-hashes.json')){if(!statSync(`${dir}/${name}`).isFile())continue;const data=readFileSync(`${dir}/${name}`);if(secrets.some(s=>data.includes(Buffer.from(s))))throw Error('Credential in artifact');hashes[name]=sha(data);}writeFileSync(`${dir}/artifact-hashes.json`,JSON.stringify(hashes,null,2));}
console.log(JSON.stringify({offline_trace_rows:rows.length,live_calls:0,v22_frozen:true,v21_unchanged:true,credential_matches:0}));

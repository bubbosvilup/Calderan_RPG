/** Freeze the evaluation corpus: PLAYED requests (captured at normal post-turn due points of the disposable run) + FIXTURE requests. Writes corpus.jsonl and an immutable manifest with hashes. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {sha} from './lib.mjs';
const dir='saves/d09-reflection-bakeoff',read=f=>readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const played=read(`${dir}/play/frozen-requests.jsonl`),states=read(`${dir}/played-state-requests.jsonl`),fixture=read(`${dir}/fixture-requests.jsonl`);
const dedupe=new Set(),all=[];
for(const r of [...played,...states,...fixture]){const key=sha({c:r.request.character.id,e:r.request.evidence});if(dedupe.has(key)){console.log('duplicate evidence skipped',r.id);continue;}dedupe.add(key);all.push(r);}
writeFileSync(`${dir}/corpus.jsonl`,all.map(r=>JSON.stringify(r)).join('\n')+'\n');
const manifest={frozen_at:new Date().toISOString(),played_due:all.filter(r=>r.origin==='PLAYED').length,played_state:all.filter(r=>r.origin==='PLAYED_STATE').length,fixture:all.filter(r=>r.origin==='FIXTURE').length,total:all.length,
  requests:all.map(r=>({id:r.id,origin:r.origin,character:r.request.character.id,turn:r.turn,evidence_entries:r.request.evidence.length,developments_since_cursor:r.developments_since_cursor.length,request_sha256:sha(r.request),catalog_sha256:sha(r.catalog)})),
  source_files:{played:sha(readFileSync(`${dir}/play/frozen-requests.jsonl`)),played_state:sha(readFileSync(`${dir}/played-state-requests.jsonl`)),fixture:sha(readFileSync(`${dir}/fixture-requests.jsonl`)),corpus:sha(readFileSync(`${dir}/corpus.jsonl`))}};
if(existsSync(`${dir}/corpus-manifest.json`))throw new Error('corpus already frozen');
writeFileSync(`${dir}/corpus-manifest.json`,JSON.stringify(manifest,null,2));console.log(JSON.stringify({played_due:manifest.played_due,played_state:manifest.played_state,fixture:manifest.fixture,total:manifest.total}));

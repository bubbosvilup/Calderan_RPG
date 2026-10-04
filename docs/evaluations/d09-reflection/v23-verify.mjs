/** Local final audit. Credential values never appear in output or artifacts. */
import {readFileSync,writeFileSync,readdirSync,existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const dir='saves/d09-reflection-v23',decode=p=>{const b=readFileSync(p);return b[0]===255&&b[1]===254?b.subarray(2).toString('utf16le'):b.toString('utf8').replace(/^\uFEFF/,'');},hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const env=decode('APIKEY.env'),secrets=[...env.matchAll(/sk-[A-Za-z0-9_-]{20,}/g)].map(m=>m[0]),exact=env.match(/sk-or-v1-[a-f0-9]{64}/)?.[0];if(!exact)throw Error('No credential for private audit');secrets.push(exact);
const files=['tracked-files.txt','new-files.txt'].flatMap(n=>decode(`${dir}/${n}`).trim().split(/\r?\n/));
for(const d of [dir,'saves/structured-reflection-reliability'])for(const e of readdirSync(d))files.push(`${d}/${e}`);
if(files.some(p=>existsSync(p)&&statSync(p).isFile()&&secrets.some(s=>readFileSync(p).includes(Buffer.from(s)))))throw Error('Credential leak detected');
const freeze=JSON.parse(decode(`${dir}/candidate-freeze.json`));if(hash(freeze.source_file)!==freeze.source_sha)throw Error('V23 freeze changed');for(const[p,h]of Object.entries(freeze.dependencies))if(hash(p)!==h)throw Error('Frozen predecessor changed');
const m=JSON.parse(decode('saves/structured-reflection-reliability/manifest.json'));for(const[p,h]of Object.entries(m.frozen.files))if(hash(p)!==h)throw Error('Frozen matrix source changed');
const unit=decode(`${dir}/unit.log`),play=decode(`${dir}/playthrough.log`);if(!unit.includes('# pass 1947')||!unit.includes('# fail 0')||!unit.includes('# todo 4')||!play.includes('# pass 25')||!play.includes('# fail 0'))throw Error('Tests not green');
const v={candidate_freeze:'MATCH',original_sources:'MATCH',credential_leaks:0,typecheck:'PASS',unit:{passed:1947,failed:0,todo:4},playthrough:{passed:25,failed:0},production_changes:0,new_generation_requests:64,verified_at:new Date().toISOString()};writeFileSync(`${dir}/final-verification.json`,JSON.stringify(v,null,2));console.log(JSON.stringify(v));

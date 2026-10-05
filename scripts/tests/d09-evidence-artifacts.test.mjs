import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, relative, isAbsolute} from 'node:path';
import {EvidenceArtifactStore} from '../d09-evidence-artifacts.mjs';

const request = turn => ({turn, role:'narrator', body:{model:'offline', messages:[{role:'user',content:`turn ${turn}`}]} });
async function temporary(t) {
  const root=resolve(tmpdir()), dir=resolve(await mkdtemp(join(root,'d09-evidence-'))), child=relative(root,dir);
  assert.ok(!isAbsolute(child)&&!child.startsWith('..')&&child.startsWith('d09-evidence-'));
  t.after(()=>rm(dir,{recursive:true,force:true})); return dir;
}

test('resume uses captured request 20, not completed-turn counter 19, and preserves interrupted bytes', async t => {
  const dir=await temporary(t), original={...request(9),id:20};
  await writeFile(join(dir,'request-020.json'),JSON.stringify(original));
  const before=await readFile(join(dir,'request-020.json'));
  const store=await EvidenceArtifactStore.open(dir,{mark_pending_on_resume:true});
  assert.equal(store.maxCapturedRequestIndex,20);
  const resumed=await store.recordRequest(request(9)); assert.equal(resumed.id,21);
  assert.deepEqual(await readFile(join(dir,'request-020.json')),before);
  await store.recordReceipt({id:21,turn:9,role:'narrator',reported_cost_usd:0});
  const audit=await store.audit(); assert.deepEqual(audit.errors,[]); assert.deepEqual(audit.pending_requests,[20]); assert.deepEqual(audit.interrupted_requests,[20]);
});
test('two open writers reserve unique physical IDs and cannot overwrite requests', async t => {
  const dir=await temporary(t), a=await EvidenceArtifactStore.open(dir), b=await EvidenceArtifactStore.open(dir);
  const allocated=await Promise.all([a.recordRequest(request(1)),b.recordRequest(request(2)),a.recordRequest(request(3))]);
  assert.equal(new Set(allocated.map(r=>r.id)).size,3);
  assert.deepEqual((await a.audit()).errors,[]);
  await assert.rejects(a.recordRequest({...request(4),id:1}),/allocated/);
});
test('receipt writes are exclusive, validated against requests, and one-to-one', async t => {
  const dir=await temporary(t), store=await EvidenceArtifactStore.open(dir), r=await store.recordRequest(request(1));
  await assert.rejects(store.recordReceipt({id:r.id,turn:2,role:'narrator'}),/identity mismatch/);
  await assert.rejects(store.recordReceipt({id:99,turn:1,role:'narrator'}),{code:'ENOENT'});
  const receipt={id:r.id,turn:1,role:'narrator',reported_cost_usd:0.01}; await store.recordReceipt(receipt);
  const bytes=await readFile(join(dir,'receipt-001.json'));
  await assert.rejects(store.recordReceipt({...receipt,reported_cost_usd:99}),{code:'EEXIST'});
  assert.deepEqual(await readFile(join(dir,'receipt-001.json')),bytes); assert.equal((await store.audit()).one_to_one_receipts,true);
});
test('a crash after request reservation skips that index; a late receipt remains attributable', async t => {
  const dir=await temporary(t), first=await EvidenceArtifactStore.open(dir), r=await first.recordRequest(request(1));
  const resumed=await EvidenceArtifactStore.open(dir,{mark_pending_on_resume:true}); assert.equal((await resumed.recordRequest(request(2))).id,2);
  await resumed.recordReceipt({id:r.id,turn:1,role:'narrator',reported_cost_usd:0.01});
  const audit=await resumed.audit(); assert.deepEqual(audit.completed_after_resume,[1]); assert.deepEqual(audit.pending_requests,[2]); assert.deepEqual(audit.errors,[]);
});
test('malformed crashed reservations are never reused; orphan receipts fail audit', async t => {
  const dir=await temporary(t); await writeFile(join(dir,'request-020.json'),'{');
  const store=await EvidenceArtifactStore.open(dir); assert.equal((await store.recordRequest(request(9))).id,21);
  await writeFile(join(dir,'receipt-022.json'),JSON.stringify({id:22,role:'narrator',turn:9}));
  const audit=await store.audit(); assert.ok(audit.errors.some(e=>e.includes('Unreadable'))); assert.ok(audit.errors.includes('Orphan receipt 22'));
  await assert.rejects(EvidenceArtifactStore.open(dir,{mark_pending_on_resume:true}),/Evidence integrity/);
});
test('submission cap counts an interrupted eighth attempt before another dispatch is possible', async t => {
  const dir=await temporary(t), first=await EvidenceArtifactStore.open(dir);
  for(let i=1;i<=8;i++)assert.equal((await first.recordSubmission({input:`input ${i}`,status:'reserved_before_submit'},8)).id,i);
  const resumed=await EvidenceArtifactStore.open(dir);
  await assert.rejects(resumed.recordSubmission({input:'ninth'},8),/budget reached/);
  assert.equal((await resumed.audit()).requests.length,0);
});
test('resume cost receipts come from immutable files even if mutable ledger was never flushed', async t => {
  const dir=await temporary(t), first=await EvidenceArtifactStore.open(dir), r=await first.recordRequest(request(1));
  await first.recordReceipt({id:r.id,turn:1,role:'narrator',reported_cost_usd:0.02});
  const resumed=await EvidenceArtifactStore.open(dir,{mark_pending_on_resume:true});
  assert.equal((await resumed.readReceipts()).reduce((cost,r)=>cost+(r.reported_cost_usd??0),0),0.02);
});
